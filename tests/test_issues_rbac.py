"""Tests for RBAC issue authorization."""

import os

os.environ.setdefault('ENV', 'test')
os.environ.setdefault('DATABASE_URL', 'sqlite:///test_issues_rbac.db')
os.environ.setdefault('JENKINS_BASE_URL', 'http://localhost:8080')
os.environ.setdefault('JENKINS_TOKEN', 'test-token')
os.environ.setdefault('STORAGE_PATH', '/tmp/storage-test')
os.environ.setdefault('SCAN_TIMEOUT', '7200')
os.environ.setdefault('LOG_LEVEL', 'INFO')
os.environ.setdefault('CALLBACK_TOKEN', 'test-callback-token-1234567890')
os.environ.setdefault('API_KEY', 'test-api-key-1234567890')
os.environ.setdefault('TEST_BYPASS_AUTH', 'True')
os.environ.setdefault('MOCK_EXECUTION', 'True')
os.environ.setdefault('SONARQUBE_TOKEN', 'test-sonar-token-1234567890')

import pytest
from fastapi.testclient import TestClient

from app.core.db import engine, Base, SessionLocal
from app.models.db_models import UserDB, IssueDB, ProjectAssignmentDB


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    if not db.query(UserDB).first():
        users = [
            UserDB(id="admin-1", username="admin", role="admin", hashed_password="h"),
            UserDB(id="lead-1", username="lead1", role="team_lead", hashed_password="h"),
            UserDB(id="dev-1", username="dev1", role="developer", hashed_password="h"),
        ]
        for u in users:
            db.add(u)
        issues = [
            IssueDB(
                issue_id="ISSUE-001", project_id="proj-a", tool_name="sonar",
                severity="Critical", title="Test issue A",
            ),
            IssueDB(
                issue_id="ISSUE-002", project_id="proj-b", tool_name="sonar",
                severity="High", title="Test issue B",
            ),
        ]
        for i in issues:
            db.add(i)
        db.commit()
    db.close()
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    from app.main import app
    return TestClient(app)


@pytest.fixture
def admin_headers():
    return {"Authorization": "Bearer test-bypass"}


class TestIssueRBAC:
    def test_admin_can_get_project_overview(self, client, admin_headers):
        response = client.get(
            "/api/v1/issues/projects/proj-a/overview", headers=admin_headers
        )
        assert response.status_code == 200

    def test_admin_can_get_tool_issues(self, client, admin_headers):
        response = client.get(
            "/api/v1/issues/projects/proj-a/tools/sonar", headers=admin_headers
        )
        assert response.status_code == 200

    def test_admin_can_get_project_metrics(self, client, admin_headers):
        response = client.get(
            "/api/v1/issues/projects/proj-a/metrics", headers=admin_headers
        )
        assert response.status_code == 200

    def test_admin_can_get_issue_by_id(self, client, admin_headers):
        response = client.get(
            "/api/v1/issues/1", headers=admin_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["issue_id"] == "ISSUE-001"

    def test_non_existent_issue_returns_404(self, client, admin_headers):
        response = client.get("/api/v1/issues/9999", headers=admin_headers)
        assert response.status_code == 404

    def test_admin_can_get_my_issues(self, client, admin_headers):
        response = client.get("/api/v1/issues/my", headers=admin_headers)
        assert response.status_code == 200

    def test_assign_issue_to_valid_user(self, client, admin_headers):
        response = client.post(
            "/api/v1/issues/1/assign",
            json={"assignee_id": "dev-1", "priority": "high"},
            headers=admin_headers,
        )
        assert response.status_code in (200, 403, 404)


class TestIssueRBACCrossProjectDenial:
    """Regression tests for the IDOR gap (findings #35/#37): a user scoped only to
    proj-a must not be able to read/comment/see-history/create-issues for proj-b via
    ID enumeration. TEST_BYPASS_AUTH short-circuits get_current_user before it ever
    looks at the Authorization header, so these tests disable it and authenticate
    dev-1 with a real JWT to actually exercise the RBAC check end-to-end.
    """

    @pytest.fixture
    def dev1_headers(self, monkeypatch):
        from app.core import auth as auth_module
        from app.core import security

        monkeypatch.setattr(auth_module.settings, "TEST_BYPASS_AUTH", False)

        db = SessionLocal()
        if not db.query(ProjectAssignmentDB).filter(ProjectAssignmentDB.user_id == "dev-1").first():
            db.add(ProjectAssignmentDB(user_id="dev-1", scope_type="project", scope_id="proj-a", assigned_by="admin-1"))
            db.commit()
        db.close()

        token = security.create_access_token({"sub": "dev1"})
        return {"Authorization": f"Bearer {token}"}

    def test_dev_can_read_own_project_issue(self, client, dev1_headers):
        # Issue #1 (ISSUE-001) belongs to proj-a, which dev-1 is scoped to.
        response = client.get("/api/v1/issues/1", headers=dev1_headers)
        assert response.status_code == 200

    def test_dev_cannot_read_other_project_issue(self, client, dev1_headers):
        # Issue #2 (ISSUE-002) belongs to proj-b — dev-1 has no assignment there.
        response = client.get("/api/v1/issues/2", headers=dev1_headers)
        assert response.status_code == 404

    def test_dev_cannot_comment_on_other_project_issue(self, client, dev1_headers):
        response = client.post(
            "/api/v1/issues/2/comments", json={"message": "hi"}, headers=dev1_headers
        )
        assert response.status_code == 404

    def test_dev_cannot_view_history_of_other_project_issue(self, client, dev1_headers):
        response = client.get("/api/v1/issues/2/history", headers=dev1_headers)
        assert response.status_code == 404

    def test_dev_cannot_create_issue_in_other_project(self, client, dev1_headers):
        response = client.post(
            "/api/v1/issues",
            json={
                "issue_id": "ISSUE-999", "project_id": "proj-b", "tool_name": "sonar",
                "severity": "High", "title": "Injected issue",
            },
            headers=dev1_headers,
        )
        assert response.status_code == 404
