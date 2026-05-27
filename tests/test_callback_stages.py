"""
Tests for Jenkins callback stage normalization and processing.

Validates that the backend correctly processes stage results from each
Jenkins pipeline stage via the /callback endpoint. This covers:
- All 10 valid stage IDs (9 user + install_dependencies) accepted
- Status normalization (PASS/FAIL/WARN/SKIPPED)
- install_dependencies stage callback accepted
- Invalid stage IDs rejected
- Stage results persisted correctly
- Intermediate RUNNING callbacks accepted
"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

from app.main import app
from app.core.db import SessionLocal, engine, Base
from app.models.db_models import ProjectDB, ScanDB
from app.state.scan_state import ScanState


@pytest.fixture(autouse=True)
def setup_database():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def mock_celery_task():
    with patch("app.tasks.jenkins_tasks.trigger_jenkins_scan_async") as mock:
        mock.delay = MagicMock(return_value=MagicMock(id="test-task-id"))
        yield mock


def _create_project(client):
    response = client.post(
        "/api/v1/projects",
        json={
            "name": "Callback Test Project",
            "git_url": "https://github.com/acme/test.git",
            "branch": "main",
        },
    )
    assert response.status_code == 200
    return response.json()["project_id"]


def _create_scan(client, project_id):
    response = client.post(
        "/api/v1/scans",
        json={"project_id": project_id, "scan_mode": "automated"},
    )
    assert response.status_code == 201
    return response.json()["scan_id"]


# ── All valid stage IDs accepted via callback ────────────────────────────────

ALL_VALID_STAGES = [
    "git_checkout",
    "sonar_scanner",
    "install_dependencies",
    "dependency_check",
    "trivy_fs_scan",
    "docker_build",
    "docker_push",
    "trivy_image_scan",
    "nmap_scan",
    "zap_scan",
]


@pytest.mark.parametrize("stage_id", ALL_VALID_STAGES)
def test_callback_accepts_all_valid_stage_ids(stage_id, client, mock_celery_task):
    """Every stage ID in VALID_STAGES must be accepted by the callback endpoint."""
    project_id = _create_project(client)
    scan_id = _create_scan(client, project_id)

    response = client.post(
        f"/api/v1/scans/{scan_id}/callback",
        json={
            "status": "RUNNING",
            "stages": [{"stage": stage_id, "status": "PASS", "summary": "test"}],
        },
        headers={"X-Callback-Token": "test-callback-token-1234567890"},
    )
    assert response.status_code == 200, (
        f"Callback rejected valid stage '{stage_id}': {response.json()}"
    )


# ── install_dependencies specifically ────────────────────────────────────────

def test_callback_accepts_install_dependencies(client, mock_celery_task):
    """install_dependencies must be accepted as a valid stage ID."""
    project_id = _create_project(client)
    scan_id = _create_scan(client, project_id)

    response = client.post(
        f"/api/v1/scans/{scan_id}/callback",
        json={
            "status": "RUNNING",
            "stages": [
                {"stage": "install_dependencies", "status": "PASS",
                 "summary": "npm install: 1 dir(s) succeeded"}
            ],
        },
        headers={"X-Callback-Token": "test-callback-token-1234567890"},
    )
    assert response.status_code == 200

    # Verify the stage result was persisted
    status = client.get(f"/api/v1/scans/{scan_id}")
    results = status.json().get("results", [])
    assert any(r["stage"] == "install_dependencies" for r in results)


def test_callback_accepts_install_dependencies_with_warn(client, mock_celery_task):
    """install_dependencies with WARN status (partial failure) must be accepted."""
    project_id = _create_project(client)
    scan_id = _create_scan(client, project_id)

    response = client.post(
        f"/api/v1/scans/{scan_id}/callback",
        json={
            "status": "RUNNING",
            "stages": [
                {"stage": "install_dependencies", "status": "WARN",
                 "summary": "npm install: 1 dir(s) succeeded, 1 failed: ./sub"}
            ],
        },
        headers={"X-Callback-Token": "test-callback-token-1234567890"},
    )
    assert response.status_code == 200


# ── Status normalization ────────────────────────────────────────────────────

STATUS_MAPPING = [
    ("PASS", "PASS"),
    ("PASSED", "PASS"),
    ("SUCCESS", "PASS"),
    ("FAIL", "FAIL"),
    ("FAILED", "FAIL"),
    ("FAILURE", "FAIL"),
    ("WARN", "WARN"),
    ("UNSTABLE", "WARN"),
    ("SKIPPED", "SKIPPED"),
]


@pytest.mark.parametrize("raw_status,expected", STATUS_MAPPING)
def test_callback_normalizes_status(raw_status, expected, client, mock_celery_task):
    """Stage status values must be normalized to PASS/FAIL/WARN/SKIPPED."""
    project_id = _create_project(client)
    scan_id = _create_scan(client, project_id)

    response = client.post(
        f"/api/v1/scans/{scan_id}/callback",
        json={
            "status": "RUNNING",
            "stages": [{"stage": "git_checkout", "status": raw_status, "summary": "test"}],
        },
        headers={"X-Callback-Token": "test-callback-token-1234567890"},
    )
    assert response.status_code == 200

    status = client.get(f"/api/v1/scans/{scan_id}")
    results = status.json().get("results", [])
    git_result = next(r for r in results if r["stage"] == "git_checkout")
    assert git_result["status"] == expected, (
        f"Status '{raw_status}' should normalize to '{expected}', got '{git_result['status']}'"
    )


# ── Invalid stage IDs rejected ──────────────────────────────────────────────

def test_callback_rejects_invalid_stage_id(client, mock_celery_task):
    """Stage IDs not in VALID_STAGES must be rejected with 400."""
    project_id = _create_project(client)
    scan_id = _create_scan(client, project_id)

    response = client.post(
        f"/api/v1/scans/{scan_id}/callback",
        json={
            "status": "SUCCESS",
            "stages": [{"stage": "nonexistent_stage", "status": "PASS"}],
        },
        headers={"X-Callback-Token": "test-callback-token-1234567890"},
    )
    assert response.status_code == 400
    assert "Invalid stage identifier" in response.json()["detail"]


def test_callback_rejects_empty_stage_id(client, mock_celery_task):
    """Empty stage ID must be rejected."""
    project_id = _create_project(client)
    scan_id = _create_scan(client, project_id)

    response = client.post(
        f"/api/v1/scans/{scan_id}/callback",
        json={
            "status": "SUCCESS",
            "stages": [{"stage": "", "status": "PASS"}],
        },
        headers={"X-Callback-Token": "test-callback-token-1234567890"},
    )
    assert response.status_code == 400


# ── Full pipeline callback simulation ────────────────────────────────────────

def test_callback_full_pipeline_simulation(client, mock_celery_task):
    """Simulate a full pipeline run with multiple stages.

    Jenkins sends intermediate RUNNING callbacks for each stage,
    then a final SUCCESS callback with all results.
    """
    project_id = _create_project(client)
    scan_id = _create_scan(client, project_id)

    # Intermediate callback: RUNNING with install_dependencies
    intermediate = client.post(
        f"/api/v1/scans/{scan_id}/callback",
        json={
            "status": "RUNNING",
            "stages": [
                {"stage": "git_checkout", "status": "PASS", "summary": "checkout ok"},
                {"stage": "install_dependencies", "status": "PASS", "summary": "npm ci ok"},
            ],
        },
        headers={"X-Callback-Token": "test-callback-token-1234567890"},
    )
    assert intermediate.status_code == 200

    # Final callback: SUCCESS with all stages
    final = client.post(
        f"/api/v1/scans/{scan_id}/callback",
        json={
            "status": "SUCCESS",
            "stages": [
                {"stage": "git_checkout", "status": "PASS", "summary": "checkout ok"},
                {"stage": "install_dependencies", "status": "PASS", "summary": "npm ci ok"},
                {"stage": "sonar_scanner", "status": "WARN", "summary": "401 Unauthorized"},
                {"stage": "dependency_check", "status": "PASS", "summary": "ODC completed"},
                {"stage": "trivy_fs_scan", "status": "PASS", "summary": "scan completed"},
            ],
        },
        headers={"X-Callback-Token": "test-callback-token-1234567890"},
    )
    assert final.status_code == 200

    # Verify final state
    status = client.get(f"/api/v1/scans/{scan_id}")
    data = status.json()
    assert data["state"] == "COMPLETED"
    assert len(data["results"]) == 5


# ── Failure callback with error details ──────────────────────────────────────

def test_callback_failure_with_error_details(client, mock_celery_task):
    """FAILURE callback must persist error details."""
    project_id = _create_project(client)
    scan_id = _create_scan(client, project_id)

    response = client.post(
        f"/api/v1/scans/{scan_id}/callback",
        json={
            "status": "FAILURE",
            "stages": [
                {"stage": "git_checkout", "status": "PASS", "summary": "ok"},
                {"stage": "sonar_scanner", "status": "FAIL", "summary": "401 Unauthorized"},
            ],
            "ERROR_MESSAGE": "Pipeline failed at stage: Sonar Scanner",
            "ERROR_TYPE": "PIPELINE_ERROR",
            "JENKINS_CONSOLE_URL": "http://192.168.1.101:8080/job/test/1/console",
        },
        headers={"X-Callback-Token": "test-callback-token-1234567890"},
    )
    assert response.status_code == 200

    status = client.get(f"/api/v1/scans/{scan_id}")
    data = status.json()
    assert data["state"] == "FAILED"
    assert data["error"]["error_type"] == "PIPELINE_ERROR"
    assert "Sonar Scanner" in data["error"]["message"]


# ── Jenkins display name fallback ────────────────────────────────────────────

DISPLAY_NAME_TO_ID = [
    ("Git Checkout", "git_checkout"),
    ("Sonar Scanner", "sonar_scanner"),
    ("Dependency Check", "dependency_check"),
    ("Trivy FS Scan", "trivy_fs_scan"),
    ("Docker Build", "docker_build"),
    ("Docker Push", "docker_push"),
    ("Trivy Image Scan", "trivy_image_scan"),
    ("Nmap Scan", "nmap_scan"),
    ("ZAP Scan", "zap_scan"),
]


@pytest.mark.parametrize("display_name,expected_id", DISPLAY_NAME_TO_ID)
def test_callback_accepts_display_names(display_name, expected_id, client, mock_celery_task):
    """Callback must accept Jenkins display names as fallback for stage IDs."""
    project_id = _create_project(client)
    scan_id = _create_scan(client, project_id)

    response = client.post(
        f"/api/v1/scans/{scan_id}/callback",
        json={
            "status": "RUNNING",
            "stages": [{"name": display_name, "status": "PASS", "summary": "test"}],
        },
        headers={"X-Callback-Token": "test-callback-token-1234567890"},
    )
    assert response.status_code == 200

    status = client.get(f"/api/v1/scans/{scan_id}")
    results = status.json().get("results", [])
    assert any(r["stage"] == expected_id for r in results), (
        f"Display name '{display_name}' should map to '{expected_id}'. "
        f"Results: {results}"
    )


# ── Callback idempotency ────────────────────────────────────────────────────

def test_callback_duplicate_returns_idempotent(client, mock_celery_task):
    """Sending the same callback twice should return idempotent=True."""
    project_id = _create_project(client)
    scan_id = _create_scan(client, project_id)

    payload = {
        "status": "RUNNING",
        "stages": [{"stage": "git_checkout", "status": "PASS", "summary": "ok"}],
    }
    headers = {"X-Callback-Token": "test-callback-token-1234567890"}

    first = client.post(f"/api/v1/scans/{scan_id}/callback", json=payload, headers=headers)
    second = client.post(f"/api/v1/scans/{scan_id}/callback", json=payload, headers=headers)

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json().get("idempotent") is True
