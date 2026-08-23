"""RBAC/IDOR regression tests for scans/routes.py and scans/state.py.

Findings #36 (nearly every scan-detail endpoint had no project scoping) and #69/#70
(POST /scans and POST /scans/{id}/cancel had zero authentication) — no dedicated RBAC
test file existed for this module before. TEST_BYPASS_AUTH short-circuits
get_current_user before it looks at the Authorization header, so cross-project denial
tests disable it and authenticate with a real JWT for the scoped user.
"""

import os

os.environ.setdefault('ENV', 'test')
os.environ.setdefault('DATABASE_URL', 'sqlite:///test_scans_rbac.db')
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
from app.models.db_models import UserDB, ProjectDB, ScanDB, ProjectAssignmentDB
from app.state.scan_state import ScanState


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    if not db.query(UserDB).first():
        db.add(UserDB(id="admin-1", username="admin", role="admin", hashed_password="h"))
        db.add(UserDB(id="dev-1", username="dev1", role="developer", hashed_password="h"))
        db.add(ProjectDB(project_id="proj-a", name="Project A", status="ACTIVE"))
        db.add(ProjectDB(project_id="proj-b", name="Project B", status="ACTIVE"))
        db.add(ScanDB(
            scan_id="scan-a-1", project_id="proj-a", scan_mode="automated",
            state=ScanState.COMPLETED, selected_stages=[], stage_results=[], callback_digests=[],
        ))
        db.add(ScanDB(
            scan_id="scan-b-1", project_id="proj-b", scan_mode="automated",
            state=ScanState.COMPLETED, selected_stages=[], stage_results=[], callback_digests=[],
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
def admin_headers():
    return {"Authorization": "Bearer test-bypass"}


class TestScansAdminAccess:
    def test_admin_can_list_scans(self, client, admin_headers):
        response = client.get("/api/v1/scans", headers=admin_headers)
        assert response.status_code == 200

    def test_admin_can_get_scan(self, client, admin_headers):
        response = client.get("/api/v1/scans/scan-a-1", headers=admin_headers)
        assert response.status_code == 200

    def test_admin_can_get_scan_results(self, client, admin_headers):
        response = client.get("/api/v1/scans/scan-a-1/results", headers=admin_headers)
        assert response.status_code == 200

    def test_trigger_scan_requires_auth(self, client, monkeypatch):
        # TEST_BYPASS_AUTH short-circuits get_current_user regardless of the request —
        # disable it here so a missing Authorization header is actually exercised.
        from app.core import auth as auth_module
        monkeypatch.setattr(auth_module.settings, "TEST_BYPASS_AUTH", False)
        response = client.post(
            "/api/v1/scans",
            json={"project_id": "proj-a", "scan_mode": "automated"},
        )
        assert response.status_code in (401, 403)

    def test_cancel_scan_requires_auth(self, client, monkeypatch):
        from app.core import auth as auth_module
        monkeypatch.setattr(auth_module.settings, "TEST_BYPASS_AUTH", False)
        response = client.post("/api/v1/scans/scan-a-1/cancel")
        assert response.status_code in (401, 403)


class TestScansCrossProjectDenial:
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

    def test_dev_can_see_own_project_scan_in_list(self, client, dev1_headers):
        response = client.get("/api/v1/scans", headers=dev1_headers)
        assert response.status_code == 200
        scan_ids = {s["scan_id"] for s in response.json()}
        assert "scan-a-1" in scan_ids
        assert "scan-b-1" not in scan_ids

    def test_dev_can_read_own_project_scan(self, client, dev1_headers):
        response = client.get("/api/v1/scans/scan-a-1", headers=dev1_headers)
        assert response.status_code == 200

    def test_dev_cannot_read_other_project_scan(self, client, dev1_headers):
        response = client.get("/api/v1/scans/scan-b-1", headers=dev1_headers)
        assert response.status_code == 404

    def test_dev_cannot_read_other_project_scan_results(self, client, dev1_headers):
        response = client.get("/api/v1/scans/scan-b-1/results", headers=dev1_headers)
        assert response.status_code == 404

    def test_dev_cannot_get_other_project_scan_overview(self, client, dev1_headers):
        response = client.get("/api/v1/scans/scan-b-1/overview", headers=dev1_headers)
        assert response.status_code == 404

    def test_dev_cannot_retry_other_project_scan_reports(self, client, dev1_headers):
        response = client.post("/api/v1/scans/scan-b-1/retry-reports", headers=dev1_headers)
        assert response.status_code == 404

    def test_dev_cannot_cancel_other_project_scan(self, client, dev1_headers):
        response = client.post("/api/v1/scans/scan-b-1/cancel", headers=dev1_headers)
        assert response.status_code == 404

    def test_dev_cannot_view_other_project_scan_history(self, client, dev1_headers):
        response = client.get("/api/v1/projects/proj-b/scans", headers=dev1_headers)
        assert response.status_code == 404

    def test_dev_cannot_trigger_scan_on_other_project(self, client, dev1_headers):
        response = client.post(
            "/api/v1/scans",
            json={"project_id": "proj-b", "scan_mode": "automated"},
            headers=dev1_headers,
        )
        assert response.status_code == 404
