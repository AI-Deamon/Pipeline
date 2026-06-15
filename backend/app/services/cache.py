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
