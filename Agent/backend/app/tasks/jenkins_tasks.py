import logging
from datetime import datetime

from app.core.celery_app import celery_app
from app.services.jenkins_service import jenkins_service
from app.core.db import SessionLocal
from app.models.db_models import ScanDB, ProjectDB
from app.state.scan_state import ScanState

logger = logging.getLogger(__name__)

class MockScan:
    def __init__(self, scan_id, scan_mode, selected_stages):
        self.scan_id = scan_id
        self.scan_mode = scan_mode
        self.selected_stages = selected_stages

@celery_app.task(bind=True, max_retries=3)
def trigger_jenkins_scan_async(self, scan_id: str, scan_mode: str, selected_stages: list, project_data: dict):
    logger.info(f"Executing async celery task to trigger jenkins for scan {scan_id}")
    logger.info(f"Celery task parameters - scan_id: {scan_id}, scan_mode: {scan_mode}, selected_stages: {selected_stages}")
    logger.info(f"Celery task project_data: {project_data}")

    mock_scan = MockScan(scan_id, scan_mode, selected_stages)
    accepted, queue_id = jenkins_service.trigger_scan_job(mock_scan, project_data)

    db = SessionLocal()
    try:
        scan_obj = db.query(ScanDB).filter(ScanDB.scan_id == scan_id).first()
        if not scan_obj:
            logger.error(f"Scan {scan_id} not found in database during async trigger update")
            return

        if not accepted:
            scan_obj.state = ScanState.FAILED
            scan_obj.finished_at = datetime.utcnow()
            scan_obj.error_message = "Failed to trigger Jenkins pipeline"
            scan_obj.error_type = "PIPELINE_ERROR"
            # FIX: Also update project's last_scan_state when Jenkins trigger fails
            project_obj = db.query(ProjectDB).filter(ProjectDB.project_id == scan_obj.project_id).first()
            if project_obj:
                project_obj.last_scan_state = ScanState.FAILED.value
                logger.info(f"Updated project {project_obj.project_id} last_scan_state to FAILED")
        else:
            # Scan is already in RUNNING state from API (optimistic update)
            # Just update the queue_id if available (started_at is already set)
            if queue_id is not None:
                scan_obj.jenkins_queue_id = str(queue_id)

            # Log the timeout that was sent to Jenkins
            scan_timeout = project_data.get('scan_timeout', 7200)
            logger.info(f"Scan {scan_id} started with timeout: {scan_timeout} seconds ({scan_timeout/60:.1f} minutes)")

        db.commit()
    finally:
        db.close()

