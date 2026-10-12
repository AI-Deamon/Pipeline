"""Regression test for a real bug found while visually verifying the reports UI:
GET /reports/projects/{id}/reports/unified built its `severity` totals from a
dict that only had critical/high/medium/low keys — "info" was missing
entirely, unlike every other severity aggregation in this file (see
`get_reports_summary`, `get_report`). The frontend's UnifiedReportPage reads
`report.severity.info` directly, so a missing key rendered as a blank Info
stat tile instead of "0".
"""
import os

os.environ.setdefault('ENV', 'test')
os.environ.setdefault('DATABASE_URL', 'sqlite:///test_unified_report_info_severity.db')
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

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.core.db import engine, Base, SessionLocal
from app.models.db_models import ProjectDB, ScanDB, ScanReportDB


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    from app.main import app
    return TestClient(app)


def test_unified_report_severity_includes_info_key(client):
    now = datetime.now(timezone.utc)

    db = SessionLocal()
    db.add(ProjectDB(project_id="proj-unified", name="Unified Report Project", status="ACTIVE"))
    db.add(ScanDB(
        scan_id="scan-unified", project_id="proj-unified", state="COMPLETED",
        scan_mode="manual", selected_stages=["sonar"], finished_at=now,
    ))
    db.add(ScanReportDB(
        scan_id="scan-unified", project_id="proj-unified", tool_name="sonar",
        severity_summary={"critical": 1, "high": 2, "medium": 3, "low": 4, "info": 5},
        findings=[], migration_status="completed", created_at=now,
    ))
    db.commit()
    db.close()

    response = client.get(
        "/api/v1/reports/projects/proj-unified/reports/unified",
        headers={"Authorization": "Bearer test-bypass"},
    )
    assert response.status_code == 200
    severity = response.json()["severity"]

    assert "info" in severity
    assert severity["info"] == 5
