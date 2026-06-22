# Quickstart: Discoverability & Navigation Fixes

**Spec**: `spec.md`
**Last updated**: 2026-06-16

Manual verification path for each user story.

## Pre-requisites

```bash
# Stack must be running
python run.py staging

# Or for dev with hot-reload
python run.py dev
```

Default login: `admin` / `admin123` at http://localhost:5173

## Test Path SC1 — Triage queue discoverable (admin)

1. Open http://localhost:5173/login
2. Log in as `admin` / `admin123`
3. **Look at the left sidebar**
4. **EXPECTED**: Between "My Issues" and "Pending Verification", there is a new "Issues" entry with a list-checks icon (`ListChecks`).
5. Below "Issues" there is a "Groups" entry with a folder-tree icon (`FolderTree`).
6. Click "Issues"
7. **EXPECTED**: URL becomes `/issues`. Page title is "Issues" or "Triage Queue". A list of issues with `status=open` (default filter) appears, sorted by severity (CRITICAL first), grouped by project. Severity + tool filter chips are at the top.
8. **EXPECTED (SC8)**: If user has 10+ projects, only the first 10 are shown with a "Show more projects" link.
9. Click an unassigned issue card
10. **EXPECTED**: `IssueDetailModal` opens
11. **EXPECTED (SC9)**: The Assign control is a `<select>` dropdown of project members (not a text input).
12. Select a user, click "Assign"
13. **EXPECTED**: Modal closes, issue moves to `assigned` status, success toast appears

## Test Path SC2 — My Issues cards now clickable (developer)

1. Log out (top-right user menu)
2. Log in as a developer account (create one via `/users` as admin first if needed)
3. **EXPECTED**: Sidebar shows "My Issues" but NOT "Issues" or "Groups"
4. **EXPECTED (Q4)**: Navigate to `/issues` directly (URL bar). The page redirects to `/my-issues`.
5. Click "My Issues"
6. Click any issue card
7. **EXPECTED (NEW)**: `IssueDetailModal` opens for that issue. (Previously: nothing happened.)
8. Press Escape
9. **EXPECTED**: Modal closes (a11y fix from spec 011 CP-1 inherited)

## Test Path SC3 — Reports link to issues (team_lead)

1. Log in as `team_lead` (or admin)
2. Run a scan on any project (Dashboard → "Manage" → "Start Scan")
3. Wait for scan to complete (or use an existing completed scan)
4. Go to Reports (Dashboard → "View Reports")
5. **EXPECTED (FR8.1)**: Page header has an "Issues" link
6. Click a finding in the findings table
7. **EXPECTED**: `FindingDetailModal` opens with finding details
8. **EXPECTED (NEW)**: Footer has an "Open in Issue Tracker" button (gated by `canAssignIssues`)
9. Click "Open in Issue Tracker"
10. **EXPECTED (PATH A)**: If a matching `IssueDB.issue_id` exists, finding modal closes, navigates to `/projects/{id}/issues/{tool}` and opens the issue's `IssueDetailModal`, success toast "Issue found"
11. **EXPECTED (PATH B)**: If no matching issue, the "Create issue" sub-button is shown. Click it → `useCreateIssue` is called with composite `issue_id` → success toast "Issue created" → new issue's modal opens

## Test Path SC4 — Project Groups discoverable (admin + team_lead)

1. Log in as `admin`
2. **EXPECTED**: Sidebar has "Groups" entry
3. Click "Groups"
4. **EXPECTED**: `ProjectGroupsPage` opens at `/project-groups`
5. Log out, log in as `team_lead`
6. **EXPECTED (Q2)**: Sidebar STILL has "Groups" entry (new `canViewProjectGroups` flag is true for team_lead)
7. Log out, log in as `developer`
8. **EXPECTED**: Sidebar has NO "Groups" entry

## Test Path SC5 — Breadcrumbs on issues pages

1. Log in as `admin`
2. Navigate to `/projects/{any-project-id}/issues` (via Dashboard → Manage → Issues link, FR7.1)
3. **EXPECTED**: Breadcrumbs show: `Dashboard → {Project Name} → Issues`
4. Click a tool
5. **EXPECTED (Q12)**: Breadcrumbs show: `Dashboard → {Project Name} → Issues → {Tool Display Name}`. For `trivy_fs_scan`, this should be "Trivy Fs Scan" (via `STAGE_DISPLAY_NAMES`), not "Trivy_fs_scan".

## Test Path SC6 — Project control page has Issues link

1. Log in as `admin`
2. Dashboard → "Manage" on any project
3. **EXPECTED (NEW, FR7.1)**: Action row has an "Issues" link button (between "Custom Scan" and "Edit" or similar position)
4. Click "Issues"
5. **EXPECTED**: Navigates to `/projects/{id}/issues`

## Test Path SC7 — Edit icon in active-project block (admin + team_lead)

1. Log in as `admin`
2. Navigate to a project's control page (e.g., `/projects/{id}`)
3. **EXPECTED (NEW, FR1.5)**: The active-project block in the sidebar has a small "Edit" icon next to the project name
4. Click the "Edit" icon
5. **EXPECTED**: Navigates to `/projects/{id}/edit`
6. Log out, log in as `team_lead`
7. **EXPECTED**: Edit icon is visible (gated by `canUpdateProject`)
8. Log out, log in as `developer`
9. **EXPECTED**: Edit icon is hidden

## Test Path SC9 — User picker on Assign (admin)

1. Log in as `admin`
2. Navigate to a project with multiple members (or seed data)
3. Open any unassigned issue in `IssueDetailModal`
4. **EXPECTED (NEW, FR9)**: The Assign control is a `<select>` dropdown of project members (not a free-text input)
5. Select a user, click "Assign"
6. **EXPECTED**: Issue transitions to `assigned`, the select resets
7. In a project with 0 members, the select should show "No project members" and the Assign button is disabled

## Automated verification

```bash
# Run after each task group
npm run lint
npm run build
npx vitest run

# Full test suite
npm run lint && npm run build && npx vitest run
```

## Rollback plan

If any of T08/T20 (new page / new modal button) breaks production:

1. Revert commit
2. The sidebar NavLinks (T03) and IssueCard onClick (T05) are safe to keep (additive, no breaking changes to existing call sites)
3. The most risky change is `FindingDetailModal` adding a button (T20) — verify with admin role manually before staging deploy

## Known limitations (deferred to future specs)

- IssuesTriagePage hard-caps at 10 projects with "Show more" link. For deployments with 50+ projects, consider adding a dedicated `GET /issues?status=open&assignee_id=null&scope=all` endpoint.
- IssuesTriagePage uses 60s `refetchInterval` polling (no WebSocket — issue channel does not exist yet).
- "Open in Issue Tracker" loops through 5 pages of `getToolIssues` (catches 95% of real cases). For tools with 1000+ issues per project, add a `?finding_id=` backend filter.
- "Open in Issue Tracker" assumes `finding.id` is stable per finding across rescans. True for SonarQube; best-effort for other tools.
- Dead hooks and dead backend endpoints are explicitly NOT removed in this spec.
