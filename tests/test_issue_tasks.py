import pytest
from datetime import datetime, timezone, timedelta
from app.core.db import engine, Base, SessionLocal
from app.models.db_models import IssueDB, IssueHistoryDB, IssueScanDB, ScanReportDB
from app.services.issue_service import IssueService
from app.tasks.issue_tasks import auto_verify_fixed_issues, detect_regressions, archive_old_resolved_issues


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def service():
    return IssueService()


def _create_issue(session, issue_id="issue:001", project_id="proj_1", tool_name="sonar", status="open", resolved_at=None):
    issue = IssueDB(
        issue_id=issue_id,
        project_id=project_id,
        tool_name=tool_name,
        scan_id="scan_1",
        first_seen_scan_id="scan_1",
        severity="high",
        title="Test issue",
        status=status,
        resolved_at=resolved_at,
    )
    session.add(issue)
    session.flush()
    return issue


def _create_scan_report(session, scan_id="scan_2", project_id="proj_1", tool_name="sonar", findings=None):
    report = ScanReportDB(
        scan_id=scan_id,
        project_id=project_id,
        tool_name=tool_name,
        findings=findings or [],
        migration_status="completed",
    )
    session.add(report)
    session.flush()
    return report


class TestAutoVerify:
    def test_auto_verifies_fixed_issue_not_in_new_scan(self, service):
        with SessionLocal() as session:
            _create_issue(session, issue_id="issue:001", status="fixed")
            _create_scan_report(session, findings=[])
            session.commit()

        auto_verify_fixed_issues("scan_2", "proj_1", "sonar")

        with SessionLocal() as session:
            issue = session.query(IssueDB).filter(IssueDB.issue_id == "issue:001").first()
            assert issue.status == "verified"

    def test_does_not_verify_issue_still_in_new_scan(self, service):
        with SessionLocal() as session:
            _create_issue(session, issue_id="issue:001", status="fixed")
            _create_scan_report(session, findings=[{"id": "issue:001", "severity": "high", "title": "Test issue"}])
            session.commit()

        auto_verify_fixed_issues("scan_2", "proj_1", "sonar")

        with SessionLocal() as session:
            issue = session.query(IssueDB).filter(IssueDB.issue_id == "issue:001").first()
            assert issue.status == "fixed"

    def test_no_fixed_issues_does_nothing(self, service):
        with SessionLocal() as session:
            _create_issue(session, issue_id="issue:001", status="open")
            _create_scan_report(session, findings=[])
            session.commit()

        auto_verify_fixed_issues("scan_2", "proj_1", "sonar")

        with SessionLocal() as session:
            issue = session.query(IssueDB).filter(IssueDB.issue_id == "issue:001").first()
            assert issue.status == "open"

    def test_does_not_auto_verify_pending_verification_issue(self, service):
        """Regression test for finding #109: pending_verification issues are
        waiting in the RBAC-gated approve_rescan review queue — they must only be
        resolved by auto_verify_pending_rescans (which requires an approved
        RescanRequestDB linked to the specific verify-scan) or a manual
        approve/reject, never by an unrelated routine scan simply not
        redetecting the finding. Previously this task's status filter included
        "pending_verification" alongside "fixed", so any scan could silently
        verify an issue a reviewer hadn't looked at yet."""
        with SessionLocal() as session:
            _create_issue(session, issue_id="issue:001", status="pending_verification")
            _create_scan_report(session, findings=[])  # absent from this scan too
            session.commit()

        auto_verify_fixed_issues("scan_2", "proj_1", "sonar")

        with SessionLocal() as session:
            issue = session.query(IssueDB).filter(IssueDB.issue_id == "issue:001").first()
            # Must remain pending_verification — untouched by this task.
            assert issue.status == "pending_verification"


class TestRegressionDetection:
    def test_detects_regression(self, service):
        with SessionLocal() as session:
            _create_issue(session, issue_id="issue:001", status="verified")
            _create_scan_report(session, findings=[{"id": "issue:001", "severity": "high", "title": "Test issue"}])
            session.commit()

        detect_regressions("scan_2", "proj_1", "sonar")

        with SessionLocal() as session:
            issue = session.query(IssueDB).filter(IssueDB.issue_id == "issue:001").first()
            assert issue.status == "open"
            assert issue.resolved_at is None

    def test_does_not_flag_non_resolved_issue(self, service):
        with SessionLocal() as session:
            _create_issue(session, issue_id="issue:001", status="open")
            _create_scan_report(session, findings=[{"id": "issue:001", "severity": "high", "title": "Test issue"}])
            session.commit()

        detect_regressions("scan_2", "proj_1", "sonar")

        with SessionLocal() as session:
            issue = session.query(IssueDB).filter(IssueDB.issue_id == "issue:001").first()
            assert issue.status == "open"

    def test_records_regression_history(self, service):
        with SessionLocal() as session:
            _create_issue(session, issue_id="issue:001", status="verified")
            _create_scan_report(session, findings=[{"id": "issue:001", "severity": "high", "title": "Test issue"}])
            session.commit()

        detect_regressions("scan_2", "proj_1", "sonar")

        with SessionLocal() as session:
            history = session.query(IssueHistoryDB).filter(IssueHistoryDB.change_type == "regression").all()
            assert len(history) == 1
            assert history[0].field_name == "status"


class TestRetentionCleanup:
    def test_archives_old_resolved_issues(self, service):
        with SessionLocal() as session:
            old = datetime.now(timezone.utc) - timedelta(days=200)
            _create_issue(session, issue_id="issue:001", status="verified", resolved_at=old)
            session.commit()

        archive_old_resolved_issues(days=180)

        with SessionLocal() as session:
            count = session.query(IssueDB).count()
            assert count == 0

    def test_keeps_recently_resolved_issues(self, service):
        with SessionLocal() as session:
            recent = datetime.now(timezone.utc) - timedelta(days=30)
            _create_issue(session, issue_id="issue:001", status="verified", resolved_at=recent)
            session.commit()

        archive_old_resolved_issues(days=180)

        with SessionLocal() as session:
            count = session.query(IssueDB).count()
            assert count == 1

    def test_keeps_open_issues_regardless_of_age(self, service):
        with SessionLocal() as session:
            old = datetime.now(timezone.utc) - timedelta(days=200)
            _create_issue(session, issue_id="issue:001", status="open", resolved_at=old)
            session.commit()

        archive_old_resolved_issues(days=180)

        with SessionLocal() as session:
            count = session.query(IssueDB).count()
            assert count == 1
