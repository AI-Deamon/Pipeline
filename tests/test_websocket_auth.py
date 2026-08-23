"""Regression tests for finding #14: /ws/scans and /ws/dashboard had zero
authentication — anyone who could reach the backend could subscribe to live scan
data with no login. TEST_BYPASS_AUTH doesn't apply to the WebSocket auth helper
(it's a standalone JWT check, not routed through get_current_user), so these tests
don't need to disable it.
"""

import os

os.environ.setdefault('ENV', 'test')
os.environ.setdefault('DATABASE_URL', 'sqlite:///test_websocket_auth.db')
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
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.core.db import engine, Base, SessionLocal
from app.models.db_models import UserDB


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    if not db.query(UserDB).first():
        db.add(UserDB(id="admin-1", username="admin", role="admin", hashed_password="h"))
        db.commit()
    db.close()
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    from app.main import app
    return TestClient(app)


class TestWebSocketAuth:
    def test_scans_ws_rejects_no_credentials(self, client):
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/api/v1/ws/scans"):
                pass

    def test_dashboard_ws_rejects_no_credentials(self, client):
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/api/v1/ws/dashboard"):
                pass

    def test_scans_ws_rejects_invalid_token(self, client):
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/api/v1/ws/scans?token=not-a-real-jwt"):
                pass

    def test_scans_ws_accepts_valid_token(self, client):
        from app.core import security
        token = security.create_access_token({"sub": "admin"})
        with client.websocket_connect(f"/api/v1/ws/scans?token={token}") as ws:
            ws.send_text("ping")
            assert ws.receive_text() == "pong"

    def test_dashboard_ws_accepts_valid_cookie(self, client):
        from app.core import security
        from app.core.config import settings
        token = security.create_access_token({"sub": "admin"})
        client.cookies.set(settings.COOKIE_NAME, token)
        with client.websocket_connect("/api/v1/ws/dashboard") as ws:
            ws.send_text("ping")
            assert ws.receive_text() == "pong"
