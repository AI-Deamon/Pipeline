import asyncio
import logging
from typing import Optional
from datetime import datetime, timezone

from app.core.celery_app import celery_app
from app.services.reporting.fetcher import process_scan_reports
from app.core.db import SessionLocal
from app.models.db_models import ScanDB, ProjectDB

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, max_retries=3)
def process_scan_reports_task(
    self,
    scan_id: str,
    jenkins_build_number: str,
    jenkins_base_url: Optional[str] = None,
):
    """
    Celery task to fetch and process all security reports after scan completes.
    Called from scan callback when status = COMPLETED.
    """
    logger.info(f"Processing reports for scan {scan_id}")

    db = SessionLocal()
    try:
        scan_obj = db.query(ScanDB).filter(ScanDB.scan_id == scan_id).first()
        if not scan_obj:
            logger.error(f"Scan {scan_id} not found")
            return

        project_obj = (
            db.query(ProjectDB)
            .filter(ProjectDB.project_id == scan_obj.project_id)
            .first()
        )
        if not project_obj:
            logger.error(f"Project {scan_obj.project_id} not found")
            return

        sonar_key = project_obj.sonar_key

        if not jenkins_base_url:
            jenkins_base_url = (
                f"http://{project_obj.target_ip}"
                if project_obj.target_ip
                else "http://localhost:8080"
            )

        reports = asyncio.run(
            process_scan_reports(
                scan_id=scan_id,
                project_id=scan_obj.project_id,
                jenkins_base_url=jenkins_base_url,
                jenkins_build_number=jenkins_build_number,
                sonar_key=sonar_key,
                stage_results=scan_obj.stage_results or [],
                selected_stages=scan_obj.selected_stages or [],
                scan_mode=scan_obj.scan_mode or "automated",
            )
        )

        logger.info(f"Processed {len(reports)} reports for scan {scan_id}")

    except Exception as e:
        logger.error(f"Error processing reports for scan {scan_id}: {e}")
        raise self.retry(exc=e, countdown=60)
    finally:
        db.close()
