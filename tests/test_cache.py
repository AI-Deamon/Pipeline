"""Coverage test for #66: cache.py had zero test references anywhere despite
guarding cache-invalidation correctness (stale reads after issue state
changes are hard to catch by inspection). Covers both the Redis-available path
(run against a throwaway local redis-server, matching the pattern used in
tests/test_rescan_rate_limit.py) and the graceful no-Redis fallback path that
runs in the default test environment.
"""
import os

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("JENKINS_BASE_URL", "http://jenkins.test")
os.environ.setdefault("STORAGE_PATH", "/tmp/sentinel-test-storage")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret")
os.environ.setdefault("ENVIRONMENT", "test")

import pytest

from app.services import cache as cache_module


def _redis_available() -> bool:
    client = cache_module._get_client()
    return client is not None


class TestNoRedisGracefulFallback:
    """Default test env has no Redis reachable — every call must no-op safely,
    never raise, matching the module's documented degrade-gracefully contract."""

    def test_cache_get_returns_none_without_redis(self):
        assert cache_module.cache_get("some-key") is None

    def test_cache_set_does_not_raise_without_redis(self):
        cache_module.cache_set("some-key", {"a": 1}, ttl_seconds=60)  # must not raise

    def test_cache_delete_does_not_raise_without_redis(self):
        cache_module.cache_delete("some-key")  # must not raise

    def test_cache_delete_pattern_does_not_raise_without_redis(self):
        cache_module.cache_delete_pattern("some-*")  # must not raise


@pytest.mark.skipif(not _redis_available(), reason="Redis not reachable in this env")
class TestRedisBackedCache:
    def test_set_then_get_roundtrips_json(self):
        cache_module.cache_delete("test:roundtrip")
        cache_module.cache_set("test:roundtrip", {"issue_id": 42, "status": "fixed"}, ttl_seconds=60)
        assert cache_module.cache_get("test:roundtrip") == {"issue_id": 42, "status": "fixed"}
        cache_module.cache_delete("test:roundtrip")

    def test_get_returns_none_for_missing_key(self):
        cache_module.cache_delete("test:missing")
        assert cache_module.cache_get("test:missing") is None

    def test_delete_removes_the_key(self):
        cache_module.cache_set("test:to-delete", {"x": 1}, ttl_seconds=60)
        cache_module.cache_delete("test:to-delete")
        assert cache_module.cache_get("test:to-delete") is None

    def test_delete_pattern_removes_matching_keys_only(self):
        cache_module.cache_set("test:pattern:1", {"x": 1}, ttl_seconds=60)
        cache_module.cache_set("test:pattern:2", {"x": 2}, ttl_seconds=60)
        cache_module.cache_set("test:other", {"x": 3}, ttl_seconds=60)

        cache_module.cache_delete_pattern("test:pattern:*")

        assert cache_module.cache_get("test:pattern:1") is None
        assert cache_module.cache_get("test:pattern:2") is None
        assert cache_module.cache_get("test:other") == {"x": 3}
        cache_module.cache_delete("test:other")


@pytest.mark.skipif(not _redis_available(), reason="Redis not reachable in this env")
class TestInvalidateAfterCommit:
    """Finding #96: invalidation must only fire once the transaction actually
    commits, not at flush-time — otherwise a concurrent reader can repopulate
    the cache with stale data in the gap before the writer's commit."""

    def test_invalidation_does_not_fire_before_commit(self):
        from app.core.db import SessionLocal
        from app.models.db_models import ProjectDB

        cache_module.cache_set("test:invalidate-before-commit", {"stale": True}, ttl_seconds=60)

        db = SessionLocal()
        db.add(ProjectDB(project_id="proj-cache-test", name="Cache Test", status="ACTIVE"))
        cache_module.invalidate_after_commit(db, key="test:invalidate-before-commit")
        db.flush()

        # Not committed yet — cache must still hold the old value.
        assert cache_module.cache_get("test:invalidate-before-commit") == {"stale": True}

        db.commit()
        # Now committed — the after_commit hook must have fired.
        assert cache_module.cache_get("test:invalidate-before-commit") is None
        db.close()

    def test_invalidation_is_discarded_on_rollback(self):
        from app.core.db import SessionLocal
        from app.models.db_models import ProjectDB

        cache_module.cache_set("test:invalidate-rollback", {"still_here": True}, ttl_seconds=60)

        db = SessionLocal()
        db.add(ProjectDB(project_id="proj-cache-rollback", name="Cache Rollback", status="ACTIVE"))
        cache_module.invalidate_after_commit(db, key="test:invalidate-rollback")
        db.rollback()

        # Rolled back — the queued invalidation must never fire.
        assert cache_module.cache_get("test:invalidate-rollback") == {"still_here": True}
        cache_module.cache_delete("test:invalidate-rollback")
        db.close()
