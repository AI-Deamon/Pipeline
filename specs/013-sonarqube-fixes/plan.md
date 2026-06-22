# SonarQube Fix Plan

**Source**: SonarQube scan of `sentinel-bfd7ff` (462 total issues)
**Date**: 2026-06-17
**Goal**: Fix all issues, one rule at a time

---

## Summary

| Severity  | Type            | Count |
|-----------|-----------------|-------|
| BLOCKER   | CODE_SMELL      | 106   |
| CRITICAL  | BUG             | 1     |
| CRITICAL  | CODE_SMELL      | 41    |
| MAJOR     | CODE_SMELL      | 214   |
| MINOR     | BUG             | 21    |
| MINOR     | CODE_SMELL      | 79    |

## Fix Order (by ROI: high count + high severity first)

### Phase 1: Python — BLOCKER (106 issues, auto-fixable)

**Rule: `python:S8410`** — Use `Annotated` type hints for FastAPI dependency injection
- **Files**: backend/app/api/issues.py, users.py, reports.py, scans/routes.py, scans/callback.py, scans/state.py, scans/utils.py, auth.py, projects.py, project_groups.py
- **Fix**: Replace `Depends(get_db)` with `Annotated[Session, Depends(get_db)]` in all function signatures

### Phase 2: Python — MAJOR (85 issues, auto-fixable)

**Rule: `python:S8415`** — Document HTTPException in responses param
- **Files**: All API route files
- **Fix**: Add `responses={404: {"description": "Not found"}}` to endpoint decorators

### Phase 3: TypeScript — MAJOR (63 issues)

**Rule: `typescript:S3358`** — Extract nested ternary operations
- **Files**: ScanProgressBar, Layout, ScanStatusPage, IssueDetailModal, ProjectControlPage, ProjectReportsPage, Breadcrumbs, UnifiedReportPage, IssuesTriagePage, IssueCard, MyIssuesPage, FindingDetailModal, ProjectOverviewPage
- **Fix**: Extract each nested ternary into standalone if/else or helper function

### Phase 4: Python — CRITICAL (18 issues)

**Rule: `python:S3776`** — High cognitive complexity
- **Files**: backend/app/api/projects.py, services/reporting/reporter.py, tasks/issue_tasks.py, services/project_grouping.py, api/reports.py, services/scan_orchestrator.py, services/scan_recovery.py, services/rbac_service.py
- **Fix**: Refactor complex functions into smaller ones

### Phase 5: TypeScript — MINOR BUG (21 issues)

**Rule: `typescript:S1082`** + **`typescript:S6848`** — Keyboard listeners on click handlers
- **Files**: IssueDetailModal, UserManagementPage, FindingDetailModal, RescanRequestModal, Toast, ProjectsPage (actually none — it's in confirmRevoke flow)
- **Fix**: Add `onKeyDown` handlers for Escape key on modal overlays

### Phase 6: TypeScript — MINOR (15 issues)

**Rule: `typescript:S7764`** — Prefer `globalThis` over `window`
- **Files**: notifications.ts, api.ts, useRescanWebSocket.ts
- **Fix**: Replace `window.` with `globalThis.`

### Phase 7: TypeScript — MINOR (14 issues)

**Rule: `typescript:S6759`** — Read-only props
- **Files**: Toast.tsx, IssueDetailModal.tsx, EmptyState.tsx, Breadcrumbs.tsx, IssueCard.tsx, RescanRequestModal.tsx, AccessDenied.tsx, SeverityPieChart.tsx, PageSkeleton.tsx, FindingDetailModal.tsx, ToolCard.tsx, ScanProgressBar.tsx, ProjectForm.tsx, ConfirmModal.tsx
- **Fix**: Add `readonly` modifier to interface props (type-only change)

### Phase 8: TypeScript — MAJOR (11 issues)

**Rule: `typescript:S6479`** — Do not use Array index in keys
- **Files**: DocsPage, UnifiedReportPage, ProjectReportsPage, IssuesTriagePage, ProjectOverviewPage, ToolDetailViewPage
- **Fix**: Use unique ID instead of index for React key props

### Phase 9: TypeScript — MINOR (10 issues)

**Rule: `typescript:S7735`** — Unexpected negated condition
- **Files**: IssuesTriagePage, MyIssuesPage, ToolCard, FindingDetailModal, ProjectReportsPage, IssueDetailModal
- **Fix**: Simplify negated conditions (e.g., `if (!a !== !b)` → `if (a !== b)`)

### Phase 10: TypeScript — MAJOR (9 issues)

**Rule: `typescript:S6853`** — Form label association
- **Files**: ProjectControlPage, RescanRequestModal, ProjectGroupsPage
- **Fix**: Add `htmlFor` on `<label>` elements

### Phase 11: Python — CRITICAL (16 issues)

**Rule: `python:S1192`** — Define constants for duplicate literals
- **Files**: api/issues.py, api/reports.py, api/projects.py, api/scans/routes.py, api/auth.py, tasks/issue_tasks.py, api/project_groups.py, api/users.py
- **Fix**: Extract repeated strings to module-level constants

### Phase 12: Python — CRITICAL + TypeScript — CRITICAL

**Rule: `python:S3776` + `typescript:S3776`** — Cognitive complexity (remaining)
- Already covered in Phase 4 for Python; TypeScript in IssueDetailModal, ScanProgressBar, Layout, ProjectOverviewPage, IssuesTriagePage

### Phase 13: All remaining MINOR rules

- `python:S1481` (11x) — Remove unused variables
- `typescript:S4325` (8x) — Unnecessary type assertions
- `typescript:S1874` (8x) — Deprecated FormEvent
- `typescript:S7781` (5x) — Prefer String.replaceAll()
- `typescript:S6582` (5x) — Optional chaining
- `typescript:S6481` (2x) — Context value changes
- `typescript:S4623` (2x) — Redundant undefined
- `typescript:S7723` (2x) — Use new Array()
- `typescript:S7773` (2x) — Use Number.isNaN
- `typescript:S6660` (1x) — If in else
- `typescript:S7770` (1x) — Arrow function to Boolean
- `typescript:S7763` (1x) — Export…from
- `typescript:S6847` (1x) — Non-interactive event listeners
- `typescript:S7759` (1x) — Use Date.now()
- `typescript:S2004` (1x) — Nested functions
- `python:S1172` (3x) — Unused parameters
- `python:S5869` (2x) — Duplicate regex char class
- `python:S1066` (2x) — Merge nested ifs
- `python:S125` (1x) — Commented out code
- `python:S6353` (1x) — Use \d
- `python:S3358` (1x) — Nested conditional

### Phase 14: Critical Bug (1 issue)

**Rule: `typescript:S2871`** — Sort compare function
- **File**: IssuesTriagePage.tsx:118
- **Fix**: Provide proper compare function using String.localeCompare
