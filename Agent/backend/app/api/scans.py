from datetime import datetime, timedelta
import hashlib
import json
import logging
import uuid
from typing import List

from fastapi import (
    APIRouter,
    Header,
    HTTPException,
    status,
    Depends,
    Request,
    BackgroundTasks,
)
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.rate_limit import limiter
from app.schemas.scan import (
    ScanCreate,
    ScanResponse,
    ScanResultsResponse,
    ScanCancelResponse,
    ScanHistoryResponse,
    ScanError,
)
from app.services.jenkins_service import jenkins_service
from app.services.validation import VALID_STAGES, validate_scan_request
from app.state.scan_state import ScanState
from app.core.db import get_db
from app.models.db_models import ScanDB, ProjectDB
from app.websockets.manager import manager as websocket_manager

router = APIRouter()
logger = logging.getLogger(__name__)

TERMINAL_STATES = {ScanState.COMPLETED, ScanState.FAILED, ScanState.CANCELLED}
ACTIVE_STATES = {ScanState.CREATED, ScanState.QUEUED, ScanState.RUNNING}
MAX_ARTIFACT_URL_LENGTH = 2048
MAX_ARTIFACT_SIZE_BYTES = 50 * 1024 * 1024

# Stage-specific timeouts (in seconds)
STAGE_TIMEOUTS = {
    "git_checkout": 300,  # 5 minutes
    "sonar_scanner": 900,  # 15 minutes
    "sonar_quality_gate": 600,  # 10 minutes
    "npm_pip_install": 600,  # 10 minutes
    "dependency_check": 900,  # 15 minutes
    "trivy_fs_scan": 600,  # 10 minutes
    "docker_build": 900,  # 15 minutes
    "docker_push": 600,  # 10 minutes
    "trivy_image_scan": 600,  # 10 minutes
    "nmap_scan": 300,  # 5 minutes
    "zap_scan": 1800,  # 30 minutes
}


def calculate_scan_timeout(selected_stages: list) -> int:
    """Calculate dynamic timeout based on selected stages"""
    if not selected_stages:
        # Default: all stages
        return sum(STAGE_TIMEOUTS.values())

    total = 0
    for stage in selected_stages:
        total += STAGE_TIMEOUTS.get(stage, 300)  # Default 5 min per unknown stage

    # Add 20% buffer for overhead
    return int(total * 1.2)


JENKINS_STAGE_NAME_TO_ID = {
    "Git Checkout": "git_checkout",
    "Sonar Scanner": "sonar_scanner",
    "Sonar Quality Gate": "sonar_quality_gate",
    "NPM / PIP Install": "npm_pip_install",
    "Dependency Check": "dependency_check",
    "Trivy FS Scan": "trivy_fs_scan",
    "Docker Build": "docker_build",
    "Docker Push": "docker_push",
    "Trivy Image Scan": "trivy_image_scan",
    "Nmap Scan": "nmap_scan",
    "ZAP Scan": "zap_scan",
}

STAGE_STATUS_MAP = {
    "PASSED": "PASS",
    "PASS": "PASS",
    "FAILED": "FAIL",
    "FAIL": "FAIL",
    "SUCCESS": "PASS",
    "FAILURE": "FAIL",
    "SKIPPED": "SKIPPED",
    "WARN": "WARN",
    "UNSTABLE": "WARN",
}


def _json_digest(payload: dict) -> str:
    canonical_payload = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical_payload.encode("utf-8")).hexdigest()


def _validate_callback_auth(callback_token: str | None):
    if settings.ENV == "test":
        return
    expected = settings.CALLBACK_TOKEN.strip()
    if callback_token != expected:
        raise HTTPException(status_code=401, detail="Invalid callback token")


def _normalize_stage(stage: dict) -> dict:
    stage_id = stage.get("stage")
    if stage_id is None:
        stage_id = JENKINS_STAGE_NAME_TO_ID.get(stage.get("name"))
    if stage_id not in VALID_STAGES:
        raise HTTPException(
            status_code=400, detail=f"Invalid stage identifier: {stage_id}"
        )

    normalized_status = STAGE_STATUS_MAP.get(str(stage.get("status", "")).upper())
    if normalized_status is None:
        raise HTTPException(
            status_code=400, detail=f"Invalid stage status: {stage.get('status')}"
        )

    return {
        "stage": stage_id,
        "status": normalized_status,
        "summary": stage.get("summary") or stage.get("details"),
        "artifact_url": stage.get("artifact_url") or stage.get("reportUrl"),
        "artifact_size_bytes": stage.get("artifact_size_bytes"),
        "artifact_sha256": stage.get("artifact_sha256"),
    }


def _validate_callback_artifacts(stages: list[dict]):
    for stage in stages:
        artifact_url = stage.get("artifact_url")
        if artifact_url is not None:
            if not isinstance(artifact_url, str):
                raise HTTPException(
                    status_code=400, detail="artifact_url must be a string"
                )
            if len(artifact_url) > MAX_ARTIFACT_URL_LENGTH:
                raise HTTPException(
                    status_code=400,
                    detail="artifact_url exceeds maximum allowed length",
                )
            if not artifact_url.startswith(("http://", "https://", "/")):
                raise HTTPException(
                    status_code=400,
                    detail="artifact_url must be absolute HTTP(S) URL or absolute path",
                )

        artifact_size_bytes = stage.get("artifact_size_bytes")
        if artifact_size_bytes is not None:
            if not isinstance(artifact_size_bytes, int):
                raise HTTPException(
                    status_code=400, detail="artifact_size_bytes must be an integer"
                )
            if artifact_size_bytes < 0 or artifact_size_bytes > MAX_ARTIFACT_SIZE_BYTES:
                raise HTTPException(
                    status_code=400,
                    detail="artifact_size_bytes is out of allowed range",
                )

        artifact_sha256 = stage.get("artifact_sha256")
        if artifact_sha256 is not None:
            if not isinstance(artifact_sha256, str) or len(artifact_sha256) != 64:
                raise HTTPException(
                    status_code=400,
                    detail="artifact_sha256 must be a 64-char hex string",
                )
            if any(c not in "0123456789abcdefABCDEF" for c in artifact_sha256):
                raise HTTPException(
                    status_code=400, detail="artifact_sha256 must be hexadecimal"
                )


def _expire_scan_if_timed_out(
    db: Session,
    scan_obj: ScanDB,
    project_obj: ProjectDB,
    now: datetime = None,
    timeout_seconds: int = None,
    auto_commit: bool = True,
) -> bool:
    """
    Checks if a scan has exceeded its timeout.
    Performance Optimization (Bolt ⚡): Accepts pre-calculated 'now' and 'timeout_seconds'
    to avoid redundant calls in loops. 'auto_commit' allows batching DB writes.
    """
    if scan_obj.state in TERMINAL_STATES:
        return False

    now = now or datetime.utcnow()
    timeout_seconds = (
        timeout_seconds if timeout_seconds is not None else settings.SCAN_TIMEOUT
    )

    reference_time = scan_obj.started_at or scan_obj.created_at
    if now - reference_time > timedelta(seconds=timeout_seconds):
        scan_obj.state = ScanState.FAILED
        scan_obj.finished_at = now
        scan_obj.error_message = f"Scan timed out after {settings.SCAN_TIMEOUT} seconds"
        scan_obj.error_type = "TIMEOUT"
        project_obj.last_scan_state = scan_obj.state.value

        if auto_commit:
            db.commit()
        logger.warning(
            "Scan %s exceeded timeout (%s sec) and was marked FAILED",
            scan_obj.scan_id,
            timeout_seconds,
        )
        return True
    return False


def _scan_to_response(scan_obj: ScanDB) -> dict:
    error = None
    if scan_obj.error_message:
        error = {
            "message": scan_obj.error_message,
            "error_type": scan_obj.error_type,
            "jenkins_console_url": scan_obj.jenkins_console_url,
        }

    return {
        "scan_id": scan_obj.scan_id,
        "project_id": scan_obj.project_id,
        "scan_mode": scan_obj.scan_mode,
        "state": scan_obj.state.value
        if hasattr(scan_obj.state, "value")
        else str(scan_obj.state),
        "selected_stages": scan_obj.selected_stages,
        "created_at": scan_obj.created_at,
        "started_at": scan_obj.started_at,
        "finished_at": scan_obj.finished_at,
        "results": scan_obj.stage_results,
        "error": error,
        "retry_count": int(scan_obj.retry_count or 0),
    }


@router.get("/scans", response_model=List[ScanResponse])
@limiter.limit("1000/minute" if settings.ENV == "test" else "50/minute")
def list_scans(request: Request, db: Session = Depends(get_db)):
    """
    Performance Optimization (Bolt ⚡):
    1. Fetches all scans and relevant projects in single batch queries to solve N+1 problem.
    2. Batches DB commits for timed-out scans.
    3. Reuses scan objects for response, skipping redundant DB query.
    """
    scans = db.query(ScanDB).all()

    # Identify active scans that might need timeout processing
    active_scans = [s for s in scans if s.state not in TERMINAL_STATES]

    if active_scans:
        # Batch fetch all relevant projects to avoid N+1 queries
        project_ids = {s.project_id for s in active_scans}
        projects = (
            db.query(ProjectDB).filter(ProjectDB.project_id.in_(project_ids)).all()
        )
        project_map = {p.project_id: p for p in projects}

        # Pre-calculate common values for timeout check
        now = datetime.utcnow()
        timeout_seconds = settings.SCAN_TIMEOUT
        any_expired = False

        for scan_obj in active_scans:
            project_obj = project_map.get(scan_obj.project_id)
            if project_obj:
                if _expire_scan_if_timed_out(
                    db, scan_obj, project_obj, now, timeout_seconds, auto_commit=False
                ):
                    any_expired = True

        # Single commit for all processed timeouts
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

    # Calculate dynamic timeout based on selected stages
    scan_timeout = calculate_scan_timeout(scan.selected_stages)

    # Allow manual timeout override via X-Scan-Timeout header
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

    # Optimistic update: Set state to RUNNING immediately to avoid race condition
    # where client queries status before Celery task updates from QUEUED to RUNNING.
    # If Jenkins trigger fails, the Celery task will update state to FAILED.
    scan_obj = ScanDB(
        scan_id=scan_id,
        project_id=scan.project_id,
        scan_mode=scan.scan_mode,
        selected_stages=scan.selected_stages or [],
        state=ScanState.RUNNING,
        created_at=datetime.utcnow(),
        started_at=datetime.utcnow(),
        jenkins_build_number=None,
        jenkins_queue_id=None,
        stage_results=[],
        callback_digests=[],
    )
    db.add(scan_obj)
    project.last_scan_state = scan_obj.state.value
    db.commit()
    db.refresh(scan_obj)

    # Broadcast initial update (Phase 3.1)
    background_tasks.add_task(
        websocket_manager.send_scan_update,
        scan_id=scan_obj.scan_id,
        project_id=scan_obj.project_id,
        data=_scan_to_response(scan_obj),
    )

    # Explicitly map project fields to ensure proper serialization
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
        "scan_timeout": scan_timeout,  # Pass timeout to Jenkins
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


@router.post("/scans/{scan_id}/callback")
def scan_callback(
    scan_id: str,
    report: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    x_callback_token: str | None = Header(default=None, alias="X-Callback-Token"),
):
    _validate_callback_auth(x_callback_token)

    scan_obj = db.query(ScanDB).filter(ScanDB.scan_id == scan_id).first()
    if not scan_obj:
        raise HTTPException(status_code=404, detail="Scan not found")

    project_obj = (
        db.query(ProjectDB).filter(ProjectDB.project_id == scan_obj.project_id).first()
    )
    if project_obj:
        _expire_scan_if_timed_out(db, scan_obj, project_obj)

    db.refresh(scan_obj)

    callback_digest = _json_digest(report)
    current_digests = scan_obj.callback_digests or []
    if callback_digest in current_digests:
        return {"status": "success", "idempotent": True}

    if scan_obj.state in TERMINAL_STATES:
        logger.info("Ignoring callback for terminal scan %s", scan_id)
        current_digests.append(callback_digest)
        # SQLAlchemy mutability for JSON fields needs assignment
        scan_obj.callback_digests = list(current_digests)
        db.commit()
        return {"status": "success", "idempotent": True}

    stages = report.get("stages", [])
    if not isinstance(stages, list):
        raise HTTPException(status_code=400, detail="stages must be a list")

    normalized_stages = [_normalize_stage(stage) for stage in stages]
    _validate_callback_artifacts(normalized_stages)
    scan_obj.stage_results = normalized_stages

    jenkins_status = str(report.get("status", "")).upper()
    if jenkins_status == "SUCCESS":
        scan_obj.state = ScanState.COMPLETED
    elif jenkins_status in {"FAILURE", "ABORTED", "UNSTABLE"}:
        scan_obj.state = ScanState.FAILED

        # Store error details from Jenkins callback (Phase 3 enhancement)
        error_message = report.get("error_message")
        error_type = report.get("error_type")
        jenkins_console_url = report.get("jenkins_console_url")

        if error_message:
            scan_obj.error_message = error_message
        if error_type:
            scan_obj.error_type = error_type
        if jenkins_console_url:
            scan_obj.jenkins_console_url = jenkins_console_url

        logger.info(
            f"Scan {scan_id} failed with error type: {error_type}, message: {error_message}"
        )
    else:
        raise HTTPException(status_code=400, detail="Invalid callback status")

    build_number = report.get("build_number")
    if build_number is None:
        build_number = report.get("buildNumber")
    if build_number is not None:
        scan_obj.jenkins_build_number = str(build_number)

    queue_id = report.get("queue_id")
    if queue_id is None:
        queue_id = report.get("queueId")
    if queue_id is not None:
        scan_obj.jenkins_queue_id = str(queue_id)

    if project_obj:
        project_obj.last_scan_state = scan_obj.state.value

    finished_at_str = report.get("finishedAt")
    if finished_at_str:
        try:
            scan_obj.finished_at = datetime.fromisoformat(
                finished_at_str.replace("Z", "+00:00")
            )
        except ValueError:
            scan_obj.finished_at = datetime.utcnow()
    elif scan_obj.state in TERMINAL_STATES:
        scan_obj.finished_at = datetime.utcnow()

    current_digests.append(callback_digest)
    scan_obj.callback_digests = list(current_digests)
    db.commit()

    # Broadcast update to all connected clients (Phase 3.1)
    background_tasks.add_task(
        websocket_manager.send_scan_update,
        scan_id=scan_obj.scan_id,
        project_id=scan_obj.project_id,
        data=_scan_to_response(scan_obj),
    )

    return {"status": "success"}


@router.post("/scans/{scan_id}/reset", response_model=ScanResponse)
@limiter.limit("10/minute")
def reset_scan(
    scan_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Reset a stuck or failed scan to allow re-running.

    This endpoint:
    - Resets scan state to NONE
    - Updates project's last_scan_state to NONE
    - Clears error messages
    - Allows new scan to be triggered
    """
    # Find scan
    scan_obj = db.query(ScanDB).filter(ScanDB.scan_id == scan_id).first()
    if not scan_obj:
        raise HTTPException(status_code=404, detail="Scan not found")

    # Find project
    project_obj = (
        db.query(ProjectDB).filter(ProjectDB.project_id == scan_obj.project_id).first()
    )
    if not project_obj:
        raise HTTPException(status_code=404, detail="Project not found")

    # Reset scan state
    scan_obj.state = ScanState.CREATED
    scan_obj.retry_count = str(int(scan_obj.retry_count or 0) + 1)
    scan_obj.started_at = None
    scan_obj.finished_at = None
    scan_obj.error_message = None
    scan_obj.error_type = None
    scan_obj.jenkins_console_url = None
    scan_obj.stage_results = []
    scan_obj.callback_digests = []

    # Reset project state
    project_obj.last_scan_state = ScanState.CREATED.value

    db.commit()
    db.refresh(scan_obj)

    # Broadcast reset update (Phase 3.1)
    background_tasks.add_task(
        websocket_manager.send_scan_update,
        scan_id=scan_obj.scan_id,
        project_id=scan_obj.project_id,
        data=_scan_to_response(scan_obj),
    )

    logger.info(f"Scan {scan_id} reset successfully")

    return _scan_to_response(scan_obj)


@router.post("/scans/{scan_id}/cancel", response_model=ScanCancelResponse)
@limiter.limit("10/minute")
def cancel_scan(
    scan_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Cancel a running scan.

    This endpoint:
    - Marks scan as CANCELLED
    - Updates project's last_scan_state
    - Note: Does NOT cancel Jenkins job (would need Jenkins integration)
    """
    # Find scan
    scan_obj = db.query(ScanDB).filter(ScanDB.scan_id == scan_id).first()
    if not scan_obj:
        raise HTTPException(status_code=404, detail="Scan not found")

    # Check if scan can be cancelled
    if scan_obj.state in TERMINAL_STATES:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel scan in {scan_obj.state.value} state",
        )

    # Cancel scan
    scan_obj.state = ScanState.CANCELLED
    scan_obj.finished_at = datetime.utcnow()
    scan_obj.error_message = "Cancelled by user"
    scan_obj.error_type = "USER_CANCELLED"

    # Update project state
    project_obj = (
        db.query(ProjectDB).filter(ProjectDB.project_id == scan_obj.project_id).first()
    )
    if project_obj:
        project_obj.last_scan_state = ScanState.CANCELLED.value

    db.commit()

    # Broadcast cancellation update (Phase 3.1)
    background_tasks.add_task(
        websocket_manager.send_scan_update,
        scan_id=scan_obj.scan_id,
        project_id=scan_obj.project_id,
        data=_scan_to_response(scan_obj),
    )

    logger.info(f"Scan {scan_id} cancelled")

    return ScanCancelResponse(
        status="success",
        message=f"Scan {scan_id} cancelled successfully",
        scan_id=scan_id,
    )


@router.get("/projects/{project_id}/scans", response_model=List[ScanHistoryResponse])
@limiter.limit("30/minute")
def get_project_scan_history(
    project_id: str,
    request: Request,
    db: Session = Depends(get_db),
    limit: int = 20,
    offset: int = 0,
):
    """
    Get scan history for a project.

    Returns list of all scans for the project with:
    - Scan ID and state
    - Timestamps
    - Error details (if failed)
    - Retry count
    """
    # Verify project exists
    project_obj = db.query(ProjectDB).filter(ProjectDB.project_id == project_id).first()
    if not project_obj:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get scans ordered by created_at descending (newest first)
    scans = (
        db.query(ScanDB)
        .filter(ScanDB.project_id == project_id)
        .order_by(ScanDB.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    # Convert to response format
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
