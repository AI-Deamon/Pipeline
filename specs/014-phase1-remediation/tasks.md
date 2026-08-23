# Tasks: Phase 1 Audit Remediation

**Input**: Design documents from `/specs/014-phase1-remediation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api-changes.md, quickstart.md

**Tests**: Included for each user story (constitution Principle 4 requires verification gate).

**Organization**: Tasks grouped by functional requirement (user story) to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US5)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Database migration and configuration changes that all stories depend on

- [x] T001 Add unique composite index on `(scan_id, tool_name)` to `ScanReportDB` in `backend/app/models/db_models.py` — add `Index('ix_scan_reports_scan_tool', 'scan_id', 'tool_name', unique=True)` to `__table_args__`
- [x] T002 [P] Add cookie and refresh token settings to `backend/app/core/config.py` — new fields: `COOKIE_NAME: str = "access_token"`, `REFRESH_COOKIE_NAME: str = "refresh_token"`, `COOKIE_MAX_AGE: int = 3600`, `COOKIE_SECURE: bool` (True in staging, False in dev/test)
- [x] T003 [P] Add `task_time_limit` and `task_soft_time_limit` to Celery config in `backend/app/core/celery_app.py` — set `task_time_limit=600`, `task_soft_time_limit=540` in `celery_app.conf.update()`

**Checkpoint**: Infrastructure ready — database constraint applied, config updated, Celery configured.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend auth changes that FR-4 depends on and that other stories may interact with

- [x] T004 Change `ACCESS_TOKEN_EXPIRE_MINUTES` from `60 * 24 * 7` to `60` in `backend/app/core/security.py`
- [x] T005 [P] Add `create_refresh_token(data: dict) -> str` function in `backend/app/core/security.py` — session-only token with no expiry claim (or very long expiry that browser destruction handles)
- [x] T006 [P] Add cookie-setting helper in `backend/app/api/auth.py` — function `set_auth_cookies(response, access_token, refresh_token)` that sets both httpOnly cookies with correct `SameSite=Lax`, `Path`, `Max-Age`, and conditional `Secure` flag based on `settings.ENV`

**Checkpoint**: Auth primitives ready — stories can now implement their specific changes.

---

## Phase 3: User Story 1 — Duplicate Scan Report Prevention (FR-1, P1)

**Goal**: Ensure each `(scan_id, tool_name)` combination has exactly one report record. Concurrent fetches replace instead of duplicating.

**Independent Test**: Trigger `process_scan_reports_task` twice for the same scan/tool. Assert exactly one `ScanReportDB` row exists with the latest data.

### Implementation for User Story 1

- [x] T007 [US1] Replace INSERT with upsert pattern in `backend/app/services/reporting/fetcher.py` `fetch_and_process_tool` — delete existing row for `(scan_id, tool_name)` before inserting new row, inside the same transaction
- [x] T008 [US1] Add pytest test in `tests/test_scan_report_dedup.py` — test: insert report, insert again with same `(scan_id, tool_name)`, assert count=1 and data is latest; test: concurrent inserts for different `(scan_id, tool_name)` both succeed

**Checkpoint**: FR-1 complete — scan reports are deduplicated. Can be tested independently.

---

## Phase 4: User Story 2 — Background Task Time Limits (FR-2, P2)

**Goal**: All Celery tasks have configurable hard/soft time limits. Hung workers are freed automatically.

**Independent Test**: Verify `celery_app.conf.task_time_limit == 600` and `task_soft_time_limit == 540`. Point a task at a hanging mock; confirm it's killed within the timeout.

### Implementation for User Story 2

- [x] T009 [US2] Add pytest test in `tests/test_celery_timeouts.py` — test: import `celery_app`, assert `task_time_limit` and `task_soft_time_limit` are set to expected values; test: verify config is overridable per-task via decorator

**Checkpoint**: FR-2 complete — Celery time limits configured and verified.

---

## Phase 5: User Story 3 — Executive Dashboard Data Correctness (FR-3, P3)

**Goal**: All four dashboard pages show errors (not silent failures), never display `NaN`, show trend indicators only with real data, and use backend-sourced risk scores.

**Independent Test**: Mock the summary API to reject — confirm `ErrorDisplay` renders. Mock empty project list — confirm no `NaN`. Mock single-scan project — confirm trend indicator hidden.

### Implementation for User Story 3

- [x] T010 [P] [US3] Add `isError` and `refetch` handling to `src/pages/ExecutiveSummaryPage.tsx` — extract from `useQuery`, render `<ErrorDisplay message="Couldn't load executive summary data." onRetry={refetch} />` when `isError` is true
- [x] T011 [P] [US3] Fix `NaN` risk score in `src/pages/ExecutiveSummaryPage.tsx` — guard `projectsWithRisk.length > 0` before computing average; render empty state ("—") when length is 0
- [x] T012 [P] [US3] Add `isError` and `refetch` handling to `src/pages/PortfolioDashboardPage.tsx` — same pattern as T010
- [x] T013 [P] [US3] Add `isError` and `refetch` handling to `src/pages/TeamWorkloadPage.tsx` — same pattern as T010
- [x] T014 [P] [US3] Add `isError` and `refetch` handling to `src/pages/TrendAnalysisPage.tsx` — same pattern as T010
- [x] T015 [US3] Remove duplicated frontend risk-score formula from `src/pages/ExecutiveSummaryPage.tsx` (lines 74-77) and `src/pages/PortfolioDashboardPage.tsx` (lines 389-392) — consume risk score from backend `/reports/summary` response instead
- [x] T016 [US3] Fix trend indicators in `src/pages/ExecutiveSummaryPage.tsx` and `src/pages/PortfolioDashboardPage.tsx` — compare current vs previous scan risk score from backend data; display trend only when ≥2 scans exist within 30 days; hide otherwise
- [x] T017 [US3] Add Vitest test in `src/tests/pages/ExecutiveSummaryPage.test.tsx` — test: mock API reject → `ErrorDisplay` renders; test: mock empty projects → no `NaN`; test: mock single-scan project → trend hidden

**Checkpoint**: FR-3 complete — all four dashboards handle errors, show valid data, and display real trends.

---

## Phase 6: User Story 4 — Authentication Token Security (FR-4, P4)

**Goal**: Tokens move to httpOnly cookies. Access tokens last 1 hour. Refresh tokens are session-only. Shared API key retired from browser. 24-hour migration grace period.

**Independent Test**: Login returns `Set-Cookie` headers. `document.cookie` does not expose `access_token`. `POST /auth/refresh` issues new access token cookie. Settings page no longer shows API key input.

### Implementation for User Story 4

- [x] T018 [US4] Modify login endpoint in `backend/app/api/auth.py` `login_for_access_token` — after creating tokens, call `set_auth_cookies(response, access_token, refresh_token)` to set httpOnly cookies; still return `access_token` in JSON body for grace period
- [x] T019 [US4] Add `POST /auth/refresh` endpoint in `backend/app/api/auth.py` — read refresh token from cookie, validate, issue new access token cookie; return 401 if refresh token invalid
- [x] T020 [US4] Add pytest test in `tests/test_auth_cookie.py` — test: login returns Set-Cookie headers with correct attributes; test: refresh endpoint issues new access token; test: refresh with invalid token returns 401
- [x] T021 [P] [US4] Remove `sessionStorage.getItem('token')` reads from `src/services/api.ts` request interceptor — browser sends httpOnly cookies automatically; remove manual `Authorization` header injection for cookie path
- [x] T022 [P] [US4] Update `src/hooks/useAuth.tsx` — remove 60-second expiry polling loop; add `refreshToken()` function calling `POST /auth/refresh`; handle 401 from refresh as session expiry → redirect to login
- [x] T023 [US4] Remove API key display/input section from `src/pages/SettingsPage.tsx` — remove the API key form (lines 71-116), keep other settings; server-to-server Jenkins integration continues to use env var
- [x] T024 [US4] Add 24-hour grace period fallback in `src/services/api.ts` — check for cookie first; fall back to `sessionStorage` header injection if cookie not present; log deprecation warning

**Checkpoint**: FR-4 complete — tokens are in httpOnly cookies, refresh works, API key removed from browser.

---

## Phase 7: User Story 5 — Project List API Performance and Pagination (FR-5, P5)

**Goal**: `GET /projects` returns paginated results (25/page default) with batch queries. Response time < 2s for 500 projects.

**Independent Test**: Seed 200 projects. Hit `GET /projects?page=1&page_size=25`. Assert ≤ 5 DB queries. Assert response contains `items`, `total`, `page`, `page_size`, `total_pages`. Assert response time < 2s.

### Implementation for User Story 5

- [x] T025 [US5] Extend `_get_last_scan_map` in `backend/app/api/projects.py` — return full scan objects (not just `scan_id`) by joining all needed columns in the existing subquery pattern
- [x] T026 [US5] Refactor `_build_project_list` in `backend/app/api/projects.py` — replace per-project `db.query(ScanDB)` with lookup into pre-fetched scan map from T025
- [x] T027 [US5] Batch `_expire_active_scans` in `backend/app/api/projects.py` — collect active project IDs, single `WHERE project_id IN (...)` query, process in Python
- [x] T028 [US5] Add pagination to `list_projects` in `backend/app/api/projects.py` — accept `page: int = 1`, `page_size: int = 25` query params; compute `offset`; apply `LIMIT/OFFSET` to project query; wrap response in `{ items, total, page, page_size, total_pages }` envelope
- [x] T029 [US5] Update frontend projects page to pass `page` and `page_size` params and handle paginated response shape — read `.items` instead of treating response as array
- [x] T030 [US5] Add empty state for zero projects in frontend projects page — render explicit "No projects found" message when `items` is empty
- [x] T031 [US5] Add pytest test in `tests/test_projects_pagination.py` — test: first page returns correct `items` count and pagination metadata; test: second page returns next set; test: empty result set returns correct `total_pages: 0`

**Checkpoint**: FR-5 complete — projects API is paginated, N+1 eliminated, response < 2s.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final verification, cleanup, and documentation

- [x] T032 Run verification gate: `npm run lint && npm run build && npx vitest run && pytest tests/`
- [x] T033 Run quickstart.md verification commands from `specs/014-phase1-remediation/quickstart.md` — validate FR-1 through FR-5 manually
- [x] T034 [P] Update `docs/TROUBLESHOOTING_AND_KNOWN_ISSUES.md` — add entries for new auth cookie behavior, pagination response shape, and Celery timeout configuration

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — can start immediately
- **Phase 2 (Foundational)**: Depends on T001-T003 (Setup) — BLOCKS US4
- **Phase 3 (US1)**: Depends on T001 (unique index) — independent of other stories
- **Phase 4 (US2)**: Depends on T003 (Celery config) — independent of other stories
- **Phase 5 (US3)**: No backend dependencies — independent of other stories
- **Phase 6 (US4)**: Depends on T002-T006 (config + auth primitives) — independent of other stories
- **Phase 7 (US5)**: No dependencies on other stories — independent
- **Phase 8 (Polish)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (FR-1)**: Can start after T001 — no dependencies on other stories
- **US2 (FR-2)**: Can start after T003 — no dependencies on other stories
- **US3 (FR-3)**: Can start immediately — pure frontend, no backend deps
- **US4 (FR-4)**: Can start after Phase 2 (T004-T006) — no dependencies on other stories
- **US5 (FR-5)**: Can start immediately — independent of other stories

### Within Each User Story

- Models/schema changes before services
- Services before endpoints
- Endpoints before frontend integration
- Tests written alongside implementation (TDD where applicable)
- Story complete before moving to next priority

### Parallel Opportunities

- **Phase 1**: T002 and T003 can run in parallel (different files)
- **Phase 5 (US3)**: T010-T014 can all run in parallel (different page files)
- **Phase 6 (US4)**: T021 and T022 can run in parallel (different files)
- **Across stories**: US1, US2, US3, and US5 can all start in parallel after Phase 1+2 complete
- **Full parallel**: US3 has zero backend dependencies and can start immediately

---

## Parallel Example: User Story 3

```bash
# Launch all dashboard error-handling tasks in parallel:
Task: "Add isError handling to ExecutiveSummaryPage.tsx"
Task: "Add isError handling to PortfolioDashboardPage.tsx"
Task: "Add isError handling to TeamWorkloadPage.tsx"
Task: "Add isError handling to TrendAnalysisPage.tsx"

# Then sequential: fix NaN, remove duplication, fix trends, add tests
```

---

## Implementation Strategy

### MVP First (US1 + US2 — Highest Impact)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 3: US1 — Scan report dedup (T007-T008)
3. Complete Phase 4: US2 — Celery timeouts (T009)
4. **STOP and VALIDATE**: Run quickstart verification for FR-1 and FR-2
5. These two fixes address the highest-risk audit findings (data integrity + worker starvation)

### Incremental Delivery

1. Setup + Foundational → Infrastructure ready
2. Add US1 + US2 → Test independently → Deploy (highest-risk fixes)
3. Add US3 → Test independently → Deploy (dashboard correctness)
4. Add US4 → Test independently → Deploy (security hardening)
5. Add US5 → Test independently → Deploy (performance)
6. Each story adds value without breaking previous stories

### Full Delivery

1. All phases complete
2. Run verification gate (T032)
3. Run quickstart validation (T033)
4. Update docs (T034)
5. **DONE**: All five audit findings remediated

---

## Notes

- [P] tasks = different files, no dependencies — safe to parallelize
- [Story] label maps task to specific FR for traceability
- Each user story is independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- The 24-hour grace period for FR-4 is a deployment concern, not a code concern — both paths are implemented from day one
