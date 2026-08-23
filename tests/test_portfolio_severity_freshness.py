"""Regression test for #114: the portfolio overview presented severity data
from different scan runs under one unified "last scan" timestamp. Each tool's
severity comes from that tool's own latest ScanReportDB (independent of
scan_id), while `last_scan_time` comes from a separate ScanDB query — a manual
"Nmap-only" rescan updates the displayed last_scan_time to today while
Trivy/ZAP/Sonar/Depcheck severity counts still reflect a much older scan, with
no way for a viewer to tell.
"""
import os

os.environ.setdefault('ENV', 'test')
os.environ.setdefault('DATABASE_URL', 'sqlite:///test_portfolio_freshness.db')
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
from app.state.scan_state import ScanState


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    from app.main import app
    return TestClient(app)


def test_severity_as_of_reflects_oldest_contributing_tool_not_last_scan_time(client):
    old_time = datetime.now(timezone.utc) - timedelta(days=30)
    recent_time = datetime.now(timezone.utc) - timedelta(minutes=5)

    db = SessionLocal()
    db.add(ProjectDB(project_id="proj-mixed", name="Mixed Freshness", status="ACTIVE"))

    # A manual "Nmap-only" rescan today updates last_scan_time...
    db.add(ScanDB(
        scan_id="scan-nmap-only", project_id="proj-mixed", scan_mode="manual",
        state=ScanState.COMPLETED, selected_stages=["nmap_scan"], stage_results=[],
        callback_digests=[], started_at=recent_time, created_at=recent_time,
    ))
    db.add(ScanReportDB(
        scan_id="scan-nmap-only", project_id="proj-mixed", tool_name="nmap",
        severity_summary={"critical": 0, "high": 0, "medium": 0, "low": 1, "info": 0},
        findings=[], migration_status="completed", created_at=recent_time,
    ))

    # ...but Trivy's severity data is 30 days stale, contributing to the same
    # unified severity summary with no visible distinction.
    db.add(ScanReportDB(
        scan_id="scan-old-full", project_id="proj-mixed", tool_name="trivy",
        severity_summary={"critical": 2, "high": 0, "medium": 0, "low": 0, "info": 0},
        findings=[], migration_status="completed", created_at=old_time,
    ))
    db.commit()
    db.close()

    response = client.get("/api/v1/portfolio/overview", headers={"Authorization": "Bearer test-bypass"})
    assert response.status_code == 200
    data = response.json()
    entry = next(p for p in data["projects"] if p["project_id"] == "proj-mixed")

    # last_scan_time reflects the recent Nmap-only scan...
    assert entry["last_scan_time"] is not None

    # ...but severity_as_of must reflect the OLDEST contributing tool (Trivy,
    # 30 days old) — proving the severity summary's real freshness is now
    # distinguishable from last_scan_time, not implied to be equally fresh.
    assert entry["severity_as_of"] is not None
    severity_as_of = datetime.fromisoformat(entry["severity_as_of"])
    last_scan_time = datetime.fromisoformat(entry["last_scan_time"])
    assert severity_as_of < last_scan_time
    assert (last_scan_time - severity_as_of).days >= 29
