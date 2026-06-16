"""Tests for DELETE /users/{user_id} — safety-checked admin user deletion."""

import os

os.environ.setdefault('ENV', 'test')
os.environ.setdefault('DATABASE_URL', 'sqlite:///test_users_delete.db')
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
from app.core.auth import get_current_user
from app.models.db_models import (
    UserDB,
    ProjectDB,
    ProjectAssignmentDB,
    IssueDB,
    AccessChangeDB,
)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    if not db.query(UserDB).first():
        users = [
            UserDB(id="admin-1", username="admin", role="admin", hashed_password="hashed_admin"),
            UserDB(id="admin-2", username="admin2", role="admin", hashed_password="hashed_admin2"),
            UserDB(id="lead-1", username="lead1", role="team_lead", hashed_password="hashed_lead1"),
            UserDB(id="dev-1", username="dev1", role="developer", hashed_password="hashed_dev1"),
            UserDB(id="dev-2", username="dev2", role="developer", hashed_password="hashed_dev2"),
        ]
        for u in users:
            db.add(u)
        projects = [
            ProjectDB(project_id="proj-a", name="Project A"),
        ]
        for p in projects:
            db.add(p)
        assignments = [
            ProjectAssignmentDB(user_id="dev-1", scope_type="project", scope_id="proj-a"),
            ProjectAssignmentDB(user_id="dev-2", scope_type="project", scope_id="proj-a"),
        ]
        for a in assignments:
            db.add(a)
        # dev-1 has one open assigned issue — used by the 409 test
        issue = IssueDB(
            issue_id="ISSUE-001",
            project_id="proj-a",
            tool_name="sonar",
            title="Open issue blocking dev-1 deletion",
            severity="High",
            status="open",
            assignee_id="dev-1",
            assigned_by="admin-1",
        )
        db.add(issue)
        db.commit()
    db.close()
    yield
    Base.metadata.drop_all(bind=engine)


def _current_user(user_id: str, username: str, role: str):
    """Build a fake current_user object that matches the bypass-user shape."""

    class _U:
        pass

    u = _U()
    u.id = user_id
    u.username = username
    u.role = role
    return u


@pytest.fixture
def client():
    from app.main import app
    return TestClient(app)


@pytest.fixture
def admin_client(client):
    """Client authenticated as admin-1 (the primary admin)."""
    from app.main import app

    app.dependency_overrides[get_current_user] = lambda: _current_user(
        user_id="admin-1", username="admin", role="admin"
    )
    yield client
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def non_admin_client(client):
    """Client authenticated as lead-1 (a team_lead, not admin)."""
    from app.main import app

    app.dependency_overrides[get_current_user] = lambda: _current_user(
        user_id="lead-1", username="lead1", role="team_lead"
    )
    yield client
    app.dependency_overrides.pop(get_current_user, None)


class TestDeleteUser:
    def test_admin_can_delete_developer(self, admin_client):
        """Happy path: admin deletes dev-2 (no open issues, no last-admin risk)."""
        db = SessionLocal()
        try:
            # dev-2 exists
            assert db.query(UserDB).filter(UserDB.id == "dev-2").first() is not None
        finally:
            db.close()

        response = admin_client.delete("/api/v1/users/dev-2")
        assert response.status_code == 204
        assert response.content == b""

        db = SessionLocal()
        try:
            assert db.query(UserDB).filter(UserDB.id == "dev-2").first() is None
            # audit log entry created
            audit = (
                db.query(AccessChangeDB)
                .filter(AccessChangeDB.change_type == "user_deleted")
                .first()
            )
            assert audit is not None
            assert audit.target_user_id == "dev-2"
            assert audit.before_value == "dev2"
        finally:
            db.close()

    def test_admin_cannot_delete_themselves(self, admin_client):
        """admin-1 trying to delete admin-1 — should 400."""
        response = admin_client.delete("/api/v1/users/admin-1")
        assert response.status_code == 400
        assert "own account" in response.json()["detail"]

    def test_admin_cannot_delete_last_admin(self, admin_client):
        """With only one admin in the DB, deleting it must be blocked."""
        db = SessionLocal()
        try:
            # Ensure only admin-1 remains
            db.query(UserDB).filter(UserDB.id == "admin-2").delete()
            db.commit()
            admin_count = db.query(UserDB).filter(UserDB.role == "admin").count()
            assert admin_count == 1
        finally:
            db.close()

        response = admin_client.delete("/api/v1/users/admin-1")
        assert response.status_code == 409
        assert "last admin" in response.json()["detail"].lower()

    def test_admin_can_delete_a_non_last_admin(self, admin_client):
        """With two admins, deleting one is allowed."""
        response = admin_client.delete("/api/v1/users/admin-2")
        assert response.status_code == 204

    def test_non_admin_cannot_delete_user(self, non_admin_client):
        """team_lead should get 403 (only admins can manage users)."""
        response = non_admin_client.delete("/api/v1/users/dev-1")
        assert response.status_code == 403
        assert "Admin access required" in response.json()["detail"]

    def test_delete_nonexistent_user_returns_404(self, admin_client):
        response = admin_client.delete("/api/v1/users/does-not-exist")
        assert response.status_code == 404
        assert "User not found" in response.json()["detail"]

    def test_admin_cannot_delete_user_with_open_issues(self, admin_client):
        """dev-1 has one open assigned issue → 409."""
        response = admin_client.delete("/api/v1/users/dev-1")
        assert response.status_code == 409
        body = response.json()["detail"]
        assert "1" in body
        assert "open assigned issue" in body

    def test_delete_cascades_project_access(self, admin_client):
        """ProjectAssignmentDB rows for the deleted user must be removed."""
        db = SessionLocal()
        try:
            assert (
                db.query(ProjectAssignmentDB)
                .filter(ProjectAssignmentDB.user_id == "dev-2")
                .first()
                is not None
            )
        finally:
            db.close()

        response = admin_client.delete("/api/v1/users/dev-2")
        assert response.status_code == 204

        db = SessionLocal()
        try:
            assert (
                db.query(ProjectAssignmentDB)
                .filter(ProjectAssignmentDB.user_id == "dev-2")
                .first()
                is None
            )
        finally:
            db.close()

    def test_delete_admin_with_open_issue_check_applies_only_to_admin_role(self, admin_client):
        """Regression: the 'last admin' check fires for admins, the 'open issues'
        check fires for everyone else. dev-2 has no open issues, so deletion
        should succeed even though dev-1 (a different user) has one."""
        # Sanity: dev-1 still has its open issue
        db = SessionLocal()
        try:
            dev1 = db.query(UserDB).filter(UserDB.id == "dev-1").first()
            assert dev1 is not None
        finally:
            db.close()

        response = admin_client.delete("/api/v1/users/dev-2")
        assert response.status_code == 204  # not blocked by dev-1's issue
