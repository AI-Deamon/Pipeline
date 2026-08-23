"""Regression test for finding #96: cache invalidation used to fire at flush time,
before the caller's later db.commit() — a concurrent read could repopulate the cache
with pre-update data in that window, which then survived past the commit with nothing
left to invalidate it. invalidate_after_commit() defers to a real after_commit hook.
"""

import os

os.environ.setdefault('ENV', 'test')
os.environ.setdefault('DATABASE_URL', 'sqlite:///test_cache_invalidation_timing.db')
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

from app.core.db import SessionLocal
from app.services import cache


def test_invalidation_does_not_fire_before_commit(monkeypatch):
    calls = []
    monkeypatch.setattr(cache, "cache_delete", lambda key: calls.append(("delete", key)))
    monkeypatch.setattr(cache, "cache_delete_pattern", lambda pattern: calls.append(("pattern", pattern)))

    with SessionLocal() as session:
        cache.invalidate_after_commit(session, key="issue:1")
        assert calls == []  # must not have fired yet, even though it's queued

        session.commit()
        assert calls == [("delete", "issue:1")]


def test_invalidation_does_not_fire_on_rollback(monkeypatch):
    calls = []
    monkeypatch.setattr(cache, "cache_delete", lambda key: calls.append(("delete", key)))

    with SessionLocal() as session:
        cache.invalidate_after_commit(session, key="issue:2")
        session.rollback()
        assert calls == []  # nothing actually changed, so nothing should invalidate


def test_multiple_invalidations_in_one_transaction_all_fire_together(monkeypatch):
    calls = []
    monkeypatch.setattr(cache, "cache_delete", lambda key: calls.append(("delete", key)))
    monkeypatch.setattr(cache, "cache_delete_pattern", lambda pattern: calls.append(("pattern", pattern)))

    with SessionLocal() as session:
        cache.invalidate_after_commit(session, key="issue:3")
        cache.invalidate_after_commit(session, pattern="pending_verification:*")
        session.commit()

    assert ("delete", "issue:3") in calls
    assert ("pattern", "pending_verification:*") in calls
    assert len(calls) == 2
