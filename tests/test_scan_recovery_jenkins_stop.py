"""Regression test for finding #19: recover_stuck_scans marked a timed-out scan
FAILED in the DB but never told Jenkins to abort the underlying build — a genuinely
hung build kept consuming an executor/agent slot indefinitely. Also verifies a
failure to reach Jenkins doesn't block the DB-side recovery (best-effort only).
"""

import os

os.environ.setdefault('ENV', 'test')
os.environ.setdefault('DATABASE_URL', 'sqlite:///test_scan_recovery_stop.db')
os.environ.setdefault('JENKINS_BASE_URL', 'http://localhost:8080')
os.environ.setdefault('JENKINS_TOKEN', 'test-token')
os.environ.setdefault('STORAGE_PATH', '/tmp/storage-test')
os.environ.setdefault('SCAN_TIMEOUT', '5')
os.environ.setdefault('LOG_LEVEL', 'INFO')
os.environ.setdefault('CALLBACK_TOKEN', 'test-callback-token-1234567890')
os.environ.setdefault('API_KEY', 'test-api-key-1234567890')
os.environ.setdefault('TEST_BYPASS_AUTH', 'True')
os.environ.setdefault('MOCK_EXECUTION', 'True')
os.environ.setdefault('SONARQUBE_TOKEN', 'test-sonar-token-1234567890')

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest

from app.core.db import engine, Base, SessionLocal
from app.models.db_models import ScanDB, ProjectDB
from app.state.scan_state import ScanState
from app.services import scan_recovery


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def _create_stuck_scan(build_number="42"):
    with SessionLocal() as db:
        db.add(ProjectDB(project_id="proj-a", name="Project A"))
        db.add(ScanDB(
            scan_id="scan-stuck", project_id="proj-a", scan_mode="automated",
            state=ScanState.RUNNING, selected_stages=[], stage_results=[], callback_digests=[],
            jenkins_build_number=build_number, timeout_seconds=5,
            started_at=datetime.now(timezone.utc) - timedelta(seconds=100),
        ))
        db.commit()


def test_recover_stuck_scans_requests_jenkins_abort():
    _create_stuck_scan(build_number="42")

    with patch.object(scan_recovery.JenkinsClient, "stop_build") as mock_stop:
        recovered = scan_recovery.recover_stuck_scans()

    assert recovered == 1
    mock_stop.assert_called_once_with("Security-pipeline", 42)

    with SessionLocal() as db:
        scan = db.query(ScanDB).filter(ScanDB.scan_id == "scan-stuck").first()
        assert scan.state == ScanState.FAILED


def test_recover_stuck_scans_still_completes_if_jenkins_abort_fails():
    _create_stuck_scan(build_number="42")

    with patch.object(scan_recovery.JenkinsClient, "stop_build", side_effect=Exception("network down")):
        recovered = scan_recovery.recover_stuck_scans()

    # Best-effort: a failed Jenkins abort must not block the DB-side recovery.
    assert recovered == 1
    with SessionLocal() as db:
        scan = db.query(ScanDB).filter(ScanDB.scan_id == "scan-stuck").first()
        assert scan.state == ScanState.FAILED


def test_recover_stuck_scans_skips_jenkins_call_when_no_build_number():
    _create_stuck_scan(build_number=None)

    with patch.object(scan_recovery.JenkinsClient, "stop_build") as mock_stop:
        recovered = scan_recovery.recover_stuck_scans()

    assert recovered == 1
    mock_stop.assert_not_called()
