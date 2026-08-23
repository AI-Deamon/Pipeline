# Specification: Phase 1 Audit Remediation

## Overview

Remediate five findings from the 2026-07-13 comprehensive application audit identified as Phase 1 priorities — items that must be completed within the first sprint to bring the platform closer to production readiness. These findings span data integrity, worker reliability, dashboard correctness, authentication security, and API performance.

## Background

A full-stack audit (dated 2026-07-13) scored the application at approximately 50/100 overall, with critical issues in security, code quality, and concurrency. Phase 0 fixes (XSS, auth rate-limiting, task chaining, callback locking) are assumed complete or in progress. Phase 1 addresses the next tier of high-impact items that directly affect data correctness, operational reliability, and user trust.

---

## User Scenarios & Testing

### Scenario 1: Duplicate scan reports do not inflate finding counts
**Actor:** Security analyst reviewing scan results  
**Flow:** Two report-fetch operations run for the same scan (e.g., a retry after partial failure, or a duplicate Jenkins callback). The system stores only one report per scan-tool combination, with the latest data.  
**Expected:** The Issues page shows the correct number of findings — no duplicates, no double-counted severity totals.  
**Edge case:** Concurrent report fetches for the same scan and tool arrive simultaneously.

### Scenario 2: Long-running background tasks do not block the worker pool
**Actor:** Platform operator monitoring Celery workers  
**Flow:** A Jenkins or external service becomes unresponsive during a scan. A background task that calls this service hangs.  
**Expected:** The task is terminated after a defined timeout, the worker is freed to process other tasks, and the failed task is retried (if retryable). No worker is permanently stuck.  
**Edge case:** Multiple tasks hang simultaneously against the same unresponsive service.

### Scenario 3: Executive dashboards always display valid data or clear errors
**Actor:** Security team lead reviewing the executive summary dashboard  
**Flow:** The dashboard loads. The backend report-summary service is available and returns data, OR the service is down/returns empty data.  
**Expected:** When data is available: risk scores are valid numbers (never "NaN"), trend indicators reflect real historical comparisons. When data is unavailable: a clear error state is shown with a retry option, not a misleading "all clear" or "NaN out of 100".  
**Edge case:** The project list is empty (zero projects). The risk score area shows an explicit empty state.

### Scenario 4: Authentication tokens are not readable by injected scripts
**Actor:** Any authenticated user browsing the application  
**Flow:** The user logs in and receives an authentication token. A malicious script (e.g., via a browser extension or a stored XSS in a non-remediated path) attempts to read the token from browser storage.  
**Expected:** The token is stored in a location that is not accessible to JavaScript (httpOnly cookie). The malicious script cannot exfiltrate the token. Token lifetime is shortened so that even if a token is somehow obtained, the window of exploitation is limited.  
**Edge case:** The user has an existing valid token when the migration deploys — both `sessionStorage` and cookie paths are accepted for 24 hours; after the grace period, only the cookie path is valid and the user must re-authenticate.

### Scenario 5: Listing projects remains fast as the project count grows
**Actor:** Developer navigating to the project list page  
**Flow:** The organization has 200+ projects. The developer opens the projects page.  
**Expected:** The page loads in under 2 seconds regardless of project count. Results are paginated (showing a configurable number per page). Only the data needed for the current page is fetched.  
**Edge case:** The user has access to zero projects — a meaningful empty state is shown.

---

## Functional Requirements

### FR-1: Duplicate Scan Report Prevention
- Each `(scan_id, tool_name)` combination must have at most one report record at any time.
- When a report fetch operation runs for an already-existing `(scan_id, tool_name)`, the existing record is replaced with the latest data, not duplicated.
- The system must handle concurrent report fetches for the same `(scan_id, tool_name)` without data corruption or IntegrityError failures.
- Existing reports from before this change continue to be readable; no data migration is required.

### FR-2: Background Task Time Limits
- All background processing tasks must have a configurable maximum execution time (hard limit).
- All background processing tasks must have a configurable soft limit that raises a recoverable exception before the hard limit, allowing graceful cleanup.
- Tasks terminated by the hard limit are marked as failed and retried according to their existing retry policy (if any).
- Tasks terminated by the soft limit may perform cleanup (e.g., releasing locks, rolling back partial state) before exiting.
- Time limits must be configurable without code changes (via configuration).

### FR-3: Executive Dashboard Data Correctness
- The executive summary dashboard must never display "NaN" or equivalent invalid numeric values for risk scores.
- When the project list is empty or all summary data is unavailable, the risk score area must display an explicit empty state message, not a computed value.
- All four new dashboard pages (Executive Summary, Portfolio, Team Workload, Trend Analysis) must detect and display fetch errors for their data sources, using a visible error state with a retry action.
- Trend indicators on dashboard pages must reflect actual historical comparisons, not single-snapshot approximations. A trend indicator is only displayed when at least 2 scans exist for the project within the last 30 days; otherwise it is hidden.
- The risk score displayed on dashboards must be sourced from the backend's authoritative computation, not re-calculated on the frontend.

### FR-4: Authentication Token Security
- Authentication tokens must not be stored in browser-accessible JavaScript storage (`sessionStorage`, `localStorage`).
- Tokens must be transmitted and stored via a mechanism that is not readable by page-level JavaScript (e.g., httpOnly cookie with `SameSite=Lax`).
- Token lifetime must be reduced from the current 7-day maximum to a shorter window appropriate for a security-sensitive application (target: 1 hour or less for access tokens).
- A refresh mechanism must be available so that users are not required to re-authenticate at the end of every short-lived token period during active use. Refresh tokens are session-only (destroyed when the browser closes); no persistent refresh token storage.
- The shared static API key model used for privileged actions in the browser must be retired for end-user flows. Server-to-server integrations (e.g., Jenkins callbacks) may retain a scoped key.

### FR-5: Project List API Performance and Pagination
- The `GET /projects` endpoint must return paginated results with a default page size of 25 and configurable page size and page number.
- The endpoint must not issue a database query per project (no N+1 pattern). All project-related data must be fetched in a bounded number of queries regardless of project count.
- Response time must remain under 2 seconds for up to 500 projects.
- Pagination metadata (total count, current page, total pages) must be included in the response.

---

## Success Criteria

| Criterion | Metric | Target |
|-----------|--------|--------|
| Duplicate reports | Duplicate `(scan_id, tool_name)` rows after concurrent fetches | 0 duplicates |
| Task hangs | Worker blocked by a single hung external call | 0 (task killed within configured timeout) |
| Dashboard NaN | Executive summary pages rendering "NaN" or invalid numeric values | 0 occurrences under any data condition |
| Dashboard error visibility | Dashboard pages showing silent failure (empty data) instead of explicit error state | 0 occurrences when backend is unreachable |
| Token exfiltration via XSS | Token readable by `document.cookie` or page-level JS | Not possible (httpOnly) |
| Token window | Maximum time a stolen access token remains valid | Under 60 minutes |
| Project list latency | Response time for 200 projects | Under 2 seconds |
| Project list queries | Number of database queries for 200 projects | Under 20 (constant, not linear) |

---

## Key Entities

- **ScanReport**: A record of a security scan tool's output for a given scan. Identified by `(scan_id, tool_name)`. Must be unique per combination.
- **Background Task (Celery)**: An asynchronous unit of work (report fetching, issue migration, cleanup). Has configurable execution limits.
- **Authentication Token (JWT)**: A time-limited credential issued on login. Currently stored in `sessionStorage`; must move to an inaccessible storage mechanism.
- **Refresh Token**: A session-scoped credential used to obtain new access tokens without re-authentication. Destroyed when the browser closes. Introduced as part of the token security improvement.
- **Project**: A tracked codebase being scanned. The project list endpoint must serve these efficiently with pagination.

---

## Clarifications

### Session 2026-07-13

- Q: How long should refresh tokens remain valid, and should they rotate on each use? → A: Session-only — browser close destroys the refresh token. No rotation needed; token lifetime equals browser session lifetime.
- Q: Which SameSite policy should the auth cookie use? → A: `SameSite=Lax` — blocks cross-site POST/iframes; allows top-level GET navigation (e.g., links from email, Slack, Jenkins).
- Q: When the cookie migration deploys, should existing `sessionStorage` tokens remain valid for a grace period? → A: 24-hour grace period — both `sessionStorage` and cookie paths accepted; old path removed after 24 hours.
- Q: What is the minimum data requirement for a trend indicator to be displayed? → A: At least 2 scans within the last 30 days — trend is hidden if insufficient recent data.
- Q: What should the default page size be for the project list? → A: 25 projects per page — configurable upward; balances fast load with manageable pagination.

---

## Assumptions

1. Phase 0 fixes (XSS sanitization, auth rate-limiting inversion, task chaining, callback row locking) are either complete or will be completed before Phase 1 items are deployed to production.
2. The existing Celery + Redis infrastructure supports task time limits without architectural changes.
3. The frontend already has an error-state component (`ErrorState` or similar) that can be reused across dashboard pages.
4. DOMPurify is already a project dependency (confirmed in audit) and can be used for any remaining sanitization needs.
5. The backend risk-calculation service already computes authoritative risk scores; Phase 1 requires only wiring the dashboards to consume these values rather than re-computing on the frontend.
6. The refresh-token flow is a new addition; the current system has no refresh mechanism. Refresh tokens are session-only (browser close destroys them).
7. The existing project list endpoint has no pagination; adding it is a backward-compatible change (default page size accommodates existing consumers).
8. The unique constraint on `(scan_id, tool_name)` does not require a data migration for existing rows, as audit confirmed existing data has no duplicates in practice (duplicates only arise from the concurrency bug being fixed).

---

## Out of Scope

- **Phase 0 items**: XSS fix, auth rate-limiting fix, task chaining, callback locking — tracked separately.
- **Phase 2+ items**: trigger-verify lock, per-scan timeout persistence, python-jose consolidation, group-aggregated dedup normalization, severity badge consolidation, rescan rate limiter eviction, bulk DELETE for cleanup, HTTP connection pooling, sonar rule cache scoping, SPA-level auth redirect.
- **Full RBAC redesign**: Replacing the shared API key with per-user scoped tokens is a larger effort beyond this sprint.
- **Frontend trend computation service**: Building a shared backend service for trend analysis is a longer-term investment.
- **Celery Beat recovery migration**: Moving from per-process recovery threads to a single-leader Celery Beat model is a separate architectural change.
