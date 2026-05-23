# Tasks: Deep Code Audit and Bug Analysis

**Input**: Design documents from `/specs/001-deep-code-audit/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are requested — the spec includes 10 failing tests that must be fixed, and the plan includes a dedicated Testing & Verification phase.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Backend**: `backend/app/`, `backend/tests/`
- **Frontend**: `src/`, `src/tests/`

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure fixes that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T001 [P] Add `JWT_SECRET_KEY` to `backend/app/core/config.py` with fallback to `API_KEY` + startup warning (research R1)
- [x] T002 [P] Update `backend/app/core/security.py:11` to use `JWT_SECRET_KEY` instead of reusing `API_KEY`
- [x] T003 [P] Remove hardcoded `admin123` from `backend/app/main.py:84-91`; require env var or generate random password
- [x] T004 [P] Add `pool_pre_ping`, `pool_size=20`, `max_overflow=10`, `pool_recycle=300` to `create_engine()` in `backend/app/core/db.py` (data-model §5)
- [x] T005 [P] Create `src/components/ErrorBoundary.tsx` class component for render errors and chunk-loading failures (research R7)
- [x] T006 Wrap `<Suspense>` in `src/App.tsx` with `<ErrorBoundary>`
- [x] T007 [P] Add `staleTime: 30_000` and `refetchOnWindowFocus: false` to `QueryClient` defaults in `src/main.tsx` (research R6)
- [x] T008 [P] Create `src/hooks/useFocusTrap.ts` shared hook for Tab/Shift+Tab cycling, Escape key, aria-modal (research R2)

**Checkpoint**: Foundation ready — user story implementation can now begin in parallel

---

## Phase 2: User Story 1 — Authentication Flow Integrity (Priority: P1) 🎯 MVP

**Goal**: Eliminate authentication bypasses, fix token handling, session management, and data isolation. Every path through auth must be secure.

**Independent Test**: Trace login → token storage → API calls → token expiry → logout. Verify each transition is correct and no state leaks between sessions. All auth-related tests pass.

### Tests for User Story 1

- [x] T009 [P] [US1] Add test for JWT secret separation in `backend/tests/test_auth_security.py`
- [x] T010 [P] [US1] Add test for password strength validation in `backend/tests/test_auth_security.py`
- [x] T011 [P] [US1] Add test for rate limiting on auth endpoints in `backend/tests/test_auth_security.py`
- [x] T012 [P] [US1] Add test for deleted user returns 401 in `backend/tests/test_auth_security.py`
- [x] T013 [P] [US1] Fix 4 failing tests in `src/pages/LoginPage.test.tsx` — align selectors with actual component (FR-014)

### Implementation for User Story 1

- [x] T014 [US1] Remove `ENV=="test"` auth bypass from `backend/app/core/auth.py:19-20`; add safeguard against misconfiguration (FR-004)
- [x] T015 [US1] Add password strength validation (min 8 chars, complexity) to `backend/app/api/auth.py` (FR-010)
- [x] T016 [US1] Add rate limiting to login/register endpoints in `backend/app/api/auth.py` (FR-011)
- [x] T017 [US1] Add global 401 interceptor in `src/services/api.ts:30-35`: clear session, redirect to login with `?reason` query param (FR-003)
- [x] T018 [US1] Add token expiry check on mount in `src/hooks/useAuth.tsx:24`; auto-logout if expired
- [x] T019 [US1] Clear `API_KEY` from sessionStorage on logout in `src/hooks/useAuth.tsx:37-40` (FR-005)
- [x] T020 [US1] Return specific error for deleted user in `backend/app/core/auth.py:53-54`; frontend shows "Account no longer exists" via `?reason=account-deleted` (FR-018)
- [x] T021 [US1] Add route guard in `src/hooks/useAuth.tsx`: redirect authenticated users away from `/login` (FR-002)
- [x] T022 [US1] Add `user_id` FK to `ProjectDB` in `backend/app/models/db_models.py`; write migration script (FR-015, data-model §2)
- [x] T023 [US1] Filter project queries by `current_user.id` in `backend/app/api/projects.py`; API-key bypass sees all data (FR-015)
- [x] T024 [US1] Handle token expiry mid-session in `src/hooks/useAuth.tsx` (scan in progress edge case)

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently. All auth flows secure, session management correct, data isolation enforced.

---

## Phase 3: User Story 2 — Client-Server State Synchronization (Priority: P1)

**Goal**: Fix React Query cache behavior, WebSocket reconnection, race conditions, and side effects. Frontend state must stay consistent with backend reality.

**Independent Test**: Trigger concurrent operations (two scans on same project, rapid page navigation during API calls) and verify state consistency. WebSocket disconnect → polling fallback works.

### Tests for User Story 2

- [x] T025 [P] [US2] Add test for race condition fix in `backend/tests/test_scan_security.py`
- [x] T026 [P] [US2] Add test for callback token timing safety in `backend/tests/test_scan_security.py`
- [x] T027 [P] [US2] Fix 3 failing tests in `src/pages/ManualScanPage.test.tsx` — 11 stages → 9 actual stages (FR-014)
- [x] T028 [P] [US2] Fix 3 failing tests in `src/pages/DashboardSearch.test.tsx` — add missing aria-labels (FR-014)

### Implementation for User Story 2

- [x] T029 [US2] Fix race condition with `SELECT FOR UPDATE` in `backend/app/api/scans/routes.py:104-162` (FR-006)
- [x] T030 [US2] Replace `!=` with `hmac.compare_digest` for callback token in `backend/app/api/scans/utils.py:71` (FR-007)
- [x] T031 [US2] Reset `isManualClose.current = false` in `connect()` in `src/hooks/useScanWebSocket.ts:56,128`
- [x] T032 [US2] Make `connected` state reactive (useState instead of ref) in `src/hooks/useScanWebSocket.ts:162-164`
- [x] T033 [US2] Add WebSocket reconnect → polling fallback with "connection lost" indicator in `src/hooks/useScanWebSocket.ts` (FR-009)
- [x] T034 [US2] Add connection timeout (fail fast if unreachable, 10s) in `src/hooks/useScanWebSocket.ts`
- [x] T035 [US2] Fix cache invalidation keys: `['scan', id]` not `['scans', id]` in `src/hooks/useScanReset.ts:27,58`
- [x] T036 [US2] Add `onSettled` for consistent cache invalidation in all `useMutation` calls
- [x] T037 [US2] Replace `useMemo` side effect with `useEffect` in `src/pages/ProjectReportsPage.tsx:96-103` (FR-012)
- [x] T038 [US2] Add explicit error states to all pages with `useQuery` (no silent failures) (FR-006)
- [x] T039 [US2] Add request timeout (abort after 30s) in `src/services/api.ts` (FR-006)
- [x] T040 [US2] Add loading skeletons to all pages (no blank screens)

**Checkpoint**: At this point, User Story 2 should be fully functional and testable independently. WebSocket reconnects correctly, cache invalidation works, no stale state.

---

## Phase 4: User Story 3 — Error Handling and Edge Cases (Priority: P2)

**Goal**: Every error path handled gracefully — network failures, validation errors, unexpected responses produce user-visible, actionable errors.

**Independent Test**: Simulate network failures, 400/401/403/500 responses, malformed data, and verify each produces a user-visible, actionable error.

### Tests for User Story 3

- [x] T041 [P] [US3] Add test for input validation rejects invalid project data in `backend/tests/test_project_validation.py`
- [x] T042 [P] [US3] Add test for XSS prevention in HTML reports in `backend/tests/test_report_xss.py`
- [x] T043 [P] [US3] Add test for ReDoS prevention in project grouping in `backend/tests/test_grouping_redos.py`

### Implementation for User Story 3

- [x] T044 [US3] Add Pydantic validation for all project creation fields in `backend/app/schemas/project.py` (FR-013)
- [x] T045 [US3] Add regex complexity limit or timeout for user-controlled patterns in `backend/app/services/project_grouping.py:91`
- [x] T046 [US3] Escape finding titles in HTML reports in `backend/app/services/reporting/reporter.py:137-141`
- [x] T047 [US3] Add global 500 handler with retry logic in `src/services/api.ts` (FR-013)
- [x] T048 [US3] Add `onError` handlers with user-visible feedback to all `useMutation` calls
- [x] T049 [US3] Add field-level validation error display to all forms (FR-013)
- [x] T050 [US3] Add debounce/dedup for rapid form submissions

**Checkpoint**: At this point, User Story 3 should be fully functional and testable independently. All error paths produce actionable feedback.

---

## Phase 5: User Story 4 — Routing and Navigation Correctness (Priority: P2)

**Goal**: All navigation flows work correctly — login redirect, protected routes, breadcrumbs, back button. User never lands on broken or unauthorized page.

**Independent Test**: Exercise every route transition: login → dashboard, direct URL access while logged out, logout → back button, deep link to scan status.

### Tests for User Story 4

- [x] T051 [P] [US4] Add test for unauthenticated redirect preserves original URL in `src/tests/components/ProtectedRoute.test.tsx`
- [x] T052 [P] [US4] Add test for authenticated redirect away from `/login` in `src/pages/LoginPage.redirect.test.tsx`

### Implementation for User Story 4

- [x] T053 [US4] Add breadcrumb navigation to all pages
- [x] T054 [US4] Add loading indicators for route transitions
- [x] T055 [US4] Add empty state for no projects in `src/pages/DashboardPage.tsx`
- [x] T056 [US4] Add keyboard navigation support to all pages
- [x] T057 [US4] Preserve original URL on login redirect (FR-002)
- [x] T058 [US4] Add horizontal scroll on mobile for all pages with tables

**Checkpoint**: At this point, User Story 4 should be fully functional and testable independently. All route transitions correct, navigation accessible.

---

## Phase 6: User Story 5 — Security-Sensitive Logic (Priority: P1)

**Goal**: All permission checks, token handling, callback validation, and secret management audited. No privilege escalation or data exposure possible.

**Independent Test**: Attempt API calls with expired tokens, wrong API keys, callback without token, and verify each is rejected.

### Tests for User Story 5

- [x] T059 [P] [US5] Add test for ownership check on report access in `backend/tests/test_reports.py`
- [x] T060 [P] [US5] Add test for scan timeout cap in `backend/tests/test_scans.py`

### Implementation for User Story 5

- [x] T061 [US5] Remove `dangerouslySetInnerHTML` from `src/components/ConfirmModal.tsx:76`; use plain text (FR-008)
- [x] T062 [US5] Apply `useFocusTrap` to all 6 modals: add `role="dialog"`, `aria-modal`, `aria-labelledby` (FR-016)
- [x] T063 [US5] Replace `confirm()`/`alert()` with `ConfirmModal` + `useToast` in `src/pages/ScanStatusPage.tsx`
- [x] T064 [US5] Replace `confirm()`/`alert()` with `ConfirmModal` + `useToast` in `src/pages/ProjectGroupsPage.tsx`
- [x] T065 [US5] Add ownership check: report's project belongs to current user in `backend/app/api/reports.py` (FR-015)
- [x] T066 [US5] Add responsive grid classes (`sm:grid-cols-3 lg:grid-cols-5`) in `src/pages/UnifiedReportPage.tsx`
- [x] T067 [US5] Add `aria-live="polite"` to `src/components/Toast.tsx` for screen readers (FR-016)
- [x] T068 [US5] Add backdrop click to close for all modals
- [x] T069 [US5] Cap scan timeout at `max(SCAN_TIMEOUT * 3, 7200)` in `backend/app/api/scans/routes.py`; return `X-Scan-Timeout-Actual` header (FR-017)
- [x] T070 [US5] Add `force-unlock` endpoint admin-only restriction in `backend/app/api/scans/routes.py` (contracts §8)

**Checkpoint**: At this point, User Story 5 should be fully functional and testable independently. All security checks enforced, no data exposure.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T071 [P] Additional unit tests for edge cases in `backend/tests/` and `src/tests/`
- [x] T072 Security hardening review
- [x] T073 Run `quickstart.md` validation steps
- [x] T074 Run full pipeline: `npm run lint && npm run build && npx vitest run && pytest tests/` — all must pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — can start immediately. BLOCKS all user stories.
- **User Stories (Phase 2-6)**: All depend on Foundational phase completion.
  - User stories can proceed sequentially in priority order (US1 → US2 → US3 → US4 → US5)
  - Or in parallel if team capacity allows (after Foundational)
- **Polish (Phase 7)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 1) — No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational (Phase 1) — Depends on T022/T023 (data isolation) for scan-related queries
- **User Story 3 (P2)**: Can start after Foundational (Phase 1) — May integrate with US1/US2 but independently testable
- **User Story 4 (P2)**: Can start after Foundational (Phase 1) — Depends on US1 route guards
- **User Story 5 (P1)**: Can start after Foundational (Phase 1) — Depends on T008 (useFocusTrap) from Foundational

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Models before services
- Services before endpoints
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Foundational tasks marked [P] can run in parallel (Phase 1)
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- All tests for a user story marked [P] can run in parallel
- Models within a story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: "Add test for JWT secret separation in backend/tests/test_auth_security.py"
Task: "Add test for password strength validation in backend/tests/test_auth_security.py"
Task: "Add test for rate limiting on auth endpoints in backend/tests/test_auth_security.py"
Task: "Add test for deleted user returns 401 in backend/tests/test_auth_security.py"
Task: "Fix 4 failing tests in src/pages/LoginPage.test.tsx"

# Launch independent implementation tasks together:
Task: "Remove ENV==test auth bypass from backend/app/core/auth.py"
Task: "Add password strength validation to backend/app/api/auth.py"
Task: "Add rate limiting to backend/app/api/auth.py"
Task: "Add global 401 interceptor in src/services/api.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Foundational (CRITICAL — blocks all stories)
2. Complete Phase 2: User Story 1
3. **STOP and VALIDATE**: Test User Story 1 independently — all auth flows secure, session management correct
4. Deploy/demo if ready

### Incremental Delivery

1. Complete Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Add User Story 4 → Test independently → Deploy/Demo
6. Add User Story 5 → Test independently → Deploy/Demo
7. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (Auth)
   - Developer B: User Story 2 (State/Cache)
   - Developer C: User Story 5 (Security)
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
- **Total tasks**: 74
- **Task distribution**: Foundational (8), US1 (16), US2 (16), US3 (10), US4 (8), US5 (12), Polish (4)
