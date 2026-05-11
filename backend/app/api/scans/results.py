"""GET endpoints for scan results and overview."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.scans.constants import TERMINAL_STATES
from app.api.scans.helpers import (
    expire_scan_if_timed_out,
    check_scan_not_started,
    scan_to_response,
    format_results,
)
from app.core.db import get_db
from app.models.db_models import ScanDB, ProjectDB
from app.schemas.scan import ScanResultsResponse, ScanResponse

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/scans/{scan_id}", response_model=ScanResponse)
def get_scan(scan_id: str, db: Session = Depends(get_db)):
    """Get full scan details with timeout check."""
    scan_obj = db.query(ScanDB).filter(ScanDB.scan_id == scan_id).first()
    if not scan_obj:
        raise HTTPException(status_code=404, detail="Scan not found")

    project_obj = (
        db.query(ProjectDB).filter(ProjectDB.project_id == scan_obj.project_id).first()
    )
    if project_obj:
        # Check for timeout (scan running too long)
        expire_scan_if_timed_out(db, scan_obj, project_obj)
        # Check if Jenkins never started the scan (e.g., Jenkinsfile syntax error)
        check_scan_not_started(db, scan_obj, project_obj)

    db.refresh(scan_obj)
    return scan_to_response(scan_obj)


@router.get("/scans/{scan_id}/results", response_model=ScanResultsResponse)
def get_scan_results(scan_id: str, db: Session = Depends(get_db)):
    """Get scan stage results only."""
    scan_obj = db.query(ScanDB).filter(ScanDB.scan_id == scan_id).first()
    if not scan_obj:
        raise HTTPException(status_code=404, detail="Scan not found")

    project_obj = (
        db.query(ProjectDB).filter(ProjectDB.project_id == scan_obj.project_id).first()
    )
    if project_obj:
        expire_scan_if_timed_out(db, scan_obj, project_obj)
        check_scan_not_started(db, scan_obj, project_obj)

    db.refresh(scan_obj)
    return {
        "scan_id": scan_obj.scan_id,
        "results": scan_obj.stage_results or [],
    }


@router.get("/scans/{scan_id}/overview")
def get_scan_overview(scan_id: str, db: Session = Depends(get_db)):
    """Get scan overview (formatted results with summary)."""
    scan_obj = db.query(ScanDB).filter(ScanDB.scan_id == scan_id).first()
    if not scan_obj:
        raise HTTPException(status_code=404, detail="Scan not found")

    project_obj = (
        db.query(ProjectDB).filter(ProjectDB.project_id == scan_obj.project_id).first()
    )
    if project_obj:
        expire_scan_if_timed_out(db, scan_obj, project_obj)
        check_scan_not_started(db, scan_obj, project_obj)

    db.refresh(scan_obj)
    return format_results(scan_obj)
