"""Jenkins callback endpoint for receiving scan results."""

import hashlib
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Header
from sqlalchemy.orm import Session

from app.api.scans.constants import (
    TERMINAL_STATES,
    STAGE_STATUS_MAP,
    JENKINS_STAGE_NAME_TO_ID,
    MAX_ARTIFACT_URL_LENGTH,
    MAX_ARTIFACT_SIZE_BYTES,
)
from app.api.scans.helpers import scan_to_response
from app.core.config import settings
from app.core.db import get_db
from app.models.db_models import ScanDB, ProjectDB
from app.services.validation import VALID_STAGES
from app.state.scan_state import ScanState
from app.websockets.manager import manager as websocket_manager

router = APIRouter()
logger = logging.getLogger(__name__)


def _json_digest(payload: dict) -> str:
    canonical_payload = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical_payload.encode("utf-8")).hexdigest()


def _validate_callback_auth(callback_token: str | None):
    if settings.ENV == "test":
        return
    expected = settings.CALLBACK_TOKEN.strip()
    if callback_token != expected:
        raise HTTPException(status_code=401, detail="Invalid callback token")


def _normalize_stage(stage: dict) -> dict:
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


def _validate_callback_artifacts(stages: list[dict]):
    for stage in stages:
        artifact_url = stage.get("artifact_url")
        if artifact_url is not None:
            if not isinstance(artifact_url, str):
                raise HTTPException(
                    status_code=400, detail="artifact_url must be a string"
                )
            if len(artifact_url) > MAX_ARTIFACT_URL_LENGTH:
                raise HTTPException(
                    status_code=400,
                    detail="artifact_url exceeds maximum allowed length",
                )
            if not artifact_url.startswith(("http://", "https://", "/")):
                raise HTTPException(
                    status_code=400,
                    detail="artifact_url must be absolute HTTP(S) URL or absolute path",
                )

        artifact_size_bytes = stage.get("artifact_size_bytes")
        if artifact_size_bytes is not None:
            if not isinstance(artifact_size_bytes, int):
                raise HTTPException(
                    status_code=400, detail="artifact_size_bytes must be an integer"
                )
            if artifact_size_bytes < 0 or artifact_size_bytes > MAX_ARTIFACT_SIZE_BYTES:
                raise HTTPException(
                    status_code=400,
                    detail="artifact_size_bytes is out of allowed range",
                )

        artifact_sha256 = stage.get("artifact_sha256")
        if artifact_sha256 is not None:
            if not isinstance(artifact_sha256, str) or len(artifact_sha256) != 64:
                raise HTTPException(
                    status_code=400,
                    detail="artifact_sha256 must be a 64-char hex string",
                )
            if any(c not in "0123456789abcdefABCDEF" for c in artifact_sha256):
                raise HTTPException(
                    status_code=400, detail="artifact_sha256 must be hexadecimal"
                )


@router.post("/scans/{scan_id}/callback")
def scan_callback(
    scan_id: str,
    report: dict,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    x_callback_token: str | None = Header(default=None, alias="X-Callback-Token"),
):
    _validate_callback_auth(x_callback_token)

    scan_obj = db.query(ScanDB).filter(ScanDB.scan_id == scan_id).first()
    if not scan_obj:
        raise HTTPException(status_code=404, detail="Scan not found")

    project_obj = (
        db.query(ProjectDB).filter(ProjectDB.project_id == scan_obj.project_id).first()
    )
    if project_obj:
        from app.api.scans.helpers import expire_scan_if_timed_out

        expire_scan_if_timed_out(db, scan_obj, project_obj)

    db.refresh(scan_obj)

    callback_digest = _json_digest(report)
    current_digests = scan_obj.callback_digests or []
    if callback_digest in current_digests:
        return {"status": "success", "idempotent": True}

    if scan_obj.state in TERMINAL_STATES:
        logger.info("Ignoring callback for terminal scan %s", scan_id)
        current_digests.append(callback_digest)
        # SQLAlchemy mutability for JSON fields needs assignment
        scan_obj.callback_digests = list(current_digests)
        db.commit()
        return {"status": "success", "idempotent": True}

    stages = report.get("stages", [])
    if not isinstance(stages, list):
        raise HTTPException(status_code=400, detail="stages must be a list")

    normalized_stages = [_normalize_stage(stage) for stage in stages]
    _validate_callback_artifacts(normalized_stages)
    scan_obj.stage_results = normalized_stages

    jenkins_status = str(report.get("status", "")).upper()

    build_number = report.get("build_number")
    if build_number is None:
        build_number = report.get("buildNumber")

    if jenkins_status == "RUNNING":
        # Jenkins confirmed build started - transition from CREATED to RUNNING
        scan_obj.state = ScanState.RUNNING
        scan_obj.started_at = datetime.now(timezone.utc)
        logger.info(f"Scan {scan_id} transitioned to RUNNING state")
    elif jenkins_status == "SUCCESS":
        scan_obj.state = ScanState.COMPLETED

        # Trigger async report processing
        build_num = str(build_number) if build_number else None
        if build_num:
            from app.tasks.report_tasks import process_scan_reports_task
            from app.core.config import settings

            background_tasks.add_task(
                process_scan_reports_task.delay,
                scan_id=scan_id,
                jenkins_build_number=build_num,
                jenkins_base_url=settings.JENKINS_BASE_URL,
            )
    elif jenkins_status in {"FAILURE", "ABORTED", "UNSTABLE"}:
        scan_obj.state = ScanState.FAILED

        # Store error details from Jenkins callback - accept both upper and lowercase keys
        error_message = report.get("ERROR_MESSAGE") or report.get("error_message")
        error_type = report.get("ERROR_TYPE") or report.get("error_type")
        jenkins_console_url = report.get("JENKINS_CONSOLE_URL") or report.get(
            "jenkins_console_url"
        )

        if error_message:
            scan_obj.error_message = error_message
        if error_type:
            scan_obj.error_type = error_type
        if jenkins_console_url:
            scan_obj.jenkins_console_url = jenkins_console_url

        logger.info(
            f"Scan {scan_id} failed with error type: {error_type}, message: {error_message}"
        )
    else:
        raise HTTPException(status_code=400, detail="Invalid callback status")

    build_number = report.get("build_number")
    if build_number is None:
        build_number = report.get("buildNumber")
    if build_number is not None:
        scan_obj.jenkins_build_number = str(build_number)

    queue_id = report.get("queue_id")
    if queue_id is None:
        queue_id = report.get("queueId")
    if queue_id is not None:
        scan_obj.jenkins_queue_id = str(queue_id)

    if project_obj:
        project_obj.last_scan_state = scan_obj.state.value

    finished_at_str = report.get("finishedAt")
    if finished_at_str:
        try:
            scan_obj.finished_at = datetime.fromisoformat(
                finished_at_str.replace("Z", "+00:00")
            )
        except ValueError:
            scan_obj.finished_at = datetime.now(timezone.utc)
    elif scan_obj.state in TERMINAL_STATES:
        scan_obj.finished_at = datetime.now(timezone.utc)

    current_digests.append(callback_digest)
    scan_obj.callback_digests = list(current_digests)
    db.commit()

    # Broadcast update to all connected clients (Phase 3.1)
    background_tasks.add_task(
        websocket_manager.send_scan_update,
        scan_id=scan_obj.scan_id,
        project_id=scan_obj.project_id,
        data=scan_to_response(scan_obj),
    )

    return {"status": "success"}
