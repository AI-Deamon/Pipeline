"""Tests for RBAC project/report scope filtering."""

import os

os.environ.setdefault('ENV', 'test')
os.environ.setdefault('DATABASE_URL', 'sqlite:///test_projects_rbac.db')
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
from app.models.db_models import UserDB, ProjectDB, ProjectAssignmentDB


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
        projects = [
            ProjectDB(project_id="proj-a", name="Project A"),
            ProjectDB(project_id="proj-b", name="Project B"),
        ]
        for p in projects:
            db.add(p)
        assignments = [
            ProjectAssignmentDB(user_id="lead-1", scope_type="project", scope_id="proj-a"),
            ProjectAssignmentDB(user_id="dev-1", scope_type="project", scope_id="proj-b"),
        ]
        for a in assignments:
            db.add(a)
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


class TestProjectList:
    def test_admin_can_list_projects(self, client, admin_headers):
        response = client.get("/api/v1/projects", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 2

    def test_project_list_contains_expected_fields(self, client, admin_headers):
        response = client.get("/api/v1/projects", headers=admin_headers)
        data = response.json()
        project = next((p for p in data if p["project_id"] == "proj-a"), None)
        assert project is not None
        assert "name" in project
        assert project["name"] == "Project A"

    def test_admin_can_get_single_project(self, client, admin_headers):
        response = client.get("/api/v1/projects/proj-a", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        assert data.get("project_id") == "proj-a"

    def test_non_existent_project_returns_404(self, client, admin_headers):
        response = client.get("/api/v1/projects/non-existent", headers=admin_headers)
        assert response.status_code == 404


class TestReportAccess:
    def test_admin_can_get_report_summary(self, client, admin_headers):
        response = client.get(
            "/api/v1/reports/projects/proj-a/reports/summary", headers=admin_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["project_id"] == "proj-a"

    def test_report_summary_returns_structured_data(self, client, admin_headers):
        response = client.get(
            "/api/v1/reports/projects/proj-b/reports/summary", headers=admin_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "total_findings" in data
        assert "severity" in data
        assert "tools" in data


class TestNonExistentProject:
    def test_non_existent_report_project_returns_404(self, client, admin_headers):
        response = client.get(
            "/api/v1/reports/projects/non-existent/reports/summary",
            headers=admin_headers,
        )
        assert response.status_code == 404
