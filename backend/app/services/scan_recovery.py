"""
Scan Recovery Service - Auto-recovery for stuck scans
"""

import logging
import threading
from datetime import datetime, timedelta, timezone
from typing import List

from sqlalchemy.orm import Session
from app.core.db import SessionLocal
from app.models.db_models import ScanDB, ProjectDB
from app.state.scan_state import ScanState
from app.core.config import settings
from app.infrastructure.jenkins.jenkins_client import JenkinsClient
from app.core.exceptions import ExternalServiceError
from app.tasks.report_tasks import process_scan_reports_task
from app.api.scans.utils import TERMINAL_STATES
from app.metrics import JENKINS_POLL_ERRORS_TOTAL

logger = logging.getLogger(__name__)

shutdown_event = threading.Event()
JENKINS_JOB_NAME = "Security-pipeline"

def _jenkins_console_url(build_number: str | None) -> str | None:
    if not build_number:
        return None
    return f"{settings.JENKINS_BASE_URL.rstrip('/')}/job/{JENKINS_JOB_NAME}/{build_number}/console"

def _set_terminal_state(
    scan_obj: ScanDB,
    project_obj: ProjectDB | None,
    state: ScanState,
    message: str | None,
    error_type: str | None,
    now: datetime,
    jenkins_console_url: str | None = None,
) -> None:
    scan_obj.state = state
    scan_obj.finished_at = now
    scan_obj.error_message = message
    scan_obj.error_type = error_type
    if jenkins_console_url:
        scan_obj.jenkins_console_url = jenkins_console_url
    if project_obj:
        project_obj.last_scan_state = state.value

def _trigger_report_processing(scan_obj: ScanDB, project_obj: ProjectDB | None = None) -> None:
    """Trigger report fetching when recovery completes a scan without a callback."""
    if not scan_obj.jenkins_build_number:
        logger.warning(f"No jenkins_build_number for scan {scan_obj.scan_id}, skipping report processing")
        return
    from app.api.scans.utils import resolve_jenkins_base_url
    jenkins_base_url = resolve_jenkins_base_url(project_obj) if project_obj else settings.JENKINS_BASE_URL
    logger.info(f"Triggering report processing for scan {scan_obj.scan_id} (recovery path, build {scan_obj.jenkins_build_number})")
    process_scan_reports_task.delay(
        scan_id=scan_obj.scan_id,
        jenkins_build_number=scan_obj.jenkins_build_number,
        jenkins_base_url=jenkins_base_url,
    )


def _handle_build_number_scan(scan_obj, project_obj, client, now):
    """Check Jenkins build status and set terminal state if done."""
    try:
        build_number = int(scan_obj.jenkins_build_number)
        build_status = client.get_build_status(JENKINS_JOB_NAME, build_number)
        building = build_status.get("building", False)
        result = str(build_status.get("result") or "").upper()

        if building:
            return 0, False

        if result == "SUCCESS":
            _set_terminal_state(
                scan_obj, project_obj, ScanState.COMPLETED,
                None, None, now,
                _jenkins_console_url(scan_obj.jenkins_build_number),
            )
            _trigger_report_processing(scan_obj, project_obj)
            return 1, True

        if result in {"FAILURE", "ABORTED", "UNSTABLE"}:
            _set_terminal_state(
                scan_obj, project_obj, ScanState.FAILED,
                f"Jenkins reported {result}", "PIPELINE_ERROR", now,
                _jenkins_console_url(scan_obj.jenkins_build_number),
            )
            return 1, True

    except (ValueError, ExternalServiceError) as e:
        if isinstance(e, ExternalServiceError) and e.status_code == 404:
            _set_terminal_state(
                scan_obj, project_obj, ScanState.FAILED,
                "Jenkins build not found", "PIPELINE_ERROR", now,
                _jenkins_console_url(scan_obj.jenkins_build_number),
            )
            return 1, True
        JENKINS_POLL_ERRORS_TOTAL.labels(check_type="build_status").inc()
        logger.warning(f"Failed to fetch Jenkins build status for scan {scan_obj.scan_id}: {e}")

    return 0, False


def _handle_queue_item_scan(scan_obj, project_obj, client, now):
    """Check Jenkins queue status and update build number if started."""
    try:
        queue_id = int(scan_obj.jenkins_queue_id)
        queue_item = client.get_queue_item(queue_id)

        if queue_item.get("cancelled"):
            _set_terminal_state(
                scan_obj, project_obj, ScanState.FAILED,
                "Jenkins queue item cancelled", "PIPELINE_ERROR", now,
                _jenkins_console_url(scan_obj.jenkins_build_number),
            )
            return 1, True

        executable = queue_item.get("executable") or {}
        build_number = executable.get("number")
        if build_number is not None:
            scan_obj.jenkins_build_number = str(build_number)
            return 0, True

    except (ValueError, ExternalServiceError) as e:
        if isinstance(e, ExternalServiceError) and e.status_code == 404:
            _set_terminal_state(
                scan_obj, project_obj, ScanState.FAILED,
                "Jenkins queue item not found", "PIPELINE_ERROR", now,
                _jenkins_console_url(scan_obj.jenkins_build_number),
            )
            return 1, True
        JENKINS_POLL_ERRORS_TOTAL.labels(check_type="queue_status").inc()
        logger.warning(f"Failed to fetch Jenkins queue status for scan {scan_obj.scan_id}: {e}")

    return 0, False


def poll_jenkins_for_active_scans() -> int:
    """
    Poll Jenkins for scans that are still RUNNING or QUEUED and reconcile status.

    Returns: Number of scans updated
    """
    db = SessionLocal()
    client = JenkinsClient()
    updated_count = 0
    any_changes = False
    try:
        # Candidate IDs only — the Jenkins HTTP call below can be slow, so we don't
        # hold row locks across it. Each scan is re-fetched and locked individually
        # right before it's mutated (see below), immediately after the network call.
        candidate_ids = [
            scan_id for (scan_id,) in db.query(ScanDB.scan_id).filter(
                ScanDB.state.in_([ScanState.QUEUED, ScanState.RUNNING])
            ).all()
        ]
        now = datetime.now(timezone.utc)

        for scan_id in candidate_ids:
            # Re-fetch (unlocked) to decide which Jenkins call to make.
            scan_obj = db.query(ScanDB).filter(ScanDB.scan_id == scan_id).first()
            if not scan_obj:
                continue

            if not scan_obj.jenkins_build_number and not scan_obj.jenkins_queue_id:
                continue

            # Lock the row now, immediately before mutating, and re-verify it hasn't
            # already been moved to a terminal state by a callback in the meantime.
            locked_scan = (
                db.query(ScanDB).filter(ScanDB.scan_id == scan_id).with_for_update().first()
            )
            if not locked_scan or locked_scan.state not in {ScanState.QUEUED, ScanState.RUNNING}:
                continue

            project_obj = (
                db.query(ProjectDB)
                .filter(ProjectDB.project_id == locked_scan.project_id)
                .with_for_update()
                .first()
            )

            try:
                # Finding #123: _handle_build_number_scan/_handle_queue_item_scan
                # already catch the exception types Jenkins calls are expected to
                # raise (finding #119), but this is a sequential single-thread sweep
                # over every active scan — an uncaught exception of any other type
                # for one scan must not abort checking the rest of the candidate
                # list for the remainder of this cycle. Defense in depth beyond #119.
                if locked_scan.jenkins_build_number:
                    count, changed = _handle_build_number_scan(locked_scan, project_obj, client, now)
                else:
                    count, changed = _handle_queue_item_scan(locked_scan, project_obj, client, now)
            except Exception as e:
                db.rollback()
                logger.warning(f"Skipping recovery poll for scan {scan_id}: {e}")
                continue

            updated_count += count
            if changed:
                any_changes = True
                db.commit()  # release this scan's lock before moving to the next

        return updated_count
    finally:
        db.close()

def recover_stuck_scans() -> int:
    """Find and recover stuck scans."""
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)

        # Consider all active scans and apply each scan's OWN timeout after locking —
        # a coarse created_at prefilter on the global timeout would either miss scans
        # with a smaller computed timeout or wrongly flag ones with a larger override.
        # Active scans are bounded in number, so scanning them all is cheap.
        candidate_ids = [
            scan_id for (scan_id,) in db.query(ScanDB.scan_id).filter(
                ScanDB.state.in_([ScanState.CREATED, ScanState.QUEUED, ScanState.RUNNING]),
            ).all()
        ]

        recovered_count = 0
        for scan_id in candidate_ids:
            scan_obj = (
                db.query(ScanDB).filter(ScanDB.scan_id == scan_id).with_for_update().first()
            )
            if not scan_obj or scan_obj.state in TERMINAL_STATES:
                continue

            # Honor the per-scan timeout; only recover if THIS scan has actually exceeded
            # its own budget, not merely the global default.
            effective_timeout = scan_obj.timeout_seconds or settings.SCAN_TIMEOUT
            reference_time = scan_obj.started_at or scan_obj.created_at
            if reference_time and reference_time.tzinfo is None:
                reference_time = reference_time.replace(tzinfo=timezone.utc)
            if reference_time and (now - reference_time).total_seconds() < effective_timeout:
                continue  # not actually timed out yet under its own budget

            logger.warning(
                f"Recovering stuck scan {scan_obj.scan_id} "
                f"(stuck since {reference_time}, timeout={effective_timeout}s)"
            )

            # Best-effort: abort the underlying Jenkins build too (finding #19) — if
            # it's genuinely still running, it'll otherwise keep consuming an
            # executor/agent slot indefinitely after Sentinel has already given up on
            # it. Never let a failure here block marking the scan FAILED on our side;
            # this is resource hygiene, not correctness.
            if scan_obj.jenkins_build_number:
                try:
                    JenkinsClient().stop_build(JENKINS_JOB_NAME, int(scan_obj.jenkins_build_number))
                    logger.info(f"Requested Jenkins abort for build {scan_obj.jenkins_build_number}")
                except Exception as stop_err:
                    logger.warning(
                        f"Failed to abort Jenkins build {scan_obj.jenkins_build_number} "
                        f"for scan {scan_obj.scan_id}: {stop_err}"
                    )

            scan_obj.state = ScanState.FAILED
            scan_obj.finished_at = now
            scan_obj.error_message = f"Scan timed out after {effective_timeout} seconds"
            scan_obj.error_type = "TIMEOUT"

            project_obj = (
                db.query(ProjectDB)
                .filter(ProjectDB.project_id == scan_obj.project_id)
                .with_for_update()
                .first()
            )
            if project_obj:
                project_obj.last_scan_state = ScanState.FAILED.value

            recovered_count += 1
            db.commit()  # release this scan's lock before moving to the next
            logger.info(f"Successfully recovered scan {scan_obj.scan_id}")

        if recovered_count > 0:
            logger.info(f"Recovery complete: {recovered_count} scan(s) recovered")

        return recovered_count

    except Exception as e:
        logger.error(f"Error during scan recovery: {e}", exc_info=True)
        db.rollback()
        return 0
    finally:
        db.close()


def recover_single_scan(scan_id: str) -> bool:
    """Recover a specific scan by ID."""
    db = SessionLocal()
    try:
        scan_obj = (
            db.query(ScanDB).filter(ScanDB.scan_id == scan_id).with_for_update().first()
        )
        if not scan_obj:
            logger.warning(f"Scan {scan_id} not found for recovery")
            return False

        if scan_obj.state in TERMINAL_STATES:
            logger.info(f"Scan {scan_id} already in terminal state {scan_obj.state}")
            return False

        scan_obj.state = ScanState.FAILED
        scan_obj.finished_at = datetime.now(timezone.utc)
        scan_obj.error_message = "Recovered by admin request"
        scan_obj.error_type = "ADMIN_RECOVERY"

        project_obj = (
            db.query(ProjectDB)
            .filter(ProjectDB.project_id == scan_obj.project_id)
            .with_for_update()
            .first()
        )
        if project_obj:
            project_obj.last_scan_state = ScanState.FAILED.value

        db.commit()
        logger.info(f"Manually recovered scan {scan_id}")
        return True

    except Exception as e:
        logger.error(f"Error recovering scan {scan_id}: {e}", exc_info=True)
        db.rollback()
        return False
    finally:
        db.close()


def run_recovery_task():
    """Background task to run recovery periodically."""
    while True:
        try:
            logger.info("Running scheduled scan recovery...")
            jenkins_updates = poll_jenkins_for_active_scans()
            if jenkins_updates > 0:
                logger.info(f"Jenkins reconciliation updated {jenkins_updates} scan(s)")
            count = recover_stuck_scans()
            if count > 0:
                logger.info(f"Recovery task complete: {count} scans recovered")
            else:
                logger.debug("Recovery task complete: no stuck scans found")
        except Exception as e:
            logger.error(f"Recovery task failed: {e}", exc_info=True)

        if shutdown_event.wait(300):
            logger.info("Shutdown event received, exiting recovery task")
            break
