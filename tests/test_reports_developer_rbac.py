"""Regression tests for finding #115: get_developer_report and get_file_measures had
no RBAC/project-ownership check at all, unlike every other endpoint in reports.py.
TEST_BYPASS_AUTH short-circuits get_current_user before it looks at the Authorization
header, so cross-project denial tests disable it and authenticate with a real JWT.
"""

import os

os.environ.setdefault('ENV', 'test')
os.environ.setdefault('DATABASE_URL', 'sqlite:///test_reports_dev_rbac.db')
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
from app.models.db_models import UserDB, ProjectDB, ScanReportDB, ProjectAssignmentDB


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    if not db.query(UserDB).first():
        db.add(UserDB(id="admin-1", username="admin", role="admin", hashed_password="h"))
        db.add(UserDB(id="dev-1", username="dev1", role="developer", hashed_password="h"))
        db.add(ProjectDB(project_id="proj-a", name="Project A", sonar_key="sonar-a"))
        db.add(ProjectDB(project_id="proj-b", name="Project B", sonar_key="sonar-b"))
        db.add(ScanReportDB(
            scan_id="scan-b-1", project_id="proj-b", tool_name="sonar",
            severity_summary={}, findings=[{"file_path": "app.py", "title": "issue", "severity": "High"}],
        ))
        db.commit()
    db.close()
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    from app.main import app
    return TestClient(app)


@pytest.fixture
def dev1_headers(monkeypatch):
    from app.core import auth as auth_module
    from app.core import security
    monkeypatch.setattr(auth_module.settings, "TEST_BYPASS_AUTH", False)

    db = SessionLocal()
    if not db.query(ProjectAssignmentDB).filter(ProjectAssignmentDB.user_id == "dev-1").first():
        db.add(ProjectAssignmentDB(user_id="dev-1", scope_type="project", scope_id="proj-a", assigned_by="admin-1"))
        db.commit()
    db.close()

    return {"Authorization": f"Bearer {security.create_access_token({'sub': 'dev1'})}"}


class TestDeveloperReportRBAC:
    def test_dev_cannot_get_other_project_developer_report(self, client, dev1_headers):
        # dev-1 is scoped to proj-a only; proj-b's developer report must be denied.
        response = client.get(
            "/api/v1/reports/projects/proj-b/reports/scan-b-1/developer",
            headers=dev1_headers,
        )
        assert response.status_code == 404

    def test_dev_cannot_get_other_project_file_measures(self, client, dev1_headers):
        # sonar-b belongs to proj-b, which dev-1 has no access to.
        response = client.get(
            "/api/v1/reports/file-measures/sonar-b:app.py",
            headers=dev1_headers,
        )
        assert response.status_code == 404

    def test_file_measures_unknown_sonar_key_returns_404(self, client, dev1_headers):
        response = client.get(
            "/api/v1/reports/file-measures/no-such-sonar-key:app.py",
            headers=dev1_headers,
        )
        assert response.status_code == 404
