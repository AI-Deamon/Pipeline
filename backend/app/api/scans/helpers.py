import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.api.scans.constants import STAGE_TIMEOUTS
from app.core.config import settings
from app.models.db_models import ScanDB, ProjectDB, MAX_RETRY_COUNT
from app.schemas.scan import ScanError, ScanResponse, ScanResultsResponse
from app.state.scan_state import ScanState
from app.websockets.manager import manager as websocket_manager

import json

logger = logging.getLogger(__name__)


def calculate_scan_timeout(selected_stages: list) -> int:
    """Calculate dynamic timeout based on selected stages"""
    if not selected_stages:
        return sum(STAGE_TIMEOUTS.values())

    total = 0
    for stage in selected_stages:
        total += STAGE_TIMEOUTS.get(stage, 300)

    return int(total * 1.2)


def scan_to_response(scan_obj: ScanDB) -> dict:
    """Convert scan object to response dict"""
    error = None
    if scan_obj.error_message:
        error = {
            "message": scan_obj.error_message,
            "error_type": scan_obj.error_type,
            "jenkins_console_url": scan_obj.jenkins_console_url,
        }

    def format_dt(dt):
        return dt.isoformat() if dt else None

    return {
        "scan_id": scan_obj.scan_id,
        "project_id": scan_obj.project_id,
        "scan_mode": scan_obj.scan_mode,
        "state": scan_obj.state.value
        if hasattr(scan_obj.state, "value")
        else str(scan_obj.state),
        "selected_stages": scan_obj.selected_stages,
        "created_at": format_dt(scan_obj.created_at),
        "started_at": format_dt(scan_obj.started_at),
        "finished_at": format_dt(scan_obj.finished_at),
        "results": scan_obj.stage_results,
        "error": error,
        "retry_count": scan_obj.retry_count or 0,
    }


def expire_scan_if_timed_out(
    db,
    scan_obj: ScanDB,
    project_obj: ProjectDB,
    now: datetime | None = None,
    timeout_seconds: int | None = None,
    auto_commit: bool = True,
) -> bool:
    """Check if scan has exceeded timeout and mark as failed"""
    if now is None:
        now = datetime.now(timezone.utc)
    if timeout_seconds is None:
        timeout_seconds = settings.SCAN_TIMEOUT

    started = scan_obj.started_at
    if not started or scan_obj.state != ScanState.RUNNING:
        return False

    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)

    elapsed = (now - started).total_seconds()
    if elapsed > timeout_seconds:
        scan_obj.state = ScanState.FAILED
        scan_obj.finished_at = now
        scan_obj.error_message = f"Scan timed out after {timeout_seconds} seconds"
        scan_obj.error_type = "TIMEOUT"

        if project_obj:
            project_obj.last_scan_state = ScanState.FAILED.value

        if auto_commit:
            db.commit()

        logger.warning(
            "Scan %s exceeded timeout (%s sec) and was marked FAILED",
            scan_obj.scan_id,
            timeout_seconds,
        )
        return True
    return False


def check_scan_not_started(
    db,
    scan_obj: ScanDB,
    project_obj: ProjectDB,
    now: datetime | None = None,
    not_started_timeout: int = 600,
    auto_commit: bool = True,
) -> bool:
    """Check if scan was triggered but Jenkins never started (e.g., syntax error in Jenkinsfile).

    This handles cases where:
    - Jenkinsfile has syntax errors
    - Jenkins fails to start the job
    - Git fetch fails before pipeline starts

    The scan will be marked FAILED if it's still in CREATED state after not_started_timeout seconds.
    """
    if now is None:
        now = datetime.now(timezone.utc)

    if scan_obj.state != ScanState.CREATED:
        return False

    created = scan_obj.created_at
    if not created:
        return False

    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)

    elapsed = (now - created).total_seconds()

    if elapsed > not_started_timeout:
        scan_obj.state = ScanState.FAILED
        scan_obj.finished_at = now
        scan_obj.error_message = "Jenkins pipeline failed to start - possible Jenkinsfile syntax error or configuration issue. Check Jenkins console for details."
        scan_obj.error_type = "PIPELINE_ERROR"
        scan_obj.jenkins_console_url = (
            f"{settings.JENKINS_BASE_URL}/job/Security-pipeline/"
        )

        if project_obj:
            project_obj.last_scan_state = ScanState.FAILED.value

        if auto_commit:
            db.commit()

        logger.warning(
            "Scan %s was not started by Jenkins after %s seconds - marked as FAILED",
            scan_obj.scan_id,
            not_started_timeout,
        )
        return True
    return False


def format_results(scan_obj: ScanDB) -> dict:
    """Format scan results for response"""
    artifacts = []

    if scan_obj.stage_results:
        for result in scan_obj.stage_results:
            artifact_url = result.get("artifact_url")
            if artifact_url:
                artifacts.append(
                    {
                        "stage": result.get("stage"),
                        "type": result.get("type"),
                        "url": artifact_url[:2048]
                        if len(artifact_url) > 2048
                        else artifact_url,
                    }
                )

    passed = sum(1 for r in scan_obj.stage_results if r.get("status") == "PASS")
    failed = sum(1 for r in scan_obj.stage_results if r.get("status") == "FAIL")
    warned = sum(1 for r in scan_obj.stage_results if r.get("status") == "WARN")
    skipped = sum(1 for r in scan_obj.stage_results if r.get("status") == "SKIPPED")

    return {
        "scan_id": scan_obj.scan_id,
        "project_id": scan_obj.project_id,
        "state": scan_obj.state.value
        if hasattr(scan_obj.state, "value")
        else str(scan_obj.state),
        "stage_results": scan_obj.stage_results,
        "summary": {
            "passed": passed,
            "failed": failed,
            "warned": warned,
            "skipped": skipped,
            "total": len(scan_obj.stage_results),
        },
        "artifacts": artifacts,
        "duration_seconds": (
            (scan_obj.finished_at - scan_obj.started_at).total_seconds()
            if scan_obj.started_at and scan_obj.finished_at
            else None
        ),
    }


def parse_jenkins_payload(payload: dict) -> dict:
    """Parse Jenkins callback payload"""
    scan_id = payload.get("SCAN_ID")
    if not scan_id:
        raise ValueError("Missing SCAN_ID in payload")

    state_str = payload.get("SCAN_STATE", "").upper()

    try:
        state = ScanState(state_str)
    except ValueError:
        logger.warning(f"Unknown scan state: {state_str}, defaulting to RUNNING")
        state = ScanState.RUNNING

    error = None
    if payload.get("ERROR_MESSAGE"):
        error = {
            "message": payload.get("ERROR_MESSAGE"),
            "error_type": payload.get("ERROR_TYPE", "JENKINS_ERROR"),
            "jenkins_console_url": payload.get("JENKINS_CONSOLE_URL"),
        }

    stage_results = []
    raw_results = payload.get("stages") or payload.get("STAGE_RESULTS", [])
    if raw_results:
        try:
            if isinstance(raw_results, str):
                stage_results = json.loads(raw_results)
            else:
                stage_results = raw_results
        except (json.JSONDecodeError, TypeError):
            logger.warning("Failed to parse STAGE_RESULTS")
            stage_results = []

    return {
        "scan_id": scan_id,
        "state": state,
        "error": error,
        "stage_results": stage_results,
        "jenkins_build_number": payload.get("BUILD_NUMBER"),
    }
