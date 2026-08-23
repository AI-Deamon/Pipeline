from datetime import datetime, timezone
import logging
from typing import Annotated

from celery import chain, group
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.models.db_models import ProjectDB, ScanDB
from app.state.scan_state import ScanState
from app.tasks.report_tasks import process_scan_reports_task
from app.tasks.issue_tasks import migrate_scan_to_issues, auto_verify_fixed_issues, auto_verify_pending_rescans, detect_regressions
from app.websockets.manager import manager as websocket_manager

from .utils import (
    TERMINAL_STATES,
    _json_digest,
    _normalize_stage,
    _scan_to_response,
    _validate_callback_artifacts,
    _validate_callback_auth,
    _expire_scan_if_timed_out,
    resolve_jenkins_base_url,
)

router = APIRouter()
logger = logging.getLogger(__name__)


def _process_failure_info(scan_obj: ScanDB, report: dict) -> None:
    error_message = report.get("ERROR_MESSAGE") or report.get("error_message")
    error_type = report.get("ERROR_TYPE") or report.get("error_type")
    jenkins_console_url = report.get("JENKINS_CONSOLE_URL") or report.get("jenkins_console_url")

    if error_message:
        scan_obj.error_message = error_message
    if error_type:
        scan_obj.error_type = error_type
    if jenkins_console_url:
        scan_obj.jenkins_console_url = jenkins_console_url

    logger.info(
        f"Scan {scan_obj.scan_id} failed with error type: {error_type}, message: {error_message}"
    )


def _update_jenkins_metadata(scan_obj: ScanDB, report: dict) -> None:
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

    git_commit = report.get("GIT_COMMIT")
    git_branch = report.get("GIT_BRANCH")
    if git_commit:
        scan_obj.git_commit = git_commit
    if git_branch:
        scan_obj.git_branch = git_branch


def _update_finished_at(scan_obj: ScanDB, report: dict) -> None:
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


def _schedule_post_processing(scan_obj: ScanDB, normalized_stages: list, build_number: int | None, project_obj: ProjectDB | None = None) -> None:
    # Process reports for COMPLETED and FAILED scans.  A FAILED scan may still
    # have PASS and FAIL stages whose findings must reach the issue tracker
    # (e.g. ZAP found vulnerabilities → FAIL stage with findings).  Terminal
    # scans that were never started (CANCELLED, SKIPPED) are skipped.
    if scan_obj.state in TERMINAL_STATES and scan_obj.state not in (ScanState.COMPLETED, ScanState.FAILED):
        return
    if not build_number:
        return

    if scan_obj.state == ScanState.FAILED:
        logger.info("Scheduling report processing for FAILED scan %s (stages may have findings)", scan_obj.scan_id)

    jenkins_base_url = resolve_jenkins_base_url(project_obj) if project_obj else settings.JENKINS_BASE_URL

    report_task = process_scan_reports_task.si(
        scan_id=scan_obj.scan_id,
        jenkins_build_number=str(build_number),
        jenkins_base_url=jenkins_base_url,
    )

    # Match the fetcher's _get_active_tools contract: both PASS and FAIL stages
    # produce reports. A FAIL stage (e.g. ZAP found vulnerabilities) is exactly the
    # one whose findings must reach the issue tracker.
    completed_stages = [s for s in normalized_stages if s.get("status") in ("PASS", "FAIL")]
    if not completed_stages:
        report_task.apply_async()
        return

    # Migration/verification read the ScanReportDB row that process_scan_reports_task
    # creates, so they must not run until that task finishes. Each stage's chain runs
    # independently once the report fetch completes; stages don't depend on each other.
    per_stage_chains = [
        chain(
            migrate_scan_to_issues.si(scan_obj.scan_id, scan_obj.project_id, stage["stage"]),
            auto_verify_fixed_issues.si(scan_obj.scan_id, scan_obj.project_id, stage["stage"]),
            auto_verify_pending_rescans.si(scan_obj.scan_id, scan_obj.project_id, stage["stage"]),
            detect_regressions.si(scan_obj.scan_id, scan_obj.project_id, stage["stage"]),
        )
        for stage in completed_stages
    ]

    chain(report_task, group(per_stage_chains)).apply_async()


@router.post("/scans/{scan_id}/callback",
  responses={400: {"description": "Bad request"}, 404: {"description": "Not found"}})
def scan_callback(
    scan_id: str,
    report: dict,
    background_tasks: BackgroundTasks,
    db: Annotated[Session, Depends(get_db)],
    x_callback_token: Annotated[str | None, Header(alias="X-Callback-Token")] = None,
):
    _validate_callback_auth(x_callback_token)

    # Lock the scan row for the duration of this request so a concurrent callback
    # delivery (Jenkins retry) or the recovery background thread can't read-modify-write
    # the same row in between our read and our commit.
    scan_obj = (
        db.query(ScanDB).filter(ScanDB.scan_id == scan_id).with_for_update().first()
    )
    if not scan_obj:
        raise HTTPException(status_code=404, detail="Scan not found")

    project_obj = (
        db.query(ProjectDB)
        .filter(ProjectDB.project_id == scan_obj.project_id)
        .with_for_update()
        .first()
    )
    if project_obj:
        _expire_scan_if_timed_out(db, scan_obj, project_obj)

    db.refresh(scan_obj)

    callback_digest = _json_digest(report)
    current_digests = scan_obj.callback_digests or []
    if callback_digest in current_digests:
        return {"status": "success", "idempotent": True}

    if scan_obj.state in TERMINAL_STATES:
        logger.info("Ignoring callback for terminal scan %s", scan_id)
        current_digests.append(callback_digest)
        scan_obj.callback_digests = list(current_digests)
        db.commit()
        return {"status": "success", "idempotent": True}

    stages = report.get("stages") or report.get("STAGE_RESULTS", [])
    if not isinstance(stages, list):
        raise HTTPException(status_code=400, detail="stages must be a list")

    normalized_stages = [_normalize_stage(stage) for stage in stages]
    _validate_callback_artifacts(normalized_stages)
    scan_obj.stage_results = normalized_stages

    jenkins_status = str(report.get("status", "")).upper()
    if jenkins_status == "RUNNING":
        scan_obj.state = ScanState.RUNNING
        scan_obj.started_at = datetime.now(timezone.utc)
        logger.info(f"Scan {scan_id} transitioned to RUNNING state")
    elif jenkins_status == "SUCCESS":
        scan_obj.state = ScanState.COMPLETED
    elif jenkins_status in {"FAILURE", "ABORTED", "UNSTABLE"}:
        scan_obj.state = ScanState.FAILED
        _process_failure_info(scan_obj, report)
    else:
        raise HTTPException(status_code=400, detail="Invalid callback status")

    _update_jenkins_metadata(scan_obj, report)

    if project_obj:
        project_obj.last_scan_state = scan_obj.state.value

    _update_finished_at(scan_obj, report)

    current_digests.append(callback_digest)
    scan_obj.callback_digests = list(current_digests)
    db.commit()

    build_number = report.get("build_number") or report.get("buildNumber")
    _schedule_post_processing(scan_obj, normalized_stages, build_number, project_obj)

    background_tasks.add_task(
        websocket_manager.send_scan_update,
        scan_id=scan_obj.scan_id,
        project_id=scan_obj.project_id,
        data=_scan_to_response(scan_obj),
    )

    return {"status": "success"}
