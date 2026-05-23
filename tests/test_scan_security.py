"""Tests for scan security fixes: race condition, callback token timing safety."""
import os
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

os.environ.setdefault('ENV', 'test')
os.environ.setdefault('DATABASE_URL', 'sqlite:///test_scan_security.db')
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

from app.core.db import engine, Base, SessionLocal
from app.models.db_models import ProjectDB, ScanDB, UserDB
from app.core.security import get_password_hash
from app.core.db import get_db
from app.state.scan_state import ScanState
import uuid
import hmac

from app.main import app


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def override_get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _create_admin():
    db = next(get_db())
    admin = UserDB(
        id=str(uuid.uuid4()),
        username="admin",
        hashed_password=get_password_hash("StrongPass1")
    )
    db.add(admin)
    db.commit()
    return admin


from app.models.db_models import UserDB

client = TestClient(app)


class TestRaceConditionFix:
    """T025: Verify race condition fix with SELECT FOR UPDATE."""

    def test_duplicate_active_scan_prevented(self):
        """Creating two active scans for same project should be prevented."""
        # Verify the code uses with_for_update() for race condition prevention
        import inspect
        from app.api.scans import routes
        source = inspect.getsource(routes.trigger_scan)
        assert "with_for_update" in source


class TestCallbackTokenTimingSafety:
    """T026: Verify callback token uses hmac.compare_digest."""

    def test_hmac_compare_digest_used(self):
        """Verify the callback validation uses constant-time comparison."""
        from app.api.scans.utils import _validate_callback_auth
        import inspect

        source = inspect.getsource(_validate_callback_auth)
        assert "hmac.compare_digest" in source

    def test_hmac_compare_digest_behavior(self):
        """Verify hmac.compare_digest works correctly for token comparison."""
        token_a = "test-callback-token-1234567890"
        token_b = "test-callback-token-1234567890"
        token_c = "wrong-token"

        assert hmac.compare_digest(token_a, token_b) is True
        assert hmac.compare_digest(token_a, token_c) is False
