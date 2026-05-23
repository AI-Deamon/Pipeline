from app.state.scan_state import ScanState
from datetime import datetime, timezone

class Scan:
    def __init__(
        self,
        scan_id: str,
        project_id: str,
        scan_mode: str,  # automated | manual
        selected_stages: list[str] | None = None,
        state: ScanState = ScanState.CREATED,
    ):
        self.scan_id = scan_id
        self.project_id = project_id
        self.scan_mode = scan_mode
        self.selected_stages = selected_stages or []
        self.state = state
        self.created_at = datetime.now(timezone.utc)
        self.started_at = None
        self.finished_at = None
        self.stage_results = []
        self.jenkins_build_number = None
        self.jenkins_queue_id = None
        self.callback_digests = set()
