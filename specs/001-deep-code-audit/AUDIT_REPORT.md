# Deep Code Audit: Sentinel DevSecOps Platform

**Date**: 2026-05-22
**Scope**: Full codebase — frontend (React/TypeScript), backend (Python/FastAPI), Docker, CI/CD, UI/UX
**Method**: Line-by-line review of all source files, test execution, runtime flow tracing

---

## 1. Project Understanding Summary

**Sentinel** is a DevSecOps security scanning platform:
- **Frontend**: React 19 + TypeScript + Vite, TanStack React Query, React Router 7, Axios
- **Backend**: FastAPI + SQLAlchemy + Celery + Redis, PostgreSQL
- **CI/CD**: Jenkins pipelines running SonarQube, Trivy, ZAP, Nmap, Dependency-Check
- **Auth**: JWT (7-day expiry) in sessionStorage, API key fallback, no refresh tokens

**Authentication chain**: `Request → Public? → ENV=test bypass? → /callback bypass? → Bearer JWT → X-API-Key → 401`

---

## 2. Flow-by-Flow Review

### Flow 1: Login → Token → API Calls
- **Correct**: OAuth2 form-urlencoded, sessionStorage, interceptor attaches Bearer token
- **Broken**: No 401 handler, no token expiry check, API key not cleared on logout

### Flow 2: Protected Routes → Redirect → Return
- **Correct**: Saves `location.state.from`, navigates back after login
- **Broken**: `isLoading` flash on every page load

### Flow 3: Logout → Session Cleanup
- **Broken**: Only removes `token`, leaves `API_KEY` in sessionStorage

### Flow 4: Token Expiry / 401
- **Broken**: No global 401 handler. Expired tokens produce generic errors

### Flow 5: Scan Creation → Duplicate Prevention
- **Broken**: Race condition — non-unique index, no `SELECT FOR UPDATE`

### Flow 6: Jenkins Callback → State Update
- **Correct**: Digest-based idempotency, terminal state handling
- **Broken**: Test env skips callback auth, timing-unsafe token comparison

### Flow 7: WebSocket Real-Time Updates
- **Broken**: `isManualClose` never reset → auto-reconnect permanently broken after first dependency change. `connected`/`connecting` not reactive.

### Flow 8: Cache Invalidation After Mutations
- **Broken**: `useScanReset`/`useScanCancel` invalidate `['scans', id]` but scan page uses `['scan', id]`. Cache invalidation is completely broken.

### Flow 9: React Component Side Effects
- **Broken**: `useMemo` used for side effects in `ProjectReportsPage`

### Flow 10: Modal Accessibility
- **Broken**: ALL 6 modals lack focus traps and Escape key handling

### Flow 11: Test Suite
- **Broken**: 10/10 tests fail across 3 files due to selector mismatches

---

## 3. Confirmed Issues (All Categories)

### SECURITY — CRITICAL

| # | Issue | File | Line(s) |
|---|-------|------|---------|
| S1 | No user-level data isolation — any auth user can access all data | `backend/app/main.py` + all API files | 116-128 |
| S2 | JWT secret reuses API_KEY | `backend/app/core/security.py` | 11 |
| S3 | Hardcoded admin password `admin123` on every startup | `backend/app/main.py` | 84-91 |
| S4 | Public registration with no rate limiting, no password validation | `backend/app/api/auth.py` | 15-31 |
| S5 | ReDoS via user-controlled regex in `naming_pattern` | `backend/app/services/project_grouping.py` | 91 |
| S6 | `dangerouslySetInnerHTML` on ConfirmModal title — XSS | `src/components/ConfirmModal.tsx` | 76 |

### SECURITY — HIGH

| # | Issue | File | Line(s) |
|---|-------|------|---------|
| S7 | Callback path bypass is overly broad (`endswith("/callback")`) | `backend/app/core/auth.py` | 23-24 |
| S8 | Sensitive data (Jenkins creds, tokens) logged at INFO level | `backend/app/services/jenkins_service.py` | 61 |
| S9 | Non-constant-time callback token comparison (timing attack) | `backend/app/api/scans/utils.py` | 71 |
| S10 | Report endpoints expose all reports via sequential ID enumeration (IDOR) | `backend/app/api/reports.py` | 149-194 |
| S11 | Force-unlock lacks admin authorization | `backend/app/api/scans/state.py` | 70-114 |
| S12 | X-Scan-Timeout allows unbounded override | `backend/app/api/scans/routes.py` | 116-131 |
| S13 | No input validation on project schema fields (URL, IP, name length) | `backend/app/schemas/project.py` | 6-13 |
| S14 | API key embedded in frontend bundle via `VITE_API_KEY` | `docker/docker-compose.yml` | 42 |
| S15 | All `.env` files with secrets committed to git | `config/.env.*`, `.env.staging` | — |

### AUTHENTICATION & SESSION — CRITICAL

| # | Issue | File | Line(s) |
|---|-------|------|---------|
| A1 | No global 401 response handling | `src/services/api.ts` | 30-35 |
| A2 | No token expiry validation on client | `src/hooks/useAuth.tsx` | 24 |
| A3 | API key not cleared on logout | `src/hooks/useAuth.tsx` | 37-40 |
| A4 | Test env bypasses ALL authentication | `backend/app/core/auth.py` | 19-20 |
| A5 | WebSocket auto-reconnect permanently broken after first dep change | `src/hooks/useScanWebSocket.ts` | 56, 128 |
| A6 | Cache invalidation completely broken (wrong query keys) | `src/hooks/useScanReset.ts` | 27, 58 |

### UI/UX — CRITICAL

| # | Issue | File(s) | Line(s) |
|---|-------|---------|---------|
| U1 | ALL modals lack focus trap and Escape key handler | `ConfirmModal.tsx`, `FindingDetailModal.tsx`, inline modals in 4 pages | — |
| U2 | Native `confirm()`/`alert()` used instead of styled modals | `ScanStatusPage.tsx:169`, `ProjectGroupsPage.tsx:70,99,114` | — |
| U3 | `grid-cols-5` with no responsive breakpoint — broken on mobile | `UnifiedReportPage.tsx` | 250 |
| U4 | Action buttons overflow on mobile | `ProjectControlPage.tsx` | 191-224 |

### UI/UX — HIGH

| # | Issue | File(s) | Line(s) |
|---|-------|---------|---------|
| U5 | Silent API error handling — blank pages on failure | `UnifiedReportPage.tsx:52-54`, `ProjectGroupsPage.tsx:23-27` | — |
| U6 | `FormInput` label text is 10px — below readable size | `src/components/FormInput.tsx` | 29 |
| U7 | `window.location.href` for internal nav destroys React state | `src/services/notifications.ts:120`, `ErrorSuggestions.tsx:253` | — |
| U8 | Findings table rows not keyboard-navigable | `src/components/reports/FindingsTable.tsx` | 271-292, 342-369 |
| U9 | `PageSkeleton` loading overlay hides skeleton content | `src/components/PageSkeleton.tsx` | 107-119 |
| U10 | `ProjectForm` uses `rounded-[3rem]` — inconsistent with rest of app | `src/components/ProjectForm.tsx` | 107 |

### UI/UX — MEDIUM

| # | Issue | File(s) | Line(s) |
|---|-------|---------|---------|
| U11 | 14 accessibility issues: missing `aria-expanded`, `aria-pressed`, labels | Multiple | — |
| U12 | 7 responsive design issues: missing breakpoints on grids/flex | Multiple | — |
| U13 | 7 UX anti-patterns: misleading status labels, confusing flows | Multiple | — |
| U14 | 5 visual consistency issues: mixed border radii, button colors | Multiple | — |
| U15 | Hardcoded `Asia/Kolkata` timezone in 6+ files | Multiple | — |
| U16 | Toast has no `aria-live` container; may overlap mobile bottom bars | `src/components/Toast.tsx` | 46-66, 102 |
| U17 | `EmptyState` uses infinite `animate-ping` — motion sickness risk | `src/components/EmptyState.tsx` | 20 |
| U18 | Breadcrumb makes unnecessary API call for scan data | `src/components/Breadcrumbs.tsx` | 17-22 |
| U19 | Breadcrumb missing entries for `/settings`, `/docs`, `/project-groups` | `src/components/Breadcrumbs.tsx` | 40-78 |
| U20 | `DocsPage` tabs lack WAI-ARIA tablist pattern | `src/pages/DocsPage.tsx` | 329-349 |

### ASYNC & STATE — CRITICAL

| # | Issue | File | Line(s) |
|---|-------|------|---------|
| T1 | `isManualClose` never reset → WebSocket reconnect permanently broken | `src/hooks/useScanWebSocket.ts` | 56, 128 |
| T2 | `useScanReset`/`useScanCancel` invalidate wrong query key (`['scans']` vs `['scan']`) | `src/hooks/useScanReset.ts` | 27, 58 |

### ASYNC & STATE — HIGH

| # | Issue | File | Line(s) |
|---|-------|------|---------|
| T3 | WebSocket `connected`/`connecting` not reactive (reads from ref) | `src/hooks/useScanWebSocket.ts` | 162-164 |
| T4 | `QueryClient` created with no defaults — `staleTime: 0` causes burst refetches | `src/App.tsx` | 36 |
| T5 | No `ErrorBoundary` for lazy-loaded route chunk failures | `src/App.tsx` | 10-23 |
| T6 | `ScanStatusPage.handleCancel` stale closure over `scan?.project_id` in `setTimeout` | `src/pages/ScanStatusPage.tsx` | 112-114 |
| T7 | `notifications.ts` `window.location.href` destroys React state on click | `src/services/notifications.ts` | 120-122 |
| T8 | `useScanStatus.ts` missing `scan?.error` in `useEffect` deps | `src/hooks/useScanStatus.ts` | 47-51 |
| T9 | `useScanHistory` no `enabled` guard + `projectId!` assertion | `src/hooks/useScanHistory.ts` | 10-21 |

### ASYNC & STATE — MEDIUM

| # | Issue | File | Line(s) |
|---|-------|------|---------|
| T10 | Dead code: `useScanStatus` hook unused, `ScanStatusPage` reimplements | `src/hooks/useScanStatus.ts` | 1-102 |
| T11 | `ScanData` uses `any` for both fields | `src/hooks/useScanStatus.ts` | 8-11 |
| T12 | `useScanHistory` doesn't expose `error`/`isError` | `src/hooks/useScanHistory.ts` | 11, 23 |
| T13 | `useScanHistory` query key never invalidated by mutations | `src/hooks/useScanHistory.ts` | 12 |
| T14 | `useScanReset` doesn't invalidate `['scan-history', projectId]` | `src/hooks/useScanReset.ts` | 25-31 |
| T15 | No `onError` on any mutation in `useScanReset.ts` | `src/hooks/useScanReset.ts` | 20-61 |
| T16 | `apiError.ts` returns misleading status 500 for network errors | `src/utils/apiError.ts` | 39-46 |
| T17 | `notifications.ts` cached `permission` goes stale | `src/services/notifications.ts` | 18, 23-24 |
| T18 | `notifications.ts` `requireInteraction: true` + 5s auto-close contradiction | `src/services/notifications.ts` | 92, 102 |
| T19 | `ScanStatusPage` non-null `scanId!` assertions without guards | `src/pages/ScanStatusPage.tsx` | 81, 89, 170 |
| T20 | `ScanStatusPage` missing error handler on `forceUnlockMutation` | `src/pages/ScanStatusPage.tsx` | 168-171 |
| T21 | `ScanHistoryPage` no `enabled` guard, missing error handler on reset | `src/pages/ScanHistoryPage.tsx` | 16-20, 28-36 |
| T22 | `ScanHistoryPage` unconditional 10s polling never stops | `src/pages/ScanHistoryPage.tsx` | 19 |

### BACKEND — HIGH

| # | Issue | File | Line(s) |
|---|-------|------|---------|
| B1 | Delete project allowed with active scans | `backend/app/api/projects.py` | 170-192 |
| B2 | Race condition: filesystem cleanup after DB commit | `backend/app/api/projects.py` | 178-187 |
| B3 | Celery task never calls `self.retry()` despite `max_retries=3` | `backend/app/tasks/jenkins_tasks.py` | 18-58 |
| B4 | `list_scans` loads ALL scans into memory | `backend/app/api/scans/routes.py` | 55 |
| B5 | No pagination on reports, scans, projects list endpoints | Multiple | — |
| B6 | Rate limiter keyed on IP only — ineffective behind proxy | `backend/app/core/rate_limit.py` | 4 |

### BACKEND — MEDIUM

| # | Issue | File | Line(s) |
|---|-------|------|---------|
| B7 | N+1 query pattern in `list_projects` (3 + 2N queries) | `backend/app/api/projects.py` | 48-95 |
| B8 | `days` parameter in trends has no upper bound | `backend/app/api/reports.py` | 277 |
| B9 | Cleanup task loads all expired reports into memory | `backend/app/tasks/cleanup_tasks.py` | 23-31 |
| B10 | Hardcoded Jenkins job name in 2 files | `scan_recovery.py:28`, `jenkins_service.py:63` | — |
| B11 | Hardcoded IST timezone in API response | `backend/app/api/projects.py` | 80-85 |
| B12 | No foreign key constraints in DB models | `backend/app/models/db_models.py` | — |
| B13 | DB engine has no pool configuration | `backend/app/core/db.py` | 5 |
| B14 | `asyncio.run()` inside Celery task | `backend/app/tasks/report_tasks.py` | 52 |
| B15 | Recovery service exception handling gap | `backend/app/services/scan_recovery.py` | 107 |
| B16 | Recovery service missing rollback on commit failure | `backend/app/services/scan_recovery.py` | 52-167 |
| B17 | Callback accepts unvalidated `dict` body | `backend/app/api/scans/callback.py` | 31 |
| B18 | `is_auto_assigned` uses String instead of Boolean | `backend/app/models/db_models.py` | 125 |
| B19 | CORS allows all methods and headers | `backend/app/main.py` | 48-50 |

### TESTS — CONFIRMED FAILURES

| # | Test File | Tests Failed | Root Cause |
|---|-----------|-------------|------------|
| T1 | `LoginPage.test.tsx` | 4/4 | Selectors: `••••••••`, `operator identity`, `authorize entry` don't exist |
| T2 | `ManualScanPage.test.tsx` | 3/3 | Mocks 11 stages (actual: 9), expects non-existent UI text |
| T3 | `DashboardSearch.test.tsx` | 3/3 | `aria-label="Search projects"` doesn't exist on component |

---

## 4. Possible Issues (Need More Evidence)

| # | Category | Issue | Evidence Needed |
|---|----------|-------|----------------|
| P1 | Security | `ProjectResponse` inherits `ProjectCreate` required fields incorrectly | Check actual API responses for None values |
| P2 | State | React Query cache invalidation may be incomplete for some mutations | Audit every `onSuccess` handler |
| P3 | Backend | `report_type` validation is silent (falls back to "technical") | Check if frontend ever sends invalid types |
| P4 | Backend | `public_endpoint_only` function is dead code | Verify it's truly unused |
| P5 | UI | `input-field` CSS class may not be defined | Check global CSS |
| P6 | UI | `btn-secondary` and `btn-primary` classes may not be defined | Check global CSS |

---

## 5. TODO/Fix List by Priority

### P0 — Security Critical (Fix Immediately)

| # | Issue | File | Line(s) | Effort |
|---|-------|------|---------|--------|
| S1 | Add user-level data isolation | All API files + models | — | Large |
| S2 | Separate JWT secret from API_KEY | `security.py` | 11 | Small |
| S3 | Remove hardcoded admin password | `main.py` | 84-91 | Small |
| S4 | Add registration rate limiting + password validation | `auth.py` | 15-31 | Medium |
| S5 | Validate `naming_pattern` as safe regex | `project_grouping.py` | 91 | Small |
| S6 | Remove `dangerouslySetInnerHTML` on ConfirmModal | `ConfirmModal.tsx` | 76 | Small |
| S9 | Use `hmac.compare_digest` for callback token | `utils.py` | 71 | Small |
| S10 | Add ownership check to report endpoints | `reports.py` | 149-194 | Medium |

### P1 — Auth & Session (Fix Before Next Release)

| # | Issue | File | Line(s) | Effort |
|---|-------|------|---------|--------|
| A1 | Add global 401 handler | `api.ts` | 30-35 | Small |
| A2 | Add token expiry check | `useAuth.tsx` | 24 | Small |
| A3 | Clear API key on logout | `useAuth.tsx` | 37-40 | Small |
| A5 | Fix WebSocket reconnect (`isManualClose` reset) | `useScanWebSocket.ts` | 56 | Small |
| A6 | Fix cache invalidation keys | `useScanReset.ts` | 27, 58 | Small |

### P2 — UI/UX Critical (Fix Before Next Release)

| # | Issue | File(s) | Effort |
|---|-------|---------|--------|
| U1 | Add focus trap + Escape to all modals | 6 files | Medium |
| U2 | Replace native `confirm()`/`alert()` | 2 files | Small |
| U3 | Add responsive breakpoints to grids | 3 files | Small |
| U4 | Fix action button overflow on mobile | `ProjectControlPage.tsx` | Small |
| U5 | Add error handling for silent API failures | 2 files | Small |

### P3 — Async & State (Fix Before Merge)

| # | Issue | File | Line(s) | Effort |
|---|-------|------|---------|--------|
| T3 | Make WebSocket `connected` reactive | `useScanWebSocket.ts` | 162-164 | Small |
| T4 | Add QueryClient defaults | `App.tsx` | 36 | Small |
| T5 | Add ErrorBoundary for lazy routes | `App.tsx` | — | Small |
| T6 | Fix stale closure in `handleCancel` | `ScanStatusPage.tsx` | 112-114 | Small |
| T10 | Remove dead `useScanStatus` hook | `useScanStatus.ts` | — | Small |

### P4 — Tests (Fix Before Merge)

| # | Issue | File | Effort |
|---|-------|------|--------|
| T1 | Fix LoginPage test selectors | `LoginPage.test.tsx` | Small |
| T2 | Fix ManualScanPage test selectors | `ManualScanPage.test.tsx` | Small |
| T3 | Fix DashboardSearch test selectors | `DashboardSearch.test.tsx` | Small |

### P5 — Code Quality (Fix When Touching Files)

| # | Issue | File(s) | Effort |
|---|-------|---------|--------|
| U11-U20 | Accessibility, responsive, visual consistency | Multiple | Medium |
| B7-B19 | Backend: N+1 queries, pagination, pool config | Multiple | Medium |
| T11-T22 | State: dead code, missing guards, error handlers | Multiple | Small |

---

## 6. Recommended Fix Order

### Phase 1: Security (Days 1-3)
1. S2 — Separate JWT secret (1 line)
2. S9 — `hmac.compare_digest` (1 line)
3. S6 — Remove `dangerouslySetInnerHTML` (1 line)
4. S3 — Randomize admin password or require env var
5. S5 — Validate regex patterns
6. S4 — Add rate limiting + password validation
7. S10 — Add ownership checks to report endpoints
8. S1 — Add user-level data isolation (larger effort)

### Phase 2: Auth & Cache (Days 4-5)
9. A1 — Global 401 handler
10. A2 — Token expiry check
11. A3 — Clear API key on logout
12. A5 — Fix WebSocket reconnect
13. A6 — Fix cache invalidation keys
14. T4 — QueryClient defaults

### Phase 3: UI/UX (Days 6-8)
15. U1 — Modal focus traps (all 6 modals)
16. U2 — Replace native confirm/alert
17. U3 — Responsive grid breakpoints
18. U5 — Error handling for silent failures
19. T5 — ErrorBoundary
20. U6 — FormInput label size

### Phase 4: Tests & State (Days 9-10)
21. T1-T3 — Fix all 10 failing tests
22. T3 — Reactive WebSocket state
23. T6 — Fix stale closures
24. T10 — Remove dead code
25. B4-B5 — Add pagination

### Phase 5: Polish (Ongoing)
26. U11-U20 — Accessibility audit fixes
27. B7-B19 — Backend optimizations
28. T11-T22 — State management cleanup
