# Spec: Discoverability & Navigation Fixes

**Branch**: `012-discoverability-fixes`
**Created**: 2026-06-16
**Status**: Draft
**Input**: User report: "the assign button is buried 3 layers deep and the layer 1 page is not visible from the dashboard" — followed by audit showing 6+ invisible UI paths the UX audit (spec 011) missed.

## Background

The UX audit (`specs/011-ux-audit/audit-report.md`) scored 0/100 on accessibility, page-size, and modal hygiene but never asked the cross-page question: **"can a user actually reach this action?"** A fresh audit (`specs/012-discoverability-fixes/research.md`) found:

- 6 of 14 protected routes have **no sidebar entry** and **no dashboard entry**.
- The full assignment workflow requires **URL knowledge** (`/projects/{id}/issues` is not linked anywhere).
- `IssueCard` in `MyIssuesPage` looks clickable but is a static `<div>` (`src/components/IssueCard.tsx:1-57`).
- `Breadcrumbs.tsx:27-82` has no cases for `/issues` or `/issues/:toolName`.
- 8+ mutating backend endpoints have hooks defined in `src/hooks/` that are **never imported** anywhere.
- Reports (`ProjectReportsPage`, `UnifiedReportPage`) are completely disconnected from the issue tracker — `FindingDetailModal` has no "Open in Issue Tracker" button.

## Clarifications

### Session 2026-06-16

- Q: Where should the new "Issues" / "Triage queue" entry live? → A: Top-level sidebar (always visible), between "My Issues" and "Pending Verification". The same pattern as other top-level entries. Per-user RBAC remains unchanged (`can_assign_issue` etc.).
- Q: Should I fix dead-code hooks (`useEditRescanRequest`, `useCancelRescanRequest`, etc.) too? → A: Tier 1 + Tier 2 only (nav + discoverability). Dead-code hooks stay (might be used by another tool, removing them is out of scope and risky).
- Q: Should there be a new "Unassigned Issues" page or a filter on the existing issues view? → A: New top-level page `IssuesTriagePage` at `/issues` (not `/issues/unassigned`) — it shows open/unassigned issues by default with filters. Reachable from the sidebar for both admin and team_lead; hidden for developers (they already have `/my-issues`).
- Q: "Open in Issue Tracker" button on finding detail modal — should it go to the issue if it exists, or always open a new one? → A: The SonarQube `sonar_issue_key` already maps issues to findings. If a matching `IssueDB` exists, link to it (`/projects/{id}/issues/{tool}?highlight={issue_id}`). If not, show a "Create issue" button that calls the existing `useCreateIssue` hook (already defined, not yet imported). This requires exposing the `useCreateIssue` mutation.
- Q: How aggressive on the sidebar? → A: Add 2 new top-level entries: "Issues" (`/issues` — triage queue, admin/team_lead only) and "Groups" (`/project-groups` — admin/team_lead only). Hide from developers. Use `useRbac()` to gate.

### Session 2026-06-16 (refinement pass — 8 gap-review questions)

- Q1 (Finding key): The `Finding` type has no `finding_key` field. Use `finding.id` for lookup. For `useCreateIssue`, use composite `finding.id + ':' + scan_id` for `issue_id` to avoid unique-index collisions across scans.
- Q2 (Groups RBAC): `useRbac.canViewAllProjects` is admin-only today. Add a new derived flag `canViewProjectGroups = isAdmin || isTeamLead` to `useRbac.ts`. FR1.3 uses it.
- Q3 (Edit project): Add a small "Edit" icon next to the project name in the `currentProject` block in `Layout.tsx:140-151`. Satisfies SC3 for the last invisible route.
- Q4 (Route guard): Inside `IssuesTriagePage`, if `!canAssignIssues && !isAdmin`, render `<Navigate to="/my-issues" replace />`. No new `ProtectedRoute` signature.
- Q5 (Project cap): Hard-cap `IssuesTriagePage` at the first 10 projects (one `getProjectOverview` call each, parallel). Show "Show more projects" link to a project filter when there are more.
- Q6 (User picker): Replace the free-text `<input>` in `IssueDetailModal:191-198` with a `<select>` populated from `api.rbac.getUsers()` filtered to project members. Update SC1 wording.
- Q7 (Triage details): Sort by severity desc (CRITICAL first), tiebreak by `last_seen_at` desc. Default status filter: `['open']` only. Add severity + tool filter chips. `refetchInterval: 60_000` (no WebSocket — issue channel doesn't exist yet).
- Q8 (Finding lookup): Client loops through `getToolIssues` pages 1-5 (cap at 125 issues scanned). If no match, return null. Documented in `contracts/api.md`.

### Session 2026-06-16 (gap-review follow-ups)

- Q9 (Success state): After "Create issue" succeeds in `FindingDetailModal`: close the finding modal, navigate to `/projects/{id}/issues/{tool}` and open the new issue's `IssueDetailModal`, show a success toast.
- Q10 (Error toast): Add `onError: (e) => addToast(...)` to the `useCreateIssue` mutation call in `FindingDetailModal`.
- Q11 (Modal close after navigate): After "Open in Issue Tracker" succeeds (existing issue found), close the finding modal AND navigate to `/projects/{id}/issues/{tool}` and open the existing issue's `IssueDetailModal`.
- Q12 (Breadcrumb tool name): Use `STAGE_DISPLAY_NAMES: Record<StageId, string>` lookup in `src/types.ts:114-124` if `pathnames[3]` matches a known stage, else title-case the segment. Avoid "Trivy_fs_scan".
- Q13 (Reports link): Add FR8 for an "Issues" link in `ProjectReportsPage` and `UnifiedReportPage` (was previously in Scope #6 but unanchored).
- Q14 (Existing test updates): T20 creates a NEW file `Layout.test.tsx` (rename for clarity). T13 update adds `vi.mock('../../hooks/useAuth', ...)` to `FindingDetailModal.test.tsx`. T10 update adds `vi.mock('../../components/IssueDetailModal', ...)` to `MyIssuesPage.test.tsx`.

## Documentation Index

| Document | Purpose |
|----------|---------|
| `spec.md` (this file) | Scope, user stories, FRs, success criteria |
| `plan.md` | File-level changes, integration order, risks |
| `research.md` | Audit findings, navigation gap inventory, decisions |
| `data-model.md` | No new tables; route map + RBAC matrix |
| `contracts/api.md` | Reuses existing endpoints; documents which dead hooks we leave alone |
| `tasks.md` | Dependency-ordered implementation tasks |
| `quickstart.md` | Manual test path for each user story |
| `checklists/requirements.md` | Quality validation |

## Scope

### In scope (Tier 1 + Tier 2)
1. Add "Issues" + "Groups" to the global sidebar (RBAC-gated via new `canViewProjectGroups` flag)
2. Make `IssueCard` clickable in `MyIssuesPage`
3. New `IssuesTriagePage` at `/issues` showing unassigned/open issues across all scoped projects (capped at 10 with "Show more")
4. Add "Issues" link in `ProjectControlPage` and `ProjectOverviewPage`
5. Add "Edit" icon in the active-project block in `Layout.tsx`
6. Fix `Breadcrumbs` for `/issues` and `/issues/:toolName` paths (use `STAGE_DISPLAY_NAMES` for tool-name display)
7. Add "Issues" tab/link in `ProjectReportsPage` and `UnifiedReportPage` (FR8)
8. Add "Open in Issue Tracker" button to `FindingDetailModal` (uses `findByFindingKey` with 5-page loop)
9. Wire `useCreateIssue` mutation so the button above can create issues from findings (composite `issue_id = finding.id + ':' + scan_id`)
10. Replace the free-text username input in `IssueDetailModal` with a `<select>` user picker (project members only)
11. In-page redirect for developers who reach `/issues` directly

### Out of scope
- Removing dead hooks (`useEditRescanRequest`, `useCancelRescanRequest`, `useScanReset`, etc.) — kept for future use
- Removing dead backend endpoints (`/fix-notes/{id}/raw`, `/scans/{id}/retry-reports`, project-group bulk-assign endpoints)
- Refactoring the 7 pages that exceed 300 lines (per audit CP-3) — separate spec
- Mobile-specific UX improvements
- New "Triage queue" widget on dashboard (the new top-level sidebar entry is sufficient)
- WebSocket live updates for issues (no issue channel exists yet; 60s `refetchInterval` is the workaround)
- Bulk-assign UI (select multiple, assign to one dev)

## User Stories

### User Story 1 — Triage queue is discoverable (Priority: P1)

As a **team lead**, I want a clearly visible "Issues" entry in the sidebar so that I can see and assign unassigned issues without knowing internal URLs.

**Why this priority**: The entire purpose of spec 008 (issue resolution platform) is to enable team leads to triage work. If they cannot find the page, the workflow is dead.

**Independent test**: Log in as team_lead → click "Issues" in sidebar → see list of open issues sorted by severity (CRITICAL first), grouped by project, with an Assign button per row → click Assign → select a developer from the dropdown → click submit. Total: 4 clicks (sidebar → card → Assign → select user → submit).

**Acceptance scenarios**:
1. Given the team lead logs in, when they look at the sidebar, then "Issues" appears between "My Issues" and "Pending Verification".
2. Given the team lead clicks "Issues", when the page loads, then they see issues with `status=open` (default filter) across all their scoped projects, sorted by severity desc, with `last_seen_at` as tiebreaker.
3. Given a developer logs in, when they navigate to `/issues` directly, then they are redirected to `/my-issues`.
4. Given the team lead has 10+ projects, when the page loads, then the first 10 projects are shown with a "Show more projects" link.
5. Given an open issue, when the team lead clicks "Assign" on the inline button, then the existing `useAssignIssue` mutation is called and the issue transitions to `assigned`.
6. Given severity + tool filter chips are rendered, when the team lead clicks a chip, then the list is filtered.
7. Given the page is idle for 60+ seconds, when the data is refetched, then new open issues are picked up (no WebSocket yet).

### User Story 2 — My Issues cards open the detail modal (Priority: P1)

As a **developer**, I want to click a card in "My Issues" so that I can see issue details, change status, or add a comment.

**Why this priority**: Currently `IssueCard` is non-interactive (`src/components/IssueCard.tsx:1-57`) — looks clickable, does nothing. This is a false affordance that breaks the most basic dev workflow.

**Independent test**: Log in as developer → "My Issues" → click any card → `IssueDetailModal` opens with the issue details.

**Acceptance scenarios**:
1. Given the developer clicks an IssueCard, when the click fires, then `IssueDetailModal` opens for that issue.
2. Given the modal is open, when the developer presses Escape, then the modal closes (CP-1 fix inherited).
3. Given the modal is open, when the developer uses Tab, then focus is trapped within the modal (CP-1 fix inherited).

### User Story 3 — Reports link to issues (Priority: P2)

As a **team lead**, I want to click "Open in Issue Tracker" on a finding in the reports so that I can move from a raw finding to a trackable issue without re-finding it.

**Why this priority**: Spec 008 promised the issue tracker would replace ad-hoc findings. The two systems are currently disconnected, which is a major workflow gap.

**Independent test**: Run a scan → go to Reports → click a finding → modal opens → click "Open in Issue Tracker" → either the existing issue opens or a new one is created.

**Acceptance scenarios**:
1. Given a finding whose `id` matches an existing `IssueDB.issue_id`, when the team lead clicks "Open in Issue Tracker", then the finding modal closes, the team lead is navigated to `/projects/{id}/issues/{tool}` and the existing issue's `IssueDetailModal` opens.
2. Given a finding with no matching issue, when the team lead clicks "Create issue", then the finding modal closes, the team lead is navigated to `/projects/{id}/issues/{tool}` and the new issue's `IssueDetailModal` opens, plus a success toast appears.
3. Given the `useCreateIssue` mutation fails, when the error is returned, then a red error toast is shown and the finding modal stays open.
4. Given the developer (not team lead) opens the same modal, when the button is rendered, then it is hidden (RBAC: `can_assign_issue`).
5. Given a project with 125+ issues, when `findByFindingKey` is called, then it scans pages 1-5 and returns the first match (cap to prevent runaway loops).

### User Story 4 — Project Groups is discoverable (Priority: P2)

As an **admin**, I want a "Groups" entry in the sidebar so that I can manage project groupings without URL knowledge.

**Independent test**: Log in as admin → click "Groups" → `ProjectGroupsPage` opens.

**Acceptance scenarios**:
1. Given the admin logs in, when they look at the sidebar, then "Groups" appears below "Issues".
2. Given the team lead logs in, when they look at the sidebar, then "Groups" is visible (new `canViewProjectGroups` flag is true for both admin and team_lead).
3. Given the developer logs in, when they look at the sidebar, then "Groups" is hidden (`canViewProjectGroups` is false for developer).

### User Story 5 — Breadcrumbs show the issue path (Priority: P2)

As any user, I want breadcrumbs to reflect the issue pages so that I can navigate back from a deep tool-issue view.

**Acceptance scenarios**:
1. Given the user is on `/projects/{id}/issues/{tool}`, when the page renders, then breadcrumbs show: `Dashboard → {Project Name} → Issues → {Tool Display Name}` (using `STAGE_DISPLAY_NAMES` if the tool is a known stage, else title-cased).
2. Given the user is on `/projects/{id}/issues`, then breadcrumbs show: `Dashboard → {Project Name} → Issues`.
3. Given the user is on `/issues` (triage queue), then breadcrumbs show: `Dashboard → Issues`.

### User Story 6 — Issues link from project pages (Priority: P3)

As any user on a project, I want an "Issues" link on the project control page and project overview page so that I can move from project management to issue management.

**Acceptance scenarios**:
1. Given the user is on `ProjectControlPage`, when the page renders, then an "Issues" link is in the action button row (next to "Custom Scan" / "Edit").
2. Given the user is on `ProjectOverviewPage`, when the page renders, then each `ToolCard` has hover state hinting at clickability (the cards are already clickable; this is purely a UX hint).

### User Story 7 — Edit Project is discoverable from the active-project block (Priority: P3)

As a **team_lead** or **admin**, I want a small "Edit" icon in the active-project block of the sidebar so that I can edit a project without navigating back to its control page first.

**Acceptance scenarios**:
1. Given a project is active in the sidebar, when the user looks at the project block, then an "Edit" icon is visible next to the project name.
2. Given the user clicks the "Edit" icon, when the click fires, then they are navigated to `/projects/{id}/edit`.
3. Given a developer is logged in, when the project block renders, then the "Edit" icon is hidden (developer can only view, not edit).

### User Story 8 — User picker replaces free-text on Assign (Priority: P2)

As a **team lead**, I want a dropdown of project members instead of a free-text username field when I assign an issue, so that I don't have to remember exact usernames.

**Acceptance scenarios**:
1. Given the team lead opens `IssueDetailModal` for an open issue, when the Assign control renders, then a `<select>` of project members is shown (not a text input).
2. Given the team lead selects a user and clicks "Assign", when the mutation succeeds, then the issue moves to `assigned` and the select resets.
3. Given the team lead is viewing an issue in a project with 0 members, when the select renders, then it shows "No project members" and the Assign button is disabled.

## Functional Requirements

### FR1: Sidebar navigation
- **FR1.1**: Add "Issues" `NavLink` to `Layout.tsx:124-130` between "My Issues" and "Pending Verification", icon: `ListChecks` (lucide).
- **FR1.2**: Add "Groups" `NavLink` after "Issues", icon: `FolderTree` (lucide).
- **FR1.3**: Both new entries are wrapped in a `useRbac()` check: "Issues" requires `canAssignIssues || isAdmin`; "Groups" requires new `canViewProjectGroups` flag (`isAdmin || isTeamLead`).
- **FR1.4**: New routes `IssuesTriagePage` and existing `ProjectGroupsPage` must be registered in `App.tsx`.
- **FR1.5**: Add "Edit" icon to the active-project block in `Layout.tsx:140-151` (next to project name), navigates to `/projects/{id}/edit`. Visible when `canUpdateProject` (new flag, `isAdmin || isTeamLead`). Hidden for developers.

### FR2: IssuesTriagePage
- **FR2.1**: New page at `/issues`. Component: `src/pages/IssuesTriagePage.tsx`.
- **FR2.2**: Shows issues with default status filter `['open']` (NOT `['open', 'assigned']` — assigned issues are visible in My Issues for the assignee). Sort by severity desc, tiebreak by `last_seen_at` desc.
- **FR2.3**: Hard cap at 10 projects. If user has access to more, render "Show more projects" link that navigates to a project filter.
- **FR2.4**: One `getProjectOverview` call per project (parallel via `Promise.allSettled`). For each project, issues are loaded by calling `getToolIssues` per tool with the active status filter.
- **FR2.5**: Grouped by project (collapsible sections, same pattern as `MyIssuesPage`).
- **FR2.6**: Header shows total count, plus filter chips for status (`open`, `assigned`, `in_progress`, `fixed`, `verified`, `rejected`), severity (CRITICAL/HIGH/MEDIUM/LOW), and tool (from `STAGE_DISPLAY_NAMES` keys).
- **FR2.7**: Each row has the same `IssueCard` component, but with an inline "Assign" button visible when `canAssignIssues` is true. Clicking the button opens `IssueDetailModal` (reuses existing modal from `ToolDetailViewPage`).
- **FR2.8**: Clicking the card body (outside the Assign button) also opens the modal.
- **FR2.9**: `refetchInterval: 60_000` (60-second poll, no WebSocket — issue channel does not exist yet).
- **FR2.10**: In-page guard: if `!canAssignIssues && !isAdmin`, render `<Navigate to="/my-issues" replace />`.
- **FR2.11**: Empty states: (a) 0 projects → "No projects assigned to you. Contact admin."; (b) 0 issues → "No open issues. Nice work!".

### FR3: IssueCard clickable
- **FR3.1**: `src/components/IssueCard.tsx` accepts an optional `onClick` prop. When provided, the card becomes a `<button>` with `onClick`, `onKeyDown` (Enter/Space), and `type="button"` (not "submit" if inside a form).
- **FR3.2**: `MyIssuesPage` passes an `onClick` that opens `IssueDetailModal` for that issue. `IssuesTriagePage` does the same.
- **FR3.3**: When `onClick` is not provided, the card renders as a read-only `<div>` (backward compatible).

### FR4: Open in Issue Tracker
- **FR4.1**: `src/components/FindingDetailModal.tsx` gets a footer button "Open in Issue Tracker".
- **FR4.2**: Button calls `api.issues.findByFindingKey(projectId, tool, finding.id)`. The client loops through `getToolIssues` pages 1-5 (cap at 125 issues scanned). Returns first match on `issue.issue_id === finding.id`, or null.
- **FR4.3**: If found, close the finding modal, navigate to `/projects/{id}/issues/{tool}` and open the existing issue's `IssueDetailModal`. Show success toast "Issue found".
- **FR4.4**: If not found, show a "Create issue" sub-button that calls `useCreateIssue` with `issue_id: finding.id + ':' + scan_id` (composite for uniqueness). On success: close finding modal, navigate, open new issue's modal, show success toast "Issue created".
- **FR4.5**: On `useCreateIssue` failure: red error toast via `useToast()`. Finding modal stays open.
- **FR4.6**: Button is only visible when `canAssignIssues` is true (gated by `useRbac()`).
- **FR4.7**: `FindingDetailModal` accepts a new prop `projectId: string` (required) and `scanId: string` (required). Both call sites (`ProjectReportsPage`, `UnifiedReportPage`, and any other page that opens the modal) must pass them.
- **FR4.8**: Uses the existing `useCreateIssue` mutation - no new backend endpoint required.

### FR5: Project Groups sidebar entry
- **FR5.1**: Already in scope via FR1.2. New `NavLink` for `/project-groups` with `FolderTree` icon.
- **FR5.2**: No backend changes; route already exists in `App.tsx:133-140`.

### FR6: Breadcrumbs fix
- **FR6.1**: `src/components/Breadcrumbs.tsx:27-82` adds cases for `pathnames[0] === 'issues'` (no projectId) → "Issues" crumb.
- **FR6.2**: `pathnames.includes('issues')` adds "Issues" crumb after project name.
- **FR6.3**: When `pathnames[2] === 'issues'` AND `pathnames[3]` is a tool name (e.g., `sonarqube`), add the tool name as a final crumb. Use `STAGE_DISPLAY_NAMES[pathnames[3] as StageId]` if it matches a known stage, else title-case the segment.

### FR7: Project page issues link
- **FR7.1**: `ProjectControlPage` action row adds an "Issues" link button (between "Custom Scan" and "Edit"), navigating to `/projects/{id}/issues`.
- **FR7.2**: `ProjectOverviewPage` `ToolCard` already navigates on click; no change needed for FR7.2.

### FR8: Reports ↔ Issues cross-link (anchors scope #6)
- **FR8.1**: `ProjectReportsPage` gets an "Issues" link in the page header or action row, navigating to `/projects/{id}/issues`. Visible to users with `canAssignIssues` or `isAdmin`.
- **FR8.2**: `UnifiedReportPage` gets the same "Issues" link with the same gating.

### FR9: User picker on Assign (IssueDetailModal)
- **FR9.1**: `src/components/IssueDetailModal.tsx:191-198` — replace the `<input type="text" placeholder="Username...">` with a `<select>` populated from `api.rbac.getUsers()` filtered to project members of the issue's `project_id`.
- **FR9.2**: If the project has 0 members, render "No project members" and disable the Assign button.
- **FR9.3**: On submit, the `useAssignIssue` mutation is called with the selected `assignee_id`. The select resets after success.
- **FR9.4**: Test the modal with `useRbac` mocked to `canAssignIssues: true` and a list of project members.

### FR10: New useRbac flags
- **FR10.1**: `src/hooks/useRbac.ts` adds two derived flags: `canViewProjectGroups: isAdmin || isTeamLead` and `canUpdateProject: isAdmin || isTeamLead` (the latter already exists implicitly as `canViewAllProjects`, but renaming for clarity — backward compat is preserved by keeping the old name).
- **FR10.2**: New flags are exported from the hook so other components can use them.

## Success Criteria

- **SC1**: A new user (admin or team_lead) can navigate from login to assigning an issue in **3 clicks + select user** (sidebar → triage queue card → click Assign → select from dropdown → submit), down from the current 5 clicks with URL knowledge + free-text username.
- **SC2**: A new developer can navigate from login to viewing issue details in **2 clicks** (sidebar → My Issues → click card), down from 2 clicks but with a broken non-interactive card.
- **SC3**: All 6 invisible routes (issues, issues/:tool, project-groups, project/:id/issues, project/:id/issues/:tool, project/:id/edit) have a discoverable entry point from the global nav OR the project context nav block.
- **SC4**: `npm run lint && npm run build && npx vitest run` all pass with no new errors.
- **SC5**: New `IssuesTriagePage` has at least one Vitest test covering: renders empty state (0 projects), renders issues grouped by project, sort by severity, Assign button calls mutation, in-page redirect for developers.
- **SC6**: All added NavLinks are keyboard-accessible (tab-focusable, Enter activates).
- **SC7**: `IssuesTriagePage` performs 60-second `refetchInterval` polling (no WebSocket dependency).
- **SC8**: `IssuesTriagePage` hard-caps at 10 projects with a "Show more" link.
- **SC9**: `IssueDetailModal` Assign control uses a `<select>` of project members (not free-text).
