import json
import logging
from datetime import datetime
from pathlib import Path
from threading import RLock

from app.core.config import settings
from app.models.scan import Scan
from app.state.scan_state import ScanState

logger = logging.getLogger(__name__)
_persist_lock = RLock()


def _state_file() -> Path:
    return Path(settings.STORAGE_PATH) / "control_plane_state.json"


def persist_state(scans_db: dict, projects_db: dict) -> None:
    with _persist_lock:
        state_file = _state_file()
        tmp = state_file.with_suffix(".tmp")

        payload = {
            "persisted_at": datetime.utcnow().isoformat(),
            "scans": {
                sid: {
                    "scan_id": s.scan_id,
                    "project_id": s.project_id,
                    "scan_mode": s.scan_mode,
                    "state": s.state.value if hasattr(s.state, "value") else str(s.state),
                    "selected_stages": s.selected_stages,
                    "created_at": s.created_at.isoformat(),
                    "started_at": s.started_at.isoformat() if s.started_at else None,
                    "finished_at": s.finished_at.isoformat() if s.finished_at else None,
                    "jenkins_build_number": s.jenkins_build_number,
                    "jenkins_queue_id": s.jenkins_queue_id,
                    "stage_results": s.stage_results,
                    "callback_digests": list(s.callback_digests),
                }
                for sid, s in scans_db.items()
            },
            "projects": {pid: dict(p) for pid, p in projects_db.items()},
        }

        try:
            state_file.parent.mkdir(parents=True, exist_ok=True)
            tmp.write_text(json.dumps(payload))
            tmp.replace(state_file)
        except Exception:
            logger.exception("Failed to persist control-plane state")


def restore_state() -> tuple[dict, dict]:
    state_file = _state_file()
    if not state_file.exists():
        return {}, {}

    try:
        payload = json.loads(state_file.read_text())
    except Exception:
        logger.exception("Failed to parse persisted state; starting fresh")
        return {}, {}

    scans: dict[str, Scan] = {}
    for sid, raw in payload.get("scans", {}).items():
        try:
            scan = Scan(
                scan_id=raw["scan_id"],
                project_id=raw["project_id"],
                scan_mode=raw["scan_mode"],
                selected_stages=raw.get("selected_stages", []),
                state=ScanState(raw["state"]),
            )
            scan.created_at = datetime.fromisoformat(raw["created_at"])
            scan.started_at = datetime.fromisoformat(raw["started_at"]) if raw.get("started_at") else None
            scan.finished_at = datetime.fromisoformat(raw["finished_at"]) if raw.get("finished_at") else None
            scan.jenkins_build_number = raw.get("jenkins_build_number")
            scan.jenkins_queue_id = raw.get("jenkins_queue_id")
            scan.stage_results = raw.get("stage_results", [])
            scan.callback_digests = set(raw.get("callback_digests", []))

            if scan.state in {ScanState.CREATED, ScanState.QUEUED, ScanState.RUNNING}:
                scan.state = ScanState.FAILED
                scan.finished_at = datetime.utcnow()

            scans[sid] = scan
        except Exception:
            logger.exception("Skipping invalid scan payload during restore for scan_id=%s", sid)

    projects = payload.get("projects", {})
    return scans, projects
