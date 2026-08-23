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

# Finding #18: a non-404 Jenkins polling error (500, timeout, TLS hiccup) previously
# only logged a warning with no operator-visible signal distinguishing "Jenkins is
# flaky" from "this scan is genuinely still running" — a scan could look stuck for an
# entire timeout window for either reason. The timeout-based recover_stuck_scans sweep
# is still the correctness backstop; this metric is purely for observability.
JENKINS_POLL_ERRORS_TOTAL = Counter(
    "jenkins_poll_errors_total",
    "Non-404 errors encountered while polling Jenkins for active-scan status, labeled by check type.",
    ["check_type"],
)
