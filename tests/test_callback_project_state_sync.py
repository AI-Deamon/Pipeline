from fastapi.testclient import TestClient
from app.main import app
from app.core.db import SessionLocal, engine, Base
from app.models.db_models import ProjectDB, ScanDB
from app.state.scan_state import ScanState
from datetime import datetime
import pytest
from unittest.mock import patch, MagicMock


@pytest.fixture(autouse=True)
def setup_database():
    """Setup and teardown database for each test"""
    # Create tables
    Base.metadata.create_all(bind=engine)
    yield
    # Drop tables after test
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db_session():
    """Provide a database session for tests"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def client():
    """Provide a test client"""
    return TestClient(app)


@pytest.fixture
def mock_celery_task():
    """Mock the Celery task to avoid Redis connection"""
    with patch("app.tasks.jenkins_tasks.trigger_jenkins_scan_async") as mock:
        mock.delay = MagicMock(return_value=MagicMock(id="test-task-id"))
        yield mock


def test_callback_syncs_project_last_scan_state_on_success(client, db_session, mock_celery_task):
    """Test that callback updates project last_scan_state on success"""
    # 1. Create project
    project_response = client.post(
        "/api/v1/projects",
        json={
            "name": "State Sync Project",
            "git_url": "https://github.com/acme/repo.git",
            "branch": "main",
            "credentials_id": "cred-1",
            "sonar_key": "sonar-1",
        },
    )
    assert project_response.status_code == 200
    project_id = project_response.json()["project_id"]

    # 2. Trigger scan
    scan_response = client.post(
        "/api/v1/scans",
        json={
            "project_id": project_id,
            "scan_mode": "automated",
        },
    )
    assert scan_response.status_code == 201
    scan_id = scan_response.json()["scan_id"]

    # 3. Simulate callback from Jenkins with SUCCESS
    callback_response = client.post(
        f"/api/v1/scans/{scan_id}/callback",
        json={"status": "SUCCESS", "stages": []},
        headers={"X-Callback-Token": "test-callback-token-1234567890"}
    )

    assert callback_response.status_code == 200
    
    # 4. Verify scan state updated
    scan_obj = db_session.query(ScanDB).filter(ScanDB.scan_id == scan_id).first()
    assert scan_obj.state == ScanState.COMPLETED
    
    # 5. Verify project last_scan_state synced
    project_obj = db_session.query(ProjectDB).filter(ProjectDB.project_id == project_id).first()
    assert project_obj.last_scan_state == "COMPLETED"


def test_callback_syncs_project_last_scan_state_on_failure(client, db_session, mock_celery_task):
    """Test that callback updates project last_scan_state on failure"""
    # 1. Create project
    project_response = client.post(
        "/api/v1/projects",
        json={
            "name": "State Sync Project",
            "git_url": "https://github.com/acme/repo.git",
            "branch": "main",
            "credentials_id": "cred-1",
            "sonar_key": "sonar-1",
        },
    )
    assert project_response.status_code == 200
    project_id = project_response.json()["project_id"]

    # 2. Trigger scan
    scan_response = client.post(
        "/api/v1/scans",
        json={
            "project_id": project_id,
            "scan_mode": "automated",
        },
    )
    assert scan_response.status_code == 201
    scan_id = scan_response.json()["scan_id"]

    # 3. Simulate callback from Jenkins with FAILURE
    callback_response = client.post(
        f"/api/v1/scans/{scan_id}/callback",
        json={"status": "FAILURE", "stages": []},
        headers={"X-Callback-Token": "test-callback-token-1234567890"}
    )

    assert callback_response.status_code == 200
    
    # 4. Verify scan state updated
    scan_obj = db_session.query(ScanDB).filter(ScanDB.scan_id == scan_id).first()
    assert scan_obj.state == ScanState.FAILED
    
    # 5. Verify project last_scan_state synced
    project_obj = db_session.query(ProjectDB).filter(ProjectDB.project_id == project_id).first()
    assert project_obj.last_scan_state == "FAILED"

