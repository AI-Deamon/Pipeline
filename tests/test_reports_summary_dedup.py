"""Regression test for a real production bug found while investigating a live
"reporting is unusable" report: GET /reports/projects/{id}/reports/summary
(with no scan_id) returned every ScanReportDB row ever created for the
project, accumulating duplicates for the same tool across every past scan. A
project with several rescans over time showed the same tool 5-6+ times in the
`tools` list (several stale/all-zero), and severity totals were massively
inflated by double/triple-counting old reports. Same "latest report per
(project_id, tool_name)" pattern already applied to portfolio.py and
project_grouping.py — this endpoint was missed.
"""
import os

os.environ.setdefault('ENV', 'test')
os.environ.setdefault('DATABASE_URL', 'sqlite:///test_reports_summary_dedup.db')
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
from app.models.db_models import ProjectDB, ScanReportDB


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    from app.main import app
    return TestClient(app)


def _add_report(db, scan_id, project_id, tool_name, created_at, critical=0, high=0, medium=0, low=0):
    db.add(ScanReportDB(
        scan_id=scan_id, project_id=project_id, tool_name=tool_name,
        severity_summary={"critical": critical, "high": high, "medium": medium, "low": low, "info": 0},
        findings=[], migration_status="completed", created_at=created_at,
    ))


def test_summary_without_scan_id_only_counts_each_tools_latest_report(client):
    old = datetime.now(timezone.utc) - timedelta(days=60)
    mid = datetime.now(timezone.utc) - timedelta(days=30)
    recent = datetime.now(timezone.utc) - timedelta(days=1)

    db = SessionLocal()
    db.add(ProjectDB(project_id="proj-rescanned", name="Rescanned Many Times", status="ACTIVE"))
    # sonar rescanned 3 times — only the most recent (13 critical) should count.
    _add_report(db, "scan-1", "proj-rescanned", "sonar", old, critical=5)
    _add_report(db, "scan-2", "proj-rescanned", "sonar", mid, critical=8)
    _add_report(db, "scan-3", "proj-rescanned", "sonar", recent, critical=13)
    # trivy_fs rescanned twice.
    _add_report(db, "scan-1", "proj-rescanned", "trivy_fs", old, high=1)
    _add_report(db, "scan-3", "proj-rescanned", "trivy_fs", recent, high=3)
    db.commit()
    db.close()

    response = client.get(
        "/api/v1/reports/projects/proj-rescanned/reports/summary",
        headers={"Authorization": "Bearer test-bypass"},
    )
    assert response.status_code == 200
    data = response.json()

    # Exactly one entry per tool, not one per historical report.
    tool_names = [t["tool"] for t in data["tools"]]
    assert sorted(tool_names) == ["sonar", "trivy_fs"]

    # Severity reflects only the latest report per tool (13, not 5+8+13=26).
    assert data["severity"]["critical"] == 13
    assert data["severity"]["high"] == 3
    assert data["total_findings"] == 16  # 13 + 3, not every historical report summed


def test_summary_with_explicit_scan_id_still_returns_only_that_scan(client):
    """An explicit scan_id is a genuine historical lookup — must not be
    collapsed to "latest per tool" like the no-filter view."""
    old = datetime.now(timezone.utc) - timedelta(days=60)
    recent = datetime.now(timezone.utc) - timedelta(days=1)

    db = SessionLocal()
    db.add(ProjectDB(project_id="proj-historical", name="Historical Lookup", status="ACTIVE"))
    _add_report(db, "scan-old", "proj-historical", "sonar", old, critical=5)
    _add_report(db, "scan-new", "proj-historical", "sonar", recent, critical=13)
    db.commit()
    db.close()

    response = client.get(
        "/api/v1/reports/projects/proj-historical/reports/summary?scan_id=scan-old",
        headers={"Authorization": "Bearer test-bypass"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["severity"]["critical"] == 5
