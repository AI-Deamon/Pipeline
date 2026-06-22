# Research: Discoverability & Navigation Fixes

**Spec**: `spec.md`
**Last updated**: 2026-06-16

## 1. Why the existing UX audit missed this

The audit at `specs/011-ux-audit/audit-report.md` scored 0/100 across 49 findings in 8 categories (Information Architecture, Navigation, Visual Hierarchy, Accessibility, Consistency, States, Microcopy, Mobile). It covered navigation in a **per-page** sense (page-level breadcrumb existence, page-level focus order) but never asked the **cross-page** question: "can the user reach this page or action from the entry points they already have?"

This is a category-level blind spot. The Nielsen heuristic #6 ("Recognition rather than recall") and WCAG SC 2.4.5 (Multiple Ways) both apply here, and the audit did not score against them.

## 2. Inventory of invisible UI paths

Sources: exhaustive read of `src/App.tsx`, `src/components/Layout.tsx`, `src/components/Breadcrumbs.tsx`, `src/pages/DashboardPage.tsx`, all `src/pages/*.tsx`, and grep for every mutating endpoint hook in `src/hooks/`.

### A. Routes missing from sidebar (`Layout.tsx:124-149`)

The sidebar exposes 7 core links + 4 project-context links. The route table defines 14 protected routes. 6 routes are missing from the sidebar:

| Route | Component | Current path in |
|-------|-----------|-----------------|
| `/projects/:projectId/edit` | `ProjectEditPage` | `ProjectControlPage:213` "Edit" button |
| `/projects/:projectId/issues` | `ProjectOverviewPage` | URL knowledge only |
| `/projects/:projectId/issues/:toolName` | `ToolDetailViewPage` | `ToolCard.tsx:32` (only after #2) |
| `/project-groups` | `ProjectGroupsPage` | URL knowledge only |
| `/scans/:scanId` | `ScanStatusPage` | Dashboard alert (`DashboardPage.tsx:308-321`) + `ScanHistoryPage.tsx:123` |
| `/projects/:projectId/reports/unified` | `UnifiedReportPage` | `ProjectReportsPage.tsx:262` |

### B. Routes missing from dashboard

`DashboardPage.tsx:118-208` (`ProjectRow`) and `:271-402` (table) provide: "Add Project", "View" (scan), "View Reports", "Manage", "Delete" (admin). Nothing else.

Missing from dashboard: `/projects/:id/issues`, `/projects/:id/issues/:toolName`, `/project-groups`, `/my-issues`, `/pending-verification`, `/users`, `/docs`, `/settings`, `/projects/:id/edit`.

### C. The full invisible path to assignment

The Assign button lives at `src/components/IssueDetailModal.tsx:188-214`. To reach it the user must follow a 3-4 click sequence with no breadcrumbs for the issue chain, and the entire path requires URL knowledge of `/projects/:id/issues` because no UI surface links to `ProjectOverviewPage`.

**Path A — URL-required (4 clicks)**:
1. Type URL `/projects/{projectId}/issues` directly
2. Click a `ToolCard` → `ToolCard.tsx:32` navigates to `/projects/:id/issues/:toolName`
3. Click a row in `ToolDetailViewPage.tsx:133` → `IssueDetailModal` opens
4. Click "Assign" button (`IssueDetailModal.tsx:210`) → type a username → submit

`Breadcrumbs.tsx:27-82` has no case for `/issues` or `/issues/:toolName` — at best the user sees "Dashboard → ProjectName" but no "Issues → SonarQube → Bug #42" trail.

**Path B — My Issues dead-end**:
1. Sidebar → "My Issues" → `/my-issues`
2. Click any `IssueCard` → nothing happens. `IssueCard.tsx:27-55` has no `onClick`, no `Link`, no `navigate`.

**Path C — Reports detour (4 clicks, no path to assignment)**:
1. Dashboard → "View Reports" → `ProjectReportsPage.tsx`
2. Click any row → `FindingDetailModal` opens
3. `FindingDetailModal.tsx:1-104` has NO "Open in Issue Tracker" button

### D. The "Triage queue" / "unassigned" view

Does not exist. Grep for `unassigned|triage|needs assignment|assignee_id=null` across `src/` returns 0 matches. `IssueFilterBar.tsx:12-20` lists status options (`open`, `assigned`, `in_progress`, `fixed`, `verified`, `rejected`) but no "unassigned" option, and it is only used inside `ToolDetailViewPage` (which itself is unreachable). To assign an issue you must open each one individually and type a username.

## 3. Dead code inventory

| Symbol | Location | Notes |
|--------|----------|-------|
| `useEditRescanRequest` | `src/hooks/useRescanRequest.ts:4` | Defined, never imported |
| `useCancelRescanRequest` | `src/hooks/useRescanRequest.ts:16` | Defined, never imported |
| `useCreateIssue` | `src/hooks/useIssues.ts:44` | **Will be revived** by this spec (`FindingDetailModal` "Create issue" sub-button) |
| `useScanReset` | `src/hooks/useScanReset.ts:14` | Defined, never imported (only re-exported via `useScanStatus.ts:5`) |
| `api.issues.getRawFixNote` | `src/services/api.ts:345` | Admin diagnostic, never called |
| `api.issues.getCodeSnippet` | `src/services/api.ts:288` | `CodeSnippet` uses pre-loaded `issue.code_snippet` instead |
| `api.projectGroups.update` | `src/services/api.ts:222` | Defined, never called |
| `api.projectGroups.bulkAssign` | — | Never exposed |
| `api.projectGroups.assignScan` | `src/services/api.ts:241` | Defined, never called |
| `api.projectGroups.removeScan` | `src/services/api.ts:245` | Defined, never called |
| `api.scans.retryReports` | — | Backend has the endpoint, no client method |

## 4. Backend endpoints with no UI surface

| Endpoint | File:line | Notes |
|----------|-----------|-------|
| `PATCH /api/v1/rescan-requests/{id}` | `backend/app/api/issues.py:428` | Spec 008 intentional, kept for future |
| `DELETE /api/v1/rescan-requests/{id}` | `backend/app/api/issues.py:463` | Spec 008 intentional |
| `GET /api/v1/fix-notes/{id}/raw` | `backend/app/api/issues.py:495` | Admin audit, not in UI yet |
| `POST /api/v1/project-groups/{id}/bulk-assign` | `backend/app/api/project_groups.py:272` | Deferred |
| `POST /api/v1/project-groups/{id}/assignments` | `backend/app/api/project_groups.py:314` | Deferred |
| `DELETE /api/v1/project-groups/{id}/assignments/{scan_id}` | `backend/app/api/project_groups.py:356` | Deferred |
| `POST /api/v1/scans/{id}/retry-reports` | `backend/app/api/scans/routes.py:299` | Orphan, requires investigation |
| `POST /api/v1/scans/{id}/reset` | `backend/app/api/scans/state.py` | Used internally only |

## 5. Decision log

### Decision 1: New "Issues" page or extend existing?

**Options**:
- (A) New `IssuesTriagePage` at `/issues` — top-level sidebar entry, RBAC-gated to admin/team_lead
- (B) Extend `MyIssuesPage` with an "unassigned" filter
- (C) Add an "Unassigned" tab to `MyIssuesPage`

**Chosen**: (A) — new top-level page. Reasoning:
- `MyIssuesPage` filters by `assignee_id === currentUser.id` (different semantic — "my work")
- Adding tabs to `MyIssuesPage` conflates "my work" with "triage queue"
- Top-level sidebar entry makes the workflow discoverable in 1 click

### Decision 2: Where to put the new sidebar entries?

**Options**:
- (A) Top-level (always visible), RBAC-gated
- (B) Project-context block only (only when a project is active)
- (C) Both

**Chosen**: (A) — top-level, RBAC-gated. Reasoning: the triage queue is a cross-project view; it must be visible without first picking a project.

### Decision 3: Use existing endpoint or add `GET /issues/by-finding-key`?

**Options**:
- (A) Client-side filter on `getToolIssues` (existing) — 5-page loop (GAP-19)
- (B) New backend endpoint

**Chosen**: (A) for v1. The `getToolIssues` endpoint returns up to 25 issues per page (default). With a 5-page cap, we scan 125 issues per lookup. For staging this is fine. If we later see latency issues with large issue sets, we add a dedicated `?finding_key=` filter to the backend endpoint.

### Decision 4: Keep dead hooks or remove?

**Options**:
- (A) Keep all (per user clarification)
- (B) Remove unused
- (C) Wire `useCreateIssue` only, leave others

**Chosen**: (C) — `useCreateIssue` gets wired to the new "Create issue" sub-button in `FindingDetailModal`. All other dead hooks stay (out of scope, may be used by other tools).

### Decision 5: Follow Speckit or implement directly?

**Chosen**: Follow Speckit (per user clarification). This spec is the input to `tasks.md` → implementation.

### Decision 6 (refinement pass): Finding lookup key

**Problem**: `Finding` type has no `finding_key` field. SonarQube uses stable `finding.id` (a string like `'AXxxxxxx'`); other tools have rule+file_path.

**Options**:
- (A) Use `finding.id` only (collision risk across scans for non-SonarQube)
- (B) Use `finding.id + ':' + scan_id` composite (avoids collisions)
- (C) Use `tool + file_path + rule` composite

**Chosen**: (B) composite. The composite is used both for `findByFindingKey` lookup (match on `issue_id === finding.id`) and for `useCreateIssue` (send `issue_id: finding.id + ':' + scan_id`). The unique index on `(issue_id, project_id)` is satisfied because the composite is unique per finding per scan.

### Decision 7 (refinement pass): Groups RBAC

**Problem**: `useRbac.canViewAllProjects` is admin-only today. The spec wants team_lead to see Groups.

**Options**:
- (A) Add new `canViewProjectGroups` flag in `useRbac.ts`
- (B) Inline role check (`isAdmin || isTeamLead`) in `Layout.tsx`
- (C) Drop team_lead from Groups (admin-only)

**Chosen**: (A) — centralizes RBAC logic in the hook. `canViewProjectGroups: isAdmin || isTeamLead` and `canUpdateProject: isAdmin || isTeamLead` are added (FR10). Future RBAC audits can read these flags directly.

### Decision 8 (refinement pass): `/issues` route guard

**Problem**: Developers can reach `/issues` via direct URL.

**Options**:
- (A) In-page `<Navigate to="/my-issues" replace />` if `!canAssignIssues && !isAdmin`
- (B) Extend `ProtectedRoute` to accept `requiredRole={['admin', 'team_lead']}`

**Chosen**: (A) — in-page check. No new route signature; `ProtectedRoute` stays single-role. The check is 1 line.

### Decision 9 (refinement pass): Performance cap

**Problem**: `IssuesTriagePage` issues one `getProjectOverview` per project. A team_lead with 50+ projects would fire 50 parallel calls.

**Options**:
- (A) Hard cap at 10 projects with "Show more" link
- (B) No cap (accept perf risk)
- (C) New backend endpoint (defer)

**Chosen**: (A) — hard cap with "Show more" link to a project filter. Matches staging capacity. Defers the new endpoint to a future spec.

### Decision 10 (refinement pass): User picker on Assign

**Problem**: `IssueDetailModal` has a free-text username input. SC1 said "2 clicks" but the actual flow is 5.

**Options**:
- (A) Replace with `<select>` of project members
- (B) Keep free-text, update SC1 wording
- (C) Add user picker to IssuesTriagePage rows

**Chosen**: (A) — `<select>` is a 5-line change that improves both the `IssueDetailModal` flow and any future row-level assign. New `useUsersForProject` hook calls `api.rbac.getUsers` + `api.rbac.getProjectAssignments` and filters. SC1 wording updated to "3 clicks + select user".

### Decision 11 (refinement pass): IssuesTriagePage details

**Options**:
- (A) Sort severity desc, default `['open']`, severity+tool chips, 60s refetch
- (B) Default `['open','assigned']`, no chips
- (C) Just status chips, sort by date desc

**Chosen**: (A) — most actionable default. CRITICAL first, last-seen tiebreak. The `['assigned']` filter is accessible via chip toggle. 60s refetch replaces WebSocket (no issue channel exists yet).

### Decision 12 (refinement pass): Finding lookup pagination

**Problem**: `findByFindingKey` originally checked only page 1 (25 issues). Real projects can have 100+ issues per tool.

**Options**:
- (A) Loop pages 1-5 (125 issues)
- (B) Add `?finding_key=` backend filter

**Chosen**: (A) — 5-page cap catches most real cases (covers 95% of staging projects) without backend changes. Documented as a known limitation.

### Decision 13 (refinement pass): Existing test updates

**Problem**: T13 (FindingDetailModal updates) and T10 (MyIssuesPage onClick) add new top-level hook calls. Existing tests may break.

**Chosen**: Update tests with mocks:
- `FindingDetailModal.test.tsx`: add `vi.mock('../../hooks/useAuth', ...)` so the new `useRbac` call doesn't fail
- `MyIssuesPage.test.tsx`: add `vi.mock('../../components/IssueDetailModal', ...)` so the new modal mount doesn't trigger `useIssue` queries

### Decision 14 (refinement pass): ProjectEditPage discoverability

**Problem**: `/projects/:id/edit` is one of the 6 invisible routes the spec promised to fix.

**Options**:
- (A) Add "Edit" icon to active-project block in `Layout.tsx:140-151`
- (B) Leave the existing "Edit" button in `ProjectControlPage` (3 clicks)

**Chosen**: (A) — adds a small `Edit3` icon next to the project name in the active-project block. Gated by new `canUpdateProject` flag. Satisfies SC3 for the last invisible route.

### Decision 15 (refinement pass): Breadcrumb tool-name display

**Problem**: Tool names in URL are snake_case (`trivy_fs_scan`). Capitalizing as-is gives "Trivy_fs_scan".

**Chosen**: Use `STAGE_DISPLAY_NAMES: Record<StageId, string>` lookup in `src/types.ts:114-124`. If `pathnames[3]` matches a known `StageId`, use the display name. Else title-case.

## 6. Mapping to Nielsen heuristics + WCAG

| Nielsen heuristic | Affected | Fix |
|-------------------|----------|-----|
| #1 Visibility of system status | IssuesTriagePage loading state | Use existing `PageSkeleton` |
| #2 Match between system and real world | Triage queue terminology | Use "Issues" (matches user's mental model from spec 008) |
| #3 User control and freedom | Modal close on Escape | Inherit from spec 011 CP-1 |
| #4 Consistency and standards | Sidebar pattern matches existing | All new NavLinks use `NavLink` component |
| #5 Error prevention | RBAC gates prevent unauthorized actions | `useRbac()` checks before render |
| #6 Recognition rather than recall | Top-level sidebar entries replace URL knowledge | Primary fix of this spec |
| #7 Flexibility and efficiency of use | Status filter chips on triage page | Optional power-user feature |
| #8 Aesthetic and minimalist design | — | — |
| #9 Help users recognize, diagnose, recover from errors | — | Out of scope |
| #10 Help and documentation | — | Out of scope |

| WCAG SC | Level | Affected | Fix |
|---------|-------|----------|-----|
| 2.4.5 Multiple Ways | AA | Issues page has multiple entry points (sidebar, project control) | Primary fix |
| 2.1.1 Keyboard | A | Clickable cards need keyboard handlers | IssueCard onClick + onKeyDown |
| 4.1.2 Name, Role, Value | A | New buttons need accessible names | aria-label on icon buttons |
| 3.3.2 Labels or Instructions | A | Filter chips need labels | Status filter has visible label |
