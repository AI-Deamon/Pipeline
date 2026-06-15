# Quickstart: Issue Resolution Platform

## End-to-End Demo Flow

This walks through the complete workflow from issue identification to verified resolution.

### Prerequisites
- All services running (`python run.py staging`)
- Admin login working (`admin/admin123`)
- At least one project with SonarQube scan results
- At least one developer user account

### Step 1: Trigger a Scan

```bash
# Via UI
1. Login as admin
2. Go to Dashboard → select a project
3. Click "Trigger Scan" → wait for completion

# Via API
curl -X POST http://localhost:8000/api/v1/projects/proj-a/scans \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"stages": ["sonar_scanner"]}'
```

Wait ~5 minutes for scan to complete.

### Step 2: Verify Enriched Data Captured

```bash
# Check the issue now has file_path, line_number, code_snippet
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/v1/issues/1 | jq
```

Expected fields in response:
- `file_path` — e.g., `"src/components/UserForm.tsx"`
- `line_number` — e.g., `42`
- `code_snippet` — multi-line code block
- `code_snippet_language` — e.g., `"tsx"`
- `effort` — e.g., `"30min"`
- `tags` — e.g., `["security", "xss"]`
- `extra_metadata` — object with `textRange`, `flows`, etc.

### Step 3: Browse to Project Overview → Tool Detail

1. Login as admin → Dashboard
2. Click on the project → Project Overview
3. See tool cards with severity counts AND finding_type breakdown (e.g., "10 bugs, 13 vulns, 6 code smells")
4. Click the "SonarQube" card → Tool Detail View
5. See enriched table: file_path, line_number, effort columns
6. See IssueTypeToggle with 4 options: All / Bugs / Vulnerabilities / Code Smells / Hotspots
7. Click a type to filter — only matching issues appear

### Step 4: Assign Issue to Developer

1. Click an issue row → IssueDetailModal opens
2. See file path (clickable → opens GitHub at that line)
3. See code snippet with offending line highlighted in red
4. See effort badge, tags list, rule link
5. Click "Assign" button → enter "dev-1" → confirm
6. Status: `open → assigned`

### Step 5: Login as Developer, Work the Issue

1. Logout, login as dev-1
2. Go to "My Issues" → see the assigned issue
3. Click the issue → see full deep-dive (code snippet, line number, etc.)
4. Click "Start Working" → status: `assigned → in_progress`
5. (In real life: developer fixes the code locally and pushes a commit)

### Step 6: Request Rescan

1. Still as dev-1, in the issue modal
2. Click "Mark Fixed" → status: `in_progress → fixed`
3. Click "Request Rescan" → modal opens
4. Enter fix note: "Sanitized user input in UserForm.tsx:42. Replaced innerHTML with textContent."
5. Click "Request Rescan" → status: `fixed → pending_verification`
6. RescanRequestDB record created (status: pending)

### Step 7: Login as Admin, Approve Rescan

1. Logout, login as admin
2. See "Pending Verification (1)" badge in nav
3. Click → PendingVerificationPage
4. See the issue grouped under the project
5. Card shows: developer who fixed, fix note, timestamp
6. Click "Verify Now" → confirm
7. RescanRequestDB.status: `pending → approved`
8. Single-tool verify scan triggered for sonar only (not full pipeline)

### Step 8: Wait for Verify Scan

1. Stay on PendingVerificationPage (auto-refreshes every 5s)
2. Card status: "Verifying..."
3. WebSocket event: `rescan_approved`
4. Scan runs ~2-3 minutes (single tool, faster than full pipeline)

### Step 9: Auto-Verify Result

**Case A — Issue is gone (fix worked)**:
1. WebSocket event: `rescan_verification_complete` with verdict `verified`
2. Card moves to "Completed" section, shows green checkmark
3. Issue status: `pending_verification → verified`
4. RescanRequestDB.status: `completed`, verdict: `verified`

**Case B — Issue still present (fix didn't work)**:
1. WebSocket event: `rescan_verification_complete` with verdict `rejected`
2. Card moves to "Completed" section, shows red X
3. Issue status: `pending_verification → rejected`
4. Issue's `code_snippet` updated with the latest finding
5. RescanRequestDB.status: `completed`, verdict: `rejected`

### Step 10: View Issue History

1. Click the issue in the dashboard
2. See history entries:
   - `system` auto-verified/rejected at 10:35 AM
   - `lead-1` approved rescan at 10:30 AM
   - `dev-1` requested rescan at 10:25 AM
   - `dev-1` marked fixed at 10:24 AM
   - `dev-1` started working at 10:20 AM
   - `admin` assigned to dev-1 at 10:15 AM
3. Full audit trail with timestamps and actors

---

## Common Scenarios

### Manual Verification (No Rescan)

For issues where the user is confident the fix worked without re-running a scan:

1. Admin opens the issue (status: `fixed`)
2. Clicks "Verify" button (only visible to admin/team_lead)
3. Status: `fixed → verified` (skips `pending_verification`)

### Reject Fix Without Rescan

If the user disagrees with the developer's "fixed" claim:

1. Admin opens the issue (status: `fixed`)
2. Clicks "Reject" → enter reason
3. Status: `fixed → rejected`
4. Issue is reset, ready for re-assignment

### Re-Assign After Rejection

1. Developer or admin re-assigns: `rejected → assigned`
2. Cycle continues

---

## API Smoke Tests

```bash
# Get pending queue
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/v1/issues/pending-verification | jq

# Request rescan
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"fix_note": "Fixed XSS by sanitizing input"}' \
  http://localhost:8000/api/v1/issues/1/request-rescan

# Approve rescan
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reviewer_note": "Verifying"}' \
  http://localhost:8000/api/v1/issues/1/approve-rescan

# Trigger verify scan directly
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"note": "Manual verify"}' \
  http://localhost:8000/api/v1/issues/1/trigger-verify-scan

# Get code snippet
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/projects/proj-a/code-snippet?file=src/components/UserForm.tsx&line=42" | jq
```

---

## WebSocket Subscription

Connect to `ws://localhost:8000/ws/issues?token=<JWT>` and listen for:

```json
{ "type": "rescan_requested", "data": { "issue_id": 1, "rescan_request_id": 42, ... } }
{ "type": "rescan_approved", "data": { "issue_id": 1, "scan_id": "scan-...", ... } }
{ "type": "rescan_verification_complete", "data": { "issue_id": 1, "verdict": "verified", ... } }
```

In TanStack Query, use a custom hook:

```typescript
useEffect(() => {
  const ws = new WebSocket(`ws://localhost:8000/ws/issues?token=${token}`);
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'rescan_requested') {
      queryClient.invalidateQueries(['pending-verification']);
    }
  };
  return () => ws.close();
}, [queryClient]);
```

---

## Troubleshooting

### "Issue not found" on `/request-rescan`
- Issue ID is the internal `IssueDB.id` (integer), not `issue_id` (string)
- Use the value from the issue list, not the SonarQube key

### "No pending rescan request" on `/approve-rescan`
- Check the rescan request status — it might be `completed` already
- Each issue can have multiple historical rescan requests, but only one pending

### Code snippet is empty
- Old scans (before this spec was deployed) won't have snippets
- Try the live API endpoint: `GET /projects/{id}/code-snippet?file=...&line=...`
- Re-run a scan to capture snippets

### Auto-verify never fires
- Check the Celery worker logs: `docker logs celery_worker --tail 50`
- Verify the scan callback fired: look for `migrate_scan_to_issues`, `auto_verify_fixed_issues`, `auto_verify_pending_rescans` tasks in worker output
- The `rescan_verification_complete` event should be sent — check WebSocket logs

### RBAC: Developer can't see rescan request button
- Developer can only request rescan on issues assigned to them
- Check the `IssueDetailModal` condition: `canUpdateAssignedIssues && status === 'fixed'`
- Confirm the developer is the assignee

---

## Performance Notes

- The pending verification endpoint uses `ix_rescan_requests_status_created_at` for fast queries
- The issue detail endpoint is cached in Redis for 60s
- WebSocket events trigger `queryClient.invalidateQueries` to refresh stale data
- The code snippet endpoint caches Git API responses for 5 minutes per `(project, file, line)`
