from pydantic import BaseModel, ConfigDict
from typing import Literal, Optional
from datetime import datetime


class RoleUpdate(BaseModel):
    role: str  # "admin", "team_lead", "developer"


class ProjectAccessCreate(BaseModel):
    # Literal, not a bare str (finding #75): a typo'd/wrong-case value (e.g.
    # "Project") used to be accepted, stored, and audit-logged as a successful grant,
    # but get_effective_project_ids() filters on an exact string match — so the row
    # was silently inert and the "granted" user got zero real access despite the API
    # reporting success. FastAPI now rejects anything but these two values at the
    # request-validation layer, before it ever reaches the database.
    scope_type: Literal["project", "project_group"]
    scope_id: str


class ProjectAccessResponse(BaseModel):
    id: int
    user_id: str
    scope_type: str
    scope_id: str
    assigned_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


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

    model_config = ConfigDict(from_attributes=True)


class UserWithRole(BaseModel):
    id: str
    username: str
    role: str
    project_assignments: list[ProjectAccessResponse] = []

    model_config = ConfigDict(from_attributes=True)


class CurrentUserResponse(BaseModel):
    id: str
    username: str
    role: str
    permissions: dict[str, bool]
