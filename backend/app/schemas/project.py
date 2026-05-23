from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime


class ProjectCreate(BaseModel):
    name: str
    git_url: str
    branch: str = "main"
    credentials_id: str
    sonar_key: str
    target_ip: Optional[str] = None
    target_url: Optional[str] = None

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    git_url: Optional[str] = None
    branch: Optional[str] = None
    credentials_id: Optional[str] = None
    sonar_key: Optional[str] = None
    target_ip: Optional[str] = None
    target_url: Optional[str] = None

class ProjectResponse(ProjectCreate):
    project_id: str
    status: str = "CREATED"
    last_scan_state: Optional[str] = None
    last_scan_id: Optional[str] = None


# Project Group Schemas
class ProjectGroupCreate(BaseModel):
    name: str
    description: Optional[str] = None
    naming_pattern: str  # e.g., "kilo_*" or regex pattern


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
