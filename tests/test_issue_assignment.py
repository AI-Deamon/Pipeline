import pytest
from datetime import datetime, timezone
from app.core.db import engine, Base, SessionLocal
from app.models.db_models import IssueDB, IssueHistoryDB
from app.services.issue_service import IssueService


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def service():
    return IssueService()


@pytest.fixture
def created_issue(service):
    session = SessionLocal()
    try:
        issue = service.create_issue(session, {
            "issue_id": "assign:001",
            "project_id": "proj_1",
            "tool_name": "sonar",
            "severity": "high",
            "title": "Assign me",
        })
        session.commit()
        return issue.id
    finally:
        session.close()


class TestIssueAssignment:
    def test_assign_issue(self, service, created_issue):
        with SessionLocal() as session:
            issue = service.assign(session, created_issue, "user_dev", "user_admin")
            assert issue.assignee_id == "user_dev"
            assert issue.status == "assigned"

    def test_assign_creates_history(self, service, created_issue):
        with SessionLocal() as session:
            service.assign(session, created_issue, "user_dev", "user_admin")
            history = (
                session.query(IssueHistoryDB)
                .filter(IssueHistoryDB.issue_id == created_issue)
                .all()
            )
            assert len(history) >= 1
            entry = history[0]
            assert entry.field_name == "assignee_id"
            assert entry.new_value == "user_dev"

    def test_assign_nonexistent_issue(self, service):
        with SessionLocal() as session:
            result = service.assign(session, 99999, "user_dev", "user_admin")
            assert result is None

    def test_reassign(self, service, created_issue):
        with SessionLocal() as session:
            issue = service.assign(session, created_issue, "user_dev", "user_admin")
            assert issue.assignee_id == "user_dev"
            issue = service.assign(session, created_issue, "user_qa", "user_admin")
            assert issue.assignee_id == "user_qa"

    def test_assign_with_priority(self, service, created_issue):
        with SessionLocal() as session:
            issue = service.assign(session, created_issue, "user_dev", "user_admin", priority="high")
            assert issue.priority == "high"


class TestIssueStatusTransitions:
    def test_transition_to_in_progress(self, service, created_issue):
        with SessionLocal() as session:
            service.assign(session, created_issue, "user_dev", "user_admin")
            session.flush()
            result = service.transition_status(session, created_issue, "in_progress", "user_dev")
            assert result.status == "in_progress"

    def test_full_assign_fix_verify(self, service, created_issue):
        with SessionLocal() as session:
            service.assign(session, created_issue, "user_dev", "user_admin")
            session.flush()
            issue = session.query(IssueDB).filter(IssueDB.id == created_issue).first()
            assert issue.status == "assigned"

            result = service.transition_status(session, created_issue, "in_progress")
            assert result.status == "in_progress"

            result = service.transition_status(session, created_issue, "fixed")
            assert result.status == "fixed"

            result = service.transition_status(session, created_issue, "verified")
            assert result.status == "verified"

    def test_invalid_transition_raises(self, service, created_issue):
        with SessionLocal() as session:
            with pytest.raises(ValueError, match="Invalid transition"):
                service.transition_status(session, created_issue, "verified")

    def test_transition_creates_history(self, service, created_issue):
        with SessionLocal() as session:
            service.assign(session, created_issue, "user_dev", "user_admin")
            session.flush()
            service.transition_status(session, created_issue, "in_progress", "user_dev")
            history = (
                session.query(IssueHistoryDB)
                .filter(IssueHistoryDB.issue_id == created_issue)
                .all()
            )
            status_changes = [h for h in history if h.field_name == "status"]
            assert len(status_changes) >= 1

    def test_transition_nonexistent_issue(self, service):
        with SessionLocal() as session:
            result = service.transition_status(session, 99999, "in_progress")
            assert result is None
