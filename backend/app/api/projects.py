import uuid
import shutil
from pathlib import Path
from datetime import datetime, timedelta, timezone
from typing import Annotated
from fastapi import APIRouter, HTTPException, Depends, status, Request
from sqlalchemy import func, and_
from sqlalchemy.orm import Session
from app.schemas.project import ProjectCreate, ProjectResponse, ProjectUpdate
from app.core.db import get_db
from app.core.auth import get_current_user, get_rbac
from app.models.db_models import ProjectDB, ScanDB, UserDB, ProjectAssignmentDB
from app.core.config import settings
from app.api.scans.utils import _expire_scan_if_timed_out
from app.state.scan_state import ScanState
from app.services.rbac_service import get_rbac_service
router = APIRouter()

_PROJECT_NOT_FOUND = "Project not found"
_GITHUB_COM = "github.com"

ACTIVE_STATES = {
    ScanState.CREATED.value,
    ScanState.QUEUED.value,
    ScanState.RUNNING.value,
}


def _is_api_key_auth(request: Request) -> bool:
    api_key = request.headers.get("X-API-Key")
    return bool(api_key and api_key == settings.API_KEY)


def _get_user_id_filter(request: Request, current_user) -> str | None:
    if _is_api_key_auth(request):
        return None
    if hasattr(current_user, 'id'):
        return current_user.id
    return None


def _filter_projects_by_user(query, request: Request, current_user, db: Session | None = None):
    if _is_api_key_auth(request):
        return query
    if db is not None:
        rbac = get_rbac_service(db=db, user=current_user)
        if rbac.is_admin:
            return query
        effective_ids = rbac.get_effective_project_ids()
        if effective_ids:
            return query.filter(ProjectDB.project_id.in_(effective_ids))
        return query.filter(ProjectDB.project_id == "__no_access__")
    return query


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


def _expire_active_scans(db: Session, db_projects: list) -> bool:
    now = datetime.now(timezone.utc)
    any_expired = False
    for p in db_projects:
        if p.last_scan_state not in ACTIVE_STATES:
            continue
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
        if active_scan and _expire_scan_if_timed_out(db, active_scan, p, now, auto_commit=False):
            any_expired = True
    return any_expired


def _build_project_list(db: Session, db_projects: list, last_scan_map: dict) -> list:
    projects = []
    for p in db_projects:
        last_scan_id = last_scan_map.get(p.project_id)
        last_scan_time = None
        if last_scan_id:
            last_scan = db.query(ScanDB).filter(ScanDB.scan_id == last_scan_id).first()
            if last_scan and last_scan.created_at:
                dt = last_scan.created_at
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                last_scan_time = dt.strftime("%Y-%m-%dT%H:%M:%SZ")
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


@router.get("/projects", response_model=list[dict])
def list_projects(request: Request, db: Annotated[Session, Depends(get_db)], current_user: Annotated[dict, Depends(get_current_user)]):
    last_scan_map = _get_last_scan_map(db)
    db_projects = _filter_projects_by_user(db.query(ProjectDB), request, current_user).all()

    if _expire_active_scans(db, db_projects):
        db.commit()

    return _build_project_list(db, db_projects, last_scan_map)


@router.post("/projects", response_model=ProjectResponse)
def create_project(project: ProjectCreate, request: Request, db: Annotated[Session, Depends(get_db)], current_user: Annotated[dict, Depends(get_current_user)]):
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


@router.get("/projects/{project_id}", response_model=ProjectResponse,
  responses={404: {"description": "Not found"}})
def get_project(project_id: str, request: Request, db: Annotated[Session, Depends(get_db)], current_user: Annotated[dict, Depends(get_current_user)]):
    db_project = _filter_projects_by_user(db.query(ProjectDB), request, current_user).filter(ProjectDB.project_id == project_id).first()
    if not db_project:
        raise HTTPException(status_code=404, detail=_PROJECT_NOT_FOUND)
    last_scan = (
        db.query(ScanDB)
        .filter(ScanDB.project_id == project_id)
        .order_by(ScanDB.created_at.desc())
        .first()
    )
    return ProjectResponse(
        project_id=db_project.project_id,
        name=db_project.name,
        status=db_project.status,
        last_scan_state=db_project.last_scan_state,
        last_scan_id=last_scan.scan_id if last_scan else None,
        user_id=db_project.user_id,
        git_url=db_project.git_url,
        branch=db_project.branch or "main",
        credentials_id=db_project.credentials_id,
        sonar_key=db_project.sonar_key,
        target_ip=db_project.target_ip,
        target_url=db_project.target_url,
        created_at=db_project.created_at,
        updated_at=db_project.updated_at,
    )


@router.patch("/projects/{project_id}", response_model=ProjectResponse,
  responses={404: {"description": "Not found"}, 409: {"description": "Conflict"}})
def update_project(
    project_id: str, project: ProjectUpdate, request: Request, db: Annotated[Session, Depends(get_db)], current_user: Annotated[dict, Depends(get_current_user)]
):
    db_project = _filter_projects_by_user(db.query(ProjectDB), request, current_user).filter(ProjectDB.project_id == project_id).first()
    if not db_project:
        raise HTTPException(status_code=404, detail=_PROJECT_NOT_FOUND)

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


@router.delete("/projects/{project_id}",
  responses={404: {"description": "Not found"}})
def delete_project(project_id: str, request: Request, db: Annotated[Session, Depends(get_db)], current_user: Annotated[dict, Depends(get_current_user)]):
    db_project = _filter_projects_by_user(db.query(ProjectDB), request, current_user).filter(ProjectDB.project_id == project_id).first()
    if not db_project:
        raise HTTPException(status_code=404, detail=_PROJECT_NOT_FOUND)
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


def _fetch_github_content(git_url: str, use_branch: str, file: str) -> tuple[str | None, str]:
    if _GITHUB_COM not in git_url:
        return None, "none"
    raw_url = git_url.replace(_GITHUB_COM, "raw.githubusercontent.com").replace(".git", "")
    file_url = f"{raw_url}/{use_branch}/{file}"
    import httpx
    resp = httpx.get(file_url, timeout=10)
    if resp.status_code == 200:
        return resp.text, "github"
    return None, "none"


def _fetch_workspace_content(project_id: str, file: str) -> tuple[str | None, str]:
    from app.core.config import settings as _s
    workspace = Path(_s.STORAGE_PATH).parent / "workspaces" / project_id
    file_path = (workspace / file).resolve()
    if not file_path.is_relative_to(workspace.resolve()):
        raise HTTPException(status_code=403, detail="Access denied: path traversal detected")
    if file_path.exists():
        return file_path.read_text(), "workspace"
    return None, "none"


def _build_git_blob_url(git_url: str, use_branch: str, file: str, line: int) -> str | None:
    if _GITHUB_COM not in (git_url or ""):
        return None
    clean = git_url.replace(".git", "")
    if clean.startswith("git@github.com:"):
        clean = clean.replace("git@github.com:", "https://github.com/", 1)
    return f"{clean}/blob/{use_branch}/{file}#L{line}"


@router.get("/projects/{project_id}/code-snippet",
  responses={403: {"description": "Forbidden"}, 404: {"description": "Not found"}})
def get_code_snippet(
    project_id: str,
    file: str,
    line: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
    context: int = 10,
    branch: str = "",
    request: Request = None,
):
    """Return lines of code around the given line from the project's Git repo."""
    from app.services.rbac_service import get_rbac_service

    rbac = get_rbac_service(db=db, user=current_user)
    if not rbac.has_project_access(project_id):
        raise HTTPException(status_code=403, detail="No project access")

    project = db.query(ProjectDB).filter(ProjectDB.project_id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail=_PROJECT_NOT_FOUND)

    ext = Path(file).suffix.lower()
    language_map = {
        ".ts": "tsx", ".tsx": "tsx",
        ".js": "javascript", ".jsx": "javascript",
        ".py": "python", ".java": "java", ".cs": "csharp",
        ".go": "go", ".rb": "ruby", ".rs": "rust",
        ".kt": "kotlin", ".swift": "swift", ".php": "php",
        ".html": "html", ".css": "css", ".scss": "scss",
        ".json": "json", ".yaml": "yaml", ".yml": "yaml",
        ".md": "markdown", ".sh": "bash", ".sql": "sql",
    }
    language = language_map.get(ext, "text")

    use_branch = branch or project.branch or "main"
    content = None
    source = "none"

    git_url = project.git_url or ""
    try:
        content, source = _fetch_github_content(git_url, use_branch, file)
    except Exception:
        pass

    if content is None and project.git_url:
        try:
            content, source = _fetch_workspace_content(project_id, file)
        except HTTPException:
            raise
        except Exception:
            pass

    if content is None:
        raise HTTPException(status_code=404, detail="File not found in any accessible source")

    lines = content.splitlines()
    start = max(0, line - 1 - context)
    end = min(len(lines), line - 1 + context + 1)
    snippet_lines = lines[start:end]
    snippet = "\n".join(snippet_lines)

    git_blob_url = _build_git_blob_url(project.git_url, use_branch, file, line)

    return {
        "file": file,
        "language": language,
        "branch": use_branch,
        "start_line": start + 1,
        "end_line": end,
        "highlight_line": line,
        "content": snippet,
        "git_url": git_blob_url,
        "source": source,
    }
