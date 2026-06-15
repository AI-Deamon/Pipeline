# Spec: Complete Issue Resolution Platform

**Supersedes**: `004-unified-issue-tracker`, `007-sonarqube-enrichment`
**Depends on**: `005-rbac` (RBAC — already implemented)

## Clarifications

### Session 2026-06-15

- Q: Who can trigger verify scans — developers or only users (admin/team_lead)? → A: Only users (admin and team_lead) can trigger scans. Developers see the issue, fix it, and ask the team lead to verify the fix. Developers cannot trigger scans themselves.

  **Impact**: This clarifies the developer role boundary. The "Request Rescan" button is really "Request Team Lead Review." Developers do not have scan-triggering permissions. The `can_approve_rescan` permission applies to users only; the `can_request_rescan` permission allows developers to submit a fix note for review, but the actual scan is gated by `can_approve_rescan` for admin/team_lead.

- Q: How should fix_note be handled for security/PII? → A: Sanitize before storage, redact on display — strip obvious secrets (regex match for common API key patterns like AWS keys, GitHub tokens, JWT tokens, passwords) before storage. The fix note is still stored in plaintext (for audit), but the UI displays a redacted version. The WebSocket payload also returns the redacted version. The raw note is only accessible to admin via a separate `/fix-notes/{id}/raw` endpoint.

- Q: How to handle concurrent/duplicate rescan requests? → A: One pending request per issue. Developer requests rescan only after fully fixing the issue (status = `fixed`). If a pending request already exists, return 409 Conflict. The Team Lead also performs the verification scan manually (not auto-triggered) — they review the developer's fix note, then click "Verify Now" themselves. This makes the workflow fully manual from the Team Lead's perspective.

- Q: Verify scan timeout behavior? → A: No timeout. The process is fully manual — human-paced throughout. Developer requests rescan after fix, TL sees the request, triggers rescan themselves or assigns additional issues that need fixes. There is no automated timeout because the workflow is human-driven, not system-driven. Stale requests remain visible on the TL's queue indefinitely until acted upon.

- Q: Behavior after a rescan is rejected (fix didn't work)? → A: Allow re-request, keep full history, reset to `in_progress`. After rejection, the issue transitions back to `in_progress`. Developer can fix the code again and submit a new rescan request. All historical rescan requests remain visible for audit. This supports iterative debugging — devs can see what the previous fix attempt was and what went wrong. The previous `fix_note` is preserved in the `rescan_requests` history.

### Session 2026-06-15 (post-plan)

- Q: Concurrency control for state transitions on the same rescan request? → A: Optimistic locking via version field. Add `version: int` column to `RescanRequestDB` (default 0). Update endpoints accept the current `version` as a query param or body field. The server checks that the incoming version matches the stored version; if not, return 409 Conflict with a message indicating the resource was modified by another user. On successful update, increment the version. The fix_note edit endpoint also uses this same mechanism. This handles all race conditions: two TLs clicking "Verify Now" simultaneously, dev editing fix_note while TL reviews, concurrent reject attempts.

- Q: Observability approach for the new workflow (post-plan, user asked about complexity)? → A: Prometheus metrics, but only 3 metrics to keep it lightweight. Add `prometheus-client` dep + a single `GET /metrics` endpoint. Endpoint requires HTTP Basic auth via `METRICS_TOKEN` env var to comply with constitution Principle 1 (Security-First Architecture). Three counters: `rescan_requests_total{status}` (incremented on each new rescan request, labeled by status=pending/approved/completed/rejected), `verifications_total{verdict}` (incremented on each auto/manual verification, labeled by verdict=verified/rejected), and a gauge `pending_verification_queue_depth` (set on read). Total addition: ~30 min of work, no alerting built in. Structured logging continues for events not captured by these metrics.

- Q: Rate limit for /request-rescan endpoint? → A: Per-user 3 rescan requests per hour. Strictest option to prevent devs from spamming the request endpoint while still allowing legitimate iterative fixes (3/hour is enough for normal dev workflow). Enforce via FastAPI dependency that checks a per-user counter in Redis with a 1-hour TTL. Return 429 Too Many Requests when exceeded. The /approve-rescan and /trigger-verify-scan endpoints (user-only) are not rate-limited since the TL/admin review pace is human-driven and naturally bounded.

- Q: Performance targets for the new endpoints? → A: Use Redis caching to meet realistic targets. `GET /issues/{id}` p95 < 200ms (Redis cache 60s TTL, invalidated on updates). `GET /issues/pending-verification` p95 < 500ms (Redis cache 5s TTL, keyed on `(project_id, status)`). `POST /issues/{id}/request-rescan` p95 < 800ms (DB write + WebSocket broadcast). WebSocket event delivery p95 < 100ms (in-memory broadcast). These targets are validated by the existing indexes on `rescan_requests` and the planned `version`-based optimistic locking.

- Q: Can devs edit or cancel a pending rescan request? → A: Yes — both edit and cancel are supported. `PATCH /api/v1/rescan-requests/{id}` allows the requester to update the `fix_note` while the request is still `pending` (returns 409 if already approved/completed). `DELETE /api/v1/rescan-requests/{id}` allows cancellation only when status is `pending` (returns 409 otherwise). Both endpoints use the version field for optimistic locking. On cancel, the issue transitions back from `pending_verification` to `fixed` (so the dev can iterate without leaving the issue in limbo). Cancellation history is preserved in the audit log.

### Session 2026-06-15 (3rd pass)

- Q: Empty / error / loading states for PendingVerificationPage? → A: Comprehensive states (see also Plan.md Constraints section for the canonical reference). **Empty**: "No pending verification requests" message with a "Browse all issues" CTA. **Loading**: skeleton table (3 placeholder rows matching the real card structure). **Error**: red banner with the error message, a "Retry" button, and link to status page. **WebSocket disconnected**: yellow banner "Offline — showing cached data" with a manual refresh button, plus the WebSocket connection indicator (per spec 004 pattern). When user takes an action (Verify/Reject), show inline spinner on the button + optimistic update with rollback on error.

- Q: Team Lead's view scope of pending verification queue? → A: All Team Leads see everything (full queue) by default. They filter by project via chip/dropdown controls at the top of the page. This is simpler than per-scope filtering and matches the existing dashboard pattern where TLs see all projects then filter. Admin still sees everything. Developer still sees only their own requests (per spec 005 RBAC). The filter chips show: "All Projects" (default), plus one chip per project with the count of pending requests. Clicking a chip filters the list.

## Documentation Index

This spec is supported by the following documents:

| Document | Purpose |
|----------|---------|
| `spec.md` (this file) | High-level overview, architecture, data flow, what each prior spec delivered |
| `plan.md` | Detailed implementation plan with file-level code snippets for each task |
| `data-model.md` | Full database schema for new tables/columns, field mappings |
| `contracts/api.md` | Complete API contracts with request/response examples, RBAC matrix |
| `research.md` | 10 key technical decisions with alternatives evaluated |
| `tasks.md` | 84 implementation tasks across 12 phases with effort estimates |
| `quickstart.md` | End-to-end demo flow, manual testing, troubleshooting |
| `checklists/requirements.md` | Quality validation checklist |

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                     COMPLETE WORKFLOW                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐    ┌──────────────┐    ┌────────────────┐  │
│  │  SONARQUBE       │    │  PIPELINE    │    │  ISSUE DB      │  │
│  │  API             │───→│  CALLBACK    │───→│  + API         │  │
│  │  issues/search   │    │  + Celery    │    │  + Frontend    │  │
│  └─────────────────┘    └──────────────┘    └───────┬────────┘  │
│                                                      │           │
│         SPEC 004 (COMPLETED) ◄───────────────────────┘           │
│         • IssueDB, state machine, CRUD API                      │
│         • Dashboard → Project Overview → Tool Detail            │
│         • Assignment, transition, comments, history             │
│         • My Issues, dedup, auto-verify, regression detection   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  RBAC (SPEC 005 — COMPLETED)                             │    │
│  │  • Admin: full access, user management                   │    │
│  │  • Team Lead: scoped projects, assign/verify             │    │
│  │  • Developer: assigned issues only, status updates       │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  PHASE 1: PARSER ENRICHMENT (was Spec 007)               │    │
│  │  • Capture file paths, line numbers, effort, tags        │    │
│  │  • Enable all 4 issue types (BUG,VULN,CODE SMELL,HOTSPOT)│    │
│  │  • Code snippet context from SonarQube                   │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  PHASE 2: RESOLUTION WORKFLOW (was Spec 008)             │    │
│  │  • Developer deep-dive with line-of-code view            │    │
│  │  • Fix note + formal rescan request                      │    │
│  │  • Pending verification queue for users                  │    │
│  │  • Single-tool verify scan + auto-resolve                │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Complete Data Flow

```
[1] SCAN EXECUTION (Jenkins pipeline)
    │
    ▼
[2] SONARQUBE API RESPONSE
    │  Raw payload per issue:
    │   • key, component (file path), line, message (title)
    │   • severity, type, rule, effort
    │   • tags, status, resolution
    │   • textRange (startLine, endLine, startOffset, endOffset)
    │   • flows (execution paths for vulnerabilities)
    │
    ▼
[3] PARSER (sonar.py)  ←── ENRICHMENT TARGET
    │  Currently drops: file path, line number, effort, tags, code_snippet
    │  Target: capture ALL fields into SecurityFinding
    │
    ▼
[4] SCAN REPORT DB (ScanReportDB)
    │  Stores findings as JSON blob
    │
    ▼
[5] CELERY MIGRATION (migrate_scan_to_issues)
    │  Maps findings → IssueDB records
    │  Dedup by (issue_id, project_id)
    │
    ▼
[6] ISSUE DB (IssueDB)  ←── SPEC 004 BASE
    │  Full normalized issue records
    │  Supports: location, effort, extra_metadata
    │
    ▼
[7] ISSUE API (issues.py)
    │  GET /projects/{id}/overview       → tool summary counts
    │  GET /projects/{id}/tools/{tool}   → paginated issue list + types filter
    │  GET /issues/{id}                  → single issue detail (enriched)
    │  POST /issues/{id}/assign          → assign to developer
    │  POST /issues/{id}/transition      → state change
    │  POST /issues/{id}/comments        → add comment
    │  GET /issues/{id}/history          → audit trail
    │  GET /issues/my                    → cross-project developer view
    │
    ▼
[8] FRONTEND PAGES
    │  DashboardPage          → project list (RBAC-filtered)
    │  ProjectOverviewPage    → tool cards with counts by type
    │  ToolDetailViewPage     → enriched issue table + type toggle
    │  IssueDetailModal       → full deep-dive + code snippet + rescan
    │  MyIssuesPage           → developer's assigned issues
    │  PendingVerificationPage → user's verification queue
    │
    ▼
[9] RESOLUTION LIFECYCLE
    │
    │  ┌─────────────────────────────────────────────────────┐
    │  │  USER sees issue on dashboard                       │
    │  │  │                                                  │
    │  │  ├── POST /assign                                   │
    │  │  │   → Issue: open → assigned                       │
    │  │  │   → DEV sees in "My Issues"                      │
    │  │  │                                                  │
    │  │  ├── DEV opens issue → DEEP-DIVE                    │
    │  │  │   → Sees: file path, line #, code snippet       │
    │  │  │   → Sees: effort, tags, rule, recommendation     │
    │  │  │   → POST /transition: assigned → in_progress     │
    │  │  │                                                  │
    │  │  ├── DEV fixes code                                 │
    │  │  │   → POST /transition: in_progress → fixed         │
    │  │  │   → POST /request-rescan with fix note           │
    │  │  │   → Issue: fixed → pending_verification          │
    │  │  │   → DEV asks TL: "Please verify my fix"           │
    │  │  │                                                  │
    │  │  ├── USER sees in PENDING QUEUE                     │
    │  │  │   → "Fix note: Sanitized input in userForm.tsx"  │
    │  │  │   → Clicks "Verify Now"                          │
    │  │  │   → POST /approve-rescan                          │
    │  │  │   → Single-tool verify scan triggered             │
    │  │  │                                                  │
    │  │  ├── VERIFY SCAN COMPLETES                          │
    │  │  │   → Issue still found  → auto-reject (fix failed)│
    │  │  │   → Issue: pending_verification → in_progress    │
    │  │  │   → DEV re-fixes, re-requests rescan             │
    │  │  │   → Issue not found    → auto-verify ✓           │
    │  │  │   → Issue: pending_verification → verified       │
    │  │  │   → Regression check on previously fixed issues  │
    │  │  │                                                  │
    │  │  └── DONE                                           │
    │  └─────────────────────────────────────────────────────┘
    │
    ▼
[10] RBAC ENFORCEMENT (SPEC 005 — applied at every step)
     │  Admin:    all projects, all actions
     │  TeamLead: scoped projects, assign/verify within scope
     │  Developer: assigned issues only, status/comments only
```

---

## What Spec 004 Already Delivered (All Tasks Complete ✓)

| Component | Files | Status |
|-----------|-------|--------|
| IssueDB, IssueHistoryDB, IssueScanDB models | `backend/app/models/db_models.py` | ✓ |
| Issue Pydantic schemas | `backend/app/schemas/issue.py` | ✓ |
| IssueService (CRUD, dedup, state machine, assignment, history) | `backend/app/services/issue_service.py` | ✓ |
| Issue state machine | `backend/app/state/issue_state.py` | ✓ |
| Issue API routes (overview, tool detail, assign, transition, comments, history, metrics) | `backend/app/api/issues.py` | ✓ |
| Celery migration task | `backend/app/tasks/issue_tasks.py` | ✓ |
| Auto-verify + regression detection | `backend/app/tasks/issue_tasks.py` | ✓ |
| WebSocket events | `backend/app/websockets/manager.py` | ✓ |
| Frontend types | `src/types.ts` | ✓ |
| useIssues hooks | `src/hooks/useIssues.ts` | ✓ |
| ToolCard component | `src/components/ToolCard.tsx` | ✓ |
| IssueCard component | `src/components/IssueCard.tsx` | ✓ |
| IssueFilterBar component | `src/components/IssueFilterBar.tsx` | ✓ |
| IssueTypeToggle component | `src/components/IssueTypeToggle.tsx` | ✓ |
| IssueDetailModal component | `src/components/IssueDetailModal.tsx` | ✓ |
| ProjectOverviewPage | `src/pages/ProjectOverviewPage.tsx` | ✓ |
| ToolDetailViewPage | `src/pages/ToolDetailViewPage.tsx` | ✓ |
| MyIssuesPage | `src/pages/MyIssuesPage.tsx` | ✓ |
| Route registration | `src/App.tsx` | ✓ |
| Backend tests (79 tests) | `tests/` | ✓ |
| Frontend tests (65 pass) | `src/tests/` | ✓ |

## What Spec 005 Already Delivered (All Tasks Complete ✓)

| Component | Files | Status |
|-----------|-------|--------|
| RBAC models (role column, project_assignments, access_changes) | `backend/app/models/db_models.py` | ✓ |
| RBAC schemas | `backend/app/schemas/rbac.py` | ✓ |
| RbacService (effective scope, authorization, audit) | `backend/app/services/rbac_service.py` | ✓ |
| require_role / require_scope auth deps | `backend/app/core/auth.py` | ✓ |
| User management API (CRUD roles, project access) | `backend/app/api/users.py` | ✓ |
| RBAC applied to projects, reports, issues routes | `backend/app/api/` | ✓ |
| Frontend RBAC types | `src/types.ts` | ✓ |
| useRbac hook | `src/hooks/useRbac.ts` | ✓ |
| useAuth extended with role/permissions | `src/hooks/useAuth.tsx` | ✓ |
| ProtectedRoute with requiredRole prop | `src/components/ProtectedRoute.tsx` | ✓ |
| AccessDenied component | `src/components/AccessDenied.tsx` | ✓ |
| UserManagementPage | `src/pages/UserManagementPage.tsx` | ✓ |
| Dashboard RBAC filtering | `src/pages/DashboardPage.tsx` | ✓ |
| RBAC guards on ProjectOverview, ToolDetailView, MyIssues | `src/pages/` | ✓ |
| Backend tests | `tests/test_rbac_service.py` + others | ✓ |
| Frontend tests | `src/tests/` | ✓ |

## What Remains to Build

### Phase 1: Parser Enrichment (5 tasks)

**Goal**: Stop discarding SonarQube data. Capture file path, line number, effort, tags, all 4 issue types, code snippet context.

| # | Task | File |
|---|------|------|
| 1 | Add `line_number`, `file_path`, `effort`, `tags`, `sonar_status`, `sonar_resolution` to SecurityFinding | `backend/app/services/reporting/parsers/base.py` |
| 2 | Populate new fields from SonarQube API response in `fetch_sonar_issues()` | `backend/app/services/reporting/parsers/sonar.py` |
| 3 | Make `types` param dynamic (stop hardcoding `BUG,VULNERABILITY`) | `backend/app/services/reporting/parsers/sonar.py` |
| 4 | Capture code snippet (20 lines around issue line) from textRange | `backend/app/services/reporting/parsers/sonar.py` |
| 5 | Map new fields to IssueDB in `migrate_scan_to_issues()` | `backend/app/tasks/issue_tasks.py` |

### Phase 2: State Machine — `pending_verification` (2 tasks)

| # | Task | File |
|---|------|------|
| 6 | Add `PENDING_VERIFICATION` state + transitions (fixed → pending → verified/rejected) | `backend/app/state/issue_state.py` |
| 7 | Update `IssueService.transition_status()` to allow new transitions | `backend/app/services/issue_service.py` |

### Phase 3: Rescan Request Model & API (7 tasks)

| # | Task | File |
|---|------|------|
| 8 | Create `RescanRequestDB` model | `backend/app/models/db_models.py` |
| 9 | Create RescanRequest Pydantic schemas | `backend/app/schemas/issue.py` |
| 10 | `POST /api/v1/issues/{id}/request-rescan` | `backend/app/api/issues.py` |
| 11 | `POST /api/v1/issues/{id}/approve-rescan` + trigger single-tool scan | `backend/app/api/issues.py` |
| 12 | `GET /api/v1/issues/pending-verification` | `backend/app/api/issues.py` |
| 13 | `POST /api/v1/issues/{id}/trigger-verify-scan` | `backend/app/api/issues.py` |
| 14 | Add rescan API methods to frontend service | `src/services/api.ts` |

### Phase 4: Auto-Verify & Callback (3 tasks)

| # | Task | File |
|---|------|------|
| 15 | Update `auto_verify_fixed_issues()` to handle `pending_verification` issues | `backend/app/tasks/issue_tasks.py` |
| 16 | On verify success → verified + RescanRequestDB.completed. On failure → rejected | `backend/app/tasks/issue_tasks.py` |
| 17 | Add `rescan_verification_complete` WebSocket event | `backend/app/websockets/manager.py` |

### Phase 5: Code Snippet Retrieval (2 tasks)

| # | Task | File |
|---|------|------|
| 18 | `GET /api/v1/projects/{id}/code-snippet?file={path}&line={n}` — proxy to Git provider or local clone | `backend/app/api/projects.py` |
| 19 | Create `CodeSnippet` component with syntax highlighting | `src/components/CodeSnippet.tsx` |

### Phase 6: Frontend Deep-Dive UI (6 tasks)

| # | Task | File |
|---|------|------|
| 20 | Expand IssueDetailModal — file path (clickable), line number, effort, tags, rule link | `src/components/IssueDetailModal.tsx` |
| 21 | Embed CodeSnippet in IssueDetailModal with issue line highlighted | `src/components/IssueDetailModal.tsx` |
| 22 | Add "Request Rescan" button → opens RescanRequestModal | `src/components/IssueDetailModal.tsx` |
| 23 | Create RescanRequestModal with fix note textarea | `src/components/RescanRequestModal.tsx` |
| 24 | Show "Rescan Requested" badge on issue rows | `src/pages/ToolDetailViewPage.tsx`, `src/pages/MyIssuesPage.tsx` |
| 25 | Add file_path, line_number, effort columns to tool detail table | `src/pages/ToolDetailViewPage.tsx` |

### Phase 7: Pending Verification Queue (4 tasks)

| # | Task | File |
|---|------|------|
| 26 | Create `PendingVerificationPage` — issues grouped by project, with Verify/Reject | `src/pages/PendingVerificationPage.tsx` |
| 27 | Add pending count badge to nav/sidebar | `src/App.tsx` or nav component |
| 28 | Add "Pending Verification" filter to dashboard | `src/pages/DashboardPage.tsx` |
| 29 | Add lazy route for PendingVerificationPage | `src/App.tsx` |

### Phase 8: Single-Tool Verify Scan (2 tasks)

| # | Task | File |
|---|------|------|
| 30 | `POST /api/v1/scans/trigger-verify` — single-tool scan via Jenkins | `backend/app/api/scans/routes.py` |
| 31 | Wire verify scan callback → auto_verify for specific issue | `backend/app/api/scans/callback.py` |

### Phase 9: Fix Infrastructure Issues (4 tasks)

| # | Task | File |
|---|------|------|
| 32 | Fix `test_issues_rbac.py` — IssueDB not registered before create_all | `tests/test_issues_rbac.py` |
| 33 | Fix "database is locked" — unique DB URL per test file | `tests/conftest.py` + test files |
| 34 | Fix lint error `@typescript-eslint/no-explicit-any` | `src/services/api.ts` |
| 35 | Fix Pydantic V2 `class Config` → `ConfigDict` | `backend/app/schemas/user.py`, `rbac.py` |

### Phase 10: Tests (6 tasks)

| # | Task | File |
|---|------|------|
| 36 | Backend tests for new state transitions | `tests/test_issue_state.py` |
| 37 | Backend API tests for rescan request endpoints | `tests/test_issue_api.py` |
| 38 | Backend tests for auto-verify with pending_verification | `tests/test_issue_tasks.py` |
| 39 | Frontend tests for CodeSnippet | `src/tests/components/CodeSnippet.test.tsx` |
| 40 | Frontend tests for RescanRequestModal | `src/tests/components/RescanRequestModal.test.tsx` |
| 41 | Frontend tests for PendingVerificationPage | `src/tests/pages/PendingVerificationPage.test.tsx` |

### Phase 11: Polish (3 tasks)

| # | Task | File |
|---|------|------|
| 42 | Run `npm run lint && npm run build` — fix errors | — |
| 43 | Run `pytest tests/` and `npx vitest run` — zero regressions | — |
| 44 | Update AGENTS.md speckit pointer to this spec | `AGENTS.md` |

---

## State Machine (Full)

```
                    ┌──────────────────────────────────────┐
                    │                                      │
                    ▼                                      │
    ┌────────┐  ┌──────────┐  ┌────────────┐  ┌────────┐ │
    │  OPEN  │→ │ ASSIGNED │→ │IN_PROGRESS │→ │ FIXED  │ │
    └────────┘  └──────────┘  └────────────┘  └───┬────┘ │
         ▲                                         │      │
         │                          ┌──────────────┘      │
         │                          ▼                      │
         │                    ┌──────────────┐             │
         │                    │  PENDING_    │             │
         │                    │ VERIFICATION │             │
         │                    └──┬───────────┘             │
         │                       │                         │
         │             ┌─────────┼──────────┐              │
         ▼             ▼         ▼          ▼              │
    ┌──────────┐  ┌────────┐ ┌────────┐ ┌──────────┐      │
    │ REJECTED │  │VERIFIED│ │VERIFIED│ │ REJECTED │      │
    │ (manual) │  │(manual)│ │(auto)  │ │ (auto)   │      │
    └────┬─────┘  └────────┘ └────────┘ └──────────┘      │
         │                                                  │
         └──────────────────────────────────────────────────┘
```

Transitions:
- `open → assigned` (user assigns)
- `assigned → in_progress` (developer starts working)
- `in_progress → fixed` (developer marks fixed)
- `fixed → pending_verification` (developer requests rescan)
- `fixed → verified` (user manually verifies without rescan)
- `fixed → rejected` (user manually rejects)
- `pending_verification → verified` (TL triggers rescan → fix verified, OR auto-verify passes)
- `pending_verification → rejected` (TL triggers rescan → fix still fails, OR auto-verify fails)
- `pending_verification → in_progress` (on rejection, issue resets for re-fix; matches clarification 5 — devs can iterate without leaving the issue in limbo)
- `in_progress → fixed → pending_verification` (re-attempt cycle, with full rescan history preserved)
- `rejected → assigned` (re-assign after final reject, manual only)

---

## RBAC Integration (Spec 005 Applied)

**Per clarification 2026-06-15**: Only users (admin/team_lead) can trigger scans. Developers fix issues and request review; they cannot trigger scans.

| Action | Admin | Team Lead | Developer |
|--------|-------|-----------|-----------|
| View all projects | ✓ | Scoped only | Assigned only |
| View project overview | ✓ | Scoped | Assigned |
| View tool detail | ✓ | Scoped | Assigned |
| View code snippet | ✓ | Scoped | Assigned |
| Assign issue | ✓ | Scoped | ✗ |
| Transition to in_progress | ✓ | Own issues | Own issues |
| Mark fixed | ✓ | Own issues | Own issues |
| Request rescan (submit fix note for review) | ✓ | Own issues | Own issues |
| Trigger verify scan (approve) | ✓ | Scoped | ✗ (per clarification) |
| View pending queue | ✓ | Scoped only | Only own requests |
| Verify/reject resolution | ✓ | Scoped | ✗ |
| Manage users/roles | ✓ | ✗ | ✗ |

---

## Effort Summary

| Phase | Tasks | Est. Effort |
|-------|-------|-------------|
| 1 — Parser Enrichment | 1-5 | 3h |
| 2 — State Machine | 6-7 | 1h |
| 3 — Rescan Request API | 8-14 | 5h |
| 4 — Auto-Verify Integration | 15-17 | 3h |
| 5 — Code Snippet | 18-19 | 3h |
| 6 — Frontend Deep-Dive | 20-25 | 5h |
| 7 — Pending Queue | 26-29 | 4h |
| 8 — Single-Tool Verify | 30-31 | 3h |
| 9 — Infrastructure Fixes | 32-35 | 2h |
| 10 — Tests | 36-41 | 5h |
| 11 — Polish | 42-44 | 1h |
| **Total** | **44 tasks** | **~35h** |
