import uuid
import shutil
from pathlib import Path
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Depends, status, Request
from sqlalchemy import func, and_
from sqlalchemy.orm import Session
from app.schemas.project import ProjectCreate, ProjectResponse, ProjectUpdate
from app.core.db import get_db
from app.core.auth import get_current_user
from app.models.db_models import ProjectDB, ScanDB, UserDB
from app.core.config import settings
from app.api.scans.utils import _expire_scan_if_timed_out
from app.state.scan_state import ScanState

router = APIRouter()

ACTIVE_STATES = {
    ScanState.CREATED.value,
    ScanState.QUEUED.value,
    ScanState.RUNNING.value,
}


def _is_api_key_auth(request: Request) -> bool:
    """Check if request is authenticated via API key (service account pattern)."""
    api_key = request.headers.get("X-API-Key")
    return bool(api_key and api_key == settings.API_KEY)


def _get_user_id_filter(request: Request, current_user) -> str | None:
    """Return user_id filter for queries. API-key auth sees all data (returns None)."""
    if _is_api_key_auth(request):
        return None  # Service account: see all data
    if hasattr(current_user, 'id'):
        return current_user.id
    return None  # Fallback for test-bypass user


def _filter_projects_by_user(query, request: Request, current_user):
    """Apply user-level data isolation to a ProjectDB query."""
    user_id = _get_user_id_filter(request, current_user)
    if user_id is not None:
        return query.filter(ProjectDB.user_id == user_id)
    return query  # API-key auth: no filter


def _get_last_scan_map(db: Session) -> dict[str, str]:
    subq = (
        db.query(
            ScanDB.project_id,
            func.max(ScanDB.created_at).label("max_created"),
        )
        .group_by(ScanDB.project_id)
        .subquery()
    )
    rows = (
        db.query(ScanDB.project_id, ScanDB.scan_id)
        .join(
            subq,
            and_(
                ScanDB.project_id == subq.c.project_id,
                ScanDB.created_at == subq.c.max_created,
            ),
        )
        .all()
    )
    return {row.project_id: row.scan_id for row in rows}


@router.get("/projects", response_model=list[dict])
def list_projects(request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    last_scan_map = _get_last_scan_map(db)
    db_projects = _filter_projects_by_user(db.query(ProjectDB), request, current_user).all()

    now = datetime.now(timezone.utc)
    any_expired = False
    for p in db_projects:
        if p.last_scan_state in ACTIVE_STATES:
            active_scan = (
                db.query(ScanDB)
                .filter(
                    ScanDB.project_id == p.project_id,
                    ScanDB.state.in_(
                        [ScanState.CREATED, ScanState.QUEUED, ScanState.RUNNING]
                    ),
                )
                .first()
            )
            if active_scan:
                if _expire_scan_if_timed_out(db, active_scan, p, now, auto_commit=False):
                    any_expired = True
    if any_expired:
        db.commit()

    projects = []
    for p in db_projects:
        last_scan_id = last_scan_map.get(p.project_id)
        last_scan_time = None
        if last_scan_id:
            last_scan = db.query(ScanDB).filter(ScanDB.scan_id == last_scan_id).first()
            if last_scan and last_scan.created_at:
                # Convert UTC to IST (UTC+5:30)
                dt = last_scan.created_at
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                # Add 5:30 hours for IST
                ist_dt = dt + timedelta(hours=5, minutes=30)
                last_scan_time = ist_dt.strftime("%Y-%m-%dT%H:%M:%S")
        projects.append(
            {
                "project_id": p.project_id,
                "name": p.name,
                "last_scan_state": p.last_scan_state,
                "last_scan_id": last_scan_id,
                "last_scan_time": last_scan_time,
            }
        )
    return projects


@router.post("/projects", response_model=ProjectResponse)
def create_project(project: ProjectCreate, request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    project_id = str(uuid.uuid4())
    user_id = current_user.id if hasattr(current_user, 'id') else None
    db_project = ProjectDB(
        project_id=project_id,
        name=project.name,
        git_url=str(project.git_url) if project.git_url else None,
        branch=project.branch,
        credentials_id=project.credentials_id,
        sonar_key=project.sonar_key,
        target_ip=project.target_ip,
        target_url=str(project.target_url) if project.target_url else None,
        user_id=user_id,
        status="CREATED",
    )
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project


@router.get("/projects/{project_id}", response_model=ProjectResponse)
def get_project(project_id: str, request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    db_project = _filter_projects_by_user(db.query(ProjectDB), request, current_user).filter(ProjectDB.project_id == project_id).first()
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")
    last_scan = (
        db.query(ScanDB)
        .filter(ScanDB.project_id == project_id)
        .order_by(ScanDB.created_at.desc())
        .first()
    )
    project_data = dict(db_project.__dict__)
    project_data.pop("_sa_instance_state", None)
    project_data["last_scan_state"] = db_project.last_scan_state
    project_data["last_scan_id"] = last_scan.scan_id if last_scan else None
    return project_data


@router.patch("/projects/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: str, project: ProjectUpdate, request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)
):
    db_project = _filter_projects_by_user(db.query(ProjectDB), request, current_user).filter(ProjectDB.project_id == project_id).first()
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")

    if db_project.last_scan_state in ACTIVE_STATES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Project cannot be edited while a scan is active",
        )

    update_data = project.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_project, field, value)

    db.commit()
    db.refresh(db_project)

    last_scan = (
        db.query(ScanDB)
        .filter(ScanDB.project_id == project_id)
        .order_by(ScanDB.created_at.desc())
        .first()
    )
    project_data = dict(db_project.__dict__)
    project_data.pop("_sa_instance_state", None)
    project_data["last_scan_state"] = db_project.last_scan_state
    project_data["last_scan_id"] = last_scan.scan_id if last_scan else None
    return project_data


@router.delete("/projects/{project_id}")
def delete_project(project_id: str, request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    db_project = _filter_projects_by_user(db.query(ProjectDB), request, current_user).filter(ProjectDB.project_id == project_id).first()
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")
    scans = db.query(ScanDB).filter(ScanDB.project_id == project_id).all()
    scan_ids = [scan.scan_id for scan in scans]
    for scan in scans:
        db.delete(scan)
    db.delete(db_project)
    db.commit()
    deleted_artifacts = 0
    storage_root = Path(settings.STORAGE_PATH)
    for scan_id in scan_ids:
        scan_path = storage_root / scan_id
        if scan_path.exists():
            shutil.rmtree(scan_path, ignore_errors=True)
            deleted_artifacts += 1
    return {
        "detail": "Project deleted successfully",
        "deleted_scans": len(scan_ids),
        "deleted_artifact_paths": deleted_artifacts,
    }
