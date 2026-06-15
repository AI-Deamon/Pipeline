from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class RoleUpdate(BaseModel):
    role: str  # "admin", "team_lead", "developer"


class ProjectAccessCreate(BaseModel):
    scope_type: str  # "project" or "project_group"
    scope_id: str


class ProjectAccessResponse(BaseModel):
    id: int
    user_id: str
    scope_type: str
    scope_id: str
    assigned_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class UserAccessResponse(BaseModel):
    user_id: str
    assignments: list[ProjectAccessResponse]


class AccessChangeResponse(BaseModel):
    id: int
    actor_id: str
    target_user_id: str
    change_type: str
    before_value: Optional[str] = None
    after_value: Optional[str] = None
    changed_at: datetime

    class Config:
        from_attributes = True


class UserWithRole(BaseModel):
    id: str
    username: str
    role: str
    project_assignments: list[ProjectAccessResponse] = []

    class Config:
        from_attributes = True


class CurrentUserResponse(BaseModel):
    id: str
    username: str
    role: str
    permissions: dict[str, bool]
