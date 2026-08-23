"""Regression test for #123: poll_jenkins_for_active_scans polls every active
scan sequentially in one loop. An uncaught exception for one scan (any type not
already handled inside _handle_build_number_scan/_handle_queue_item_scan) must
not abort the sweep before the remaining candidate scans are checked.
"""
import os

os.environ.setdefault('ENV', 'test')
os.environ.setdefault('DATABASE_URL', 'sqlite:///test_poll_jenkins_sweep.db')
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


def _create_active_scan(scan_id, build_number):
    db = SessionLocal()
    if not db.query(ProjectDB).filter(ProjectDB.project_id == "proj-a").first():
        db.add(ProjectDB(project_id="proj-a", name="Project A"))
    db.add(ScanDB(
        scan_id=scan_id, project_id="proj-a", scan_mode="automated",
        state=ScanState.RUNNING, selected_stages=[], stage_results=[], callback_digests=[],
        jenkins_build_number=build_number,
    ))
    db.commit()
    db.close()


def test_one_scans_unexpected_exception_does_not_abort_the_sweep():
    _create_active_scan("scan-broken", "1")
    _create_active_scan("scan-healthy", "2")

    call_log = []

    def _flaky_get_build_status(job_name, build_number):
        call_log.append(build_number)
        if build_number == 1:
            raise AttributeError("simulated unexpected client bug")
        return {"building": False, "result": "SUCCESS"}

    with patch.object(scan_recovery.JenkinsClient, "get_build_status", side_effect=_flaky_get_build_status):
        with patch("app.services.scan_recovery._trigger_report_processing"):
            updated = scan_recovery.poll_jenkins_for_active_scans()

    # Both scans must have been checked despite scan-broken raising.
    assert set(call_log) == {1, 2}
    assert updated == 1

    db = SessionLocal()
    broken = db.query(ScanDB).filter(ScanDB.scan_id == "scan-broken").first()
    healthy = db.query(ScanDB).filter(ScanDB.scan_id == "scan-healthy").first()
    # scan-broken's poll failed and was skipped — state unchanged, not corrupted.
    assert broken.state == ScanState.RUNNING
    assert healthy.state == ScanState.COMPLETED
    db.close()
