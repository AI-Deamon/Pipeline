from pydantic import BaseModel, ConfigDict, computed_field, field_validator, model_validator
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
    sonar_status: Optional[str] = None
    sonar_resolution: Optional[str] = None
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
    sonar_status: Optional[str] = None
    sonar_resolution: Optional[str] = None
    sonar_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    @model_validator(mode='before')
    @classmethod
    def backfill_sonar_fields(cls, values: Any) -> Any:
        if isinstance(values, dict):
            if not values.get('sonar_status') and values.get('extra_metadata'):
                meta = values['extra_metadata']
                if isinstance(meta, dict):
                    values.setdefault('sonar_status', meta.get('sonar_status'))
                    values.setdefault('sonar_resolution', meta.get('sonar_resolution'))
        elif hasattr(values, 'extra_metadata'):
            meta = getattr(values, 'extra_metadata', None) or {}
            if not getattr(values, 'sonar_status', None) and meta:
                try:
                    values.sonar_status = meta.get('sonar_status')
                except AttributeError:
                    pass
            if not getattr(values, 'sonar_resolution', None) and meta:
                try:
                    values.sonar_resolution = meta.get('sonar_resolution')
                except AttributeError:
                    pass
        return values

    # `@computed_field` is required on every one of these — a plain `@property` on a
    # Pydantic v2 model is never included in `.model_dump()`/the serialized JSON
    # response at all, only `@computed_field` properties are. Found live: none of
    # file_path/line_number/tags/etc. ever reached the frontend despite `location`
    # and `extra_metadata` being fully populated in the database for every real
    # issue — `issue.file_path` was `undefined` for every single finding, so the
    # Triage table's "Location" column showed "—" for all 151 real findings on a
    # project, and the code-snippet fetch (gated on file_path/line_number being
    # present) never fired for a single one either.
    @computed_field
    @property
    def file_path(self) -> Optional[str]:
        if self.location and isinstance(self.location, dict):
            return self.location.get("file_path")
        return None

    @computed_field
    @property
    def line_number(self) -> Optional[int]:
        if self.location and isinstance(self.location, dict):
            return self.location.get("line")
        return None

    @computed_field
    @property
    def tags(self) -> list[str]:
        if self.extra_metadata and isinstance(self.extra_metadata, dict):
            return list(self.extra_metadata.get("tags", []))
        return []

    @computed_field
    @property
    def code_snippet_language(self) -> Optional[str]:
        if self.extra_metadata and isinstance(self.extra_metadata, dict):
            return self.extra_metadata.get("code_snippet_language")
        return None

    @computed_field
    @property
    def rule_name(self) -> Optional[str]:
        if self.extra_metadata and isinstance(self.extra_metadata, dict):
            return self.extra_metadata.get("rule_name")
        return None

    @computed_field
    @property
    def language(self) -> Optional[str]:
        if self.extra_metadata and isinstance(self.extra_metadata, dict):
            return self.extra_metadata.get("language")
        return None

    @computed_field
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


class ToolIssuesResponse(BaseModel):
    total: int
    page: int
    page_size: int
    total_pages: int
    issues: list[IssueResponse]


class MyIssuesResponse(BaseModel):
    total: int
    page: int
    page_size: int
    projects: list[dict[str, Any]]
    issues: list[IssueResponse]


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


class RescanRejectRequest(BaseModel):
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


class PendingVerificationResponse(BaseModel):
    total: int
    page: int
    page_size: int
    groups: list[dict[str, Any]]
