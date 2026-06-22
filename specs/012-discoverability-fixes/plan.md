# Plan: Discoverability & Navigation Fixes

**Spec**: `spec.md`
**Last updated**: 2026-06-16

## 1. File-by-file change list

### Frontend (src/)

| File | Change | FR |
|------|--------|----|
| `src/hooks/useRbac.ts` | Add 2 derived flags: `canViewProjectGroups`, `canUpdateProject` | FR10 |
| `src/components/Layout.tsx` | Import `ListChecks`, `FolderTree`, `Edit3` from `lucide-react`; add `useRbac()` call; add "Issues" + "Groups" `NavLink` (gated by FR1.3); add "Edit" icon to active-project block (FR1.5) | FR1, FR10 |
| `src/App.tsx` | Add `<Route path="/issues" element={<IssuesTriagePage />} />` | FR2.1 |
| `src/pages/IssuesTriagePage.tsx` | **NEW** — Triage queue page with sort, filter chips, project cap, in-page redirect | FR2 |
| `src/components/IssueCard.tsx` | Accept optional `onClick` prop; render as `<button>` when provided | FR3 |
| `src/pages/MyIssuesPage.tsx` | Pass `onClick` to `IssueCard` that opens `IssueDetailModal`; mount modal; update test to mock modal | FR3.2, GAP-14 |
| `src/components/IssueDetailModal.tsx` | Replace free-text `<input>` with `<select>` of project members; new useUsersForProject hook | FR9 |
| `src/components/FindingDetailModal.tsx` | Add `projectId`, `scanId` props; add "Open in Issue Tracker" + "Create issue" footer buttons; success/error toasts; update test to mock useAuth | FR4, GAP-4, GAP-11, GAP-13 |
| `src/hooks/useIssues.ts` | `useCreateIssue` already exported; add `useIssueByFindingKey` TanStack Query hook | FR4 |
| `src/hooks/useRbac.ts` | Add `useUsersForProject(projectId)` (calls `api.rbac.getUsers`, filters by project assignment) | FR9.1 |
| `src/services/api.ts` | Add `api.issues.findByFindingKey(projectId, tool, findingKey)` method (5-page loop) | FR4.2 |
| `src/components/Breadcrumbs.tsx` | Add cases for `pathnames[0] === 'issues'`; `pathnames.includes('issues')`; tool name at `pathnames[3]` with `STAGE_DISPLAY_NAMES` lookup | FR6, GAP-20 |
| `src/pages/ProjectControlPage.tsx` | Add "Issues" link button in action row (between "Custom Scan" and "Edit") | FR7.1 |
| `src/pages/ProjectOverviewPage.tsx` | No change (cards already clickable) | FR7.2 |
| `src/pages/ProjectReportsPage.tsx` | Add "Issues" link in page header (gated by `canAssignIssues || isAdmin`) | FR8.1 |
| `src/pages/UnifiedReportPage.tsx` | Add same "Issues" link with same gating | FR8.2 |

### Backend (backend/app/api/)

**No backend changes.** All fixes use existing endpoints. `findByFindingKey` is implemented client-side with a 5-page loop over `getToolIssues`.

### Tests (src/tests/)

| File | Change |
|------|--------|
| `src/tests/pages/IssuesTriagePage.test.tsx` | **NEW** — empty state (0 projects), 0 issues, sort by severity, in-page redirect for developers, Assign button |
| `src/tests/components/IssueCard.test.tsx` | Add test: clickable variant calls onClick |
| `src/tests/components/Layout.test.tsx` | **NEW FILE** — "Issues" + "Groups" NavLinks for admin, hidden for developer; "Edit" icon in active-project block |
| `src/tests/components/Breadcrumbs.test.tsx` | Add test: issues path produces correct crumb chain with `STAGE_DISPLAY_NAMES` lookup |
| `src/tests/components/FindingDetailModal.test.tsx` | Update to mock `useAuth`; add test: "Open in Issue Tracker" calls `findByFindingKey` and navigates; "Create issue" calls `useCreateIssue` |
| `src/tests/components/IssueDetailModal.test.tsx` | Add test: `<select>` user picker replaces free-text input; project members only |
| `src/tests/pages/MyIssuesPage.test.tsx` | Update to mock `IssueDetailModal` so the new click handler is testable in isolation |

## 2. Integration order (dependency graph)

```
Step 1 (foundation, parallel):
  - useRbac: add canViewProjectGroups, canUpdateProject   [no deps]
  - IssueCard: add onClick prop                            [no deps]
  - Breadcrumbs: add issues cases                          [no deps]

Step 2 (depends on Step 1):
  - Layout: add NavLinks + Edit icon + RBAC gate           [useRbac]
  - App.tsx: register /issues route                        [no deps]

Step 3 (depends on Step 2):
  - IssuesTriagePage: new page                             [IssueCard, useRbac]
  - MyIssuesPage: wire onClick + mock modal in test        [IssueCard]
  - ProjectControlPage: add Issues link                    [no deps]
  - ProjectReportsPage: add Issues link                    [no deps]
  - UnifiedReportPage: add Issues link                     [no deps]
  - IssueDetailModal: replace free-text with <select>      [api.rbac.getUsers]
  - api.issues.findByFindingKey: 5-page loop               [getToolIssues]

Step 4 (depends on Step 3):
  - FindingDetailModal: projectId+scanId props, Open in Issue Tracker, Create issue, toasts  [findByFindingKey, useCreateIssue, useRbac]
  - Tests for each new component
  - Update existing tests (FindingDetailModal, MyIssuesPage)

Step 5 (verification):
  - npm run lint && npm run build && npx vitest run
  - Manual: log in as admin, complete SC1-SC9
```

## 3. Component sketches

### useRbac.ts (additions)

```typescript
// Add to existing useRbac hook
const isAdmin = user?.role === 'admin';
const isTeamLead = user?.role === 'team_lead';
const isDeveloper = user?.role === 'developer';

return {
  // ... existing flags
  canViewProjectGroups: isAdmin || isTeamLead,
  canUpdateProject: isAdmin || isTeamLead,
};
```

### Layout.tsx (additions)

```tsx
// At top, add to imports:
import { useRbac } from '../hooks/useRbac';
import { ListChecks, FolderTree, Edit3 } from 'lucide-react';

// Inside Layout, before the return:
const { isAdmin, canAssignIssues, canViewProjectGroups, canUpdateProject } = useRbac();

// In the nav block (after My Issues NavLink):
{(canAssignIssues || isAdmin) && (
  <NavLink to="/issues" icon={ListChecks} isActive={isActive('/issues')} onNavigate={handleNavClick}>Issues</NavLink>
)}
{canViewProjectGroups && (
  <NavLink to="/project-groups" icon={FolderTree} isActive={isActive('/project-groups')} onNavigate={handleNavClick}>Groups</NavLink>
)}

// In the active-project block (around Layout.tsx:140-151), add Edit icon:
{showProjectContext && canUpdateProject && (
  <Link
    to={`/projects/${currentProject?.id}/edit`}
    aria-label={`Edit ${currentProject?.name}`}
    className="..."
  >
    <Edit3 className="w-4 h-4" />
  </Link>
)}
```

### IssuesTriagePage.tsx (skeleton)

```tsx
const PROJECT_CAP = 10;
const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0, high: 1, medium: 2, low: 3,
};

const IssuesTriagePage = () => {
  const { canAssignIssues, isAdmin } = useRbac();
  const [statusFilter, setStatusFilter] = useState<IssueStatus[]>(['open']);
  const [severityFilter, setSeverityFilter] = useState<Severity[]>([]);
  const [toolFilter, setToolFilter] = useState<string[]>([]);
  const [selectedIssueId, setSelectedIssueId] = useState<number | null>(null);

  // Guard: developers → /my-issues
  if (!canAssignIssues && !isAdmin) {
    return <Navigate to="/my-issues" replace />;
  }

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: api.projects.list,
    refetchInterval: 60_000,
  });

  const visibleProjects = projects.slice(0, PROJECT_CAP);
  const hasMoreProjects = projects.length > PROJECT_CAP;

  // Per project: load overview, then per-tool issues
  // ... (Promise.allSettled over visible projects)

  // Sort all issues: severity desc, then last_seen_at desc
  const sorted = [...allIssues].sort((a, b) => {
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sev !== 0) return sev;
    return new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime();
  });

  // Filter
  const filtered = sorted.filter(i =>
    statusFilter.includes(i.status) &&
    (severityFilter.length === 0 || severityFilter.includes(i.severity)) &&
    (toolFilter.length === 0 || toolFilter.includes(i.tool_name))
  );

  // Group by project
  const grouped = groupBy(filtered, i => i.project_id);

  return (
    <div>
      {/* Header with filter chips */}
      {/* Per-project collapsible section */}
      {/* IssueCard per issue with onClick opening modal */}
      <IssueDetailModal issueId={selectedIssueId} onClose={() => setSelectedIssueId(null)} />
    </div>
  );
};
```

### IssueCard.tsx (modified)

```tsx
interface IssueCardProps {
  issue: IssueResponse;
  onClick?: (issue: IssueResponse) => void;
}

const IssueCard = memo(function IssueCard({ issue, onClick }: IssueCardProps) {
  const handleClick = () => onClick?.(issue);
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  const content = ( /* ... existing JSX ... */ );

  if (!onClick) {
    return <div className="..."> {content} </div>;
  }
  return (
    <button
      type="button"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="w-full text-left ..."
    >
      {content}
    </button>
  );
});
```

### IssueDetailModal.tsx (user picker)

```tsx
// Replace the free-text <input> at IssueDetailModal.tsx:191-198 with:
const { data: projectMembers = [] } = useUsersForProject(issue.project_id);

<select
  value={assigneeId}
  onChange={(e) => setAssigneeId(e.target.value)}
  className="..."
  disabled={projectMembers.length === 0}
>
  <option value="">{projectMembers.length === 0 ? 'No project members' : 'Select user...'}</option>
  {projectMembers.map(u => (
    <option key={u.id} value={u.username}>{u.username}</option>
  ))}
</select>
<button onClick={handleAssign} disabled={!assigneeId || assignMutation.isPending || projectMembers.length === 0}>
  {assignMutation.isPending ? <Loader2 className="animate-spin" /> : <UserCheck />}
  Assign
</button>
```

### FindingDetailModal.tsx (additions)

```tsx
// Add new props:
interface FindingDetailModalProps {
  finding: Finding | null;
  projectId: string;
  scanId: string;
  onClose: () => void;
}

// In footer:
const { canAssignIssues } = useRbac();
const { addToast } = useToast();
const navigate = useNavigate();
const lookupMutation = useIssueByFindingKey(projectId, finding?.tool, finding?.id);
const createMutation = useCreateIssue();

const handleOpenInIssueTracker = async () => {
  const result = await lookupMutation.refetch();
  if (result.data) {
    addToast({ type: 'success', title: 'Issue found' });
    onClose();
    navigate(`/projects/${projectId}/issues/${finding.tool}?highlight=${result.data.id}`);
  }
};

const handleCreateIssue = async () => {
  try {
    const created = await createMutation.mutateAsync({
      project_id: projectId,
      issue_id: `${finding.id}:${scanId}`,  // composite for uniqueness
      tool_name: finding.tool,
      title: finding.title,
      severity: finding.severity,
    });
    addToast({ type: 'success', title: 'Issue created' });
    onClose();
    navigate(`/projects/${projectId}/issues/${finding.tool}?highlight=${created.id}`);
  } catch (e) {
    addToast({ type: 'error', title: 'Failed to create issue', message: (e as Error).message });
  }
};

{canAssignIssues && (
  <div className="flex gap-2">
    <button onClick={handleOpenInIssueTracker} disabled={lookupMutation.isFetching}>
      {lookupMutation.isFetching ? <Loader2 className="animate-spin" /> : <Bug />}
      Open in Issue Tracker
    </button>
    {!lookupMutation.data && (
      <button onClick={handleCreateIssue} disabled={createMutation.isPending}>
        {createMutation.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
        Create issue
      </button>
    )}
  </div>
)}
```

### Breadcrumbs.tsx (additions)

```tsx
// In pathnames mapping:
{pathnames[0] === 'issues' && (
  <span className="text-slate-900">Issues</span>
)}

{pathnames.includes('issues') && activeProjectId && (
  <>
    <ChevronRight ... />
    <Link to={`/projects/${activeProjectId}/issues`}>Issues</Link>
  </>
)}

{pathnames[2] === 'issues' && pathnames[3] && (
  <>
    <ChevronRight ... />
    <span className="text-slate-900">
      {STAGE_DISPLAY_NAMES[pathnames[3] as StageId] || pathnames[3].charAt(0).toUpperCase() + pathnames[3].slice(1)}
    </span>
  </>
)}
```

## 4. Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| 50+ parallel `getProjectOverview` calls overload staging | Medium | Hard cap at 10 projects (Q5) with "Show more" link. `Promise.allSettled` for resilience. |
| `useCreateIssue` requires non-null `issue_id` | High (caught) | Use composite `finding.id + ':' + scan_id` (Q1). Document the format. |
| `Finding` has no `finding_key` field | High (caught) | Use `finding.id` as the lookup key. Document the assumption. |
| `Finding` has no `project_id` field | High (caught) | Add `projectId: string` prop to `FindingDetailModal` (Q4 in follow-up). Update all call sites. |
| `useCreateIssue` for non-SonarQube findings collides on unique index | High (caught) | Composite `issue_id` (Q1) prevents this. |
| `findByFindingKey` only checks page 1 of `getToolIssues` (pageSize=25) | High (caught) | Loop pages 1-5 (Q8). Catches most real cases, prevents runaway loops. |
| Developers reach `/issues` directly via URL | Medium | In-page `<Navigate to="/my-issues" replace />` guard (Q4). |
| `canViewAllProjects` is admin-only — Groups gate fails for team_lead | High (caught) | Add new `canViewProjectGroups` flag in `useRbac.ts` (Q2). |
| `Breadcrumbs` capitalizes snake_case tool names as "Trivy_fs_scan" | Low (caught) | Use `STAGE_DISPLAY_NAMES` lookup (Q12 in follow-up). |
| Existing tests break (Layout, MyIssuesPage, FindingDetailModal) | Medium | Plan explicit updates: T13 mock `useAuth`; T10 mock `IssueDetailModal` (GAP-14). |
| Sidebar overflow on small screens | Low | Existing nav scrolls; new items add ~80px. |
| `IssueCard` as `<button>` breaks card-in-row layouts | Low | Use `display: block; width: 100%; text-align: left;` to preserve appearance. |

## 5. Out-of-scope follow-ups (defer to future specs)

- Dashboard "Triage queue" widget (count of unassigned per project, clickable)
- Bulk-assign UI on IssuesTriagePage (select multiple, assign to one dev)
- Project group auto-assign dashboard widget
- Mobile-optimized IssuesTriagePage (card vs table toggle)
- Removing dead hooks (`useEditRescanRequest`, `useCancelRescanRequest`, etc.)
- Removing dead backend endpoints

## 6. Verification

```bash
# After each step
npm run lint
npm run build   # tsc -b + vite build
npx vitest run

# Manual smoke test
python run.py staging
# 1. Log in as admin
# 2. See "Issues" in sidebar (between My Issues and Pending Verification)
# 3. See "Groups" in sidebar
# 4. Click "Issues" → IssuesTriagePage loads
# 5. Click an issue card → IssueDetailModal opens
# 6. Click "Assign" → modal closes, issue moves to assigned
# 7. Log in as developer → sidebar has "My Issues" only (no "Issues", no "Groups")
# 8. Click a card in My Issues → IssueDetailModal opens
# 9. Run a scan, go to Reports, click a finding → "Open in Issue Tracker" button visible
# 10. Click it → navigates to existing issue or creates new
```
