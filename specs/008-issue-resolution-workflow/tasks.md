# Tasks: Complete Issue Resolution Platform

**Input**: Design documents from `/specs/008-issue-resolution-workflow/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, quickstart.md
**Supersedes**: `004-unified-issue-tracker/tasks.md`, `007-sonarqube-enrichment/tasks.md`

## Legend
- `[SPEC004]` — already implemented, verified in spec 004
- `[SPEC005]` — already implemented, verified in spec 005
- `[P]` — can run in parallel (different files, no dependencies)
- `[US1..US7]` — user story label (mapped to spec's workflow stages)

## User Stories (from spec.md)

- **US1** — Issue Identification & Dashboarding (P1) — SonarQube data flows to dashboard with full details
- **US2** — Assignment (P1, already done in SPEC004) — user assigns issue to developer
- **US3** — Developer Deep-Dive (P1) — developer sees file path, line, code snippet
- **US4** — Fix & Rescan Request (P1) — dev marks fixed, requests TL review
- **US5** — Verification Queue (P2) — TL reviews, triggers verify scan
- **US6** — Rescan Edit/Cancel (P2) — dev edits fix note or cancels pending request
- **US7** — Observability, Performance & Caching (P3) — Prometheus metrics, Redis caching, rate limiting

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install new dependencies (prometheus-client, slowapi, react-syntax-highlighter).

- [X] T001 [P] Add `prometheus-client` to `backend/requirements.txt`
- [X] T002 [P] Add `slowapi` to `backend/requirements.txt` (already present)
- [X] T003 [P] Add `react-syntax-highlighter` to `package.json` dependencies
- [X] T004 Run `pip install -r backend/requirements.txt` and `npm install` to install new deps

**Checkpoint**: New dependencies available.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Parser enrichment + state machine — blocks US1 (dashboard) and US4 (rescan).

- [X] T005 [P] Add `line_number`, `file_path`, `effort`, `tags`, `sonar_status`, `sonar_resolution`, `code_snippet`, `code_snippet_language` fields to `SecurityFinding` dataclass in `backend/app/services/reporting/parsers/base.py`
- [X] T006 [P] Make `types` param dynamic — accept `issue_types` kwarg in `fetch_sonar_issues()` instead of hardcoded `BUG,VULNERABILITY` in `backend/app/services/reporting/parsers/sonar.py`
- [X] T007 Populate new fields in `fetch_sonar_issues()` in `backend/app/services/reporting/parsers/sonar.py` — extract `component`, `line`, `effort`, `tags`, `status`, `resolution` from SonarQube API response
- [X] T008 [P] Map new fields to IssueDB in `migrate_scan_to_issues()` — populate `IssueDB.location` (file_path + line_number as JSON), `IssueDB.effort`, `IssueDB.extra_metadata` (tags, status, resolution, code_snippet_language) in `backend/app/tasks/issue_tasks.py`
- [X] T009 [P] Add `code_snippet` column to `IssueDB` in `backend/app/models/db_models.py` — `Column(Text, nullable=True)`
- [X] T010 [P] Add `PENDING_VERIFICATION = "pending_verification"` to `IssueState` enum in `backend/app/state/issue_state.py`
- [X] T011 Add transitions to `backend/app/state/issue_state.py`:
  - `FIXED → PENDING_VERIFICATION` (dev requests rescan)
  - `PENDING_VERIFICATION → VERIFIED` (TL verifies manually OR auto-verify passes)
  - `PENDING_VERIFICATION → REJECTED` (TL rejects manually OR auto-verify fails)
  - `PENDING_VERIFICATION → IN_PROGRESS` (on rejection, dev can iterate without re-marking fixed)
- [X] T012 [P] Update `IssueService.transition_status()` in `backend/app/services/issue_service.py` to allow new transitions with validation (already uses is_valid_transition, no change needed)

**Checkpoint**: Parser returns full SonarQube payload. State machine supports the full resolution lifecycle.

---

## Phase 3: US1 — Issue Identification & Dashboarding (P1) 🎯 MVP

**Goal**: Dashboard shows enriched issue data (file path, line number, effort, tags).

**Independent Test**: Trigger a scan → verify IssueDB has `file_path`, `line_number`, `effort`, `tags`, `code_snippet`. View Tool Detail View → see enriched columns.

### Implementation for US1

- [X] T013 [P] [US1] Update `IssueResponse` schema in `backend/app/schemas/issue.py` to expose `file_path`, `line_number`, `effort`, `tags`, `code_snippet`, `code_snippet_language`, `git_url`
- [X] T014 [P] [US1] Add `file_path`, `line_number`, `effort` columns to the issue table in `src/pages/ToolDetailViewPage.tsx`
- [X] T015 [P] [US1] Add `SECURITY_HOTSPOT` option to `IssueTypeToggle.tsx`
- [X] T016 [US1] Update `get_project_overview()` in `backend/app/services/issue_service.py` to return `by_type` breakdown (bug/vulnerability/code_smell/security_hotspot) per tool
- [X] T017 [US1] Update `ToolCard.tsx` to render `by_type` breakdown
- [X] T018 [US1] Update `ProjectOverviewPage.tsx` to display `by_type` counts per tool card (already passes entire tool object to ToolCard, no change needed)

**Checkpoint**: Dashboard shows file paths, line numbers, effort, and 4-type breakdown.

---

## Phase 4: US3 — Developer Deep-Dive (P1)

**Goal**: Developer sees full technical context including the code that caused the issue.

**Independent Test**: Open an issue → see file path (clickable to Git), line number, code snippet with highlighted line, effort, tags, rule link.

### Implementation for US3

- [X] T019 [P] [US3] Implement `GET /api/v1/projects/{id}/code-snippet?file={path}&line={n}` in `backend/app/api/projects.py` — proxy to Git provider or local clone, return 20 lines of context
- [X] T020 [P] [US3] Create `CodeSnippet.tsx` component with syntax highlighting (use `react-syntax-highlighter`) in `src/components/CodeSnippet.tsx`
- [X] T021 [P] [US3] Expand `IssueDetailModal.tsx` — add file path (clickable to git_url), line number, effort badge, tags list, rule link
- [X] T022 [US3] Embed `CodeSnippet` in `IssueDetailModal.tsx` with the offending line highlighted in red
- [X] T023 [P] [US3] Add code snippet API method to `src/services/api.ts` — `projects.getCodeSnippet(projectId, { file, line, context })`
- [X] T024 [P] [US3] Add `RescanRequest` (frontend model) and `code_snippet` types to `src/types.ts`
- [X] T024a [P] [US4] Add WebSocket event payload types to `src/types.ts`:
  - `RescanRequestedEvent` — `{ issue_id, rescan_request_id, requested_by, project_id }`
  - `RescanApprovedEvent` — `{ issue_id, rescan_request_id, approved_by, scan_id }`
  - `RescanVerificationCompleteEvent` — `{ issue_id, rescan_request_id, verdict, scan_id, issue_still_present }`

**Checkpoint**: Developer deep-dive view works end-to-end.

---

## Phase 5: US4 — Fix & Rescan Request (P1)

**Goal**: Developer marks issue as fixed and submits a fix note for TL review.

**Independent Test**: Dev marks issue fixed → opens "Request Rescan" modal → enters fix note → submits → issue status `fixed → pending_verification`. Rate limited at 3/hour.

### Implementation for US4

- [X] T025 [P] [US4] Create `RescanRequestDB` model in `backend/app/models/db_models.py` — `id`, `issue_id` (FK CASCADE), `requested_by`, `fix_note`, `status`, `scan_id`, `verdict`, `reviewer_id`, `reviewer_note`, `version` (default 0, optimistic locking), timestamps
- [X] T026 [P] [US4] Create `RescanRequestCreate` and `RescanRequestResponse` Pydantic schemas in `backend/app/schemas/issue.py`
- [X] T027 [US4] Create `backend/app/services/rescan_service.py` — optimistic locking helpers, `create_request`, `update_with_version_check`, `cancel`
- [X] T028 [US4] Create `backend/app/services/fix_note_sanitizer.py` — regex match AWS keys, GitHub tokens, JWT tokens, passwords. Returns `(sanitized_text, raw_text, redaction_map)`
- [X] T029 [US4] Implement `POST /api/v1/issues/{id}/request-rescan` in `backend/app/api/issues.py` — create RescanRequestDB (apply sanitization), transition issue to `pending_verification`, increment `rescan_requests_total{status="pending"}` metric
- [X] T030 [US4] Add `can_request_rescan(issue)` method to `RbacService` in `backend/app/services/rbac_service.py` — admin: true, team_lead: scoped, developer: only if assignee
- [X] T031 [US4] Add rate limit middleware (slowapi) to `POST /issues/{id}/request-rescan` in `backend/app/api/issues.py` — 3/hour per user via Redis, return 429
- [X] T032 [P] [US4] Create `RescanRequestModal.tsx` in `src/components/RescanRequestModal.tsx` — textarea for fix note, submit button, validation
- [X] T033 [P] [US4] Add "Request Rescan" button in `IssueDetailModal.tsx` — opens `RescanRequestModal` when status is `fixed` and dev is assignee
- [X] T034 [US4] Add rescan API methods to `src/services/api.ts` — `issues.requestRescan`, `issues.editRescanRequest`, `issues.cancelRescanRequest` (depends on T023)
- [X] T035 [P] [US4] Add `useRescanRequest` hook in `src/hooks/useRescanRequest.ts` for PATCH/DELETE operations with optimistic locking

**Checkpoint**: Developer can request rescan with fix note. Rate limit enforced. Status transitions correctly.

---

## Phase 6: US5 — Verification Queue (P2)

**Goal**: User (admin/team_lead) sees pending rescans and triggers verify scan.

**Independent Test**: User opens Pending Verification page → sees fix notes grouped by project → clicks "Verify Now" → confirm modal → single-tool scan triggers.

### Implementation for US5

- [X] T036 [P] [US5] Implement `GET /api/v1/issues/pending-verification` in `backend/app/api/issues.py` — return all issues with pending rescan requests, grouped by project
- [X] T037 [P] [US5] Implement `POST /api/v1/issues/{id}/approve-rescan` in `backend/app/api/issues.py` — approve request (version check), trigger single-tool verify scan, set RescanRequestDB.status=approved
- [X] T038 [P] [US5] Implement `POST /api/v1/issues/{id}/trigger-verify-scan` in `backend/app/api/issues.py` — trigger single-tool rescan directly (non-approve path)
- [X] T039 [P] [US5] Add `can_approve_rescan(project_id)` method to `RbacService` — admin: true, team_lead: scoped, developer: false
- [X] T040 [US5] Create `PendingVerificationPage.tsx` in `src/pages/PendingVerificationPage.tsx` — issues grouped by project, FilterChips for project filter, RescanRequestCard components, calls `useRescanWebSocket` to subscribe to `rescan_requested`/`rescan_approved`/`rescan_verification_complete` events (depends on T047, T052)
- [X] T041 [P] [US5] Create `FilterChips.tsx` in `src/components/FilterChips.tsx` — project filter chips with pending count badges
- [X] T042 [P] [US5] Create `RescanRequestCard.tsx` in `src/components/RescanRequestCard.tsx` — issue title, severity, developer, fix note, Verify Now + Reject buttons
- [X] T043 [P] [US5] Create `EmptyState.tsx` in `src/components/EmptyState.tsx` — comprehensive empty/loading/error states per 3rd-pass clarification
- [X] T044 [US5] Add lazy-loaded route for `PendingVerificationPage` in `src/App.tsx`
- [X] T045 [US5] Add pending count badge to sidebar/nav in `src/App.tsx` — uses `useRescanQueue` hook
- [X] T046 [P] [US5] Add pending verification API methods to `src/services/api.ts` — `issues.getPendingVerification`, `issues.approveRescan`, `issues.triggerVerifyScan`
- [X] T047 [P] [US5] Add `useRescanQueue` hook in `src/hooks/useRescanQueue.ts` — TanStack Query with WebSocket invalidation

**Checkpoint**: User has a dedicated verification queue with project filter chips, comprehensive states.

---

## Phase 7: Auto-Verify & Single-Tool Verify Scan

**Purpose**: Trigger single-tool verify scan via Jenkins and wire callback to auto-verify.

- [X] T048 [P] Implement `POST /api/v1/scans/trigger-verify` in `backend/app/api/scans/routes.py` — accepts `project_id` and `tool`, triggers Jenkins single-stage build
- [X] T049 Update `auto_verify_fixed_issues()` in `backend/app/tasks/issue_tasks.py` to also check `pending_verification` issues
- [X] T050 [P] Wire verify scan callback in `backend/app/api/scans/callback.py` — on completion, call `auto_verify_pending_rescans` for the specific issue
- [X] T051 [P] Add `rescan_requested`, `rescan_approved`, `rescan_verification_complete` WebSocket event types in `backend/app/websockets/manager.py` (uses existing broadcast_event)
- [X] T052 [P] Add `useRescanWebSocket` hook in `src/hooks/useRescanWebSocket.ts` — subscribes to 3 event types, invalidates queries
- [X] T052a [P] Update `docs/architecture-overview.md` with the new state machine and rescan workflow

**Checkpoint**: Verify scan triggers and auto-resolves on completion.

---

## Phase 8: US6 — Rescan Edit & Cancel (P2)

**Goal**: Developer can edit fix note or cancel pending request before TL reviews.

**Independent Test**: Dev opens their pending request → edits fix note → TL sees updated note. Dev cancels pending → issue goes back to `fixed`.

### Implementation for US6

- [X] T053 [P] [US6] Implement `PATCH /api/v1/rescan-requests/{id}` in `backend/app/api/issues.py` — edit `fix_note` while `pending`, version check (409 on mismatch), re-sanitize
- [X] T054 [P] [US6] Implement `DELETE /api/v1/rescan-requests/{id}` in `backend/app/api/issues.py` — cancel only when `pending`, version check, transition issue back to `fixed`
- [X] T055 [P] [US6] Add `/fix-notes/{id}/raw` admin-only endpoint in `backend/app/api/issues.py` — returns raw (un-sanitized) fix note for audit
- [X] T056 [P] [US6] Add "Edit Fix Note" and "Cancel Request" buttons in `RescanRequestModal.tsx` — visible only when status is `pending`
- [X] T057 [P] [US6] Show "Rescan Requested" badge on issue rows in `src/pages/ToolDetailViewPage.tsx` and `src/pages/MyIssuesPage.tsx`

**Checkpoint**: Developer can iterate on fix note or cancel before TL reviews.

---

## Phase 9: US7 — Observability, Performance & Caching (P3)

**Goal**: Prometheus metrics + Redis caching + rate limiting all in place.

**Independent Test**: `GET /metrics` returns counters. Issue detail endpoint < 200ms. 4th rescan request in 1 hour returns 429.

### Implementation for US7

- [X] T058 [P] [US7] Create `backend/app/metrics.py` — define 3 metrics: `rescan_requests_total{status}`, `verifications_total{verdict}`, `pending_verification_queue_depth` (gauge)
- [X] T059 [US7] Add `GET /metrics` endpoint in `backend/app/main.py` — uses `prometheus_client.make_asgi_app()`, requires HTTP Basic auth via `METRICS_TOKEN` env var
- [X] T059a [P] [US7] Add `METRICS_TOKEN` to `backend/app/core/config.py` Settings — required for `/metrics` endpoint
- [X] T059b [P] [US7] Update `docker/docker-compose*.yml` files to set `METRICS_TOKEN` env var
- [X] T060 [US7] Instrument rescan endpoints to update metrics — `request-rescan`, `approve-rescan`, verification completion
- [X] T061 [P] [US7] Apply Redis cache to `GET /issues/{id}` in `backend/app/api/issues.py` — 60s TTL, key=`issue:{id}`, invalidate on issue update
- [X] T062 [P] [US7] Apply Redis cache to `GET /issues/pending-verification` in `backend/app/api/issues.py` — 5s TTL, key=`pending_verification:{project_id}:{status}`
- [X] T063 [P] [US7] Add Redis cache invalidation hooks in `IssueService._record_history()` in `backend/app/services/issue_service.py`

**Checkpoint**: Metrics endpoint works. Caching meets perf targets. Rate limit returns 429.

---

## Phase 10: Infrastructure Fixes

**Purpose**: Fix pre-existing bugs discovered during verification.

- [X] T064 [P] Fix `test_issues_rbac.py` — register `IssueDB` before `Base.metadata.create_all()` in `tests/test_issues_rbac.py`
- [X] T065 [P] Fix SQLite "database is locked" — use `:memory:` with `StaticPool` in `tests/conftest.py`
- [X] T066 [P] Fix lint error `@typescript-eslint/no-explicit-any` at `src/services/api.ts:234`
- [X] T067 [P] Fix Pydantic V2 deprecation — replace `class Config` with `model_config = ConfigDict(...)` in `backend/app/schemas/user.py` and `backend/app/schemas/rbac.py`

---

## Phase 11: Tests

- [X] T068 [P] Backend tests for new state transitions in `tests/test_issue_state.py`
- [X] T069 [P] Backend API tests for rescan request endpoints in `tests/test_issue_api.py`
- [X] T070 [P] Backend tests for optimistic locking in `tests/test_issue_api.py` — concurrent PATCH/DELETE should 409
- [X] T071 [P] Backend tests for fix note sanitization in `tests/test_fix_note_sanitizer.py` — verify AWS key redaction
- [X] T072 [P] Backend tests for rate limiting in `tests/test_issue_api.py` — 4th request in 1 hour returns 429
- [X] T073 [P] Backend tests for auto-verify with `pending_verification` in `tests/test_issue_tasks.py`
- [X] T074 [P] Backend tests for Prometheus metrics in `tests/test_metrics.py` — verify counters increment
- [X] T075 [P] Frontend tests for `CodeSnippet` in `src/tests/components/CodeSnippet.test.tsx`
- [X] T076 [P] Frontend tests for `RescanRequestModal` in `src/tests/components/RescanRequestModal.test.tsx`
- [X] T077 [P] Frontend tests for `PendingVerificationPage` in `src/tests/pages/PendingVerificationPage.test.tsx`
- [X] T078 [P] Frontend tests for `FilterChips` in `src/tests/components/FilterChips.test.tsx`
- [X] T079 [P] Frontend tests for `useRescanRequest` RBAC integration in `src/tests/hooks/useRescanRequest.test.tsx`

**Checkpoint**: All new code has test coverage.

---

## Phase 12: Polish

- [X] T080 [P] Update `Agent/Jenkinsfile` to capture code snippets at scan time (sed command) — see plan.md T004
- [X] T081 [P] Run `npm run lint && npm run build` — fix any new errors
- [X] T082 [P] Run `pytest tests/` and `npx vitest run` — confirm zero regressions
- [X] T083 [P] Update `AGENTS.md` speckit pointer to `specs/008-issue-resolution-workflow/plan.md` (already set)
- [X] T084 [P] Final docs review — verify architecture-overview, reports-pipeline, and CONTEXT.md files are current

**Checkpoint**: All code compiles, all tests pass, verification gate green.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — can start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS US1, US4
- **Phase 3 (US1)**: Depends on Phase 2 — needs parser and state machine
- **Phase 4 (US3)**: Depends on Phase 2 — needs parser enrichment for code snippet
- **Phase 5 (US4)**: Depends on Phase 2 — needs state machine and RescanRequestDB
- **Phase 6 (US5)**: Depends on Phase 5 — needs RescanRequestDB
- **Phase 7 (Auto-Verify)**: Depends on Phase 5 + 6 — needs API + rescan lifecycle
- **Phase 8 (US6)**: Depends on Phase 5 — needs RescanRequestDB
- **Phase 9 (US7)**: Depends on Phase 5 + 6 — needs API endpoints to instrument
- **Phase 10 (Infra Fixes)**: Independent — can run anytime
- **Phase 11 (Tests)**: Depends on all implementation phases
- **Phase 12 (Polish)**: Depends on Phase 11

### User Story Dependencies

- **US1 (P1)**: Starts after Phase 2. No dependency on other stories.
- **US3 (P1)**: Starts after Phase 2. Independent.
- **US4 (P1)**: Starts after Phase 2. Independent.
- **US5 (P2)**: Starts after US4. Needs RescanRequestDB.
- **US6 (P2)**: Starts after US4. Needs RescanRequestDB.
- **US7 (P3)**: Starts after US4 + US5. Needs API endpoints.

### Within Each User Story

- Models before services
- Services before endpoints
- Endpoints before frontend
- Frontend hooks before pages
- Core implementation before integration
- Tests after implementation

### Parallel Opportunities

- All Setup tasks (T001–T004) can run in parallel
- All Foundational tasks marked [P] (T005, T006, T008, T009, T010) can run in parallel
- US1 tasks (T013, T014, T015) can run in parallel
- US3 tasks (T019, T020, T021, T023, T024) can run in parallel
- US4 tasks (T025, T026, T032, T033, T034, T035) can run in parallel after T027+T028
- US5 tasks (T036, T037, T038, T039, T041, T042, T043, T046, T047) can run in parallel
- US6 tasks (T053, T054, T055, T056, T057) can run in parallel
- US7 tasks (T058, T061, T062, T063) can run in parallel
- All Phase 11 test tasks can run in parallel
- All Phase 12 polish tasks can run in parallel

---

## Parallel Example: US4 — Fix & Rescan Request

```bash
# Models + schemas + frontend in parallel:
Task: "Create RescanRequestDB model in backend/app/models/db_models.py"
Task: "Create RescanRequestCreate and RescanRequestResponse schemas in backend/app/schemas/issue.py"
Task: "Create RescanRequestModal in src/components/RescanRequestModal.tsx"
Task: "Add Request Rescan button in src/components/IssueDetailModal.tsx"

# After models/schemas:
Task: "Create RescanService with optimistic locking in backend/app/services/rescan_service.py"
Task: "Create fix_note_sanitizer in backend/app/services/fix_note_sanitizer.py"

# After RescanService:
Task: "Implement POST /request-rescan in backend/app/api/issues.py"
```

---

## Implementation Strategy

### MVP Scope (US1 only)

**Minimum Viable**: Phase 1 + Phase 2 + Phase 3 (US1 only)

Delivers:
- Parser captures file paths, line numbers, effort, tags, all 4 issue types ✓
- Dashboard shows enriched data ✓
- 4-type breakdown in project overview ✓

Without this MVP, the developer cannot see file paths/line numbers on the dashboard.

### Incremental Delivery

1. **MVP (US1)**: Parser + dashboard enrichment — immediately useful for triage
2. **+US3**: Deep-dive view — developer can see code context
3. **+US4 + US5 + US6**: Rescan lifecycle — full assignment-to-verification workflow
4. **+US7**: Observability + caching — production-readiness
5. **Polish**: Tests, lint, build, docs

### Parallel Team Strategy

With multiple developers:
1. **All**: Phase 1 + Phase 2 together (3h)
2. After foundational:
   - **Developer A**: US1 (3h) — dashboard enrichment
   - **Developer B**: US3 (5h) — deep-dive view + code snippet
   - **Developer C**: US4 (5h) — rescan request model + API
3. After US4:
   - **Developer A**: US5 (4h) — pending queue page
   - **Developer B**: US6 (2h) — edit/cancel
   - **Developer C**: US7 (3h) — metrics + caching
4. **All**: Phase 7 (3h), Phase 10 (2h), Phase 11 (5h), Phase 12 (1h)

---

## Effort Summary

| Phase | Tasks | Est. Effort |
|-------|-------|-------------|
| 1 — Setup | T001–T004 | 0.5h |
| 2 — Foundational | T005–T012 | 4h |
| 3 — US1 Dashboard | T013–T018 | 3h |
| 4 — US3 Deep-Dive | T019–T024 | 5h |
| 5 — US4 Rescan Request | T025–T035, T024a | 5h |
| 6 — US5 Verification Queue | T036–T047 | 4h |
| 7 — Auto-Verify | T048–T052, T052a | 3h |
| 8 — US6 Edit/Cancel | T053–T057 | 2h |
| 9 — US7 Observability | T058–T063, T059a, T059b | 3.5h |
| 10 — Infra Fixes | T064–T067 | 2h |
| 11 — Tests | T068–T079 | 5h |
| 12 — Polish | T080–T084 | 1h |
| **Total** | **88 tasks** | **~38h** |
