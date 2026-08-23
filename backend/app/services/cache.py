"""Lightweight Redis cache helper for issue resolution endpoints.

Used to satisfy perf targets in the spec:
- `GET /issues/{id}` p95 < 200ms (60s TTL)
- `GET /issues/pending-verification` p95 < 500ms (5s TTL)

The client is created lazily to avoid import-time connection attempts in test env.
"""

from __future__ import annotations

import json
import os
from typing import Any, Optional

_client: Optional["redis.Redis"] = None


def _get_client() -> Optional["redis.Redis"]:
    global _client
    if _client is not None:
        return _client
    url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    try:
        import redis  # type: ignore
        _client = redis.Redis.from_url(url, socket_connect_timeout=1, socket_timeout=1)
        _client.ping()
        return _client
    except Exception:
        # Redis unavailable (e.g. test env); fall back to no-cache.
        _client = None
        return None


def cache_get(key: str) -> Optional[Any]:
    client = _get_client()
    if client is None:
        return None
    try:
        raw = client.get(key)
    except Exception:
        return None
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return None


def cache_set(key: str, value: Any, ttl_seconds: int) -> None:
    client = _get_client()
    if client is None:
        return
    try:
        client.setex(key, ttl_seconds, json.dumps(value, default=str))
    except Exception:
        return


def cache_delete(key: str) -> None:
    client = _get_client()
    if client is None:
        return
    try:
        client.delete(key)
    except Exception:
        return


def cache_delete_pattern(pattern: str) -> None:
    client = _get_client()
    if client is None:
        return
    try:
        for key in client.scan_iter(match=pattern, count=100):
            client.delete(key)
    except Exception:
        return


def invalidate_after_commit(session, key: str | None = None, pattern: str | None = None) -> None:
    """Queue a cache invalidation to run only once `session`'s transaction actually
    commits (finding #96).

    Calling cache_delete/cache_delete_pattern directly at flush-time — before the
    caller's later db.commit() — invalidates the cache while the DB write is still
    only visible inside this transaction. A concurrent request can hit the
    now-empty cache in that window, read the pre-update row under READ COMMITTED,
    and repopulate the cache with stale data that then survives the writer's commit
    for the rest of its TTL, with nothing left to invalidate it again. Deferring to
    an `after_commit` hook means the invalidation only fires once the new value is
    actually visible to a fresh read, closing that window.
    """
    pending = session.info.setdefault("_cache_invalidations", [])
    pending.append((key, pattern))

    if not session.info.get("_cache_invalidation_hooked"):
        from sqlalchemy import event

        def _flush_pending(sess):
            items = sess.info.pop("_cache_invalidations", [])
            for k, p in items:
                if k:
                    cache_delete(k)
                if p:
                    cache_delete_pattern(p)

        def _clear_pending(sess):
            sess.info.pop("_cache_invalidations", None)

        event.listen(session, "after_commit", _flush_pending)
        event.listen(session, "after_rollback", _clear_pending)
        session.info["_cache_invalidation_hooked"] = True
