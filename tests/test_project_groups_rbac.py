"""RBAC regression test for #116: project_groups.py's entire cross-project
rollup API had no project-scoping at all — any authenticated user could fetch
the full aggregated severity summary for any group, including ones containing
projects they had no RBAC grant on.

TEST_BYPASS_AUTH short-circuits get_current_user before it looks at the
Authorization header, so cross-project denial tests disable it and
authenticate with a real JWT for the scoped user, matching the pattern in
tests/test_scans_rbac.py.
"""

import os

os.environ.setdefault('ENV', 'test')
os.environ.setdefault('DATABASE_URL', 'sqlite:///test_project_groups_rbac.db')
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
from app.models.db_models import UserDB, ProjectDB, ScanDB, ProjectAssignmentDB, ProjectGroupDB, ScanAssignmentDB
from app.state.scan_state import ScanState
from datetime import datetime, timezone


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
        db.add(ProjectGroupDB(
            group_id="group-ab", name="Group AB", naming_pattern="proj-*",
            created_at=datetime.now(timezone.utc), updated_at=datetime.now(timezone.utc),
        ))
        db.add(ScanAssignmentDB(
            group_id="group-ab", scan_id="scan-a-1", project_id="proj-a",
            match_confidence=100, is_auto_assigned="false", assigned_at=datetime.now(timezone.utc),
        ))
        db.add(ScanAssignmentDB(
            group_id="group-ab", scan_id="scan-b-1", project_id="proj-b",
            match_confidence=100, is_auto_assigned="false", assigned_at=datetime.now(timezone.utc),
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


class TestProjectGroupsAdminAccess:
    def test_admin_sees_full_group(self, client, admin_headers):
        response = client.get("/api/v1/project-groups/group-ab", headers=admin_headers)
        assert response.status_code == 200
        data = response.json()
        project_ids = {a["project_id"] for a in data["assigned_scans"]}
        assert project_ids == {"proj-a", "proj-b"}

    def test_admin_sees_group_in_list(self, client, admin_headers):
        response = client.get("/api/v1/project-groups/", headers=admin_headers)
        assert response.status_code == 200
        assert any(g["group_id"] == "group-ab" for g in response.json())


class TestProjectGroupsCrossProjectScoping:
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

    def test_dev_sees_only_own_project_in_group_detail(self, client, dev1_headers):
        """Before the fix: this returned both proj-a and proj-b's severity data,
        leaking findings from a project the dev has no RBAC grant on."""
        response = client.get("/api/v1/project-groups/group-ab", headers=dev1_headers)
        assert response.status_code == 200
        data = response.json()
        project_ids = {a["project_id"] for a in data["assigned_scans"]}
        assert project_ids == {"proj-a"}
        assert "proj-b" not in project_ids

    def test_dev_sees_group_in_list_because_of_partial_overlap(self, client, dev1_headers):
        response = client.get("/api/v1/project-groups/", headers=dev1_headers)
        assert response.status_code == 200
        assert any(g["group_id"] == "group-ab" for g in response.json())

    def test_dev_with_no_overlapping_project_gets_404(self, client, dev1_headers):
        """A group containing only projects outside the dev's scope must be
        indistinguishable from a group that doesn't exist."""
        db = SessionLocal()
        db.add(ProjectGroupDB(
            group_id="group-b-only", name="B Only", naming_pattern="proj-b*",
            created_at=datetime.now(timezone.utc), updated_at=datetime.now(timezone.utc),
        ))
        db.add(ScanAssignmentDB(
            group_id="group-b-only", scan_id="scan-b-1", project_id="proj-b",
            match_confidence=100, is_auto_assigned="false", assigned_at=datetime.now(timezone.utc),
        ))
        db.commit()
        db.close()

        response = client.get("/api/v1/project-groups/group-b-only", headers=dev1_headers)
        assert response.status_code == 404

    def test_dev_cannot_delete_group(self, client, dev1_headers):
        response = client.delete("/api/v1/project-groups/group-ab", headers=dev1_headers)
        assert response.status_code == 403
