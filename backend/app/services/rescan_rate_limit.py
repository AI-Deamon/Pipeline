"""Per-user rate limit for /request-rescan: 3 requests per hour."""

from __future__ import annotations

import time
from collections import defaultdict
from threading import Lock

_BUCKETS: dict[str, list[float]] = defaultdict(list)
_LOCK = Lock()
_LIMIT = 3
_WINDOW_SECONDS = 3600


def check(user_id: str) -> tuple[bool, int]:
    """Return (allowed, seconds_until_reset).

    `allowed` is True if the user is under the limit. `seconds_until_reset`
    is the number of seconds until the oldest entry expires (only meaningful
    when not allowed).
    """
    now = time.time()
    with _LOCK:
        bucket = _BUCKETS[user_id]
        bucket[:] = [t for t in bucket if now - t < _WINDOW_SECONDS]
        if len(bucket) >= _LIMIT:
            oldest = min(bucket)
            reset_in = int(_WINDOW_SECONDS - (now - oldest))
            return False, max(reset_in, 1)
        bucket.append(now)
        return True, 0


def reset(user_id: str) -> None:
    with _LOCK:
        _BUCKETS.pop(user_id, None)
