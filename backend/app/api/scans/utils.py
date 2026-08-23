from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
import logging

from app.core.config import settings
from app.state.scan_state import ScanState

logger = logging.getLogger(__name__)

TERMINAL_STATES = {ScanState.COMPLETED, ScanState.FAILED, ScanState.CANCELLED, ScanState.SKIPPED}
ACTIVE_STATES = {ScanState.CREATED, ScanState.QUEUED, ScanState.RUNNING}


def resolve_jenkins_base_url(project) -> str:
    """Resolve the Jenkins base URL. Always the global ``JENKINS_BASE_URL`` setting —
    there is exactly one Jenkins instance in this architecture (see Settings.JENKINS_BASE_URL,
    a single required string with no pool/failover concept).

    This function previously swapped in the project's ``target_ip`` as the entire
    Jenkins base URL (``http://{target_ip}``) whenever it was set. That was a real
    vulnerability (finding #15), not a multi-Jenkins feature: ``target_ip`` is the
    IP of the *scanned application* (see docs/jenkins_pipeline_architecture.md's Nmap
    stage, which runs `nmap ... ${PROJECT.target_ip}`), completely unrelated to where
    Jenkins itself is hosted. Since `fetch_artifact()` attaches
    `Authorization: Basic base64("admin:"+JENKINS_TOKEN)` to requests against this
    URL, setting `target_ip` to an attacker-controlled address sent the real Jenkins
    admin credential straight to them — and, since only IP-shape was validated (no
    private/loopback/metadata blocklist), it was SSRF-capable against internal
    targets too. `project` is accepted for signature compatibility with existing
    callers but is intentionally unused now.
    """
    return settings.JENKINS_BASE_URL
MAX_ARTIFACT_URL_LENGTH = 2048
MAX_ARTIFACT_SIZE_BYTES = 50 * 1024 * 1024

STAGE_TIMEOUTS = {
    "git_checkout": 300,
    "sonar_scanner": 900,
    "dependency_check": 900,
    "trivy_fs_scan": 600,
    "docker_build": 900,
    "docker_push": 600,
    "trivy_image_scan": 600,
    "nmap_scan": 300,
    "zap_scan": 1800,
}

JENKINS_STAGE_NAME_TO_ID = {
    "Git Checkout": "git_checkout",
    "Sonar Scanner": "sonar_scanner",
    "Dependency Check": "dependency_check",
    "Trivy FS Scan": "trivy_fs_scan",
    "Docker Build": "docker_build",
    "Docker Push": "docker_push",
    "Trivy Image Scan": "trivy_image_scan",
    "Nmap Scan": "nmap_scan",
    "ZAP Scan": "zap_scan",
}

STAGE_STATUS_MAP = {
    "PASSED": "PASS",
    "PASS": "PASS",
    "FAILED": "FAIL",
    "FAIL": "FAIL",
    "SUCCESS": "PASS",
    "FAILURE": "FAIL",
    "SKIPPED": "SKIPPED",
    "WARN": "WARN",
    "UNSTABLE": "WARN",
}


def calculate_scan_timeout(selected_stages: list) -> int:
    if not selected_stages:
        return sum(STAGE_TIMEOUTS.values())
    total = 0
    for stage in selected_stages:
        total += STAGE_TIMEOUTS.get(stage, 300)
    return int(total * 1.2)


def _json_digest(payload: dict) -> str:
    canonical_payload = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical_payload.encode("utf-8")).hexdigest()


def _validate_callback_auth(callback_token: str | None):
    if settings.ENV == "test":
        return
    expected = settings.CALLBACK_TOKEN.strip()
    if not callback_token or not hmac.compare_digest(callback_token, expected):
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Invalid callback token")


def _normalize_stage(stage: dict) -> dict:
    from app.services.validation import VALID_STAGES
    from fastapi import HTTPException

    stage_id = stage.get("stage")
    if stage_id is None:
        stage_id = JENKINS_STAGE_NAME_TO_ID.get(stage.get("name"))
    if stage_id not in VALID_STAGES:
        raise HTTPException(
            status_code=400, detail=f"Invalid stage identifier: {stage_id}"
        )

    normalized_status = STAGE_STATUS_MAP.get(str(stage.get("status", "")).upper())
    if normalized_status is None:
        raise HTTPException(
            status_code=400, detail=f"Invalid stage status: {stage.get('status')}"
        )

    return {
        "stage": stage_id,
        "status": normalized_status,
        "summary": stage.get("summary") or stage.get("details"),
        "artifact_url": stage.get("artifact_url") or stage.get("reportUrl"),
        "artifact_size_bytes": stage.get("artifact_size_bytes"),
        "artifact_sha256": stage.get("artifact_sha256"),
    }


def _validate_artifact_url(artifact_url):
    if artifact_url is None:
        return
    if not isinstance(artifact_url, str):
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="artifact_url must be a string")
    if len(artifact_url) > MAX_ARTIFACT_URL_LENGTH:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="artifact_url exceeds maximum allowed length")
    if not artifact_url.startswith(("http://", "https://", "/")):
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="artifact_url must be absolute HTTP(S) URL or absolute path")


def _validate_artifact_size(artifact_size_bytes):
    if artifact_size_bytes is None:
        return
    if not isinstance(artifact_size_bytes, int):
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="artifact_size_bytes must be an integer")
    if artifact_size_bytes < 0 or artifact_size_bytes > MAX_ARTIFACT_SIZE_BYTES:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="artifact_size_bytes is out of allowed range")


def _validate_artifact_sha256(artifact_sha256):
    if artifact_sha256 is None:
        return
    if not isinstance(artifact_sha256, str) or len(artifact_sha256) != 64:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="artifact_sha256 must be a 64-char hex string")
    if any(c not in "0123456789abcdefABCDEF" for c in artifact_sha256):
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="artifact_sha256 must be hexadecimal")


def _validate_callback_artifacts(stages: list[dict]):
    for stage in stages:
        _validate_artifact_url(stage.get("artifact_url"))
        _validate_artifact_size(stage.get("artifact_size_bytes"))
        _validate_artifact_sha256(stage.get("artifact_sha256"))


def _expire_scan_if_timed_out(
    db,
    scan_obj,
    project_obj,
    now: datetime = None,
    timeout_seconds: int = None,
    auto_commit: bool = True,
) -> bool:
    if scan_obj.state in TERMINAL_STATES:
        return False

    now = now or datetime.now(timezone.utc)
    if timeout_seconds is None:
        # Honor the per-scan timeout (set from the X-Scan-Timeout header at trigger time)
        # before falling back to the global default, so a long scan isn't expired early.
        timeout_seconds = getattr(scan_obj, "timeout_seconds", None) or settings.SCAN_TIMEOUT

    reference_time = scan_obj.started_at or scan_obj.created_at
    if reference_time and reference_time.tzinfo is None:
        reference_time = reference_time.replace(tzinfo=timezone.utc)

    if reference_time and now - reference_time > timedelta(seconds=timeout_seconds):
        scan_obj.state = ScanState.FAILED
        scan_obj.finished_at = now
        scan_obj.error_message = f"Scan timed out after {timeout_seconds} seconds"
        scan_obj.error_type = "TIMEOUT"
        project_obj.last_scan_state = scan_obj.state.value

        if auto_commit:
            db.commit()
        logger.warning(
            "Scan %s exceeded timeout (%s sec) and was marked FAILED",
            scan_obj.scan_id,
            timeout_seconds,
        )
        return True
    return False


def _scan_to_response(scan_obj) -> dict:
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
        "git_commit": scan_obj.git_commit,
        "git_branch": scan_obj.git_branch,
    }
