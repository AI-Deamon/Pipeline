from pydantic import BaseModel
from typing import List, Optional
from app.state.scan_state import ScanState
from datetime import datetime

class ScanCreate(BaseModel):
    project_id: str
    scan_mode: str  # automated | manual
    selected_stages: Optional[List[str]] = None

class StageResult(BaseModel):
    stage: str
    status: str
    summary: Optional[str] = None
    artifact_url: Optional[str] = None

class ScanError(BaseModel):
    """Error details for failed scans"""
    message: str
    error_type: Optional[str] = None
    jenkins_console_url: Optional[str] = None

class ScanResponse(BaseModel):
    scan_id: str
    project_id: str
    scan_mode: str
    state: ScanState
    selected_stages: Optional[List[str]] = []
    created_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    results: List[StageResult] = []
    # New fields for Phase 1 & 2
    error: Optional[ScanError] = None
    retry_count: int = 0

class ScanResultsResponse(BaseModel):
    scan_id: str
    results: List[StageResult]

class ScanResetResponse(BaseModel):
    """Response for scan reset endpoint"""
    status: str
    message: str
    scan_id: str
    project_id: str

class ScanCancelResponse(BaseModel):
    """Response for scan cancel endpoint"""
    status: str
    message: str
    scan_id: str

class ScanRetryReportsResponse(BaseModel):
    """Response for retry-reports endpoint"""
    status: str
    message: str
    scan_id: str
    task_id: Optional[str] = None

class ScanHistoryResponse(BaseModel):
    """Single scan item in history"""
    scan_id: str
    state: ScanState
    created_at: datetime
    finished_at: Optional[datetime] = None
    retry_count: int = 0
    error: Optional[ScanError] = None
