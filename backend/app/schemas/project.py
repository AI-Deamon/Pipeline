from pydantic import BaseModel, ConfigDict, field_validator
from typing import Optional
from datetime import datetime
import re

# Shared validation logic (finding #76): ProjectUpdate previously redeclared these
# same fields as bare Optional[str] with zero validators, so a PATCH with a malformed
# target_ip/git_url/target_url succeeded where the equivalent POST would 422 —
# unvalidated values from PATCH are the origin point for values that eventually flow
# into the Jenkinsfile (see the target_ip shell-injection finding, #49). Factored out
# so ProjectCreate and ProjectUpdate can't drift from each other again.


def _validate_name_value(v: str) -> str:
    if not v or len(v.strip()) == 0:
        raise ValueError("Name cannot be empty")
    if len(v) > 255:
        raise ValueError("Name must be 255 characters or fewer")
    return v.strip()


def _validate_git_url_value(v: Optional[str]) -> Optional[str]:
    if v and not re.match(r'^https?://', v):
        raise ValueError("Git URL must start with http:// or https://")
    if v and len(v) > 2048:
        raise ValueError("Git URL must be 2048 characters or fewer")
    return v


def _validate_target_ip_value(v: Optional[str]) -> Optional[str]:
    if v and not re.match(r'^(\d{1,3}\.){3}\d{1,3}$', v):
        raise ValueError("Target IP must be a valid IPv4 address")
    return v


def _validate_target_url_value(v: Optional[str]) -> Optional[str]:
    if v and not re.match(r'^https?://', v):
        raise ValueError("Target URL must start with http:// or https://")
    if v and len(v) > 2048:
        raise ValueError("Target URL must be 2048 characters or fewer")
    return v


class ProjectCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    git_url: Optional[str] = None
    branch: str = "main"
    credentials_id: Optional[str] = None
    sonar_key: Optional[str] = None
    target_ip: Optional[str] = None
    target_url: Optional[str] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        return _validate_name_value(v)

    @field_validator("git_url")
    @classmethod
    def validate_git_url(cls, v: Optional[str]) -> Optional[str]:
        return _validate_git_url_value(v)

    @field_validator("target_ip")
    @classmethod
    def validate_target_ip(cls, v: Optional[str]) -> Optional[str]:
        return _validate_target_ip_value(v)

    @field_validator("target_url")
    @classmethod
    def validate_target_url(cls, v: Optional[str]) -> Optional[str]:
        return _validate_target_url_value(v)

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    git_url: Optional[str] = None
    branch: Optional[str] = None
    credentials_id: Optional[str] = None
    sonar_key: Optional[str] = None
    target_ip: Optional[str] = None
    target_url: Optional[str] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        return None if v is None else _validate_name_value(v)

    @field_validator("git_url")
    @classmethod
    def validate_git_url(cls, v: Optional[str]) -> Optional[str]:
        return _validate_git_url_value(v)

    @field_validator("target_ip")
    @classmethod
    def validate_target_ip(cls, v: Optional[str]) -> Optional[str]:
        return _validate_target_ip_value(v)

    @field_validator("target_url")
    @classmethod
    def validate_target_url(cls, v: Optional[str]) -> Optional[str]:
        return _validate_target_url_value(v)

class ProjectResponse(ProjectCreate):
    model_config = ConfigDict(from_attributes=True, extra="forbid")

    project_id: str
    status: str = "CREATED"
    last_scan_state: Optional[str] = None
    last_scan_id: Optional[str] = None
    user_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime


# Project Group Schemas
class ProjectGroupCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    description: Optional[str] = None
    naming_pattern: str  # e.g., "kilo_*" or regex pattern

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        if not v or len(v.strip()) == 0:
            raise ValueError("Name cannot be empty")
        if len(v) > 255:
            raise ValueError("Name must be 255 characters or fewer")
        return v.strip()

    @field_validator("naming_pattern")
    @classmethod
    def validate_naming_pattern(cls, v: str) -> str:
        if len(v) > 200:
            raise ValueError("Naming pattern must be 200 characters or fewer")
        # Reject patterns that could cause ReDoS
        if re.search(r'(\([^)]*\))*\*|\(.*\)\*', v):
            raise ValueError("Naming pattern contains potentially unsafe regex")
        return v


class ProjectGroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    naming_pattern: Optional[str] = None


class ProjectGroupResponse(BaseModel):
    group_id: str
    name: str
    description: Optional[str] = None
    naming_pattern: str
    created_at: datetime
    updated_at: Optional[datetime] = None


class ScanAssignment(BaseModel):
    scan_id: str
    project_id: str
    match_confidence: int = 100
    is_auto_assigned: bool = True
    assigned_at: datetime


class ProjectGroupDetail(ProjectGroupResponse):
    assigned_scans: list[ScanAssignment] = []
    total_findings: int = 0
    severity_summary: dict = {}
