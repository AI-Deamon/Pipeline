# Research: Phase 1 Audit Remediation

**Date**: 2026-07-13
**Feature**: Phase 1 Audit Remediation (FR-1 through FR-5)

---

## FR-1: Duplicate Scan Report Prevention

### Decision: PostgreSQL unique partial index + SQLAlchemy upsert pattern

**Rationale**: The `ScanReportDB` model (`backend/app/models/db_models.py:67-98`) currently has no unique constraint on `(scan_id, tool_name)`. The `fetch_and_process_tool` function (`backend/app/services/reporting/fetcher.py:81-119`) always does `db.add(report)` (INSERT). Multiple code paths can invoke this for the same scan/tool combination: callback COMPLETED, recovery `_trigger_report_processing`, manual `/retry-reports`, and Celery retries.

**Approach**: Add a composite unique index on `(scan_id, tool_name)` to the `ScanReportDB.__table_args__`. Replace the raw INSERT in `fetch_and_process_tool` with a delete-then-insert pattern inside the same transaction (effectively upsert). This is simpler than PostgreSQL's `ON CONFLICT` for SQLAlchemy ORM objects and handles the JSON column correctly.

**Alternatives considered**:
- `INSERT ... ON CONFLICT DO UPDATE` (PostgreSQL native upsert): Requires dropping to Core-level SQLAlchemy, loses ORM object creation benefits, and doesn't handle the JSON column merge cleanly.
- Application-level lock (Redis `SETNX`): Adds operational complexity and a Redis dependency for a problem PostgreSQL handles natively.
- Doing nothing (retry on IntegrityError): Already partially handled by the `except` block, but silently loses data instead of updating.

**Validation**: Trigger `process_scan_reports_task` twice for the same scan/tool. Assert exactly one `ScanReportDB` row exists with the latest data.

---

## FR-2: Background Task Time Limits

### Decision: Celery `task_time_limit` and `task_soft_time_limit` in `celery_app.conf`

**Rationale**: The Celery config (`backend/app/core/celery_app.py:16-23`) has no time limits. Tasks making slow/hung external calls (Jenkins, SonarQube) can block a worker indefinitely. Under concurrent scan load, this exhausts the worker pool.

**Approach**: Add `task_time_limit=600` (10 min hard kill) and `task_soft_time_limit=540` (9 min graceful exception) to `celery_app.conf.update()`. These are global defaults; individual tasks can override via `@task(time_limit=...)` if needed.

**Alternatives considered**:
- Per-task `time_limit` decorator: More granular but harder to maintain. Global defaults with per-task overrides is the standard Celery pattern.
- `worker_max_tasks_per_child`: Only addresses memory leaks, not hung tasks.
- `worker_max_memory_per_child`: Requires cgroup or resource monitoring; overkill for this use case.

**Validation**: Point a task at a deliberately-hanging mock endpoint (e.g., `httpbin.org/delay/9999`). Confirm the task is killed at 600s, not hanging forever.

---

## FR-3: Executive Dashboard Data Correctness

### Decision: Add `isError` handling using existing `ErrorDisplay` component; remove frontend risk-score duplication

**Rationale**: All four dashboard pages (`ExecutiveSummaryPage.tsx`, `PortfolioDashboardPage.tsx`, `TeamWorkloadPage.tsx`, `TrendAnalysisPage.tsx`) check `isLoading` but never `isError`. The `ErrorDisplay` component (`src/components/ui/ErrorDisplay.tsx:1-35`) already exists with message, code, and retry support.

**Approach**:
1. For each dashboard page, extract `isError` and `refetch` from `useQuery` calls. Render `<ErrorDisplay message="..." onRetry={refetch} />` when `isError` is true.
2. Guard the average risk score calculation against empty arrays (add `projectsWithRisk.length > 0` check).
3. Remove the duplicated frontend risk-score formula from `ExecutiveSummaryPage.tsx:74-77` and `PortfolioDashboardPage.tsx:389-392`. Instead, consume the risk score from the backend's `/reports/summary` response (assumption 5 in spec).
4. For trend indicators: compare current scan's risk score against the previous scan's risk score (fetched from the same summary endpoint). Display trend only when at least 2 scans exist within the last 30 days per the clarified spec.

**Alternatives considered**:
- Create a new `ErrorState` component: Unnecessary — `ErrorDisplay` already has the exact interface needed (message, code, onRetry).
- Use React Query's `useErrorBoundary`: Would require wrapping each page in an error boundary, which is heavier than inline error display.
- Keep frontend risk-score formula but sync with backend: Creates drift risk; removing it entirely is simpler.

**Validation**: Mock the summary API to reject. Confirm `ErrorDisplay` renders with retry button. Mock empty project list. Confirm risk score shows empty state, not `NaN`.

---

## FR-4: Authentication Token Security

### Decision: httpOnly cookie (`SameSite=Lax`) for JWT + session-only refresh token + 24-hour migration grace period

**Rationale**: Currently, the JWT (7-day lifetime) is stored in `sessionStorage` (`src/hooks/useAuth.tsx:41`) and read by the axios request interceptor (`src/services/api.ts:15-28`). The login endpoint (`backend/app/api/auth.py:69-87`) returns the token in the JSON response body. The `security.py` module (`backend/app/core/security.py:12-23`) sets `ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7`.

**Approach**:
1. **Backend**: Change `ACCESS_TOKEN_EXPIRE_MINUTES` from `60 * 24 * 7` to `60` (1 hour). Add new settings: `COOKIE_NAME`, `COOKIE_MAX_AGE`, `REFRESH_TOKEN_MAX_AGE` (session-only = 0, meaning browser session).
2. **Backend login endpoint**: After creating the access token, set it as an httpOnly cookie (`Set-Cookie: access_token=...; HttpOnly; SameSite=Lax; Path=/`) in addition to returning it in the JSON body (for the 24-hour grace period).
3. **Backend**: Add a `POST /auth/refresh` endpoint that reads the refresh token from a session cookie and issues a new access token cookie. The refresh token is session-only (destroyed on browser close).
4. **Frontend**: Remove `sessionStorage.getItem('token')` reads from `api.ts` interceptor. The browser automatically sends httpOnly cookies — no manual header injection needed.
5. **Frontend useAuth**: Remove the 60-second expiry polling loop. Token expiry is now handled by the cookie's `Max-Age`. Add a `refreshToken()` function that calls `POST /auth/refresh`.
6. **Migration grace period**: For 24 hours after deploy, the login endpoint also returns the token in the JSON body (existing behavior). The frontend interceptor checks for the cookie first, falls back to `sessionStorage` header injection. After 24 hours, remove the fallback.
7. **SettingsPage**: Remove the API key display/input section for end-user flows. Server-to-server integrations (Jenkins) continue to use the API key via backend env var only.

**Alternatives considered**:
- Short-lived token + refresh token rotation: More secure but heavier; session-only refresh is sufficient for this application's threat model.
- Store JWT in `localStorage`: Still accessible to XSS — no security improvement over `sessionStorage`.
- Backend-only session store: Requires server-side session state, breaking the stateless JWT model.

**Validation**: After migration, confirm `document.cookie` does not expose the access token. Confirm a stored XSS payload cannot read the token. Confirm the 24-hour grace period works (both paths accepted). Confirm session-only refresh: closing the browser destroys the refresh token.

---

## FR-5: Project List API Performance and Pagination

### Decision: Batch-fetch last scan data; add `limit`/`offset` pagination to `list_projects`

**Rationale**: `list_projects` (`backend/app/api/projects.py:124-132`) has two N+1 patterns:
1. `_build_project_list` (line 100-121): One `db.query(ScanDB)` per project to get last scan details.
2. `_expire_active_scans` (line 79-97): One `db.query(ScanDB)` per active project to find the active scan.

The `_get_last_scan_map` helper (line 56-76) already does a batched GROUP BY + self-join to find the latest scan per project, but it's only used to get the `scan_id` — the actual scan details are then fetched one-by-one.

**Approach**:
1. Extend `_get_last_scan_map` to return full scan objects (or a dict of `project_id → ScanDB`), not just `scan_id`. Use the existing subquery pattern but join to get all needed columns.
2. Replace the per-project query in `_build_project_list` with a lookup into the pre-fetched map.
3. Batch `_expire_active_scans`: collect all active project IDs, do a single `WHERE project_id IN (...)` query to find all active scans, then process in Python.
4. Add `limit` and `offset` query parameters to `list_projects`. Default `limit=25`, configurable up to 100. Return a response envelope with `{ items: [...], total: N, page: 1, page_size: 25, total_pages: N }`.
5. The frontend projects page must pass `limit` and `offset` (or `page`) params and handle the paginated response shape.

**Alternatives considered**:
- Cursor-based pagination: More complex, better for infinite scroll. Offset-based is simpler and sufficient for a project list with < 10k items.
- DataLoader pattern: Python doesn't have a direct equivalent; batch queries achieve the same result.
- Adding a materialized view: Overkill for this scale; batch queries are sufficient.

**Validation**: Seed 200 projects in a test DB. Hit `GET /projects?page=1&page_size=25`. Assert total queries ≤ 5 (not 200+). Assert response time < 2s. Assert `total_pages` is correct.

---

## Cross-Cutting: Testing Strategy

Each FR requires:
- **Backend**: pytest test in `tests/` covering the happy path, edge cases, and failure modes.
- **Frontend**: Vitest test covering the component rendering under error/empty/loading states.
- **Integration**: At least one test per FR that exercises the full flow (e.g., API → DB → response).

Test files:
- `tests/test_scan_report_dedup.py` (FR-1)
- `tests/test_celery_timeouts.py` (FR-2)
- `tests/test_auth_cookie.py` (FR-4)
- `tests/test_projects_pagination.py` (FR-5)
- `src/tests/pages/ExecutiveSummaryPage.test.tsx` (FR-3, extend existing)
- `src/tests/pages/PortfolioDashboardPage.test.tsx` (FR-3, new)
