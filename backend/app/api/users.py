"""User access management endpoints: roles, project access, audit trail."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.db import get_db
from app.models.db_models import UserDB
from app.models.db_models import ProjectAssignmentDB
from app.schemas.rbac import (
    AccessChangeResponse,
    CurrentUserResponse,
    ProjectAccessCreate,
    ProjectAccessResponse,
    RoleUpdate,
    UserAccessResponse,
    UserWithRole,
)
from app.services.rbac_service import RbacService, get_rbac_service

router = APIRouter()


def _get_rbac(request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)) -> RbacService:
    return get_rbac_service(db=db, user=current_user)


@router.get("/users", response_model=list[UserWithRole])
def list_users(
    request: Request,
    role: str | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    rbac = _get_rbac(request, db, current_user)
    if not rbac.can_manage_users():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    query = db.query(UserDB)
    if role:
        query = query.filter(UserDB.role == role)
    users = query.all()

    result = []
    for u in users:
        assignments = (
            db.query(ProjectAssignmentDB)
            .filter(ProjectAssignmentDB.user_id == str(u.id))
            .all()
        )
        result.append(
            UserWithRole(
                id=str(u.id),
                username=str(u.username),
                role=str(u.role),
                project_assignments=[ProjectAccessResponse.model_validate(a) for a in assignments],
            )
        )
    return result


@router.patch("/users/{user_id}/role", response_model=UserWithRole)
def update_user_role(
    user_id: str,
    body: RoleUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    rbac = _get_rbac(request, db, current_user)
    if not rbac.can_manage_users():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    from app.services.rbac_service import validate_role
    try:
        validate_role(body.role)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    target_user = db.query(UserDB).filter(UserDB.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    old_role = str(target_user.role)
    target_user.role = body.role
    db.commit()
    db.refresh(target_user)

    rbac.log_access_change(
        target_user_id=user_id,
        change_type="role_changed",
        before_value=old_role,
        after_value=body.role,
    )

    return UserWithRole(
        id=str(target_user.id),
        username=str(target_user.username),
        role=str(target_user.role),
        project_assignments=[],
    )


@router.get("/users/{user_id}/project-access", response_model=UserAccessResponse)
def get_user_project_access(
    user_id: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    rbac = _get_rbac(request, db, current_user)
    if not rbac.can_manage_users():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    from app.models.db_models import ProjectAssignmentDB
    assignments = (
        db.query(ProjectAssignmentDB)
        .filter(ProjectAssignmentDB.user_id == user_id)
        .all()
    )
    return UserAccessResponse(
        user_id=user_id,
        assignments=[
            ProjectAccessResponse.model_validate(a) for a in assignments
        ],
    )


@router.post("/users/{user_id}/project-access", response_model=ProjectAccessResponse, status_code=status.HTTP_201_CREATED)
def grant_project_access(
    user_id: str,
    body: ProjectAccessCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    rbac = _get_rbac(request, db, current_user)
    if not rbac.can_manage_users():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    # Check for duplicate
    existing = (
        db.query(ProjectAssignmentDB)
        .filter(
            ProjectAssignmentDB.user_id == user_id,
            ProjectAssignmentDB.scope_type == body.scope_type,
            ProjectAssignmentDB.scope_id == body.scope_id,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Assignment already exists")

    assignment = ProjectAssignmentDB(
        user_id=user_id,
        scope_type=body.scope_type,
        scope_id=body.scope_id,
        assigned_by=current_user.id,
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)

    rbac.log_access_change(
        target_user_id=user_id,
        change_type="scope_granted",
        after_value=f"{body.scope_type}:{body.scope_id}",
    )

    return ProjectAccessResponse.model_validate(assignment)


@router.delete("/users/{user_id}/project-access/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_project_access(
    user_id: str,
    assignment_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    rbac = _get_rbac(request, db, current_user)
    if not rbac.can_manage_users():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    assignment = (
        db.query(ProjectAssignmentDB)
        .filter(
            ProjectAssignmentDB.id == assignment_id,
            ProjectAssignmentDB.user_id == user_id,
        )
        .first()
    )
    if not assignment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")

    scope_desc = f"{assignment.scope_type}:{assignment.scope_id}"
    db.delete(assignment)
    db.commit()

    rbac.log_access_change(
        target_user_id=user_id,
        change_type="scope_revoked",
        before_value=scope_desc,
    )


@router.get("/access-changes", response_model=list[AccessChangeResponse])
def list_access_changes(
    request: Request,
    target_user_id: str | None = None,
    actor_id: str | None = None,
    change_type: str | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    rbac = _get_rbac(request, db, current_user)
    if not rbac.can_manage_users():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    from app.models.db_models import AccessChangeDB

    query = db.query(AccessChangeDB)
    if target_user_id:
        query = query.filter(AccessChangeDB.target_user_id == target_user_id)
    if actor_id:
        query = query.filter(AccessChangeDB.actor_id == actor_id)
    if change_type:
        query = query.filter(AccessChangeDB.change_type == change_type)

    records = query.order_by(AccessChangeDB.changed_at.desc()).all()
    return [AccessChangeResponse.model_validate(r) for r in records]
