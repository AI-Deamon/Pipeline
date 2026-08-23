"""Regression test for finding #95: update_with_version_check previously checked
record.version in Python and then issued a plain `UPDATE ... WHERE id=:id` with no
version guard — two concurrent requests both reading the same version could both pass
the check and both flush successfully, silently losing one's changes with no 409 ever
raised. This simulates the real race with two separate DB sessions (matching how two
concurrent HTTP requests would each get their own session), not just a mocked check.
"""

import os

os.environ.setdefault('ENV', 'test')
os.environ.setdefault('DATABASE_URL', 'sqlite:///test_rescan_version_cas.db')
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

from app.core.db import engine, Base, SessionLocal
from app.models.db_models import IssueDB, RescanRequestDB
from app.services import rescan_service


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def rescan_id():
    with SessionLocal() as session:
        issue = IssueDB(
            issue_id="ISSUE-CAS-1", project_id="proj-a", tool_name="sonar",
            severity="High", title="Test issue", status="fixed",
        )
        session.add(issue)
        session.flush()
        record = rescan_service.create_request(
            session, issue.id, requested_by="dev-1", fix_note="fixed it",
        )
        session.commit()
        return record.id


class TestRescanVersionCAS:
    def test_stale_version_is_rejected_not_silently_overwritten(self, rescan_id):
        # Two independent sessions, simulating two concurrent HTTP requests each
        # reading the record at version=0.
        session_a = SessionLocal()
        session_b = SessionLocal()
        try:
            record_a = rescan_service.find_by_id(session_a, rescan_id)
            record_b = rescan_service.find_by_id(session_b, rescan_id)
            assert record_a.version == 0
            assert record_b.version == 0

            # Request A wins the race: updates and commits first.
            rescan_service.update_with_version_check(
                session_a, record_a, 0, fix_note="A's edit"
            )
            session_a.commit()

            # Request B, still holding the stale version=0 it read earlier, must be
            # rejected — not silently overwrite A's committed change.
            with pytest.raises(rescan_service.RescanVersionConflict):
                rescan_service.update_with_version_check(
                    session_b, record_b, 0, fix_note="B's edit"
                )
            session_b.rollback()
        finally:
            session_a.close()
            session_b.close()

        # A's edit must have actually persisted, undisturbed by B's failed attempt.
        with SessionLocal() as verify_session:
            final = rescan_service.find_by_id(verify_session, rescan_id)
            assert final.fix_note == "A's edit"
            assert final.version == 1

    def test_matching_version_succeeds_and_bumps_version(self, rescan_id):
        with SessionLocal() as session:
            record = rescan_service.find_by_id(session, rescan_id)
            updated = rescan_service.update_with_version_check(
                session, record, 0, fix_note="updated"
            )
            session.commit()
            assert updated.fix_note == "updated"
            assert updated.version == 1
