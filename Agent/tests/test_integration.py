from fastapi.testclient import TestClient
from app.main import app
from app.core.db import SessionLocal, engine, Base
from app.models.db_models import ProjectDB, ScanDB
from app.state.scan_state import ScanState
import pytest
from unittest.mock import patch, MagicMock


@pytest.fixture(autouse=True)
def setup_database():
    """Setup and teardown database for each test"""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    """Provide a test client"""
    return TestClient(app)


@patch("app.tasks.jenkins_tasks.trigger_jenkins_scan_async")
def test_integration_v1(mock_celery_task):
    """Test the complete integration flow: create project -> trigger scan -> get status -> get results"""
    # Mock the Celery task to avoid actually calling Celery
    mock_celery_task.delay = MagicMock(return_value=MagicMock(id="test-task-id"))
    
    client = TestClient(app)
    
    # 1. Create project with snake_case
    project_data = {
        "name": "Integration Project",
        "git_url": "https://github.com/test/repo.git",
        "branch": "main",
        "credentials_id": "git-cred",
        "sonar_key": "sonar-key"
    }
    response = client.post("/api/v1/projects", json=project_data)
    assert response.status_code == 200
    data = response.json()

    # Assert output matches spec
    assert "project_id" in data
    assert data["status"] == "CREATED"

    project_id = data["project_id"]

    # 2. Trigger scan
    scan_data = {
        "project_id": project_id,
        "scan_mode": "automated"
    }
    response = client.post("/api/v1/scans", json=scan_data)
    assert response.status_code == 201
    data = response.json()

    # Assert output matches spec
    assert "scan_id" in data
    # Scan is created as RUNNING (optimistic update)
    assert data["state"] == "RUNNING"

    scan_id = data["scan_id"]

    # 3. Get Status
    response = client.get(f"/api/v1/scans/{scan_id}")
    assert response.status_code == 200
    scan_state = response.json()["state"]
    assert scan_state == "RUNNING"

    # 4. Get Results
    response = client.get(f"/api/v1/scans/{scan_id}/results")
    assert response.status_code == 200
    assert "results" in response.json()


if __name__ == "__main__":
    pytest.main([__file__])

