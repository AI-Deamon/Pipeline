from pydantic import BaseModel, ConfigDict, field_validator
from typing import Optional, Any
from datetime import datetime


class IssueCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    issue_id: str
    project_id: str
    tool_name: str
    severity: str
    title: str
    scan_id: Optional[str] = None
    first_seen_scan_id: Optional[str] = None
    description: Optional[str] = None
    issue_type: Optional[str] = None
    location: Optional[dict[str, Any]] = None
    severity_v2: Optional[str] = None
    effort: Optional[str] = None
    rule: Optional[str] = None
    recommendation: Optional[str] = None
    finding_type: Optional[str] = None
    raw_evidence: Optional[str] = None
    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        if not v or len(v.strip()) == 0:
            raise ValueError("Title cannot be empty")
        return v.strip()


class IssueUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    severity: Optional[str] = None
    title: Optional[str] = None
    status: Optional[str] = None
    assignee_id: Optional[str] = None
    priority: Optional[str] = None
    description: Optional[str] = None
    location: Optional[dict[str, Any]] = None
    issue_type: Optional[str] = None
    is_new: Optional[bool] = None


class IssueResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    issue_id: str
    project_id: str
    tool_name: str
    scan_id: Optional[str] = None
    first_seen_scan_id: Optional[str] = None
    first_seen_at: datetime
    last_seen_at: datetime
    resolved_at: Optional[datetime] = None
    severity: str
    issue_type: Optional[str] = None
    title: str
    description: Optional[str] = None
    location: Optional[dict[str, Any]] = None
    severity_v2: Optional[str] = None
    effort: Optional[str] = None
    rule: Optional[str] = None
    recommendation: Optional[str] = None
    finding_type: Optional[str] = None
    raw_evidence: Optional[str] = None
    code_snippet: Optional[str] = None
    is_new: bool
    status: str
    assignee_id: Optional[str] = None
    assigned_by: Optional[str] = None
    priority: Optional[str] = None
    extra_metadata: Optional[dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime

    @property
    def file_path(self) -> Optional[str]:
        if self.location and isinstance(self.location, dict):
            return self.location.get("file_path")
        return None

    @property
    def line_number(self) -> Optional[int]:
        if self.location and isinstance(self.location, dict):
            return self.location.get("line")
        return None

    @property
    def tags(self) -> list[str]:
        if self.extra_metadata and isinstance(self.extra_metadata, dict):
            return list(self.extra_metadata.get("tags", []))
        return []

    @property
    def code_snippet_language(self) -> Optional[str]:
        if self.extra_metadata and isinstance(self.extra_metadata, dict):
            return self.extra_metadata.get("code_snippet_language")
        return None

    @property
    def rule_name(self) -> Optional[str]:
        if self.extra_metadata and isinstance(self.extra_metadata, dict):
            return self.extra_metadata.get("rule_name")
        return None

    @property
    def language(self) -> Optional[str]:
        if self.extra_metadata and isinstance(self.extra_metadata, dict):
            return self.extra_metadata.get("language")
        return None

    @property
    def git_url(self) -> Optional[str]:
        return None  # populated by API layer from project git_url + file + line


class IssueAssignRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assignee_id: str
    priority: Optional[str] = None
    comment: Optional[str] = None


class IssueStatusRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: str
    comment: Optional[str] = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if not v or len(v.strip()) == 0:
            raise ValueError("Status cannot be empty")
        return v.strip()


class IssueCommentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str

    @field_validator("message")
    @classmethod
    def validate_message(cls, v: str) -> str:
        if not v or len(v.strip()) == 0:
            raise ValueError("Message cannot be empty")
        return v.strip()


class IssueHistoryResponse(BaseModel):
    issue_id: int
    history: list[dict[str, Any]]


class ToolOverview(BaseModel):
    tool: str
    total: int
    severity: dict[str, int]
    by_type: Optional[dict[str, int]] = None


class OverviewResponse(BaseModel):
    project_id: str
    tools: list[ToolOverview]


class IssueBrief(BaseModel):
    id: int
    issue_id: str
    tool_name: str
    severity: str
    title: str
    status: str
    priority: Optional[str] = None
    location: Optional[dict[str, Any]] = None
    first_seen_at: datetime
    last_seen_at: datetime


class MyIssuesResponse(BaseModel):
    total: int
    page: int
    page_size: int
    projects: list[dict[str, Any]]


class MetricsResponse(BaseModel):
    total: int
    by_status: dict[str, int]
    avg_assignment_latency_hours: Optional[float] = None
    avg_verification_latency_hours: Optional[float] = None


class RescanRequestCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fix_note: str
    commit_sha: Optional[str] = None

    @field_validator("fix_note")
    @classmethod
    def validate_fix_note(cls, v: str) -> str:
        if not v or len(v.strip()) == 0:
            raise ValueError("Fix note cannot be empty")
        return v.strip()


class RescanRequestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    issue_id: int
    requested_by: str
    fix_note: Optional[str] = None
    fix_note_raw: Optional[str] = None
    commit_sha: Optional[str] = None
    status: str
    scan_id: Optional[str] = None
    verdict: Optional[str] = None
    reviewer_id: Optional[str] = None
    reviewer_note: Optional[str] = None
    version: int
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None


class RescanApproveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reviewer_note: Optional[str] = None


class RescanEditRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fix_note: str
    version: int

    @field_validator("fix_note")
    @classmethod
    def validate_fix_note(cls, v: str) -> str:
        if not v or len(v.strip()) == 0:
            raise ValueError("Fix note cannot be empty")
        return v.strip()


class RescanCancelRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int


class RawFixNoteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    issue_id: int
    fix_note_raw: Optional[str] = None
    requested_by: str
    created_at: datetime


class TriggerVerifyScanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    note: Optional[str] = None


class PendingVerificationResponse(BaseModel):
    total: int
    page: int
    page_size: int
    groups: list[dict[str, Any]]
