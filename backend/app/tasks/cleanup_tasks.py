import logging
from datetime import datetime, timezone, timedelta

from sqlalchemy import func

from app.core.celery_app import celery_app
from app.core.db import SessionLocal
from app.models.db_models import ScanReportDB

logger = logging.getLogger(__name__)


@celery_app.task
def cleanup_expired_reports():
    """
    Delete reports older than 90 days, except each (project_id, tool_name)'s
    latest report even if it's past expiry.
    Runs daily at 3 AM.
    """
    logger.info("Starting cleanup of expired reports")

    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)

        # Finding #118: deleting purely by absolute age silently zeroed out any
        # project whose sole (project_id, tool_name) report crossed the 90-day
        # mark without a rescan — it doesn't show up as "stale" anywhere, it just
        # vanishes from every portfolio/rollup view entirely, indistinguishable
        # from a project with zero findings. Excluding each tool's current latest
        # report from deletion — even when expired — means a project only loses
        # data once it's been genuinely superseded by a newer scan, never for
        # simply not having been rescanned recently.
        latest_per_tool = (
            db.query(
                ScanReportDB.project_id,
                ScanReportDB.tool_name,
                func.max(ScanReportDB.created_at).label("max_created_at"),
            )
            .group_by(ScanReportDB.project_id, ScanReportDB.tool_name)
            .subquery()
        )

        not_latest = ~(
            db.query(latest_per_tool)
            .filter(
                latest_per_tool.c.project_id == ScanReportDB.project_id,
                latest_per_tool.c.tool_name == ScanReportDB.tool_name,
                latest_per_tool.c.max_created_at == ScanReportDB.created_at,
            )
            .exists()
        )

        # Bulk DELETE in a single statement rather than loading every expired ORM object
        # into memory and deleting one at a time — much cheaper for a daily cron that may
        # sweep large numbers of reports.
        count = (
            db.query(ScanReportDB)
            .filter(
                ScanReportDB.expires_at.isnot(None),
                ScanReportDB.expires_at < now,
                not_latest,
            )
            .delete(synchronize_session=False)
        )

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

        # Bug found while writing test coverage for #67: days=None (the documented
        # "permanent" case) left expires_at as None, but this unconditionally called
        # .isoformat() on it — AttributeError, caught by the broad except below and
        # silently reported as {"error": ...} instead of the success it actually was.
        return {
            "success": True,
            "expires_at": report.expires_at.isoformat() if report.expires_at else None,
        }

    except Exception as e:
        db.rollback()
        logger.error(f"Error setting report expiration: {e}")
        return {"error": str(e)}
    finally:
        db.close()
