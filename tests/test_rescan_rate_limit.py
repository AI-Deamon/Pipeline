"""Regression test for #5: rescan rate limiter was in-memory/single-process
only, so it silently became `3 * worker_count`/hour with multiple processes.
Now backed by Redis (shared across processes) with in-memory fallback.
"""
import os

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("JENKINS_BASE_URL", "http://jenkins.test")
os.environ.setdefault("STORAGE_PATH", "/tmp/sentinel-test-storage")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret")
os.environ.setdefault("ENVIRONMENT", "test")

import importlib

import pytest

from app.services import cache as cache_module
from app.services import rescan_rate_limit


def _redis_available() -> bool:
    client = cache_module._get_client()
    return client is not None


class TestInMemoryFallback:
    def test_allows_up_to_limit_then_blocks(self):
        rescan_rate_limit.reset("user-a")
        for _ in range(3):
            allowed, _ = rescan_rate_limit._check_in_memory("user-a")
            assert allowed
        allowed, reset_in = rescan_rate_limit._check_in_memory("user-a")
        assert not allowed
        assert reset_in > 0
        rescan_rate_limit.reset("user-a")


@pytest.mark.skipif(not _redis_available(), reason="Redis not reachable in this env")
class TestRedisBackedSharedAcrossProcesses:
    def test_limit_shared_across_separate_client_instances(self):
        """Simulates two separate worker processes sharing rate-limit state via
        Redis: each 'process' uses its own client handle but reads/writes the
        same key, proving the limit is no longer per-process."""
        rescan_rate_limit.reset("user-shared")

        # First "process" uses 2 of the 3 allowed requests.
        for _ in range(2):
            allowed, _ = rescan_rate_limit.check("user-shared")
            assert allowed

        # A second "process" (fresh Redis client, same backing store) should
        # only get 1 more before being blocked — not its own separate quota.
        cache_module._client = None
        allowed, _ = rescan_rate_limit.check("user-shared")
        assert allowed
        allowed, reset_in = rescan_rate_limit.check("user-shared")
        assert not allowed
        assert reset_in > 0

        rescan_rate_limit.reset("user-shared")
