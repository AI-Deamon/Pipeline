"""Prometheus metrics for the issue resolution workflow."""

from prometheus_client import Counter, Gauge

RESCAN_REQUESTS_TOTAL = Counter(
    "rescan_requests_total",
    "Total rescan requests, labeled by status.",
    ["status"],
)

VERIFICATIONS_TOTAL = Counter(
    "verifications_total",
    "Total issue verifications, labeled by verdict.",
    ["verdict"],
)

PENDING_VERIFICATION_QUEUE_DEPTH = Gauge(
    "pending_verification_queue_depth",
    "Number of issues currently in pending_verification state.",
)
