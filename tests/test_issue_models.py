import pytest
from datetime import datetime, timezone
from sqlalchemy import text
from app.core.db import engine, Base, SessionLocal
from app.models.db_models import IssueDB, IssueHistoryDB, IssueScanDB


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


class TestIssueDB:
    def test_create_issue(self):
        with SessionLocal() as session:
            issue = IssueDB(
                issue_id="test:001",
                project_id="proj_1",
                tool_name="sonar",
                severity="critical",
                title="Hardcoded password",
                first_seen_at=datetime.now(timezone.utc),
                last_seen_at=datetime.now(timezone.utc),
            )
            session.add(issue)
            session.commit()
            fetched = session.query(IssueDB).filter_by(issue_id="test:001").first()
            assert fetched is not None
            assert fetched.project_id == "proj_1"
            assert fetched.tool_name == "sonar"
            assert fetched.severity == "critical"
            assert fetched.title == "Hardcoded password"

    def test_issue_dedup_unique_constraint(self):
        with SessionLocal() as session:
            now = datetime.now(timezone.utc)
            issue = IssueDB(
                issue_id="dedup:001",
                project_id="proj_1",
                tool_name="sonar",
                severity="high",
                title="Test",
                first_seen_at=now,
                last_seen_at=now,
            )
            session.add(issue)
            session.commit()
            dup = IssueDB(
                issue_id="dedup:001",
                project_id="proj_1",
                tool_name="sonar",
                severity="high",
                title="Duplicate",
                first_seen_at=now,
                last_seen_at=now,
            )
            session.add(dup)
            with pytest.raises(Exception):
                session.commit()

    def test_issue_defaults_status_and_new(self):
        with SessionLocal() as session:
            now = datetime.now(timezone.utc)
            issue = IssueDB(
                issue_id="defaults:001",
                project_id="proj_1",
                tool_name="trivy_fs",
                severity="medium",
                title="Test defaults",
                first_seen_at=now,
                last_seen_at=now,
            )
            session.add(issue)
            session.commit()
            assert issue.status == "open"
            assert issue.is_new is True
            assert issue.priority is None


class TestIssueHistoryDB:
    def test_create_history_entry(self):
        with SessionLocal() as session:
            now = datetime.now(timezone.utc)
            issue = IssueDB(
                issue_id="hist:001",
                project_id="proj_1",
                tool_name="sonar",
                severity="low",
                title="History test",
                first_seen_at=now,
                last_seen_at=now,
            )
            session.add(issue)
            session.flush()
            hist = IssueHistoryDB(
                issue_id=issue.id,
                change_type="status_change",
                old_value="open",
                new_value="assigned",
                actor_id="user_1",
                created_at=now,
            )
            session.add(hist)
            session.commit()
            fetched = session.query(IssueHistoryDB).filter_by(issue_id=issue.id).first()
            assert fetched is not None
            assert fetched.change_type == "status_change"
            assert fetched.old_value == "open"
            assert fetched.new_value == "assigned"
            assert fetched.actor_id == "user_1"


class TestIssueScanDB:
    def test_create_issue_scan_entry(self):
        with SessionLocal() as session:
            now = datetime.now(timezone.utc)
            issue = IssueDB(
                issue_id="scanlink:001",
                project_id="proj_1",
                tool_name="sonar",
                severity="high",
                title="Scan link test",
                first_seen_at=now,
                last_seen_at=now,
            )
            session.add(issue)
            session.flush()
            from app.models.db_models import ScanDB
            from app.state.scan_state import ScanState
            scan = ScanDB(
                scan_id="scan_999",
                project_id="proj_1",
                scan_mode="automated",
                state=ScanState.COMPLETED,
            )
            session.add(scan)
            session.flush()
            link = IssueScanDB(
                issue_id=issue.id,
                scan_id="scan_999",
                project_id="proj_1",
                tool_name="sonar",
                is_present=True,
            )
            session.add(link)
            session.commit()
            fetched = session.query(IssueScanDB).filter_by(issue_id=issue.id).first()
            assert fetched is not None
            assert fetched.scan_id == "scan_999"
            assert fetched.is_present is True
