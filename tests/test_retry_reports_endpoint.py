"""Tests for scan retry-reports endpoint"""
from unittest import mock
from fastapi.testclient import TestClient
from app.main import app
from app.core.db import SessionLocal
from app.models.db_models import ScanDB, ProjectDB
from app.state.scan_state import ScanState

client = TestClient(app)


def test_retry_reports_missing_scan():
    """Returns 404 for non-existent scan"""
    response = client.post("/api/v1/scans/nonexistent/retry-reports")
    assert response.status_code == 404
    assert response.json()["detail"] == "Scan not found"


def test_retry_reports_no_build_number():
    """Returns 400 when scan has no build number"""
    db = SessionLocal()
    try:
        # Create a project
        project = ProjectDB(
            project_id="test-proj-retry",
            name="Test Project",
            target_ip="10.0.0.1",
        )
        db.add(project)

        # Create a scan without build number
        scan = ScanDB(
            scan_id="test-scan-retry-1",
            project_id="test-proj-retry",
            scan_mode="manual",
            state=ScanState.COMPLETED,
            jenkins_build_number=None,
        )
        db.add(scan)
        db.commit()

        response = client.post("/api/v1/scans/test-scan-retry-1/retry-reports")
        assert response.status_code == 400
        assert "no associated Jenkins build number" in response.json()["detail"]
    finally:
        db.close()


def test_retry_reports_success():
    """Successfully queues retry when scan has build number"""
    db = SessionLocal()
    try:
        # Create a project
        project = ProjectDB(
            project_id="test-proj-retry-2",
            name="Test Project",
            target_ip="10.0.0.1",
        )
        db.add(project)

        # Create a scan with build number
        scan = ScanDB(
            scan_id="test-scan-retry-2",
            project_id="test-proj-retry-2",
            scan_mode="manual",
            state=ScanState.COMPLETED,
            jenkins_build_number="42",
        )
        db.add(scan)
        db.commit()

        with mock.patch("app.tasks.report_tasks.process_scan_reports_task") as mock_task:
            mock_task.delay.return_value.id = "celery-task-123"
            response = client.post("/api/v1/scans/test-scan-retry-2/retry-reports")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "queued"
            assert data["scan_id"] == "test-scan-retry-2"
            assert data["task_id"] == "celery-task-123"
            mock_task.delay.assert_called_once()
    finally:
        db.close()
