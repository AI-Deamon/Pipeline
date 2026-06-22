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

logger = logging.getLogger(__name__)

shutdown_event = threading.Event()

TERMINAL_STATES = {ScanState.COMPLETED, ScanState.FAILED, ScanState.CANCELLED}
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

def _trigger_report_processing(scan_obj: ScanDB) -> None:
    """Trigger report fetching when recovery completes a scan without a callback."""
    if not scan_obj.jenkins_build_number:
        logger.warning(f"No jenkins_build_number for scan {scan_obj.scan_id}, skipping report processing")
        return
    logger.info(f"Triggering report processing for scan {scan_obj.scan_id} (recovery path, build {scan_obj.jenkins_build_number})")
    process_scan_reports_task.delay(
        scan_id=scan_obj.scan_id,
        jenkins_build_number=scan_obj.jenkins_build_number,
        jenkins_base_url=settings.JENKINS_BASE_URL,
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
            _trigger_report_processing(scan_obj)
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
        active_scans = db.query(ScanDB).filter(
            ScanDB.state.in_([ScanState.QUEUED, ScanState.RUNNING])
        ).all()
        now = datetime.now(timezone.utc)

        for scan_obj in active_scans:
            project_obj = db.query(ProjectDB).filter(
                ProjectDB.project_id == scan_obj.project_id
            ).first()

            if scan_obj.jenkins_build_number:
                count, changed = _handle_build_number_scan(scan_obj, project_obj, client, now)
                updated_count += count
                if changed:
                    any_changes = True
                continue

            if scan_obj.jenkins_queue_id:
                count, changed = _handle_queue_item_scan(scan_obj, project_obj, client, now)
                updated_count += count
                if changed:
                    any_changes = True

        if any_changes:
            db.commit()
        return updated_count
    finally:
        db.close()

def recover_stuck_scans() -> int:
    """Find and recover stuck scans."""
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        timeout_threshold = now - timedelta(seconds=settings.SCAN_TIMEOUT)

        stuck_scans = db.query(ScanDB).filter(
            ScanDB.state.in_([ScanState.CREATED, ScanState.QUEUED, ScanState.RUNNING]),
            ScanDB.created_at < timeout_threshold
        ).all()

        recovered_count = 0
        for scan_obj in stuck_scans:
            logger.warning(
                f"Recovering stuck scan {scan_obj.scan_id} "
                f"(stuck since {scan_obj.created_at}, timeout={settings.SCAN_TIMEOUT}s)"
            )
            scan_obj.state = ScanState.FAILED
            scan_obj.finished_at = now
            scan_obj.error_message = f"Scan timed out after {settings.SCAN_TIMEOUT} seconds"
            scan_obj.error_type = "TIMEOUT"

            project_obj = db.query(ProjectDB).filter(
                ProjectDB.project_id == scan_obj.project_id
            ).first()
            if project_obj:
                project_obj.last_scan_state = ScanState.FAILED.value

            recovered_count += 1
            logger.info(f"Successfully recovered scan {scan_obj.scan_id}")

        if recovered_count > 0:
            db.commit()
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
        scan_obj = db.query(ScanDB).filter(ScanDB.scan_id == scan_id).first()
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

        project_obj = db.query(ProjectDB).filter(
            ProjectDB.project_id == scan_obj.project_id
        ).first()
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
