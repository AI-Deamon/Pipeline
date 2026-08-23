"""Regression tests for finding #56: the "Reject" button on rescan approvals called
POST /scans/trigger-verify — the same action "Approve" effectively drives — instead
of actually rejecting anything. There was no reject endpoint at all. This verifies
the new POST /issues/{issue_id}/reject-rescan endpoint.
"""

import os

os.environ.setdefault('ENV', 'test')
os.environ.setdefault('DATABASE_URL', 'sqlite:///test_rescan_reject.db')
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
from app.models.db_models import UserDB, IssueDB


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    if not db.query(UserDB).first():
        db.add(UserDB(id="admin-1", username="admin", role="admin", hashed_password="h"))
        db.add(IssueDB(
            issue_id="ISSUE-REJ-1", project_id="proj-a", tool_name="sonar",
            severity="High", title="Fixable issue", status="fixed",
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


@pytest.fixture
def issue_id(client, admin_headers):
    # The rescan rate limiter is an in-memory, process-global bucket (finding #5) —
    # it isn't reset by the per-test DB fixtures, so it must be cleared explicitly or
    # the 4th test in this file trips "3 requests/hour" against the same test process.
    from app.services import rescan_rate_limit
    rescan_rate_limit.reset("test-bypass")  # TEST_BYPASS_AUTH's username, not "admin"

    db = SessionLocal()
    issue = db.query(IssueDB).filter(IssueDB.issue_id == "ISSUE-REJ-1").first()
    iid = issue.id
    db.close()
    response = client.post(
        f"/api/v1/issues/{iid}/request-rescan",
        json={"fix_note": "Fixed the thing", "commit_sha": "abc123"},
        headers=admin_headers,
    )
    assert response.status_code == 201, response.text
    return iid


class TestRejectRescan:
    def test_reject_rescan_marks_request_rejected(self, client, admin_headers, issue_id):
        response = client.post(
            f"/api/v1/issues/{issue_id}/reject-rescan",
            json={"reviewer_note": "Not actually fixed"},
            headers=admin_headers,
        )
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["rescan_request"]["status"] == "rejected"
        assert data["rescan_request"]["reviewer_note"] == "Not actually fixed"

    def test_reject_rescan_reopens_issue_to_in_progress(self, client, admin_headers, issue_id):
        client.post(
            f"/api/v1/issues/{issue_id}/reject-rescan",
            json={},
            headers=admin_headers,
        )
        response = client.get(f"/api/v1/issues/{issue_id}", headers=admin_headers)
        assert response.json()["status"] == "in_progress"

    def test_reject_rescan_with_no_pending_request_returns_409(self, client, admin_headers, issue_id):
        client.post(f"/api/v1/issues/{issue_id}/reject-rescan", json={}, headers=admin_headers)
        # Second reject attempt — the request is no longer pending.
        response = client.post(
            f"/api/v1/issues/{issue_id}/reject-rescan", json={}, headers=admin_headers
        )
        assert response.status_code == 409

    def test_reject_rescan_does_not_trigger_a_scan(self, client, admin_headers, issue_id, monkeypatch):
        # Regression guard: the old (broken) implementation called trigger-verify-scan,
        # which creates a ScanDB row. Rejecting must not do that.
        from app.models.db_models import ScanDB
        db = SessionLocal()
        before = db.query(ScanDB).count()
        db.close()

        client.post(f"/api/v1/issues/{issue_id}/reject-rescan", json={}, headers=admin_headers)

        db = SessionLocal()
        after = db.query(ScanDB).count()
        db.close()
        assert after == before
