from datetime import datetime, timezone
import logging
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.rate_limit import limiter
from app.models.db_models import ProjectDB, ScanDB
from app.schemas.scan import ScanCancelResponse, ScanResponse
from app.state.scan_state import ScanState
from app.websockets.manager import manager as websocket_manager

from app.core.auth import get_current_user, require_admin
from app.services.rbac_service import get_rbac_service
from .utils import (
    TERMINAL_STATES,
    _scan_to_response,
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/scans/{scan_id}/cancel", response_model=ScanCancelResponse,
  responses={400: {"description": "Bad request"}, 404: {"description": "Not found"}})
@limiter.limit("10/minute")
def cancel_scan(
    scan_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    # Lock the row for the duration of this request, the same pattern callback.py and
    # scan_recovery.py use, and re-check the terminal-state guard *after* acquiring
    # the lock — not just before. Without this (finding #94), a concurrent callback
    # or recovery-sweep commit could land between the initial unlocked read and this
    # endpoint's write, and this endpoint's unconditional UPDATE would silently
    # overwrite whatever the other path just committed (e.g. a real COMPLETED/FAILED
    # outcome gets clobbered back to CANCELLED using state read before the race).
    scan_obj = (
        db.query(ScanDB).filter(ScanDB.scan_id == scan_id).with_for_update().first()
    )
    if not scan_obj:
        raise HTTPException(status_code=404, detail="Scan not found")

    rbac = get_rbac_service(db=db, user=current_user)
    if not rbac.has_project_access(scan_obj.project_id):
        raise HTTPException(status_code=404, detail="Scan not found")

    if scan_obj.state in TERMINAL_STATES:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel scan in {scan_obj.state.value} state",
        )

    scan_obj.state = ScanState.CANCELLED
    scan_obj.finished_at = datetime.now(timezone.utc)
    scan_obj.error_message = "Cancelled by user"
    scan_obj.error_type = "USER_CANCELLED"

    project_obj = (
        db.query(ProjectDB)
        .filter(ProjectDB.project_id == scan_obj.project_id)
        .with_for_update()
        .first()
    )
    if project_obj:
        project_obj.last_scan_state = ScanState.CANCELLED.value

    db.commit()

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


@router.post("/scans/{scan_id}/force-unlock",
  responses={400: {"description": "Bad request"}, 404: {"description": "Not found"}})
@limiter.limit("10/minute")
def force_unlock_scan(
    scan_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(require_admin)],
):
    # See the matching comment in cancel_scan above — same race, same fix.
    scan_obj = (
        db.query(ScanDB).filter(ScanDB.scan_id == scan_id).with_for_update().first()
    )
    if not scan_obj:
        raise HTTPException(status_code=404, detail="Scan not found")

    if scan_obj.state in TERMINAL_STATES:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot unlock scan in {scan_obj.state.value} state (already in terminal state)",
        )

    scan_obj.state = ScanState.FAILED
    scan_obj.finished_at = datetime.now(timezone.utc)
    scan_obj.error_message = "Scan unlocked by administrator"
    scan_obj.error_type = "ADMIN_RECOVERY"

    project_obj = (
        db.query(ProjectDB)
        .filter(ProjectDB.project_id == scan_obj.project_id)
        .with_for_update()
        .first()
    )
    if project_obj:
        project_obj.last_scan_state = ScanState.FAILED.value

    db.commit()

    background_tasks.add_task(
        websocket_manager.send_scan_update,
        scan_id=scan_obj.scan_id,
        project_id=scan_obj.project_id,
        data=_scan_to_response(scan_obj),
    )

    logger.info(f"Scan {scan_id} force-unlocked by administrator")

    return {
        "status": "success",
        "message": f"Scan {scan_id} unlocked successfully",
        "scan_id": scan_id,
    }
