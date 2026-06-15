"""Tests for RBAC user management API endpoints."""

import os

os.environ.setdefault('ENV', 'test')
os.environ.setdefault('DATABASE_URL', 'sqlite:///test_rbac_api.db')
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
from sqlalchemy.orm import Session

from app.core.db import engine, Base, SessionLocal
from app.models.db_models import UserDB


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    if not db.query(UserDB).first():
        users = [
            UserDB(id="admin-1", username="admin", role="admin", hashed_password="hashed_admin"),
            UserDB(id="lead-1", username="lead1", role="team_lead", hashed_password="hashed_lead1"),
            UserDB(id="dev-1", username="dev1", role="developer", hashed_password="hashed_dev1"),
        ]
        for u in users:
            db.add(u)
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
    """Get admin auth headers."""
    return {"Authorization": "Bearer test-bypass"}


class TestListUsers:
    def test_admin_can_list_users(self, client, admin_headers):
        response = client.get("/api/v1/users", headers=admin_headers)
        assert response.status_code == 200
        assert isinstance(response.json(), list)


class TestUpdateRole:
    def test_admin_can_change_role(self, client, admin_headers):
        # First get users
        resp = client.get("/api/v1/users", headers=admin_headers)
        users = resp.json()
        if not users:
            pytest.skip("No users in test DB")

        user_id = users[0]["id"]
        response = client.patch(
            f"/api/v1/users/{user_id}/role",
            json={"role": "team_lead"},
            headers=admin_headers,
        )
        assert response.status_code == 200
        assert response.json()["role"] == "team_lead"

    def test_invalid_role_rejected(self, client, admin_headers):
        resp = client.get("/api/v1/users", headers=admin_headers)
        users = resp.json()
        if not users:
            pytest.skip("No users")

        user_id = users[0]["id"]
        response = client.patch(
            f"/api/v1/users/{user_id}/role",
            json={"role": "superadmin"},
            headers=admin_headers,
        )
        assert response.status_code == 422


class TestProjectAccess:
    def test_get_project_access(self, client, admin_headers):
        resp = client.get("/api/v1/users", headers=admin_headers)
        users = resp.json()
        if not users:
            pytest.skip("No users")

        user_id = users[0]["id"]
        response = client.get(
            f"/api/v1/users/{user_id}/project-access",
            headers=admin_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert "user_id" in data
        assert "assignments" in data

    def test_grant_project_access(self, client, admin_headers):
        resp = client.get("/api/v1/users", headers=admin_headers)
        users = resp.json()
        if not users:
            pytest.skip("No users")

        user_id = users[0]["id"]
        response = client.post(
            f"/api/v1/users/{user_id}/project-access",
            json={"scope_type": "project", "scope_id": "test-project-123"},
            headers=admin_headers,
        )
        assert response.status_code == 201
        data = response.json()
        assert data["scope_type"] == "project"
        assert data["scope_id"] == "test-project-123"

    def test_duplicate_access_returns_409(self, client, admin_headers):
        resp = client.get("/api/v1/users", headers=admin_headers)
        users = resp.json()
        if not users:
            pytest.skip("No users")

        user_id = users[0]["id"]
        # Grant once
        client.post(
            f"/api/v1/users/{user_id}/project-access",
            json={"scope_type": "project", "scope_id": "dup-test"},
            headers=admin_headers,
        )
        # Grant again
        response = client.post(
            f"/api/v1/users/{user_id}/project-access",
            json={"scope_type": "project", "scope_id": "dup-test"},
            headers=admin_headers,
        )
        assert response.status_code == 409


class TestAccessChanges:
    def test_list_access_changes(self, client, admin_headers):
        response = client.get("/api/v1/access-changes", headers=admin_headers)
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_access_change_recorded_on_role_change(self, client, admin_headers):
        resp = client.get("/api/v1/users", headers=admin_headers)
        users = resp.json()
        if not users:
            pytest.skip("No users")

        user_id = users[0]["id"]
        # Change role
        client.patch(
            f"/api/v1/users/{user_id}/role",
            json={"role": "team_lead"},
            headers=admin_headers,
        )
        # Check audit log
        resp = client.get("/api/v1/access-changes", headers=admin_headers)
        changes = resp.json()
        role_changes = [c for c in changes if c["change_type"] == "role_changed"]
        assert len(role_changes) >= 1
