"""Regression test for finding #90: safe_broadcast() called the async
ConnectionManager.broadcast_event() from sync code with no running event loop, so the
coroutine was created and immediately discarded, unawaited — the broadcast never
actually happened. Every caller (issues.py route handlers, the Celery task in
issue_tasks.py) is sync with no loop of its own, so asyncio.run() is the fix.
"""

import os

os.environ.setdefault('ENV', 'test')
os.environ.setdefault('DATABASE_URL', 'sqlite:///test_ws_broadcast.db')
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

from unittest.mock import AsyncMock

from app.websockets.manager import manager, safe_broadcast


def test_safe_broadcast_actually_awaits_broadcast_event(monkeypatch):
    mock_broadcast = AsyncMock()
    monkeypatch.setattr(manager, "broadcast_event", mock_broadcast)

    safe_broadcast("test_event", {"foo": "bar"})

    mock_broadcast.assert_awaited_once_with("test_event", {"foo": "bar"})


def test_safe_broadcast_swallows_and_logs_errors_without_raising(monkeypatch):
    async def _raises(*_args, **_kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(manager, "broadcast_event", _raises)

    # Must not raise — callers (a request handler mid-response, a Celery task) treat
    # broadcast failures as non-fatal.
    safe_broadcast("test_event", {"foo": "bar"})
