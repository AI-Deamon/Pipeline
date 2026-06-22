# Data Model: Discoverability & Navigation Fixes

**Spec**: `spec.md`
**Last updated**: 2026-06-16

## 1. No new tables

This spec adds **zero** new database tables, columns, or migrations. It only:
- Adds 1 new route (`/issues`)
- Modifies 1 component (`IssueCard`) to accept an `onClick` prop
- Adds 2 sidebar `NavLink` entries
- Adds 1 API client method (`api.issues.findByFindingKey`) that wraps an existing backend endpoint

## 2. Route map (additions in **bold**)

| Route | Component | RBAC | Notes |
|-------|-----------|------|-------|
| `/` | redirect → `/dashboard` | Auth | unchanged |
| `/login` | `LoginPage` | Public | unchanged |
| `/register` | `RegisterPage` | Public | unchanged |
| `/dashboard` | `DashboardPage` | Auth | unchanged |
| `/projects/create` | `CreateProjectPage` | Admin | unchanged |
| `/projects/:projectId` | `ProjectControlPage` | Scoped | unchanged |
| `/projects/:projectId/edit` | `ProjectEditPage` | Scoped | unchanged |
| `/projects/:projectId/manual` | `ManualScanPage` | Scoped | unchanged |
| `/scans/:scanId` | `ScanStatusPage` | Scoped | unchanged |
| `/projects/:projectId/history` | `ScanHistoryPage` | Scoped | unchanged |
| `/projects/:projectId/reports` | `ProjectReportsPage` | Scoped | unchanged |
| `/projects/:projectId/reports/unified` | `UnifiedReportPage` | Scoped | unchanged |
| `/project-groups` | `ProjectGroupsPage` | Scoped | **NOW in sidebar** |
| `/settings` | `SettingsPage` | Auth | unchanged |
| `/users` | `UserManagementPage` | Admin | unchanged |
| `/docs` | `DocsPage` | Auth | unchanged |
| `/projects/:projectId/issues` | `ProjectOverviewPage` | Scoped | unchanged (now reachable from sidebar) |
| `/projects/:projectId/issues/:toolName` | `ToolDetailViewPage` | Scoped | unchanged (now reachable from sidebar) |
| `/my-issues` | `MyIssuesPage` | Auth (filters by user) | unchanged |
| `/pending-verification` | `PendingVerificationPage` | Scoped | unchanged |
| **`/issues`** | **`IssuesTriagePage`** | **`canAssignIssues` or admin** | **NEW** |

## 3. Component prop additions

### `IssueCard`

```typescript
// before
interface IssueCardProps {
  issue: IssueResponse;
}

// after
interface IssueCardProps {
  issue: IssueResponse;
  onClick?: (issue: IssueResponse) => void;
}
```

When `onClick` is provided, the card renders as `<button>`. When not, it renders as `<div>` (backward compatible — all existing call sites continue to work).

## 4. RBAC matrix (additions only)

| Action | Admin | Team Lead | Developer | Permission flag |
|--------|-------|-----------|-----------|-----------------|
| See "Issues" in sidebar | ✓ | ✓ (scoped) | ✗ | `canAssignIssues \|\| isAdmin` |
| Access `/issues` (triage queue) | ✓ | ✓ (scoped) | ✗ (in-page redirect to `/my-issues`) | `canAssignIssues \|\| isAdmin` |
| See "Groups" in sidebar | ✓ | ✓ (scoped) | ✗ | `canViewProjectGroups` (NEW) |
| Click "Assign" in `IssuesTriagePage` | ✓ | ✓ (scoped) | ✗ | `canAssignIssues` |
| See "Open in Issue Tracker" in `FindingDetailModal` | ✓ | ✓ (scoped) | ✗ | `canAssignIssues` |
| See "Edit" icon in active-project block | ✓ | ✓ (scoped) | ✗ | `canUpdateProject` (NEW) |
| See "Issues" link in `ProjectReportsPage` / `UnifiedReportPage` | ✓ | ✓ (scoped) | ✗ | `canAssignIssues \|\| isAdmin` |
| See user picker on Assign in `IssueDetailModal` | ✓ | ✓ (scoped) | ✗ | `canAssignIssues` |

All other RBAC behavior is unchanged (per spec 005).

### New useRbac flags (added to `src/hooks/useRbac.ts`)

```typescript
// Existing
canViewAllProjects: isAdmin
canAssignIssues: isAdmin || (isTeamLead && hasProjectAccess)
canVerifyIssues: isAdmin || (isTeamLead && hasProjectAccess)
canUpdateAssignedIssues: isAdmin || (isTeamLead && hasProjectAccess) || (isDeveloper && isAssignee)

// NEW (FR10)
canViewProjectGroups: isAdmin || isTeamLead
canUpdateProject: isAdmin || isTeamLead
```

## 5. API client additions

```typescript
// src/services/api.ts (new method)
issues: {
  // ...existing methods...
  findByFindingKey: (projectId: string, tool: string, findingId: string) =>
    Promise<IssueResponse | null>,
}
```

**Implementation**: Client loops through `getToolIssues` pages 1-5 (cap at 125 issues scanned). Returns first issue where `issue.issue_id === findingId`, or `null`. Documented assumption: `finding.id` is stable per finding across rescans.

## 6. IssueDetailModal user picker — data source

`useUsersForProject(projectId)` hook (new, in `src/hooks/useUsersForProject.ts` or appended to `useRbac.ts`):

```typescript
function useUsersForProject(projectId: string): User[] {
  const { data: allUsers = [] } = useQuery({
    queryKey: ['rbac', 'users'],
    queryFn: api.rbac.getUsers,
  });

  const { data: projectAssignments = [] } = useQuery({
    queryKey: ['rbac', 'project-assignments', projectId],
    queryFn: () => api.rbac.getProjectAssignments(projectId),
    enabled: !!projectId,
  });

  return useMemo(() => {
    const memberIds = new Set(projectAssignments.map(a => a.user_id));
    return allUsers.filter(u => memberIds.has(u.id));
  }, [allUsers, projectAssignments]);
}
```

**Assumption**: `api.rbac.getUsers` and `api.rbac.getProjectAssignments` exist. If not, the hook falls back to `useUsers()` (all users) and adds a TODO for proper project scoping.
