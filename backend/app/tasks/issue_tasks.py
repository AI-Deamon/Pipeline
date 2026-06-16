import logging
from datetime import datetime, timezone, timedelta

from app.core.celery_app import celery_app
from app.core.db import SessionLocal
from app.models.db_models import ScanReportDB, IssueDB, IssueScanDB, RescanRequestDB
from app.services.issue_service import IssueService
from app.services import rescan_service as rescan_svc

logger = logging.getLogger(__name__)
service = IssueService()


@celery_app.task
def migrate_scan_to_issues(scan_id: str, project_id: str, tool_name: str):
    """Migrate findings from a completed scan report to the issues table."""
    db = SessionLocal()
    try:
        report = (
            db.query(ScanReportDB)
            .filter(
                ScanReportDB.scan_id == scan_id,
                ScanReportDB.project_id == project_id,
                ScanReportDB.tool_name == tool_name,
            )
            .first()
        )
        if not report:
            logger.warning(f"No report found for scan {scan_id} tool {tool_name}")
            return {"error": "Report not found"}

        report.migration_status = "processing"
        db.commit()

        findings = report.findings or []
        count = 0
        for finding in findings:
            try:
                file_path = finding.get("file_path")
                line_number = finding.get("line_number")
                location = finding.get("location")
                if not location and (file_path or line_number):
                    location = {}
                    if file_path:
                        location["file_path"] = file_path
                    if line_number is not None:
                        location["line"] = line_number
                extra_metadata = {}
                tags = finding.get("tags") or []
                if tags:
                    extra_metadata["tags"] = tags
                if finding.get("sonar_status"):
                    extra_metadata["sonar_status"] = finding["sonar_status"]
                if finding.get("sonar_resolution"):
                    extra_metadata["sonar_resolution"] = finding["sonar_resolution"]
                if finding.get("code_snippet_language"):
                    extra_metadata["code_snippet_language"] = finding["code_snippet_language"]
                issue_data = {
                    "issue_id": finding.get("id") or finding.get("issue_id", f"{scan_id}-{count}"),
                    "project_id": project_id,
                    "tool_name": tool_name,
                    "scan_id": scan_id,
                    "severity": (finding.get("severity") or "medium").lower(),
                    "title": finding.get("title") or finding.get("message", "Unknown issue"),
                    "description": finding.get("description") or finding.get("detail"),
                    "location": location,
                    "effort": finding.get("effort"),
                    "finding_type": finding.get("type") or finding.get("finding_type", "bug"),
                    "recommendation": finding.get("recommendation") or finding.get("fix"),
                    "rule": finding.get("rule") or finding.get("rule_id"),
                    "code_snippet": finding.get("code_snippet"),
                    "extra_metadata": extra_metadata,
                }
                service.create_issue(db, issue_data)
                count += 1
            except Exception as e:
                logger.warning(f"Skipping finding {finding.get('id', 'unknown')}: {e}")

        report.migration_status = "completed"
        db.commit()
        logger.info(f"Migrated {count} findings from scan {scan_id} tool {tool_name}")
        return {"migrated": count}

    except Exception as e:
        db.rollback()
        logger.error(f"Migration failed for scan {scan_id} tool {tool_name}: {e}")
        return {"error": str(e)}
    finally:
        db.close()


@celery_app.task
def archive_old_resolved_issues(days: int = 180):
    """Archive issues with resolved_at older than specified days."""
    db = SessionLocal()
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        old_issues = (
            db.query(IssueDB)
            .filter(
                IssueDB.resolved_at.isnot(None),
                IssueDB.resolved_at < cutoff,
                IssueDB.status.in_(["verified", "rejected"]),
            )
            .all()
        )
        count = len(old_issues)
        for issue in old_issues:
            db.delete(issue)
        db.commit()
        logger.info(f"Archived {count} resolved issues older than {days} days")
        return {"archived": count}
    except Exception as e:
        db.rollback()
        logger.error(f"Archive failed: {e}")
        return {"error": str(e)}
    finally:
        db.close()


@celery_app.task
def auto_verify_fixed_issues(scan_id: str, project_id: str, tool_name: str):
    """Auto-verify issues that were fixed (not found in latest scan)."""
    db = SessionLocal()
    try:
        report = (
            db.query(ScanReportDB)
            .filter(
                ScanReportDB.scan_id == scan_id,
                ScanReportDB.project_id == project_id,
                ScanReportDB.tool_name == tool_name,
            )
            .first()
        )
        if not report:
            return {"error": "Report not found"}

        current_ids = set()
        findings = report.findings or []
        for f in findings:
            fid = f.get("id") or f.get("issue_id")
            if fid:
                current_ids.add(fid)

        fixed_issues = (
            db.query(IssueDB)
            .filter(
                IssueDB.project_id == project_id,
                IssueDB.tool_name == tool_name,
                IssueDB.status.in_(["fixed", "pending_verification"]),
                IssueDB.scan_id != scan_id,
            )
            .all()
        )

        verified = 0
        for issue in fixed_issues:
            if issue.issue_id not in current_ids:
                service.transition_status(db, issue.id, "verified", "system")
                verified += 1

        db.commit()
        logger.info(f"Auto-verified {verified} fixed issues for scan {scan_id}")
        return {"auto_verified": verified}

    except Exception as e:
        db.rollback()
        logger.error(f"Auto-verify failed: {e}")
        return {"error": str(e)}
    finally:
        db.close()


@celery_app.task
def detect_regressions(scan_id: str, project_id: str, tool_name: str):
    """Flag previously verified issues that reappeared in a new scan."""
    db = SessionLocal()
    try:
        report = (
            db.query(ScanReportDB)
            .filter(
                ScanReportDB.scan_id == scan_id,
                ScanReportDB.project_id == project_id,
                ScanReportDB.tool_name == tool_name,
            )
            .first()
        )
        if not report:
            return {"error": "Report not found"}

        current_ids = set()
        findings = report.findings or []
        for f in findings:
            fid = f.get("id") or f.get("issue_id")
            if fid:
                current_ids.add(fid)

        resolved_issues = (
            db.query(IssueDB)
            .filter(
                IssueDB.project_id == project_id,
                IssueDB.tool_name == tool_name,
                IssueDB.status.in_(["verified", "fixed"]),
            )
            .all()
        )

        regressions = 0
        for issue in resolved_issues:
            if issue.issue_id in current_ids:
                entry = service._record_history(
                    db, issue.id, "status", issue.status, "regression",
                    actor_id="system", change_type="regression",
                )
                issue.status = "open"
                issue.resolved_at = None
                regressions += 1

        db.commit()
        logger.info(f"Detected {regressions} regressions for scan {scan_id}")
        return {"regressions": regressions}

    except Exception as e:
        db.rollback()
        logger.error(f"Regression detection failed: {e}")
        return {"error": str(e)}
    finally:
        db.close()


@celery_app.task
def auto_verify_pending_rescans(scan_id: str, project_id: str, tool_name: str):
    """After a verify scan completes, check all pending-verification issues for
    this project/tool. If the issue is no longer in the new scan, auto-verify.
    If the issue is still present, auto-reject.
    """
    db = SessionLocal()
    try:
        report = (
            db.query(ScanReportDB)
            .filter(
                ScanReportDB.scan_id == scan_id,
                ScanReportDB.project_id == project_id,
                ScanReportDB.tool_name == tool_name,
            )
            .first()
        )
        if not report:
            return {"error": "Report not found"}

        current_ids = {f.get("id") or f.get("issue_id") for f in (report.findings or [])}

        approved_rescans = (
            db.query(RescanRequestDB)
            .filter(
                RescanRequestDB.status == "approved",
                RescanRequestDB.scan_id == scan_id,
            )
            .all()
        )

        verified = 0
        rejected = 0
        for rescan in approved_rescans:
            issue = db.query(IssueDB).filter(IssueDB.id == rescan.issue_id).first()
            if not issue:
                continue
            still_present = issue.issue_id in current_ids
            if still_present:
                service.transition_status(db, issue.id, "rejected", "system")
                rescan_svc.complete(db, rescan, "rejected")
                rejected += 1
            else:
                service.transition_status(db, issue.id, "verified", "system")
                rescan_svc.complete(db, rescan, "verified")
                verified += 1

            try:
                from app.websockets.manager import manager as websocket_manager
                websocket_manager.broadcast_event(
                    "rescan_verification_complete",
                    {
                        "issue_id": issue.id,
                        "rescan_request_id": rescan.id,
                        "verdict": "rejected" if still_present else "verified",
                        "scan_id": scan_id,
                        "issue_still_present": still_present,
                    },
                )
            except Exception:
                pass

        from app.metrics import VERIFICATIONS_TOTAL
        if verified:
            VERIFICATIONS_TOTAL.labels(verdict="verified").inc(verified)
        if rejected:
            VERIFICATIONS_TOTAL.labels(verdict="rejected").inc(rejected)

        db.commit()
        logger.info(
            f"Auto-verify for {scan_id}: {verified} verified, {rejected} rejected"
        )
        return {"verified": verified, "rejected": rejected}

    except Exception as e:
        db.rollback()
        logger.error(f"Auto-verify pending rescans failed: {e}")
        return {"error": str(e)}
    finally:
        db.close()
