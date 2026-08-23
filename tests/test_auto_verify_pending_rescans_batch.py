"""Regression test for #110: a single approved RescanRequestDB whose issue is
already in a state that can't legally transition again (e.g. #109 already
auto-verified it via a different path) raised ValueError uncaught inside the
per-rescan loop, aborting the *entire batch* — every other rescan verification
already processed in the same call for unrelated issues got rolled back too.
"""
import pytest
from datetime import datetime, timezone

from app.core.db import engine, Base, SessionLocal
from app.models.db_models import IssueDB, ScanDB, ScanReportDB, RescanRequestDB
from app.state.scan_state import ScanState
from app.tasks.issue_tasks import auto_verify_pending_rescans


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def _make_issue(session, issue_id, status="pending_verification"):
    now = datetime.now(timezone.utc)
    issue = IssueDB(
        issue_id=issue_id, project_id="proj-1", tool_name="sonar", scan_id="scan-orig",
        first_seen_scan_id="scan-orig", severity="high", title="Test issue",
        status=status, first_seen_at=now, last_seen_at=now,
    )
    session.add(issue)
    session.flush()
    return issue


def test_one_conflicting_rescan_does_not_roll_back_the_rest_of_the_batch():
    db = SessionLocal()

    # Two issues, both with an approved rescan pending verification against the
    # same verify-scan.
    healthy_issue = _make_issue(db, "issue-healthy")
    conflicting_issue = _make_issue(db, "issue-conflict", status="verified")  # already verified via #109's path

    db.add(ScanDB(
        scan_id="verify-scan-1", project_id="proj-1", scan_mode="automated",
        state=ScanState.COMPLETED, selected_stages=[], stage_results=[], callback_digests=[],
    ))
    db.add(ScanReportDB(
        scan_id="verify-scan-1", project_id="proj-1", tool_name="sonar",
        severity_summary={}, findings=[], migration_status="completed",
    ))

    healthy_rescan = RescanRequestDB(
        issue_id=healthy_issue.id, requested_by="dev1", status="approved", scan_id="verify-scan-1",
    )
    conflicting_rescan = RescanRequestDB(
        issue_id=conflicting_issue.id, requested_by="dev1", status="approved", scan_id="verify-scan-1",
    )
    db.add(healthy_rescan)
    db.add(conflicting_rescan)
    db.commit()
    healthy_issue_id = healthy_issue.id
    healthy_rescan_id = healthy_rescan.id
    db.close()

    result = auto_verify_pending_rescans.run("verify-scan-1", "proj-1", "sonar")

    # Must not error out entirely — the healthy rescan's verification must have
    # gone through despite the conflicting one failing.
    assert "error" not in result
    assert result["verified"] + result["rejected"] == 1

    db = SessionLocal()
    refreshed_healthy = db.query(IssueDB).filter(IssueDB.id == healthy_issue_id).first()
    assert refreshed_healthy.status in ("verified", "rejected")

    refreshed_healthy_rescan = db.query(RescanRequestDB).filter(RescanRequestDB.id == healthy_rescan_id).first()
    assert refreshed_healthy_rescan.status == "completed"
    db.close()
