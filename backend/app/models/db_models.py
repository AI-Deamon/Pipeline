import enum
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Enum, JSON, Index, Integer
from app.core.db import Base
from app.state.scan_state import ScanState

# Maximum retry count to prevent infinite retry loops
MAX_RETRY_COUNT = 10

class ProjectDB(Base):
    __tablename__ = "projects"

    project_id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    status = Column(String, default="CREATED")
    last_scan_state = Column(String, nullable=True)
    git_url = Column(String, nullable=True)
    branch = Column(String, nullable=True)
    credentials_id = Column(String, nullable=True)
    sonar_key = Column(String, nullable=True)
    target_ip = Column(String, nullable=True)
    target_url = Column(String, nullable=True)
    user_id = Column(String, nullable=True)  # FK to users.id; nullable for migration backfill
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

class ScanDB(Base):
    __tablename__ = "scans"

    scan_id = Column(String, primary_key=True, index=True)
    project_id = Column(String, index=True, nullable=False)
    scan_mode = Column(String, nullable=False)
    selected_stages = Column(JSON, default=list)
    state = Column(Enum(ScanState), default=ScanState.CREATED, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    jenkins_build_number = Column(String, nullable=True)
    jenkins_queue_id = Column(String, nullable=True)
    stage_results = Column(JSON, default=list)
    callback_digests = Column(JSON, default=list)
    # New fields for Phase 1 & 2
    error_message = Column(String, nullable=True)  # Store error details
    error_type = Column(String, nullable=True)  # e.g., "PIPELINE_ERROR", "SECURITY_ISSUE"
    jenkins_console_url = Column(String, nullable=True)  # Direct link to Jenkins logs
    retry_count = Column(Integer, default=0, nullable=False)  # Number of retries
    git_commit = Column(String, nullable=True)  # Git commit SHA from build
    git_branch = Column(String, nullable=True)  # Git branch from build

    # Index for faster active scan lookups
    __table_args__ = (
        Index('ix_scans_project_state', 'project_id', 'state'),
    )

class UserDB(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)


class ScanReportDB(Base):
    __tablename__ = "scan_reports"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    scan_id = Column(String, index=True, nullable=False)
    project_id = Column(String, index=True, nullable=False)
    tool_name = Column(String, nullable=False)  # trivy_fs, zap, dependency_check, nmap, sonar

    # Summary counts: {"critical": 3, "high": 12, "medium": 45, "low": 89}
    severity_summary = Column(JSON, default=dict)

    # Detailed findings: [{"id": "001", "severity": "Critical", ...}]
    findings = Column(JSON, default=list)

    # Raw report storage (full JSON from tool)
    raw_report = Column(String, nullable=True)

    # Link to Jenkins artifact or Sonar dashboard
    report_url = Column(String, nullable=True)

    # Metadata
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    # Retention: 90 days from creation
    expires_at = Column(DateTime, nullable=True)

    # Index for cleanup queries
    __table_args__ = (
        Index('ix_scan_reports_project_created', 'project_id', 'created_at'),
    )


class ProjectGroupDB(Base):
    """Groups multiple projects under a unified high-level project view"""
    __tablename__ = "project_groups"

    group_id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    # Pattern for auto-matching scans (e.g., "kilo_*" matches "kilo_frontend", "kilo_backend")
    naming_pattern = Column(String, nullable=False)
    # Owner/Creator
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    # Index for pattern matching queries
    __table_args__ = (
        Index('ix_project_groups_naming_pattern', 'naming_pattern'),
    )


class ScanAssignmentDB(Base):
    """Maps scans to project groups for aggregated reporting"""
    __tablename__ = "scan_assignments"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    group_id = Column(String, index=True, nullable=False)
    scan_id = Column(String, index=True, nullable=False)
    project_id = Column(String, index=True, nullable=False)
    # Confidence score from fuzzy matching (0-100)
    match_confidence = Column(Integer, default=100)
    # Whether this was auto-assigned or manually assigned
    is_auto_assigned = Column(String, default="true")
    assigned_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    # Unique constraint to prevent duplicate assignments
    __table_args__ = (
        Index('ix_scan_assignments_group_scan', 'group_id', 'scan_id', unique=True),
        Index('ix_scan_assignments_project', 'project_id'),
    )
