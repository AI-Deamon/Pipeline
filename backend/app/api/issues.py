import logging
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.auth import get_current_user
from app.services.issue_service import IssueService
from app.services.rbac_service import get_rbac_service
from app.services import rescan_service
from app.services.fix_note_sanitizer import sanitize as sanitize_fix_note
from app.metrics import RESCAN_REQUESTS_TOTAL, VERIFICATIONS_TOTAL as RESCAN_VERIFICATIONS_TOTAL
from app.schemas.issue import (
    IssueCreate,
    IssueAssignRequest,
    IssueStatusRequest,
    IssueCommentCreate,
    IssueResponse,
    OverviewResponse,
    ToolOverview,
    ToolIssuesResponse,
    MyIssuesResponse,
    MetricsResponse,
    IssueHistoryResponse,
    RescanRequestCreate,
    RescanRequestResponse,
    RescanApproveRequest,
    RescanRejectRequest,
    RescanEditRequest,
    RescanCancelRequest,
    RawFixNoteResponse,
    PendingVerificationResponse,
)
from app.core.config import settings
from app.models.db_models import RescanRequestDB, IssueDB, ProjectDB
from app.state.issue_state import IssueState
from app.websockets.manager import manager as websocket_manager

logger = logging.getLogger(__name__)

router = APIRouter()
service = IssueService()

_PROJECT_NOT_FOUND = "Project not found"
_ISSUE_NOT_FOUND = "Issue not found"
_RESCAN_REQUEST_NOT_FOUND = "Rescan request not found"


def _enrich_sonar_url(db: Session, issue_resp: IssueResponse) -> IssueResponse:
    project = db.query(ProjectDB).filter(ProjectDB.project_id == issue_resp.project_id).first()
    if project and project.sonar_key:
        issue_id = issue_resp.issue_id
        base = f"{settings.SONARQUBE_PROTOCOL}://{settings.SONARQUBE_URL}"
        issue_resp.sonar_url = f"{base}/project/issues?id={project.sonar_key}&issues={issue_id}&open={issue_id}"
    return issue_resp


def _build_pending_verification_query(
    db: Session,
    current_user,
    rbac,
    project_id: str | None,
    status: str,
    user_id: str,
    page: int,
    page_size: int,
):
    effective_ids = rbac.get_effective_project_ids() if not rbac.is_admin else None

    if rbac.is_developer:
        q = (
            db.query(RescanRequestDB)
            .filter(
                RescanRequestDB.status == status,
                RescanRequestDB.requested_by == user_id,
            )
        )
    else:
        q = db.query(RescanRequestDB).filter(RescanRequestDB.status == status)
        if effective_ids is not None and effective_ids:
            q = q.join(IssueDB, IssueDB.id == RescanRequestDB.issue_id).filter(
                IssueDB.project_id.in_(effective_ids)
            )

    if project_id:
        q = q.join(IssueDB, IssueDB.id == RescanRequestDB.issue_id).filter(
            IssueDB.project_id == project_id
        )

    total = q.count()
    rows = q.order_by(RescanRequestDB.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return total, rows


def _build_pending_groups_map(db: Session, rows: list) -> dict:
    from app.models.db_models import ProjectDB

    groups_map: dict[str, dict] = {}
    for r in rows:
        issue_obj = service.get_by_id(db, r.issue_id)
        if not issue_obj:
            continue
        pid = issue_obj.project_id
        if pid not in groups_map:
            proj = db.query(ProjectDB).filter(ProjectDB.project_id == pid).first()
            groups_map[pid] = {"project_id": pid, "project_name": proj.name if proj else pid, "items": []}
        created_at = r.created_at
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        elapsed = (datetime.now(timezone.utc) - created_at).total_seconds() / 60
        groups_map[pid]["items"].append({
            "rescan_request_id": r.id,
            "issue_id": r.issue_id,
            "issue_title": issue_obj.title,
            "issue_severity": issue_obj.severity,
            "tool": issue_obj.tool_name,
            "requested_by": r.requested_by,
            "requested_by_name": r.requested_by,
            "fix_note": r.fix_note,
            "commit_sha": r.commit_sha,
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "fix_elapsed_minutes": int(elapsed),
        })
    return groups_map


@router.get("/issues/projects/{project_id}/overview", response_model=OverviewResponse,
  responses={404: {"description": "Not found"}})
def get_project_overview(
    project_id: str,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    rbac = get_rbac_service(db=db, user=current_user)
    if not rbac.has_project_access(project_id):
        raise HTTPException(status_code=404, detail=_PROJECT_NOT_FOUND)
    tools = service.get_project_overview(db, project_id)
    return OverviewResponse(project_id=project_id, tools=[ToolOverview(**t) for t in tools])


@router.get("/issues/projects/{project_id}/tools/{tool_name}",
  response_model=ToolIssuesResponse,
  responses={404: {"description": "Not found"}})
def get_tool_issues(project_id: str, tool_name: str, request: Request, db: Annotated[Session, Depends(get_db)], current_user: Annotated[dict, Depends(get_current_user)], page: int = 1, page_size: int = 25, finding_type: str | None = None):
    rbac = get_rbac_service(db=db, user=current_user)
    if not rbac.has_project_access(project_id):
        raise HTTPException(status_code=404, detail=_PROJECT_NOT_FOUND)
    result = service.get_tool_issues(db, project_id, tool_name, page, page_size, finding_type)
    return result


@router.get("/issues/my", response_model=MyIssuesResponse)
def get_my_issues(request: Request, db: Annotated[Session, Depends(get_db)], current_user: Annotated[dict, Depends(get_current_user)], page: int = 1, page_size: int = 25):
    user_id = getattr(current_user, "username", None) or "api-key-bypass"
    result = service.get_my_issues(db, user_id, page, page_size)
    return result


@router.post("/issues", response_model=IssueResponse, status_code=201,
  responses={400: {"description": "Bad request"}})
def create_issue(
    data: IssueCreate,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    rbac = get_rbac_service(db=db, user=current_user)
    if not rbac.has_project_access(data.project_id):
        raise HTTPException(status_code=404, detail=_PROJECT_NOT_FOUND)
    try:
        issue = service.create_issue(db, data.model_dump())
        db.commit()
        resp = IssueResponse.model_validate(issue)
        return _enrich_sonar_url(db, resp)
    except Exception:
        db.rollback()
        # Finding #38: this used to swallow the real exception entirely — a bare
        # `except Exception` with no logging means any unexpected failure (a DB
        # constraint violation, a bug in service.create_issue) was indistinguishable
        # from a legitimate client error, and left zero trail to debug it from.
        logger.error("Failed to create issue for project %s", data.project_id, exc_info=True)
        raise HTTPException(status_code=400, detail="Failed to create issue")


@router.get("/issues/projects/{project_id}/metrics", response_model=MetricsResponse,
  responses={404: {"description": "Not found"}})
def get_project_metrics(
    project_id: str,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    rbac = get_rbac_service(db=db, user=current_user)
    if not rbac.has_project_access(project_id):
        raise HTTPException(status_code=404, detail=_PROJECT_NOT_FOUND)
    metrics = service.get_metrics(db, project_id)
    return MetricsResponse(**metrics)


@router.get("/issues/pending-verification", response_model=PendingVerificationResponse)
def get_pending_verification(request: Request, db: Annotated[Session, Depends(get_db)], current_user: Annotated[dict, Depends(get_current_user)], project_id: str | None = None, status: str = "pending", page: int = 1, page_size: int = 25):
    from app.services.cache import cache_get, cache_set
    cache_key = f"pending_verification:{project_id or 'all'}:{status}:p{page}:s{page_size}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached

    rbac = get_rbac_service(db=db, user=current_user)
    user_id = str(getattr(current_user, "username", None) or getattr(current_user, "id", ""))
    total, rows = _build_pending_verification_query(db, current_user, rbac, project_id, status, user_id, page, page_size)
    groups_map = _build_pending_groups_map(db, rows)

    response = PendingVerificationResponse(
        total=total,
        page=page,
        page_size=page_size,
        groups=list(groups_map.values()),
    )
    cache_set(cache_key, response.model_dump(), ttl_seconds=5)
    return response


@router.get("/issues/{issue_id}", response_model=IssueResponse,
  responses={404: {"description": "Not found"}})
def get_issue(
    issue_id: int,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    issue = service.get_by_id(db, issue_id)
    if issue is None:
        raise HTTPException(status_code=404, detail=_ISSUE_NOT_FOUND)
    rbac = get_rbac_service(db=db, user=current_user)
    if not rbac.has_project_access(issue.project_id):
        raise HTTPException(status_code=404, detail=_ISSUE_NOT_FOUND)

    from app.services.cache import cache_get, cache_set
    cache_key = f"issue:{issue_id}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    db.commit()
    resp = IssueResponse.model_validate(issue)
    _enrich_sonar_url(db, resp)
    payload = resp.model_dump()
    cache_set(cache_key, payload, ttl_seconds=60)
    return resp


@router.post("/issues/{issue_id}/comments",
  responses={404: {"description": "Not found"}})
def add_comment(
    issue_id: int,
    data: IssueCommentCreate,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    issue = service.get_by_id(db, issue_id)
    if issue is None:
        raise HTTPException(status_code=404, detail=_ISSUE_NOT_FOUND)
    rbac = get_rbac_service(db=db, user=current_user)
    if not rbac.has_project_access(issue.project_id):
        raise HTTPException(status_code=404, detail=_ISSUE_NOT_FOUND)
    user_id = getattr(current_user, "username", None) or "api-key-bypass"
    entry = service.add_comment(db, issue_id, user_id, data.message)
    db.commit()
    return {
        "id": entry.id,
        "issue_id": entry.issue_id,
        "change_type": entry.change_type,
        "message": entry.comment,
        "actor_id": entry.actor_id,
        "created_at": entry.created_at.isoformat() if entry.created_at else None,
    }


@router.get("/issues/{issue_id}/history", response_model=IssueHistoryResponse,
  responses={404: {"description": "Not found"}})
def get_issue_history(
    issue_id: int,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    issue = service.get_by_id(db, issue_id)
    if issue is None:
        raise HTTPException(status_code=404, detail=_ISSUE_NOT_FOUND)
    rbac = get_rbac_service(db=db, user=current_user)
    if not rbac.has_project_access(issue.project_id):
        raise HTTPException(status_code=404, detail=_ISSUE_NOT_FOUND)
    history = service.get_history(db, issue_id)
    return IssueHistoryResponse(issue_id=issue_id, history=history)


@router.post("/issues/{issue_id}/assign", response_model=IssueResponse,
  responses={400: {"description": "Bad request"}, 403: {"description": "Forbidden"}, 404: {"description": "Not found"}})
def assign_issue(
    issue_id: int,
    data: IssueAssignRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    rbac = get_rbac_service(db=db, user=current_user)
    db_issue = service.get_by_id(db, issue_id)
    if db_issue is None:
        raise HTTPException(status_code=404, detail=_ISSUE_NOT_FOUND)
    if not rbac.can_assign_issue(db_issue.project_id):
        raise HTTPException(status_code=403, detail="Not authorized to assign issues")
    user_id = getattr(current_user, "username", None) or "api-key-bypass"
    try:
        issue = service.assign(db, issue_id, data.assignee_id, user_id, data.priority)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if issue is None:
        raise HTTPException(status_code=404, detail=_ISSUE_NOT_FOUND)
    db.commit()
    resp = IssueResponse.model_validate(issue)
    return _enrich_sonar_url(db, resp)


@router.post("/issues/{issue_id}/transition", response_model=IssueResponse,
  responses={400: {"description": "Bad request"}, 403: {"description": "Forbidden"}, 404: {"description": "Not found"}})
def transition_issue(
    issue_id: int,
    data: IssueStatusRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    rbac = get_rbac_service(db=db, user=current_user)
    db_issue = service.get_by_id(db, issue_id)
    if db_issue is None:
        raise HTTPException(status_code=404, detail=_ISSUE_NOT_FOUND)
    if data.status in ("verified", "rejected"):
        if not rbac.can_verify_issue(db_issue.project_id):
            raise HTTPException(status_code=403, detail="Not authorized to verify or reject issues")
    elif not rbac.can_update_issue(db_issue.project_id, db_issue.assignee_id):
        raise HTTPException(status_code=403, detail="Not authorized to update this issue")
    user_id = getattr(current_user, "username", None) or "api-key-bypass"
    try:
        issue = service.transition_status(db, issue_id, data.status, user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if issue is None:
        raise HTTPException(status_code=404, detail=_ISSUE_NOT_FOUND)
    db.commit()
    resp = IssueResponse.model_validate(issue)
    return _enrich_sonar_url(db, resp)


@router.post("/issues/{issue_id}/request-rescan", response_model=RescanRequestResponse, status_code=201,
  responses={403: {"description": "Forbidden"}, 404: {"description": "Not found"}, 409: {"description": "Conflict"}, 429: {"description": "Too many requests"}})
def request_rescan(
    issue_id: int,
    data: RescanRequestCreate,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    issue = service.get_by_id(db, issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail=_ISSUE_NOT_FOUND)
    rbac = get_rbac_service(db=db, user=current_user)
    if not rbac.can_request_rescan(issue):
        raise HTTPException(status_code=403, detail="Not authorized to request rescan for this issue")
    user_id = str(getattr(current_user, "username", None) or getattr(current_user, "id", "api-key-bypass"))
    from app.services.rescan_rate_limit import check as rate_check
    allowed, retry_in = rate_check(user_id)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Try again in {retry_in} seconds.",
            headers={"Retry-After": str(retry_in)},
        )
    if issue.status not in (IssueState.FIXED.value, IssueState.IN_PROGRESS.value):
        raise HTTPException(
            status_code=409,
            detail=f"Issue must be in fixed or in_progress state (current: {issue.status})",
        )
    sanitized = sanitize_fix_note(data.fix_note)
    try:
        rescan = rescan_service.create_request(
            session=db,
            issue_id=issue_id,
            requested_by=str(user_id),
            fix_note=sanitized.sanitized,
            fix_note_raw=sanitized.raw,
            commit_sha=data.commit_sha,
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    if issue.status == IssueState.IN_PROGRESS.value:
        service.transition_status(db, issue_id, IssueState.FIXED.value, str(user_id))
    service.transition_status(db, issue_id, IssueState.PENDING_VERIFICATION.value, str(user_id))
    db.commit()
    db.refresh(rescan)
    RESCAN_REQUESTS_TOTAL.labels(status="pending").inc()
    try:
        from app.websockets.manager import safe_broadcast
        safe_broadcast(
            "rescan_requested",
            {
                "issue_id": issue_id,
                "rescan_request_id": rescan.id,
                "requested_by": str(user_id),
                "project_id": issue.project_id,
            },
        )
    except Exception:
        pass
    return rescan


@router.post("/issues/{issue_id}/approve-rescan",
  responses={403: {"description": "Forbidden"}, 404: {"description": "Not found"}, 409: {"description": "Conflict"}})
def approve_rescan(
    issue_id: int,
    data: RescanApproveRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    issue = service.get_by_id(db, issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail=_ISSUE_NOT_FOUND)
    rbac = get_rbac_service(db=db, user=current_user)
    if not rbac.can_approve_rescan(issue.project_id):
        raise HTTPException(status_code=403, detail="Not authorized to approve rescan")
    rescan = rescan_service.find_pending_for_issue(db, issue_id)
    if not rescan:
        raise HTTPException(status_code=409, detail="No pending rescan request")
    user_id = str(getattr(current_user, "username", None) or getattr(current_user, "id", "reviewer"))
    rescan.status = "approved"
    rescan.reviewer_id = user_id
    rescan.reviewer_note = data.reviewer_note
    rescan.version = rescan.version + 1
    from datetime import datetime, timezone
    rescan.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(rescan)
    try:
        from app.websockets.manager import safe_broadcast
        safe_broadcast(
            "rescan_approved",
            {
                "issue_id": issue_id,
                "rescan_request_id": rescan.id,
                "approved_by": user_id,
                "scan_id": None,
            },
        )
    except Exception:
        pass
    return {
        "rescan_request": RescanRequestResponse.model_validate(rescan),
        "scan": {"scan_id": None, "project_id": issue.project_id, "tool": issue.tool_name, "state": "PENDING"},
    }


@router.post("/issues/{issue_id}/reject-rescan",
  responses={403: {"description": "Forbidden"}, 404: {"description": "Not found"}, 409: {"description": "Conflict"}})
def reject_rescan(
    issue_id: int,
    data: RescanRejectRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    """Reviewer-facing rejection of a pending rescan request — the actual fix for
    finding #56 (the frontend "Reject" button previously called trigger-verify-scan,
    the same action "Approve" effectively drives, so rejecting silently re-triggered
    a scan instead of recording a rejection). Distinct from DELETE /rescan-requests
    (self-service cancel by the requester) — this requires the same reviewer
    permission as approve-rescan.
    """
    issue = service.get_by_id(db, issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail=_ISSUE_NOT_FOUND)
    rbac = get_rbac_service(db=db, user=current_user)
    if not rbac.can_approve_rescan(issue.project_id):
        raise HTTPException(status_code=403, detail="Not authorized to reject rescan")
    rescan = rescan_service.find_pending_for_issue(db, issue_id)
    if not rescan:
        raise HTTPException(status_code=409, detail="No pending rescan request")
    user_id = str(getattr(current_user, "username", None) or getattr(current_user, "id", "reviewer"))
    try:
        rescan_service.reject(db, rescan, user_id, data.reviewer_note)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    if issue.status == IssueState.PENDING_VERIFICATION.value:
        service.transition_status(db, issue.id, IssueState.IN_PROGRESS.value, user_id)
    db.commit()
    db.refresh(rescan)
    try:
        from app.websockets.manager import safe_broadcast
        safe_broadcast(
            "rescan_rejected",
            {
                "issue_id": issue_id,
                "rescan_request_id": rescan.id,
                "rejected_by": user_id,
                "project_id": issue.project_id,
            },
        )
    except Exception:
        pass
    return {"rescan_request": RescanRequestResponse.model_validate(rescan)}


@router.patch("/rescan-requests/{request_id}", response_model=RescanRequestResponse,
  responses={403: {"description": "Forbidden"}, 404: {"description": "Not found"}, 409: {"description": "Conflict"}})
def edit_rescan_request(
    request_id: int,
    data: RescanEditRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    record = rescan_service.find_by_id(db, request_id)
    if not record:
        raise HTTPException(status_code=404, detail=_RESCAN_REQUEST_NOT_FOUND)
    user_id = str(getattr(current_user, "username", None) or getattr(current_user, "id", ""))
    if record.requested_by != user_id:
        rbac = get_rbac_service(db=db, user=current_user)
        if not rbac.is_admin:
            raise HTTPException(status_code=403, detail="Only the requester or admin can edit a rescan request")
    if record.status != "pending":
        raise HTTPException(status_code=409, detail=f"Cannot edit request in status '{record.status}'")
    sanitized = sanitize_fix_note(data.fix_note)
    try:
        record = rescan_service.update_with_version_check(
            db, record, data.version,
            fix_note=sanitized.sanitized,
            fix_note_raw=sanitized.raw,
        )
    except rescan_service.RescanVersionConflict as e:
        raise HTTPException(
            status_code=409,
            detail=f"Version conflict: current={e.current_version}, supplied={e.supplied_version}",
        )
    db.commit()
    db.refresh(record)
    return record


@router.delete("/rescan-requests/{request_id}",
  responses={403: {"description": "Forbidden"}, 404: {"description": "Not found"}, 409: {"description": "Conflict"}})
def cancel_rescan_request(
    request_id: int,
    data: RescanCancelRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    record = rescan_service.find_by_id(db, request_id)
    if not record:
        raise HTTPException(status_code=404, detail=_RESCAN_REQUEST_NOT_FOUND)
    user_id = str(getattr(current_user, "username", None) or getattr(current_user, "id", ""))
    if record.requested_by != user_id:
        rbac = get_rbac_service(db=db, user=current_user)
        if not rbac.is_admin:
            raise HTTPException(status_code=403, detail="Only the requester or admin can cancel a rescan request")
    try:
        record = rescan_service.cancel(db, record, data.version)
    except rescan_service.RescanVersionConflict as e:
        raise HTTPException(
            status_code=409,
            detail=f"Version conflict: current={e.current_version}, supplied={e.supplied_version}",
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    issue = service.get_by_id(db, record.issue_id)
    if issue and issue.status == IssueState.PENDING_VERIFICATION.value:
        # PENDING_VERIFICATION -> FIXED is not a legal transition (see issue_state.py
        # TRANSITIONS); this previously raised ValueError and 500'd whenever a
        # requester cancelled their own pending-verification rescan. IN_PROGRESS is
        # both valid and semantically correct — a cancelled/rejected fix needs more work.
        service.transition_status(db, issue.id, IssueState.IN_PROGRESS.value, str(user_id))
    db.commit()
    return {"detail": "Rescan request cancelled", "id": record.id, "version": record.version}


@router.get("/fix-notes/{request_id}/raw", response_model=RawFixNoteResponse,
  responses={403: {"description": "Forbidden"}, 404: {"description": "Not found"}})
def get_raw_fix_note(
    request_id: int,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    rbac = get_rbac_service(db=db, user=current_user)
    if not rbac.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    record = rescan_service.find_by_id(db, request_id)
    if not record:
        raise HTTPException(status_code=404, detail=_RESCAN_REQUEST_NOT_FOUND)
    return record
