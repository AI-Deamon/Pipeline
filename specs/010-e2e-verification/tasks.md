# Tasks: End-to-End Verification of Issue Resolution Platform

**Input**: `specs/010-e2e-verification/spec.md`

## Phase 0: Pre-flight

- [X] T001 Run `git status` — verify working tree clean on `main`
- [X] T002 Run `pytest tests/` — verify all 106 backend tests pass
- [X] T003 Run `npx vitest run` — verify all frontend tests pass — **FAIL** (24/25 files fail to import; `@testing-library/dom` not installed; pre-existing)
- [X] T004 Run `npx tsc -b` — verify TypeScript compiles — **PASS** for production (0 errors); **FAIL** for tests (34 errors, pre-existing)
- [X] T005 Check Docker daemon is running

## Phase 1: Stack Startup

- [ ] T006 Start docker-compose stack: `python run.py test` (or staging)
- [ ] T007 Wait for postgres health check (max 60s)
- [ ] T008 Wait for backend ready (poll `/api/v1/` — max 120s)
- [ ] T009 Wait for frontend ready (poll `http://localhost:5173/` — max 60s)
- [ ] T010 Verify SonarQube ready (poll `http://localhost:9000/api/system/status`)

## Phase 2: Auth + RBAC (US1)

- [ ] T011 curl POST `/api/v1/auth/login` as `admin/admin123` → capture JWT
- [ ] T012 curl GET `/api/v1/auth/me` → verify `role=admin`, all permissions=true
- [ ] T013 Login as `team_lead` user → verify `role=team_lead`
- [ ] T014 Login as `developer` user → verify `role=developer`
- [ ] T015 As admin: GET `/api/v1/issues/projects/proj-a/overview` → all projects visible
- [ ] T016 As team_lead: GET `/api/v1/issues/projects/proj-a/overview` → scoped projects only
- [ ] T017 As developer: GET `/api/v1/issues/projects/proj-a/overview` → assigned projects only
- [ ] T018 Document RBAC enforcement results

## Phase 3: SonarQube Pipeline (US2)

- [ ] T019 POST `/api/v1/scans` with `selected_stages=["sonar_scanner"]`
- [ ] T020 Poll scan status until COMPLETED
- [ ] T021 Query `ScanReportDB.findings` — verify all 8 enriched fields
- [ ] T022 Query `IssueDB` — verify `file_path`, `line_number`, `effort`, `tags` not null
- [ ] T023 Open dashboard in browser, click project, click SonarQube card
- [ ] T024 Verify Tool Detail View shows Location column (file:line) and Effort column
- [ ] T025 Click an issue → verify modal shows file path, line, code snippet
- [ ] T026 Confirm code snippet has syntax highlighting
- [ ] T027 Document SonarQube details verification results

## Phase 4: Rescan Workflow (US3 + US4)

- [ ] T028 Login as developer, find assigned issue
- [ ] T029 Mark issue as fixed (POST `/api/v1/issues/{id}/transition` with `status=fixed`)
- [ ] T030 Open IssueDetailModal → click "Request Rescan"
- [ ] T031 Enter fix note with embedded fake AWS key (`AKIAIOSFODNN7EXAMPLE`)
- [ ] T032 Submit → verify response has redacted key, status=`pending_verification`
- [ ] T033 Inspect `RescanRequestDB.fix_note_raw` — verify raw key preserved
- [ ] T034 Inspect `RescanRequestDB.fix_note` — verify key redacted
- [ ] T035 Try 4th rescan → expect 429 with Retry-After header
- [ ] T036 Login as team lead, open Pending Verification page
- [ ] T037 Verify issue appears with redacted fix note
- [ ] T038 Click "Verify Now" → verify scan triggers
- [ ] T039 Wait for callback → verify auto-verify completes
- [ ] T040 Verify final issue status (verified or rejected)
- [ ] T041 Verify WebSocket event `rescan_verification_complete` was sent
- [ ] T042 Document rescan workflow results

## Phase 5: Observability (US5)

- [ ] T043 curl `/metrics` without auth → expect 401
- [ ] T044 curl `/metrics` with `Authorization: Basic <METRICS_TOKEN>` → expect 200
- [ ] T045 Verify response contains `rescan_requests_total{status="pending"}` counter
- [ ] T046 Verify response contains `verifications_total{verdict="verified"}` counter
- [ ] T047 Verify response contains `pending_verification_queue_depth` gauge
- [ ] T048 Measure response time p95 (target: < 200ms)
- [ ] T049 Document observability results

## Phase 6: Report

- [ ] T050 Write `specs/010-e2e-verification/VERIFICATION_REPORT.md` with all results
- [ ] T051 Each user story: PASS / FAIL with measurements
- [ ] T052 List defects (if any) with severity (CRITICAL/HIGH/MEDIUM/LOW)
- [ ] T053 For each defect: reproduction steps + expected vs actual
- [ ] T054 File defects as tasks in `tasks.md` (separate follow-up spec)
- [ ] T055 Commit verification artifacts (spec, checklist, tasks, report)
- [ ] T056 Report final summary to user

## Out of Scope (Document but don't execute)

- Performance load testing (1000+ concurrent)
- Multi-tenant scenarios
- Disaster recovery
- Security penetration testing

## Defects Found (To Be Filed as Follow-up Tasks)

- [ ] D1 [HIGH] Install `@testing-library/dom` as dev dependency: `npm install --save-dev @testing-library/dom`
- [ ] D2 [HIGH] Re-run `npx vitest run` and `npx tsc -b` to verify both defects resolved
- [ ] D3 [MEDIUM] Consider adding a pre-commit hook that runs `npx tsc -b` to catch prod TS errors
- [ ] D4 [LOW] Add `pytest` to the test scope explicitly in `package.json` or doc (currently not in any test script)
