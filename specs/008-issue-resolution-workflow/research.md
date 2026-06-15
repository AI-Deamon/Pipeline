# Research: Issue Resolution Platform Technical Decisions

## Decision 1: How to Capture Code Snippets from SonarQube

### Context
SonarQube's `api/issues/search` returns a `textRange` object (startLine, endLine, startOffset, endOffset) but **NOT the actual code lines**. To show the developer the exact code, we need to fetch the file content from somewhere.

### Options Evaluated

**Option A — Capture at Scan Time from Jenkins Workspace** ✓ CHOSEN
- Jenkins checks out the repo before running SonarQube scan
- Modify the Jenkinsfile to capture the file content around each issue's `textRange`
- Store the snippet in `ScanReportDB.findings[i].code_snippet`
- Migrate to `IssueDB.code_snippet` in `migrate_scan_to_issues()`

**Pros**:
- Captures the exact code at the time of scan (no drift)
- No external API dependency
- Works with any Git provider

**Cons**:
- Requires Jenkinsfile changes
- Increases scan payload size (~1KB per issue)

**Option B — Live Git API on Demand**
- Backend proxies to `https://api.github.com/repos/{owner}/{repo}/contents/{path}?ref={branch}`
- Fetches file content on `CodeSnippet` component mount
- Returns 20 lines around the target line

**Pros**: Always fresh, no scan-time overhead

**Cons**: External API rate limits, requires Git provider credentials, slower UX

**Option C — Cached Storage from Previous Scan**
- SonarQube's `textRange` gives us line numbers
- Store the file content in a separate `file_contents` table on first scan
- Reuse cached content for subsequent deep-dives

**Pros**: Fresh enough, no external API

**Cons**: Complex cache invalidation when file changes

### Decision
**Use Option A** with **Option B as fallback**. The Jenkins pipeline already checks out the repo, so capturing the snippet is a minimal addition. For issues where the snippet is missing (older scans), fall back to live Git API.

---

## Decision 2: Single-Tool Verify Scan vs Full Pipeline Rescan

### Context
When a developer fixes an issue and requests rescan, should the system:
- (A) Run a full pipeline scan (git_checkout + sonar_scanner + trivy_fs + zap + ...)?
- (B) Run only the tool that reported the issue (e.g., just SonarQube)?

### Trade-offs

**Option A — Full Pipeline**:
- Pros: Verifies no other issues appeared from the developer's changes
- Cons: Slow (10+ minutes), wasteful, blocks other verifications

**Option B — Single-Tool** ✓ CHOSEN
- Pros: Fast (2-3 min), focuses on the issue at hand, can be parallelized across multiple verifications
- Cons: Other tools' issues could be introduced without detection

### Decision
**Use Option B** with a caveat: the UI shows a warning that other tools are not re-scanned. The user can choose to trigger a full pipeline scan if they want broader verification. The single-tool scan is a fast path, not a replacement.

---

## Decision 3: Auto-Verify Verdict Logic

### Context
When a verification scan completes, how do we determine if the fix worked?

### Logic

```python
async def determine_verdict(
    issue_id: int,
    new_scan_id: str,
    db: Session
) -> Literal["verified", "rejected"]:
    issue = db.query(IssueDB).filter(IssueDB.id == issue_id).first()
    new_report = db.query(ScanReportDB).filter(
        ScanReportDB.scan_id == new_scan_id,
        ScanReportDB.tool_name == issue.tool_name,
    ).first()

    if not new_report:
        return "rejected"  # scan failed; can't verify

    finding_ids_in_new_scan = {f.get("id") for f in (new_report.findings or [])}

    if issue.issue_id in finding_ids_in_new_scan:
        # Issue is still present
        new_finding = next(f for f in new_report.findings if f.get("id") == issue.issue_id)
        # Update issue with new finding data
        issue.location = new_finding.get("location")
        issue.code_snippet = new_finding.get("code_snippet")
        return "rejected"
    else:
        # Issue is gone
        return "verified"
```

### Edge Cases
1. **Scan failed entirely**: Reject with reason "verification scan failed"
2. **Issue moved to a different file/line**: Reject (developer may have moved the code, not fixed it)
3. **Multiple SonarQube projects in one repo**: Match by `issue_id` (which includes project key) — already handled
4. **Issue ID changed (new SonarQube scan)**: SonarQube uses stable `issue` key (UUID), so issue_id is stable across scans

### Decision
Match by `issue_id`. If present in new scan → rejected. If absent → verified.

---

## Decision 4: State Machine — Why `pending_verification` is a Separate State

### Context
The existing state machine has: `open → assigned → in_progress → fixed → verified/rejected`. The natural extension would be to reuse `fixed` for "fixed and pending verification." Why add a new state?

### Reasons

1. **UI differentiation**: Dashboard needs to show "Pending Verification" as a distinct column/badge
2. **Different action permissions**: Only User can approve rescan from `pending_verification`; both User and Dev can transition to `rejected` from `fixed`
3. **Query performance**: `WHERE status = 'pending_verification'` is a fast filter for the queue
4. **Audit clarity**: History shows `fixed → pending_verification → verified` is a distinct lifecycle from `fixed → verified` (manual verify without rescan)

### Decision
Add `pending_verification` as a first-class state. The transitions:
- `fixed → pending_verification` (developer requests rescan)
- `pending_verification → verified` (auto or manual)
- `pending_verification → rejected` (auto: fix didn't work, or manual)
- `pending_verification → fixed` (user rejects the request, dev re-attempts)

---

## Decision 5: Code Snippet Language Detection

### Context
For syntax highlighting, we need to know the file's language. SonarQube's `component` field gives the file path; we can derive language from extension.

### Mapping (partial)

```python
EXTENSION_LANGUAGE_MAP = {
    ".ts": "tsx", ".tsx": "tsx",
    ".js": "javascript", ".jsx": "javascript",
    ".py": "python",
    ".java": "java",
    ".cs": "csharp",
    ".cpp": "cpp", ".c": "c", ".h": "cpp", ".hpp": "cpp",
    ".go": "go",
    ".rb": "ruby",
    ".rs": "rust",
    ".kt": "kotlin", ".kts": "kotlin",
    ".swift": "swift",
    ".php": "php",
    ".scala": "scala",
    ".html": "html",
    ".css": "css",
    ".scss": "scss",
    ".json": "json",
    ".yaml": "yaml", ".yml": "yaml",
    ".md": "markdown",
    ".sh": "bash",
    ".sql": "sql",
}
```

### Frontend
- Use `react-syntax-highlighter` library
- Pass `language` prop based on `code_snippet_language` field
- Fall back to plain text if language unknown

### Decision
Detect from file extension server-side, store in `extra_metadata["code_snippet_language"]`, use `react-syntax-highlighter` in `CodeSnippet` component.

---

## Decision 6: RBAC for Rescan Actions

### Context
Spec 005 defines role-based permissions. For the rescan workflow:

| Action | Admin | Team Lead | Developer |
|--------|-------|-----------|-----------|
| Request rescan | ✓ (any issue) | ✓ (scoped) | ✓ (own assigned only) |
| Approve rescan | ✓ | ✓ (scoped) | ✗ |
| Trigger verify scan | ✓ | ✓ (scoped) | ✗ |
| Reject rescan request | ✓ | ✓ (scoped) | ✗ |
| View pending queue | ✓ (all) | ✓ (scoped) | ✓ (own requests) |

### Implementation
Add to `RbacService` (spec 005):

```python
def can_request_rescan(self, issue) -> bool:
    if self.is_admin:
        return True
    if self.is_team_lead:
        return self.has_project_access(issue.project_id)
    if self.is_developer:
        return issue.assignee_id == self._user.id
    return False

def can_approve_rescan(self, project_id: str) -> bool:
    if self.is_admin:
        return True
    if self.is_team_lead:
        return self.has_project_access(project_id)
    return False
```

### Decision
Add two new methods to `RbacService`. Use them in the new endpoints.

---

## Decision 7: WebSocket Event Delivery

### Context
Real-time updates for the rescan workflow are critical. Users should see:
- New rescan requests in their queue (without refresh)
- Scan progress
- Verification results

### Implementation

**Existing** (spec 004): `backend/app/websockets/manager.py` has a basic WebSocket manager.

**Add events**:
- `rescan_requested` — new request created
- `rescan_approved` — user approved
- `rescan_verification_complete` — scan done

**Subscription routing**:
- WebSocket clients connect with `?project_id=X` query param
- Server filters events by project scope
- For dev's "My Issues", subscribe to all `rescan_requested` events but only show their own

### Decision
Extend the existing WebSocket manager. Add 3 new event types. Frontend `useRescanRequests` hook subscribes and updates the queue in real-time.

---

## Decision 8: Pagination and Performance

### Context
With 100,000+ issues per spec 004, the `pending-verification` endpoint must be fast.

### Indexes Already Exist
- `ix_issues_project_tool` on `(project_id, tool_name)`
- `ix_issues_assignee_status` on `(assignee_id, status)`
- `ix_issues_project_status` on `(project_id, status)`

### New Indexes Needed
- `ix_rescan_requests_status_created_at` on `(status, created_at)` — fast pending queue query
- `ix_rescan_requests_issue` on `(issue_id)` — fast lookup by issue

### Caching
- The pending verification queue changes frequently (each request/update)
- Don't cache the queue itself
- Cache individual issue details with 60s TTL using Redis

### Decision
Add 2 new indexes. Cache individual issues with Redis TTL. Don't cache the queue list.

---

## Decision 9: Frontend State Management

### Context
The pending verification page needs to update in real-time as:
- New requests come in
- User approves/rejects
- Verify scans complete

### State Sync
- TanStack Query for server state (existing)
- WebSocket subscription to invalidate queries on events
- Optimistic updates for approve/reject actions

### Implementation Pattern

```typescript
// useRescanQueue hook
const { data, isLoading } = useQuery({
  queryKey: ['rescan-queue', projectId, status],
  queryFn: () => api.issues.getPendingVerification({ projectId, status }),
  refetchOnWindowFocus: true,
});

// WebSocket listener
useEffect(() => {
  const ws = useWebSocket();
  const unsub = ws.subscribe('rescan_requested', () => {
    queryClient.invalidateQueries(['rescan-queue']);
  });
  return unsub;
}, [queryClient]);
```

### Decision
TanStack Query for server state. WebSocket events trigger `queryClient.invalidateQueries`. Optimistic updates for approve/reject with rollback on error.

---

## Decision 10: Failure Modes and Recovery

### Context
What happens if:
- Verify scan fails to trigger (Jenkins down)
- Verify scan times out
- Developer assigned to issue is no longer in the system
- Issue is deleted while pending verification

### Handling

| Failure | Action |
|---------|--------|
| Jenkins down when approving | Return 503, leave rescan request as `pending` |
| Scan times out | Set `RescanRequestDB.status = "rejected"`, `reviewer_note = "scan timed out"` |
| Assignee deleted | Issue becomes `open` (unassign), rescan request remains |
| Issue deleted | Cascade delete `rescan_requests` records (FK with `ON DELETE CASCADE`) |

### Decision
Implement failure handling per the table. Use FK cascade on issue delete. Add timeout handling to verify scan trigger (e.g., 5 min max).

---

## Summary of Key Decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Code snippet capture | Option A: Scan-time from Jenkins workspace, with Git API fallback |
| 2 | Verify scan scope | Single-tool only (full pipeline is opt-in) |
| 3 | Auto-verify verdict | Match by `issue_id` — present = rejected, absent = verified |
| 4 | State machine | Add `pending_verification` as first-class state |
| 5 | Language detection | File extension → `react-syntax-highlighter` |
| 6 | RBAC | New `can_request_rescan` and `can_approve_rescan` methods |
| 7 | WebSocket | 3 new events, project-scoped subscriptions |
| 8 | Performance | 2 new indexes, cache individual issues not the queue |
| 9 | Frontend state | TanStack Query + WebSocket invalidation + optimistic updates |
| 10 | Failure recovery | Cascade FK, scan timeout, Jenkins down returns 503 |
