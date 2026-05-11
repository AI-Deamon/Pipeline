import enum
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Enum, JSON
from app.core.db import Base
from app.state.scan_state import ScanState


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


class ScanDB(Base):
    __tablename__ = "scans"

    scan_id = Column(String, primary_key=True, index=True)
    project_id = Column(String, index=True, nullable=False)
    scan_mode = Column(String, nullable=False)
    selected_stages = Column(JSON, default=list)
    state = Column(Enum(ScanState), default=ScanState.CREATED, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    jenkins_build_number = Column(String, nullable=True)
    jenkins_queue_id = Column(String, nullable=True)
    stage_results = Column(JSON, default=list)
    callback_digests = Column(JSON, default=list)
    # New fields for Phase 1 & 2
    error_message = Column(String, nullable=True)  # Store error details
    error_type = Column(
        String, nullable=True
    )  # e.g., "PIPELINE_ERROR", "SECURITY_ISSUE"
    jenkins_console_url = Column(String, nullable=True)  # Direct link to Jenkins logs
    retry_count = Column(String, default="0", nullable=False)  # Number of retries


class UserDB(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
