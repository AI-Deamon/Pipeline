import logging
from datetime import datetime, timezone, timedelta

from app.core.celery_app import celery_app
from app.core.db import SessionLocal
from app.models.db_models import ScanReportDB

logger = logging.getLogger(__name__)


@celery_app.task
def cleanup_expired_reports():
    """
    Delete reports older than 90 days.
    Runs daily at 3 AM.
    """
    logger.info("Starting cleanup of expired reports")

    db = SessionLocal()
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(days=90)

        expired_reports = db.query(ScanReportDB).filter(
            ScanReportDB.expires_at < datetime.now(timezone.utc),
            ScanReportDB.expires_at.isnot(None)
        ).all()

        count = len(expired_reports)

        for report in expired_reports:
            db.delete(report)

        db.commit()
        logger.info(f"Deleted {count} expired reports")

        return {"deleted": count}

    except Exception as e:
        db.rollback()
        logger.error(f"Error cleaning up expired reports: {e}")
        return {"error": str(e)}
    finally:
        db.close()


@celery_app.task
def set_report_expiration(report_id: int, days: int = 90):
    """
    Set expiration date for a specific report.
    days=None means permanent (no expiration).
    """
    db = SessionLocal()
    try:
        report = db.query(ScanReportDB).filter(ScanReportDB.id == report_id).first()
        if not report:
            return {"error": f"Report {report_id} not found"}

        if days is None:
            report.expires_at = None
        else:
            report.expires_at = datetime.now(timezone.utc) + timedelta(days=days)

        db.commit()
        logger.info(f"Set expiration for report {report_id}: {report.expires_at}")

        return {"success": True, "expires_at": report.expires_at.isoformat()}

    except Exception as e:
        db.rollback()
        logger.error(f"Error setting report expiration: {e}")
        return {"error": str(e)}
    finally:
        db.close()
