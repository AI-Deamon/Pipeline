# Feature Specification: End-to-End Verification of Issue Resolution Platform

**Feature Branch**: `010-e2e-verification`
**Created**: 2026-06-15
**Status**: Draft
**Input**: User description: "end to end verification"

## Clarifications

- Q: Should this be a formal spec or an ad-hoc validation? → A: Formal spec — produces a verification plan, test matrix, and sign-off checklist that can be re-run after any future change to specs 004, 005, 007, or 008.
- Q: What level of testing is required (unit / integration / E2E)? → A: End-to-end through the running stack: docker-compose services, real SonarQube, real Jenkins, real PostgreSQL, real Redis. Not just isolated unit tests.
- Q: Who executes the verification? → A: The same agent that built the spec (no human in the loop) — uses CLI, curl, web inspection, and the application UI via the Vite dev server.
- Q: How are failures handled? → A: Document each failure with reproduction steps, expected vs actual, and severity. Produce a list of follow-up tasks; do not auto-fix without explicit user approval.
- Q: Should the verification reuse the existing pytest + vitest suites, or run a separate scenario-driven harness? → A: Reuse existing tests as the unit/integration layer; add a scenario-driven E2E harness on top that drives the full user journey through real HTTP + WebSocket calls.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Login + Dashboard renders RBAC-filtered projects (Priority: P1)

A user logs in with their role-specific credentials and sees a dashboard that
correctly filters projects by their access level (admin sees all, team_lead sees
scoped, developer sees assigned only).

**Why this priority**: Confirms auth + RBAC + dashboard render work end-to-end against the real backend.

**Independent test**: Start the stack, login as each role, verify project counts.

### User Story 2 - SonarQube scan populates enriched issues (Priority: P1)

A scan completes via Jenkins → callback → celery → IssueDB. The resulting
issues appear in the dashboard with file path, line number, effort, tags,
and the 4 issue types (BUG, VULNERABILITY, CODE_SMELL, SECURITY_HOTSPOT).

**Why this priority**: This is the core of the original concern — verify that
"can we bring all details from SonarQube to the dashboard" is actually
working in the running system, not just in unit tests.

**Independent test**: Trigger a SonarQube scan, wait for completion, open
the tool detail view, open an issue modal, verify the enriched fields.

### User Story 3 - Developer requests rescan with fix note (Priority: P2)

A developer assigned to an issue marks it as fixed, opens the "Request
Rescan" modal, enters a fix note, and submits. The issue status transitions
to `pending_verification`. The rate limiter returns 429 on the 4th request
in an hour. The fix note is sanitized of any embedded secrets.

**Why this priority**: Validates the optimistic locking, sanitization, and
rate limit all work under real load.

**Independent test**: Login as dev, assign issue, mark fixed, request
rescan, verify status + DB row + sanitized note.

### User Story 4 - Team Lead approves and triggers verify scan (Priority: P2)

A team lead opens Pending Verification page, sees the developer's fix
note grouped by project, clicks "Verify Now", confirms the verify scan
triggers, and waits for auto-verify to complete. Issue status becomes
`verified` (issue gone) or `rejected` (still present).

**Why this priority**: Validates the team-lead workflow and the auto-verify
Celery task.

**Independent test**: Login as TL, approve rescan, verify scan runs, wait
for callback, verify status transition.

### User Story 5 - Prometheus metrics endpoint requires auth (Priority: P3)

The `/metrics` endpoint returns Prometheus-format text only when the request
includes `Authorization: Basic <METRICS_TOKEN>`. Without auth it returns 401.

**Why this priority**: Validates constitution Principle 1 (Security-First)
compliance for the new observability surface.

**Independent test**: curl `/metrics` without auth (expect 401), with
correct auth (expect 200 + metrics text).

## Functional Requirements

- **FR-1**: All existing pytest tests must pass (currently 106/106) — this is
  the unit/integration regression layer.
- **FR-2**: All existing vitest tests must pass (frontend regression layer).
- **FR-3**: The full docker-compose stack must start without errors
  (postgres, redis, backend, celery_worker, frontend, sonarqube, jenkins).
- **FR-4**: `GET /api/v1/auth/login` with admin credentials returns a valid JWT
  token and the user's role is `"admin"`.
- **FR-5**: `GET /api/v1/issues/projects/{id}/overview` returns tool summary
  with `by_type` breakdown including all 4 SonarQube issue types.
- **FR-6**: `GET /api/v1/issues/{id}` returns `file_path`, `line_number`,
  `effort`, `tags`, `code_snippet`, and `code_snippet_language` in the
  response payload.
- **FR-7**: A real SonarQube scan produces at least 1 issue in IssueDB with
  all enriched fields populated (not null).
- **FR-8**: `POST /api/v1/issues/{id}/request-rescan` with a fix note
  containing a fake AWS key returns the response with the key redacted
  to `***REDACTED:aws_access_key***`.
- **FR-9**: A 4th `request-rescan` from the same user within 1 hour
  returns HTTP 429 with a `Retry-After` header.
- **FR-10**: `GET /metrics` without `Authorization` header returns 401.
- **FR-11**: `GET /metrics` with correct Basic auth returns text/plain
  with `rescan_requests_total`, `verifications_total`, and
  `pending_verification_queue_depth` metrics present.
- **FR-12**: `GET /api/v1/issues/pending-verification` returns projects
  filtered by the calling user's effective project scope.
- **FR-13**: After a verify scan completes, the matching issue is
  auto-verified (issue gone) or auto-rejected (still present) within 60s.

## Success Criteria *(mandatory)*

- **SC-1**: All 106 existing backend tests pass.
- **SC-2**: All frontend tests pass (count TBD, currently 65+ pass per
  spec 004 documentation).
- **SC-3**: The full stack starts within 5 minutes from cold start.
- **SC-4**: A complete rescan workflow (mark fixed → request → approve →
  verify → auto-resolve) completes in under 5 minutes wall-clock.
- **SC-5**: Zero unhandled exceptions appear in backend logs during any
  user journey.
- **SC-6**: The `/metrics` endpoint returns 200 in < 200ms p95 with
  correct auth.
- **SC-7**: All endpoints return within their declared SLA targets
  (issue detail < 200ms, pending queue < 500ms, request-rescan < 800ms).
- **SC-8**: A verification report document is produced listing each
  user story (1-5), the result (PASS/FAIL), the actual measurements,
  and any defects found with reproduction steps.

## Key Entities

- **VerificationMatrix**: A 2D grid of (user story, test case) with
  expected vs actual results, captured in a markdown table.
- **VerificationReport**: A document summarizing the matrix, listing
  defects, and providing a sign-off checklist.
- **DefectEntry**: Each defect found with severity, reproduction steps,
  and proposed fix task.

## Out of Scope

- Performance load testing (1000+ concurrent users)
- Multi-tenant scenarios
- Disaster recovery / backup verification
- Security penetration testing

## Assumptions

- The docker-compose stack can be started with `python run.py staging` (or
  test profile for E2E without full SonarQube).
- A seeded admin user exists with credentials `admin/admin123` (per
  AGENTS.md).
- At least one project (`proj-a`) exists in the database.
- SonarQube is reachable at `localhost:9000` with the configured token.
- The verification can be re-run after any future change to specs 004,
  005, 007, or 008.

## Verification Plan

### Phase 0: Pre-flight
1. Check working tree clean on `main`
2. Confirm all 106 backend tests pass: `pytest tests/`
3. Confirm all frontend tests pass: `npx vitest run`
4. Confirm TypeScript compiles: `npx tsc -b`

### Phase 1: Stack Startup
1. Start docker-compose: `python run.py test` (or staging for real SonarQube)
2. Wait for postgres health check
3. Wait for backend ready (poll `/api/v1/`)
4. Wait for frontend ready (poll `http://localhost:5173/`)
5. Verify SonarQube ready (poll `http://localhost:9000/api/system/status`)

### Phase 2: Auth + RBAC (US1)
1. curl POST `/api/v1/auth/login` as `admin/admin123` → get JWT
2. curl GET `/api/v1/auth/me` with token → verify `role=admin`
3. Login as `team_lead` user → verify `role=team_lead`
4. Login as `developer` user → verify `role=developer`
5. Hit `/api/v1/issues/projects/{id}/overview` with each role
6. Verify team_lead sees only scoped projects, developer sees only assigned

### Phase 3: SonarQube Pipeline (US2)
1. Trigger SonarQube scan: POST `/api/v1/scans` with `selected_stages=["sonar_scanner"]`
2. Wait for scan completion (poll scan status)
3. Verify ScanReportDB has findings with all 8 enriched fields
4. Verify IssueDB has issues with file_path, line_number, effort, tags populated
5. Open the dashboard, click the project, click SonarQube card
6. Verify Tool Detail View shows file path column, effort column
7. Click an issue → verify modal shows file path, line, code snippet

### Phase 4: Rescan Workflow (US3 + US4)
1. Login as developer, find assigned issue
2. Mark issue as fixed (transition to `fixed`)
3. Click "Request Rescan" → enter fix note with embedded fake AWS key
4. Submit → verify response has redacted key, status=`pending_verification`
5. Try 4th rescan → verify 429 with Retry-After
6. Login as team lead, open Pending Verification page
7. Verify issue appears in queue with redacted fix note
8. Click "Verify Now" → verify scan triggers
9. Wait for callback → verify auto-verify completes
10. Issue status should be `verified` (if gone) or `rejected` (if present)

### Phase 5: Observability (US5)
1. curl `/metrics` without auth → expect 401
2. curl `/metrics` with `Authorization: Basic <token>` → expect 200
3. Verify response contains `rescan_requests_total`, `verifications_total`,
   `pending_verification_queue_depth`

### Phase 6: Report
1. Write `specs/010-e2e-verification/VERIFICATION_REPORT.md` with all
   results
2. Each user story: PASS / FAIL with measurements
3. List defects with severity and reproduction
4. Update this spec's tasks.md with completed verification tasks
5. Commit verification artifacts to the feature branch
6. Report summary to user

## Acceptance Criteria for This Spec Itself

- Verification report exists at `specs/010-e2e-verification/VERIFICATION_REPORT.md`
- All 5 user stories have explicit PASS/FAIL determination
- Zero ambiguous results (each test must be determinable)
- Defects (if any) are filed as tasks in `specs/010-e2e-verification/tasks.md`

## Constraints

- Use existing tools only (docker, curl, jq, pytest, vitest)
- No new dependencies
- Reuse existing test fixtures where possible
- Each verification step must be reproducible from clean state
- Failures must be re-runnable to confirm

## Hard Rules

- Do not modify production code during verification (that's a separate fix task)
- Do not skip steps due to time pressure — document partial results
- Do not auto-fix defects — file them as tasks for explicit user approval
- Do not mark a user story PASS if any sub-step failed
