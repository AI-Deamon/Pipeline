# API Contracts: Discoverability & Navigation Fixes

**Spec**: `spec.md`
**Last updated**: 2026-06-16

## Summary

This spec reuses **100% of existing backend endpoints**. The only new code is on the client.

| New client surface | Reuses backend endpoint |
|--------------------|--------------------------|
| `api.issues.findByFindingKey(projectId, tool, key)` | `GET /api/v1/projects/{project_id}/issues/{tool_name}` (filter client-side) |
| `useIssueByFindingKey` hook | (wraps `findByFindingKey`) |
| `useCreateIssue` already defined; now imported | `POST /api/v1/issues` (existing, per spec 004) |
| `IssuesTriagePage` data | `GET /api/v1/projects/{project_id}/issues/overview` (existing) — one call per project |
| `IssueCard` `onClick` prop | No backend change |
| `Layout` NavLinks | No backend change |
| `Breadcrumbs` cases | No backend change |

## Reused endpoints (per spec 004 + 008)

### `POST /api/v1/issues/{issue_id}/assign`
- **Existing**: `backend/app/api/issues.py:250`
- **RBAC**: `can_assign_issue` (admin: true, team_lead: scoped, developer: false)
- **Body**: `{ "assignee_id": "username", "priority"?: "low"|"medium"|"high"|"critical" }`
- **Response**: `IssueResponse`
- **New callers**: `IssuesTriagePage` (inline Assign button per row), `IssueDetailModal` (assign control with `<select>` user picker)

### `POST /api/v1/issues`
- **Existing**: `backend/app/api/issues.py:83` (spec 004)
- **New caller**: `FindingDetailModal` "Create issue" sub-button
- **Body shape**: `{ project_id, issue_id, tool_name, title, severity, ... }`
- **`issue_id` format**: composite `finding.id + ':' + scan_id` (e.g., `"AX1234:scan-abc-123"`) to avoid unique-index collisions on `(issue_id, project_id)` across multiple scans
- **Response**: `IssueResponse`

### `POST /api/v1/issues/{issue_id}/transition`
- **Existing**: `backend/app/api/issues.py:272`
- **Reuse**: `IssueDetailModal` (unchanged) + new `MyIssuesPage` modal entry point

### `GET /api/v1/projects/{project_id}/issues/overview`
- **Existing**: `backend/app/api/issues.py` (spec 004)
- **New caller**: `IssuesTriagePage` (one call per project, parallel, capped at 10)
- **Response shape**: `{ tools: [{ tool, severity_counts, total_count, statuses }] }` — `IssuesTriagePage` expands this to per-tool per-issue detail by calling `getToolIssues` per tool with the right status filter

### `GET /api/v1/projects/{project_id}/issues/{tool_name}`
- **Existing**: `backend/app/api/issues.py` (spec 004)
- **Reuse**: `IssuesTriagePage` (per-tool, status-filtered) and `api.issues.findByFindingKey` (5-page loop)

### `GET /api/v1/rbac/users` and `GET /api/v1/rbac/projects/{id}/assignments`
- **Existing**: `backend/app/api/users.py` (spec 005)
- **New caller**: `useUsersForProject` hook (for `IssueDetailModal` user picker)

## New client method (no backend change)

```typescript
// src/services/api.ts
issues: {
  // ...existing...

  /**
   * Find an existing issue for a given scan finding.
   * Returns null if no issue is tracked for this finding.
   * Implementation: loops through getToolIssues pages 1-5 (cap at 125 issues).
   * Returns first match where issue.issue_id === findingId, or null.
   */
  findByFindingKey: async (
    projectId: string,
    tool: string,
    findingId: string
  ): Promise<IssueResponse | null> => {
    const PAGE_CAP = 5;
    for (let page = 1; page <= PAGE_CAP; page++) {
      const result = await api.issues.getToolIssues(projectId, tool, page, 25, undefined);
      const match = result.issues.find(i => i.issue_id === findingId);
      if (match) return match;
      if (result.issues.length < 25) return null; // last page
    }
    return null;
  },
}
```

**Assumption documented**: `finding.id` is stable per finding across rescans (true for SonarQube; best-effort for other tools). If tools don't populate `id` stably, this lookup may return null and the user will see the "Create issue" sub-button instead.

**Performance**: 5 sequential pages × 25 issues = up to 125 issues scanned per lookup. In practice this is sub-200ms because TanStack Query caches subsequent calls. The loop is sequential (not parallel) to keep backend load low.

## Dead hooks — explicitly NOT touched

The following hooks and methods are defined but never imported anywhere. They are **out of scope** for this spec (per user clarification). They may be used by other tools, scripts, or future features. Removing them requires broader cross-codebase search.

| Symbol | Location | Status |
|--------|----------|--------|
| `useEditRescanRequest` | `src/hooks/useRescanRequest.ts:4` | Dead (defined, not imported) |
| `useCancelRescanRequest` | `src/hooks/useRescanRequest.ts:16` | Dead (defined, not imported) |
| `useCreateIssue` | `src/hooks/useIssues.ts:44` | **Now used** by `FindingDetailModal` via T14 |
| `useScanReset` | `src/hooks/useScanReset.ts:14` | Dead (defined, not imported) |
| `api.issues.getRawFixNote` | `src/services/api.ts:345` | Dead (admin diagnostic, never called) |
| `api.issues.getCodeSnippet` | `src/services/api.ts:288` | Dead (`CodeSnippet` uses pre-loaded data) |
| `api.projectGroups.update` | `src/services/api.ts:222` | Dead |
| `api.projectGroups.bulkAssign` | — | Never exposed in client |
| `api.projectGroups.assignScan` | `src/services/api.ts:241` | Dead |
| `api.projectGroups.removeScan` | `src/services/api.ts:245` | Dead |
| `api.scans.retryReports` | — | Never exposed in client |

## Backend endpoint coverage (out of scope for this spec)

| Backend endpoint | File:line | Client caller | Action |
|------------------|-----------|---------------|--------|
| `PATCH /api/v1/rescan-requests/{id}` | `backend/app/api/issues.py:428` | None | Keep (spec 008 may add UI later) |
| `DELETE /api/v1/rescan-requests/{id}` | `backend/app/api/issues.py:463` | None | Keep |
| `GET /api/v1/fix-notes/{id}/raw` | `backend/app/api/issues.py:495` | None | Keep (admin audit tool) |
| `POST /api/v1/projects` (create) | `backend/app/api/projects.py:131` | `CreateProjectPage` | Used |
| `POST /api/v1/project-groups/{id}/bulk-assign` | `backend/app/api/project_groups.py:272` | None | Keep (deferred to spec 013) |
| `POST /api/v1/project-groups/{id}/assignments` | `backend/app/api/project_groups.py:314` | None | Keep |
| `DELETE /api/v1/project-groups/{id}/assignments/{scan_id}` | `backend/app/api/project_groups.py:356` | None | Keep |
| `POST /api/v1/scans/{id}/retry-reports` | `backend/app/api/scans/routes.py:299` | None | Keep (orphan, requires investigation) |
| `POST /api/v1/scans/{id}/reset` | `backend/app/api/scans/state.py` | None | Keep |
| `GET /api/v1/projects/{id}/code-snippet` | `backend/app/api/projects.py:241` | None (uses pre-loaded data) | Keep |
