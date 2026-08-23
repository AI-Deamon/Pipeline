"""Per-user rate limit for /request-rescan: 3 requests per hour.

Finding #5: this used to be an in-memory process-local dict, which only works
correctly for a single worker process — if the API or Celery ever scales to
multiple workers, each process gets its own bucket and the effective limit
silently becomes `3 * worker_count`/hour with no visible symptom. Redis is
already a live dependency for Celery/caching (see `app.services.cache`), so
this now uses a Redis sorted-set sliding window shared across every process,
with the original in-memory implementation kept as a fallback for
environments where Redis isn't reachable (matches the degrade-gracefully
pattern in `cache.py`).
"""

from __future__ import annotations

import time
from collections import defaultdict
from threading import Lock

from app.services.cache import _get_client

_BUCKETS: dict[str, list[float]] = defaultdict(list)
_LOCK = Lock()
_LIMIT = 3
_WINDOW_SECONDS = 3600

_LUA_CHECK = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
if count >= limit then
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local oldest_ts = now
    if #oldest > 0 then oldest_ts = tonumber(oldest[2]) end
    return {0, oldest_ts}
end
redis.call('ZADD', key, now, tostring(now))
redis.call('EXPIRE', key, window)
return {1, 0}
"""


def _evict_empty_buckets(now: float) -> None:
    """Drop buckets whose entries have all aged out.

    Called opportunistically from _check_in_memory(). Without this, _BUCKETS grows
    unbounded — one permanent entry per distinct user_id that ever requested a
    rescan — which is a slow memory leak in a long-lived worker/API process. Must
    hold _LOCK.
    """
    stale = [
        uid for uid, ts in _BUCKETS.items()
        if not ts or all(now - t >= _WINDOW_SECONDS for t in ts)
    ]
    for uid in stale:
        del _BUCKETS[uid]


def _check_in_memory(user_id: str) -> tuple[bool, int]:
    now = time.time()
    with _LOCK:
        bucket = _BUCKETS[user_id]
        bucket[:] = [t for t in bucket if now - t < _WINDOW_SECONDS]
        if len(bucket) >= _LIMIT:
            oldest = min(bucket)
            reset_in = int(_WINDOW_SECONDS - (now - oldest))
            return False, max(reset_in, 1)
        bucket.append(now)
        _evict_empty_buckets(now)
        return True, 0


def check(user_id: str) -> tuple[bool, int]:
    """Return (allowed, seconds_until_reset).

    `allowed` is True if the user is under the limit. `seconds_until_reset`
    is the number of seconds until the oldest entry expires (only meaningful
    when not allowed).
    """
    client = _get_client()
    if client is None:
        return _check_in_memory(user_id)

    now = time.time()
    key = f"rescan_rate:{user_id}"
    try:
        allowed, oldest_ts = client.eval(
            _LUA_CHECK, 1, key, now, _WINDOW_SECONDS, _LIMIT
        )
    except Exception:
        return _check_in_memory(user_id)

    if not allowed:
        reset_in = int(_WINDOW_SECONDS - (now - float(oldest_ts)))
        return False, max(reset_in, 1)
    return True, 0


def reset(user_id: str) -> None:
    with _LOCK:
        _BUCKETS.pop(user_id, None)
    client = _get_client()
    if client is not None:
        try:
            client.delete(f"rescan_rate:{user_id}")
        except Exception:
            pass
