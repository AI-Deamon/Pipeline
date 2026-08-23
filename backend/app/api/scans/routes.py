import logging
import uuid
from datetime import datetime, timezone
from typing import Annotated, List

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    Header,
    HTTPException,
    Request,
    Response,
    status,
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.rate_limit import limiter
from app.core.auth import get_current_user
from app.models.db_models import ProjectDB, ScanDB, RescanRequestDB
from app.schemas.scan import (
    ScanCancelResponse,
    ScanCreate,
    ScanError,
    ScanHistoryResponse,
    ScanResponse,
    ScanResultsResponse,
    ScanRetryReportsResponse,
)
from app.services.rbac_service import get_rbac_service
from app.services.validation import validate_scan_request
from app.state.scan_state import ScanState
from app.websockets.manager import manager as websocket_manager

from .utils import (
    ACTIVE_STATES,
    TERMINAL_STATES,
    calculate_scan_timeout,
    resolve_jenkins_base_url,
    _expire_scan_if_timed_out,
    _scan_to_response,
)
from .callback import router as callback_router
from .state import router as state_router

router = APIRouter()
logger = logging.getLogger(__name__)

_PROJECT_NOT_FOUND = "Project not found"
_SCAN_NOT_FOUND = "Scan not found"

router.include_router(callback_router)
router.include_router(state_router)


def _parse_scan_timeout_header(x_scan_timeout: str | None, calculated_timeout: int) -> int:
    if not x_scan_timeout:
        return calculated_timeout
    try:
        override = int(x_scan_timeout)
        if override > 0:
            max_allowed = max(settings.SCAN_TIMEOUT * 3, 7200)
            actual = min(override, max_allowed)
            if override > max_allowed:
                logger.info(f"Scan timeout clamped from {override}s to {max_allowed}s (max allowed)")
            logger.info(f"Scan timeout set via header: {actual} seconds ({actual / 60:.1f} minutes)")
            return actual
        logger.warning(f"Invalid X-Scan-Timeout header value ({x_scan_timeout}), using calculated timeout")
    except ValueError:
        logger.warning(f"Invalid X-Scan-Timeout header value ({x_scan_timeout}), using calculated timeout")
    return calculated_timeout


@router.get("/scans", response_model=List[ScanResponse])
@limiter.limit("1000/minute" if settings.ENV == "test" else "50/minute")
def list_scans(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    rbac = get_rbac_service(db=db, user=current_user)
    query = db.query(ScanDB)
    if not rbac.is_admin:
        effective_ids = rbac.get_effective_project_ids()
        if not effective_ids:
            return []
        query = query.filter(ScanDB.project_id.in_(effective_ids))
    scans = query.all()

    active_scans = [s for s in scans if s.state not in TERMINAL_STATES]

    if active_scans:
        project_ids = {s.project_id for s in active_scans}
        projects = (
            db.query(ProjectDB).filter(ProjectDB.project_id.in_(project_ids)).all()
        )
        project_map = {p.project_id: p for p in projects}

        now = datetime.now(timezone.utc)
        any_expired = False

        for scan_obj in active_scans:
            project_obj = project_map.get(scan_obj.project_id)
            if project_obj:
                # Pass timeout_seconds=None so each scan uses its own persisted
                # timeout (falling back to the global default inside the helper).
                if _expire_scan_if_timed_out(
                    db, scan_obj, project_obj, now, None, auto_commit=False
                ):
                    any_expired = True

        if any_expired:
            db.commit()

    return [_scan_to_response(s) for s in scans]


@router.post("/scans", response_model=ScanResponse, status_code=status.HTTP_201_CREATED,
  responses={400: {"description": "Bad request"}, 404: {"description": "Not found"}, 409: {"description": "Conflict"}})
@limiter.limit("1000/minute" if settings.ENV == "test" else "10/minute")
def trigger_scan(
    request: Request,
    response: Response,
    scan: ScanCreate,
    background_tasks: BackgroundTasks,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
    x_scan_timeout: Annotated[str | None, Header(alias="X-Scan-Timeout")] = None,
):
    try:
        validate_scan_request(scan)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    rbac = get_rbac_service(db=db, user=current_user)
    if not rbac.has_project_access(scan.project_id):
        raise HTTPException(status_code=404, detail=_PROJECT_NOT_FOUND)

    project = (
        db.query(ProjectDB)
        .filter(ProjectDB.project_id == scan.project_id)
        .with_for_update()
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail=_PROJECT_NOT_FOUND)

    if project.last_scan_state and project.last_scan_state in [
        state.value for state in ACTIVE_STATES
    ]:
        raise HTTPException(
            status_code=409,
            detail="An active scan already exists for this project",
        )

    scan_id = str(uuid.uuid4())
    calculated_timeout = calculate_scan_timeout(scan.selected_stages)
    scan_timeout = _parse_scan_timeout_header(x_scan_timeout, calculated_timeout)

    try:
        scan_obj = ScanDB(
            scan_id=scan_id,
            project_id=scan.project_id,
            scan_mode=scan.scan_mode,
            selected_stages=scan.selected_stages or [],
            state=ScanState.CREATED,
            created_at=datetime.now(timezone.utc),
            started_at=None,
            jenkins_build_number=None,
            jenkins_queue_id=None,
            stage_results=[],
            callback_digests=[],
            timeout_seconds=scan_timeout,
        )
        db.add(scan_obj)
        project.last_scan_state = scan_obj.state.value
        db.commit()
    except IntegrityError as e:
        db.rollback()
        if "ix_scans_project_state" in str(e.orig) or "uq_project_active_state" in str(e.orig):
            logger.info(f"Duplicate scan prevented for project {scan.project_id} (database constraint)")
            raise HTTPException(
                status_code=409,
                detail="An active scan already exists for this project",
            )
        raise

    db.refresh(scan_obj)

    background_tasks.add_task(
        websocket_manager.send_scan_update,
        scan_id=scan_obj.scan_id,
        project_id=scan_obj.project_id,
        data=_scan_to_response(scan_obj),
    )

    project_data = {
        "project_id": project.project_id,
        "name": project.name,
        "git_url": project.git_url,
        "branch": project.branch,
        "credentials_id": project.credentials_id,
        "sonar_key": project.sonar_key,
        "target_ip": project.target_ip,
        "target_url": project.target_url,
        "status": project.status,
        "scan_timeout": scan_timeout,
    }

    from app.tasks.jenkins_tasks import trigger_jenkins_scan_async

    trigger_jenkins_scan_async.delay(
        scan_id=scan_obj.scan_id,
        scan_mode=scan_obj.scan_mode,
        selected_stages=scan_obj.selected_stages,
        project_data=project_data,
    )

    response.headers["X-Scan-Timeout-Actual"] = str(scan_timeout)

    return _scan_to_response(scan_obj)


@router.post("/scans/trigger-verify", response_model=ScanResponse, status_code=status.HTTP_201_CREATED,
  responses={403: {"description": "Forbidden"}, 404: {"description": "Not found"}, 409: {"description": "Conflict"}})
def trigger_verify_scan(
    project_id: str,
    tool: str,
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    """Trigger a single-tool verification scan (issue resolution workflow)."""
    from app.services.rbac_service import get_rbac_service
    rbac = get_rbac_service(db=db, user=current_user)
    if not rbac.can_approve_rescan(project_id):
        raise HTTPException(status_code=403, detail="Not authorized to trigger verify scan")

    # Lock the project row and enforce the one-active-scan-per-project invariant, same
    # as trigger_scan — otherwise a verify scan can be created in RUNNING state while a
    # regular scan is already active, leaving two active scans the rest of the code
    # assumes can't coexist.
    project = (
        db.query(ProjectDB)
        .filter(ProjectDB.project_id == project_id)
        .with_for_update()
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail=_PROJECT_NOT_FOUND)

    if project.last_scan_state and project.last_scan_state in [
        state.value for state in ACTIVE_STATES
    ]:
        raise HTTPException(
            status_code=409,
            detail="An active scan already exists for this project",
        )

    scan_id = f"verify-{tool}-{uuid.uuid4().hex[:8]}"
    scan_obj = ScanDB(
        scan_id=scan_id,
        project_id=project_id,
        state=ScanState.RUNNING,
        scan_mode="manual",
        selected_stages=[tool],
    )
    db.add(scan_obj)
    project.last_scan_state = scan_obj.state.value
    db.commit()
    db.refresh(scan_obj)

    # Link approved RescanRequestDB rows to this scan so auto_verify_pending_rescans
    # can match them after the scan completes.
    from app.services.issue_service import IssueService
    issue_svc = IssueService()
    pending_rescans = (
        db.query(RescanRequestDB)
        .join(IssueDB, IssueDB.id == RescanRequestDB.issue_id)
        .filter(
            RescanRequestDB.status == "approved",
            RescanRequestDB.scan_id.is_(None),
            IssueDB.project_id == project_id,
            IssueDB.tool_name == tool,
        )
        .all()
    )
    for rc in pending_rescans:
        rc.scan_id = scan_id
    if pending_rescans:
        db.commit()
        logger.info("Linked %d rescan requests to verify scan %s", len(pending_rescans), scan_id)

    project_data = {
        "project_id": project.project_id,
        "name": project.name,
        "git_url": project.git_url,
        "branch": project.branch or "main",
    }
    try:
        from app.services.jenkins_service import JenkinsService
        jenkins_svc = JenkinsService()
        jenkins_svc.trigger_scan_job(scan_obj, project_data)
    except Exception as e:
        logger.warning(f"Jenkins trigger failed for verify scan {scan_id}: {e}")
        scan_obj.state = ScanState.FAILED
        scan_obj.error_message = str(e)
        scan_obj.error_type = "TRIGGER_ERROR"
        project.last_scan_state = ScanState.FAILED.value
        db.commit()
        raise HTTPException(status_code=502, detail=f"Jenkins trigger failed: {e}")

    return _scan_to_response(scan_obj)


def _require_scan_access(db: Session, current_user, scan_obj: ScanDB) -> None:
    rbac = get_rbac_service(db=db, user=current_user)
    if not rbac.has_project_access(scan_obj.project_id):
        raise HTTPException(status_code=404, detail=_SCAN_NOT_FOUND)


@router.get("/scans/{scan_id}", response_model=ScanResponse,
  responses={404: {"description": "Not found"}})
def get_scan(
    scan_id: str,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    scan_obj = db.query(ScanDB).filter(ScanDB.scan_id == scan_id).first()
    if not scan_obj:
        raise HTTPException(status_code=404, detail=_SCAN_NOT_FOUND)
    _require_scan_access(db, current_user, scan_obj)

    project_obj = (
        db.query(ProjectDB).filter(ProjectDB.project_id == scan_obj.project_id).first()
    )
    if project_obj:
        _expire_scan_if_timed_out(db, scan_obj, project_obj)

    db.refresh(scan_obj)
    return _scan_to_response(scan_obj)


@router.get("/scans/{scan_id}/results", response_model=ScanResultsResponse,
  responses={404: {"description": "Not found"}})
def get_scan_results(
    scan_id: str,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    scan_obj = db.query(ScanDB).filter(ScanDB.scan_id == scan_id).first()
    if not scan_obj:
        raise HTTPException(status_code=404, detail=_SCAN_NOT_FOUND)
    _require_scan_access(db, current_user, scan_obj)

    project_obj = (
        db.query(ProjectDB).filter(ProjectDB.project_id == scan_obj.project_id).first()
    )
    if project_obj:
        _expire_scan_if_timed_out(db, scan_obj, project_obj)

    db.refresh(scan_obj)
    return {
        "scan_id": scan_obj.scan_id,
        "results": scan_obj.stage_results or [],
    }


@router.post("/scans/{scan_id}/retry-reports", response_model=ScanRetryReportsResponse,
  responses={400: {"description": "Bad request"}, 404: {"description": "Not found"}})
def retry_scan_reports(
    scan_id: str,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    scan_obj = db.query(ScanDB).filter(ScanDB.scan_id == scan_id).first()
    if not scan_obj:
        raise HTTPException(status_code=404, detail=_SCAN_NOT_FOUND)
    _require_scan_access(db, current_user, scan_obj)

    if not scan_obj.jenkins_build_number:
        raise HTTPException(
            status_code=400,
            detail="Scan has no associated Jenkins build number",
        )

    project_obj = (
        db.query(ProjectDB).filter(ProjectDB.project_id == scan_obj.project_id).first()
    )
    if not project_obj:
        raise HTTPException(status_code=404, detail=_PROJECT_NOT_FOUND)

    jenkins_base_url = resolve_jenkins_base_url(project_obj)

    from app.tasks.report_tasks import process_scan_reports_task

    task = process_scan_reports_task.delay(
        scan_id=scan_id,
        jenkins_build_number=scan_obj.jenkins_build_number,
        jenkins_base_url=jenkins_base_url,
    )

    return {
        "status": "queued",
        "message": "Report fetch re-queued",
        "scan_id": scan_id,
        "task_id": task.id,
    }


@router.get("/scans/{scan_id}/overview",
  responses={404: {"description": "Not found"}})
def get_scan_overview(
    scan_id: str,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    scan_obj = db.query(ScanDB).filter(ScanDB.scan_id == scan_id).first()
    if not scan_obj:
        raise HTTPException(status_code=404, detail=_SCAN_NOT_FOUND)
    _require_scan_access(db, current_user, scan_obj)

    project_obj = (
        db.query(ProjectDB).filter(ProjectDB.project_id == scan_obj.project_id).first()
    )
    if project_obj:
        _expire_scan_if_timed_out(db, scan_obj, project_obj)

    db.refresh(scan_obj)
    return _scan_to_response(scan_obj)


@router.get("/projects/{project_id}/scans", response_model=List[ScanHistoryResponse],
  responses={404: {"description": "Not found"}})
@limiter.limit("30/minute")
def get_project_scan_history(
    project_id: str,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
    limit: int = 20,
    offset: int = 0,
):
    project_obj = db.query(ProjectDB).filter(ProjectDB.project_id == project_id).first()
    if not project_obj:
        raise HTTPException(status_code=404, detail=_PROJECT_NOT_FOUND)

    rbac = get_rbac_service(db=db, user=current_user)
    if not rbac.has_project_access(project_id):
        raise HTTPException(status_code=404, detail=_PROJECT_NOT_FOUND)

    scans = (
        db.query(ScanDB)
        .filter(ScanDB.project_id == project_id)
        .order_by(ScanDB.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    history = []
    for scan_obj in scans:
        error = None
        if scan_obj.error_message:
            error = ScanError(
                message=scan_obj.error_message,
                error_type=scan_obj.error_type,
                jenkins_console_url=scan_obj.jenkins_console_url,
            )

        history.append(
            ScanHistoryResponse(
                scan_id=scan_obj.scan_id,
                state=scan_obj.state,
                created_at=scan_obj.created_at,
                started_at=scan_obj.started_at,
                finished_at=scan_obj.finished_at,
                retry_count=int(scan_obj.retry_count or 0),
                error=error,
            )
        )

    return history
