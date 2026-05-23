import uuid
from app.models.scan import Scan
from app.state.scan_state import ScanState
from datetime import datetime

def create_scan_object(project_id: str, scan_mode: str, selected_stages: list[str] | None):
    scan_id = str(uuid.uuid4())

    scan = Scan(
        scan_id=scan_id,
        project_id=project_id,
        scan_mode=scan_mode,
        selected_stages=selected_stages,
    )

    scan.state = ScanState.CREATED
    return scan

# orchestrate_scan is not used in Phase 3
def orchestrate_scan(scan: Scan, project_data: dict):
    """
    Handles the transition from QUEUED to RUNNING by triggering Jenkins.
    """
    # This will be used in later phases
    pass
