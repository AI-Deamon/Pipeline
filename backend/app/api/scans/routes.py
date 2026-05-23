from datetime import datetime, timedelta, timezone
import logging
import uuid
from typing import List

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    Header,
    HTTPException,
    Request,
    status,
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.rate_limit import limiter
from app.models.db_models import ProjectDB, ScanDB
from app.schemas.scan import (
    ScanCancelResponse,
    ScanCreate,
    ScanError,
    ScanHistoryResponse,
    ScanResponse,
    ScanResultsResponse,
    ScanRetryReportsResponse,
)
from app.services.validation import validate_scan_request
from app.state.scan_state import ScanState
from app.websockets.manager import manager as websocket_manager

from .utils import (
    ACTIVE_STATES,
    TERMINAL_STATES,
    calculate_scan_timeout,
    _expire_scan_if_timed_out,
    _scan_to_response,
)
from .callback import router as callback_router
from .state import router as state_router

router = APIRouter()
logger = logging.getLogger(__name__)

router.include_router(callback_router)
router.include_router(state_router)


@router.get("/scans", response_model=List[ScanResponse])
@limiter.limit("1000/minute" if settings.ENV == "test" else "50/minute")
def list_scans(request: Request, db: Session = Depends(get_db)):
    scans = db.query(ScanDB).all()

    active_scans = [s for s in scans if s.state not in TERMINAL_STATES]

    if active_scans:
        project_ids = {s.project_id for s in active_scans}
        projects = (
            db.query(ProjectDB).filter(ProjectDB.project_id.in_(project_ids)).all()
        )
        project_map = {p.project_id: p for p in projects}

        now = datetime.now(timezone.utc)
        timeout_seconds = settings.SCAN_TIMEOUT
        any_expired = False

        for scan_obj in active_scans:
            project_obj = project_map.get(scan_obj.project_id)
            if project_obj:
                if _expire_scan_if_timed_out(
                    db, scan_obj, project_obj, now, timeout_seconds, auto_commit=False
                ):
                    any_expired = True

        if any_expired:
            db.commit()

    return [_scan_to_response(s) for s in scans]


@router.post("/scans", response_model=ScanResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("1000/minute" if settings.ENV == "test" else "10/minute")
def trigger_scan(
    request: Request,
    scan: ScanCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    x_scan_timeout: str | None = Header(default=None, alias="X-Scan-Timeout"),
):
    try:
        validate_scan_request(scan)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    project = (
        db.query(ProjectDB).filter(ProjectDB.project_id == scan.project_id).first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if project.last_scan_state and project.last_scan_state in [
        state.value for state in ACTIVE_STATES
    ]:
        raise HTTPException(
            status_code=409,
            detail="An active scan already exists for this project",
        )

    scan_id = str(uuid.uuid4())

    scan_timeout = calculate_scan_timeout(scan.selected_stages)

    if x_scan_timeout:
        try:
            override_timeout = int(x_scan_timeout)
            if override_timeout > 0:
                scan_timeout = override_timeout
                logger.info(
                    f"Scan timeout overridden via header: {scan_timeout} seconds ({scan_timeout / 60:.1f} minutes)"
                )
            else:
                logger.warning(
                    f"Invalid X-Scan-Timeout header value ({x_scan_timeout}), using calculated timeout"
                )
        except ValueError:
            logger.warning(
                f"Invalid X-Scan-Timeout header value ({x_scan_timeout}), using calculated timeout"
            )

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
        )
        db.add(scan_obj)
        project.last_scan_state = scan_obj.state.value
        db.commit()
    except IntegrityError as e:
        db.rollback()
        if "ix_scans_project_state" in str(e.orig) or "uq_project_active_state" in str(
            e.orig
        ):
            logger.info(
                f"Duplicate scan prevented for project {scan.project_id} (database constraint)"
            )
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

    logger.info(f"Project data before sending to celery: {project_data}")
    logger.info(
        f"Calculated scan timeout: {scan_timeout} seconds ({scan_timeout / 60:.1f} minutes)"
    )

    from app.tasks.jenkins_tasks import trigger_jenkins_scan_async

    trigger_jenkins_scan_async.delay(
        scan_id=scan_obj.scan_id,
        scan_mode=scan_obj.scan_mode,
        selected_stages=scan_obj.selected_stages,
        project_data=project_data,
    )

    return _scan_to_response(scan_obj)


@router.get("/scans/{scan_id}", response_model=ScanResponse)
def get_scan(scan_id: str, db: Session = Depends(get_db)):
    scan_obj = db.query(ScanDB).filter(ScanDB.scan_id == scan_id).first()
    if not scan_obj:
        raise HTTPException(status_code=404, detail="Scan not found")

    project_obj = (
        db.query(ProjectDB).filter(ProjectDB.project_id == scan_obj.project_id).first()
    )
    if project_obj:
        _expire_scan_if_timed_out(db, scan_obj, project_obj)

    db.refresh(scan_obj)
    return _scan_to_response(scan_obj)


@router.get("/scans/{scan_id}/results", response_model=ScanResultsResponse)
def get_scan_results(scan_id: str, db: Session = Depends(get_db)):
    scan_obj = db.query(ScanDB).filter(ScanDB.scan_id == scan_id).first()
    if not scan_obj:
        raise HTTPException(status_code=404, detail="Scan not found")

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


@router.post("/scans/{scan_id}/retry-reports", response_model=ScanRetryReportsResponse)
def retry_scan_reports(scan_id: str, db: Session = Depends(get_db)):
    """
    Re-trigger report fetching for a completed scan.
    Useful when Jenkins was unreachable during the original fetch.
    """
    scan_obj = db.query(ScanDB).filter(ScanDB.scan_id == scan_id).first()
    if not scan_obj:
        raise HTTPException(status_code=404, detail="Scan not found")

    if not scan_obj.jenkins_build_number:
        raise HTTPException(
            status_code=400,
            detail="Scan has no associated Jenkins build number",
        )

    project_obj = (
        db.query(ProjectDB).filter(ProjectDB.project_id == scan_obj.project_id).first()
    )
    if not project_obj:
        raise HTTPException(status_code=404, detail="Project not found")

    jenkins_base_url = (
        f"http://{project_obj.target_ip}"
        if project_obj.target_ip
        else settings.JENKINS_BASE_URL
    )

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


@router.get("/scans/{scan_id}/overview")
def get_scan_overview(scan_id: str, db: Session = Depends(get_db)):
    scan_obj = db.query(ScanDB).filter(ScanDB.scan_id == scan_id).first()
    if not scan_obj:
        raise HTTPException(status_code=404, detail="Scan not found")

    project_obj = (
        db.query(ProjectDB).filter(ProjectDB.project_id == scan_obj.project_id).first()
    )
    if project_obj:
        _expire_scan_if_timed_out(db, scan_obj, project_obj)

    db.refresh(scan_obj)
    return _scan_to_response(scan_obj)


@router.get("/projects/{project_id}/scans", response_model=List[ScanHistoryResponse])
@limiter.limit("30/minute")
def get_project_scan_history(
    project_id: str,
    request: Request,
    db: Session = Depends(get_db),
    limit: int = 20,
    offset: int = 0,
):
    project_obj = db.query(ProjectDB).filter(ProjectDB.project_id == project_id).first()
    if not project_obj:
        raise HTTPException(status_code=404, detail="Project not found")

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
                finished_at=scan_obj.finished_at,
                retry_count=int(scan_obj.retry_count or 0),
                error=error,
            )
        )

    return history
