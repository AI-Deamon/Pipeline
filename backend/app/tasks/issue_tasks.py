import hashlib
import logging
from datetime import datetime, timezone, timedelta

from app.core.celery_app import celery_app
from app.core.db import SessionLocal
from app.models.db_models import ScanReportDB, IssueDB, IssueScanDB, RescanRequestDB
from app.services.issue_service import IssueService
from app.services import rescan_service as rescan_svc

logger = logging.getLogger(__name__)
service = IssueService()

_REPORT_NOT_FOUND = "Report not found"


def _build_location(finding: dict) -> dict | None:
    file_path = finding.get("file_path")
    line_number = finding.get("line_number")
    location = finding.get("location")
    if not location and (file_path or line_number):
        location = {}
        if file_path:
            location["file_path"] = file_path
        if line_number is not None:
            location["line"] = line_number
    return location


def _build_extra_metadata(finding: dict) -> dict:
    extra = {}
    tags = finding.get("tags") or []
    if tags:
        extra["tags"] = tags
    if finding.get("sonar_status"):
        extra["sonar_status"] = finding["sonar_status"]
    if finding.get("sonar_resolution"):
        extra["sonar_resolution"] = finding["sonar_resolution"]
    if finding.get("code_snippet_language"):
        extra["code_snippet_language"] = finding["code_snippet_language"]
    if finding.get("cve"):
        extra["cve"] = finding["cve"]
    if finding.get("cvss_score"):
        extra["cvss_score"] = finding["cvss_score"]
    if finding.get("cvss_severity"):
        extra["cvss_severity"] = finding["cvss_severity"]
    if finding.get("package"):
        extra["package"] = finding["package"]
    if finding.get("package_version"):
        extra["package_version"] = finding["package_version"]
    if finding.get("fixed_version"):
        extra["fixed_version"] = finding["fixed_version"]
    if finding.get("references"):
        extra["references"] = finding["references"]
    if finding.get("exploit_available"):
        extra["exploit_available"] = finding["exploit_available"]
    if finding.get("fix_command"):
        extra["fix_command"] = finding["fix_command"]
    if finding.get("cwe_ids"):
        extra["cwe_ids"] = finding["cwe_ids"]
    if finding.get("host"):
        extra["host"] = finding["host"]
    if finding.get("port"):
        extra["port"] = finding["port"]
    if finding.get("service"):
        extra["service"] = finding["service"]
    if finding.get("uri"):
        extra["uri"] = finding["uri"]
    if finding.get("rule_name"):
        extra["rule_name"] = finding["rule_name"]
    if finding.get("language"):
        extra["language"] = finding["language"]
    return extra


def _stable_fallback_issue_id(finding: dict, tool_name: str) -> str:
    """Finding #111 (generalizes #44): a scan_id/count-based fallback ID guarantees
    a brand-new IssueDB row every single scan for any finding whose parser doesn't
    populate a stable `id`/`issue_id` — `_upsert`'s (issue_id, project_id) match can
    never hit a prior scan's row, so `last_seen_at` never updates and the issue
    count grows unbounded. Also, since `count` only increments on successful
    creates, an unrelated earlier failure in the same scan shifts every subsequent
    fallback ID, so the same real finding could get a different ID between two
    otherwise-identical scans. Hash stable content identity instead (tool/rule or
    title, plus file/line when present) so the same finding gets the same fallback
    ID across scans and regardless of what else happened earlier in the batch.
    """
    location = finding.get("location") or {}
    file_path = finding.get("file_path") or (location.get("file_path") if isinstance(location, dict) else None) or ""
    line = finding.get("line_number") or (location.get("line") if isinstance(location, dict) else None) or ""
    identity = "||".join([
        tool_name,
        str(finding.get("rule") or finding.get("rule_id") or finding.get("title") or finding.get("message") or ""),
        str(file_path).lower().strip(),
        str(line).strip(),
    ])
    return f"{tool_name}-{hashlib.sha256(identity.encode()).hexdigest()[:16]}"


def _build_issue_data(finding: dict, scan_id: str, project_id: str, tool_name: str, count: int) -> dict:
    location = _build_location(finding)
    extra_metadata = _build_extra_metadata(finding)
    return {
        "issue_id": finding.get("id") or finding.get("issue_id") or _stable_fallback_issue_id(finding, tool_name),
        "project_id": project_id,
        "tool_name": tool_name,
        "scan_id": scan_id,
        "severity": (finding.get("severity") or "medium").lower(),
        "title": finding.get("title") or finding.get("message", "Unknown issue"),
        "description": finding.get("description") or finding.get("detail"),
        "location": location,
        "effort": finding.get("effort"),
        "finding_type": finding.get("type") or finding.get("finding_type", "bug"),
        "sonar_status": finding.get("sonar_status"),
        "sonar_resolution": finding.get("sonar_resolution"),
        "recommendation": finding.get("recommendation") or finding.get("fix"),
        "rule": finding.get("rule") or finding.get("rule_id"),
        "code_snippet": finding.get("code_snippet"),
        "raw_evidence": finding.get("raw_evidence"),
        "severity_v2": finding.get("cvss_severity"),
        "extra_metadata": extra_metadata,
    }


def _get_current_ids(report) -> set:
    current_ids = set()
    findings = report.findings or []
    for f in findings:
        fid = f.get("id") or f.get("issue_id")
        if fid:
            current_ids.add(fid)
    return current_ids


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
            return {"error": _REPORT_NOT_FOUND}

        report.migration_status = "processing"
        db.commit()

        findings = report.findings or []
        count = 0
        for finding in findings:
            try:
                issue_data = _build_issue_data(finding, scan_id, project_id, tool_name, count)
                # Finding #97: create_issue is check-then-insert with no lock, so a
                # concurrent migration of the same recurring finding can flush an
                # INSERT that collides with the unique (issue_id, project_id) index.
                # Without a SAVEPOINT, that IntegrityError leaves the whole outer
                # Postgres transaction aborted — every subsequent flush in this loop
                # then fails too, silently dropping the rest of the findings and
                # leaving migration_status stuck at "processing" forever (the final
                # commit below also fails). begin_nested() scopes the failure to just
                # this one finding's SAVEPOINT, so the loop can keep going.
                with db.begin_nested():
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
    """Auto-verify issues marked 'fixed' that are absent from the latest scan.

    Deliberately does NOT touch 'pending_verification' issues (finding #109).
    Those are issues a developer explicitly requested review for via
    request-rescan — they're waiting in the RBAC-gated approve_rescan queue, and
    must only be resolved by auto_verify_pending_rescans (which requires an
    *approved* RescanRequestDB linked to *this specific* scan_id) or the manual
    reject_rescan/approve_rescan endpoints. This task previously included
    "pending_verification" in the same status filter, so ANY scan of the
    project/tool — not just the reviewer-approved verify-scan — could silently
    mark a pending-review issue "verified" before a reviewer ever looked at it,
    completely bypassing the approval workflow the rest of the codebase
    carefully built. A plain "fixed" issue (never entered the review queue at
    all) auto-verifying when a routine scan confirms it's gone is fine — FIXED
    -> VERIFIED is a valid direct transition in the state machine precisely for
    that case.
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
            return {"error": _REPORT_NOT_FOUND}

        current_ids = _get_current_ids(report)

        fixed_issues = (
            db.query(IssueDB)
            .filter(
                IssueDB.project_id == project_id,
                IssueDB.tool_name == tool_name,
                IssueDB.status == "fixed",
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
            return {"error": _REPORT_NOT_FOUND}

        current_ids = _get_current_ids(report)

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
                # Route through the state machine (VERIFIED/FIXED → OPEN is an allowed
                # regression transition) instead of writing issue.status directly, so
                # history/resolved_at stay consistent with every other status change.
                service.transition_status(
                    db, issue.id, "open", changed_by="system", change_type="regression",
                )
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


def _process_rescan_verification(db, rescan, current_ids, scan_id):
    """Process a single rescan verification and broadcast result."""
    issue = db.query(IssueDB).filter(IssueDB.id == rescan.issue_id).first()
    if not issue:
        return 0, 0

    still_present = issue.issue_id in current_ids
    if still_present:
        service.transition_status(db, issue.id, "rejected", "system")
        rescan_svc.complete(db, rescan, "rejected")
        verified, rejected = 0, 1
    else:
        service.transition_status(db, issue.id, "verified", "system")
        rescan_svc.complete(db, rescan, "verified")
        verified, rejected = 1, 0

    try:
        from app.websockets.manager import safe_broadcast
        safe_broadcast(
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
        logger.warning("Failed to broadcast rescan verification for issue %s", issue.id)

    return verified, rejected


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
            return {"error": _REPORT_NOT_FOUND}

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
            try:
                # Finding #110: transition_status raises ValueError on an invalid
                # state transition (e.g. #109 already auto-verified this issue via a
                # different path, so it's no longer OPEN/... when its real approved
                # verify-scan later completes here too). Previously that ValueError
                # was uncaught inside the loop, propagating to the outer except and
                # rolling back the *entire batch* — every other rescan verification
                # already processed in this same call, for unrelated issues, got
                # discarded too. Isolating each rescan lets the rest of the batch
                # commit even when one is stale/conflicting.
                v, r = _process_rescan_verification(db, rescan, current_ids, scan_id)
                verified += v
                rejected += r
            except Exception as e:
                logger.warning(
                    "Skipping rescan verification for rescan_request %s (issue %s): %s",
                    rescan.id, rescan.issue_id, e,
                )

        from app.metrics import VERIFICATIONS_TOTAL
        if verified:
            VERIFICATIONS_TOTAL.labels(verdict="verified").inc(verified)
        if rejected:
            VERIFICATIONS_TOTAL.labels(verdict="rejected").inc(rejected)

        db.commit()
        logger.info(f"Auto-verify for {scan_id}: {verified} verified, {rejected} rejected")
        return {"verified": verified, "rejected": rejected}

    except Exception as e:
        db.rollback()
        logger.error(f"Auto-verify pending rescans failed: {e}")
        return {"error": str(e)}
    finally:
        db.close()
