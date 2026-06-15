# API Contracts: Issue Resolution Platform

**Base URL**: `/api/v1`

**Auth**: All endpoints require JWT (Bearer token) or API key, except `/auth/login`, `/auth/register`, `/docs`.

**RBAC**: Per Spec 005. Admin has full access. Team Lead has scoped project access. Developer has access only to assigned issues.

---

## New Endpoints

### POST `/issues/{issue_id}/request-rescan`

Developer marks an issue as fixed and formally requests a rescan. Creates a `rescan_requests` record and transitions the issue to `pending_verification`.

**Path params**:
- `issue_id` (int) — internal IssueDB.id

**Request body**:
```json
{
  "fix_note": "Sanitized user input in UserForm.tsx:42. Replaced innerHTML with textContent and added a whitelist for allowed tags.",
  "commit_sha": "a1b2c3d4"  // optional, for traceability
}
```

**Response 201**:
```json
{
  "id": 42,
  "issue_id": 1,
  "requested_by": "dev-1",
  "fix_note": "Sanitized user input in UserForm.tsx:42. Replaced innerHTML with textContent and added a whitelist for allowed tags.",
  "commit_sha": "a1b2c3d4",
  "status": "pending",
  "scan_id": null,
  "verdict": null,
  "reviewer_id": null,
  "reviewer_note": null,
  "created_at": "2026-06-15T10:30:00Z",
  "updated_at": "2026-06-15T10:30:00Z",
  "completed_at": null
}
```

**Errors**:
- `403` — User is not the assignee of this issue (developers can only request rescan on their own)
- `404` — Issue not found
- `409` — Issue is not in `fixed` state (must be `fixed` or `in_progress` first)

**Side effects**:
- Creates `RescanRequestDB` record
- Transitions issue: `fixed → pending_verification`
- Records audit log entry
- Sends WebSocket notification to assigned project leads/admins

---

### POST `/issues/{issue_id}/approve-rescan`

Admin or Team Lead approves a pending rescan request and triggers a single-tool verification scan.

**Path params**:
- `issue_id` (int)

**Request body**:
```json
{
  "reviewer_note": "Looking good. Verifying with a fresh SonarQube run."
}
```

**Response 200**:
```json
{
  "rescan_request": {
    "id": 42,
    "status": "approved",
    "reviewer_id": "lead-1",
    "reviewer_note": "Looking good. Verifying with a fresh SonarQube run.",
    "updated_at": "2026-06-15T10:35:00Z"
  },
  "scan": {
    "scan_id": "scan-2026-06-15-001",
    "project_id": "proj-a",
    "tool": "sonar",
    "state": "RUNNING",
    "created_at": "2026-06-15T10:35:00Z"
  }
}
```

**Errors**:
- `403` — User lacks `can_verify_issues` permission (Admin/Team Lead only)
- `404` — Issue or pending rescan request not found
- `409` — No pending rescan request exists for this issue

**Side effects**:
- Sets `RescanRequestDB.status = "approved"`, `reviewer_id`, `reviewer_note`
- Triggers Jenkins build for `(project_id, tool)` single-stage scan
- Sets `RescanRequestDB.scan_id` to the new scan ID
- Sends WebSocket notification

---

### GET `/issues/pending-verification`

Returns all issues with pending rescan requests, grouped by project. Filterable by project_id, requester, and status.

**Query parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `project_id` | string | — | Filter by project |
| `status` | string | `pending` | `pending`, `approved`, `rejected`, `completed` |
| `requested_by` | string | — | Filter by developer who requested |
| `page` | int | 1 | Pagination page |
| `page_size` | int | 25 | Items per page |

**Response 200**:
```json
{
  "total": 8,
  "page": 1,
  "page_size": 25,
  "groups": [
    {
      "project_id": "proj-a",
      "project_name": "Meraki Dashboard",
      "items": [
        {
          "rescan_request_id": 42,
          "issue_id": 1,
          "issue_title": "XSS vulnerability in UserForm.tsx",
          "issue_severity": "critical",
          "tool": "sonar",
          "requested_by": "dev-1",
          "requested_by_name": "alice",
          "fix_note": "Sanitized user input in UserForm.tsx:42...",
          "commit_sha": "a1b2c3d4",
          "status": "pending",
          "created_at": "2026-06-15T10:30:00Z",
          "fix_elapsed_minutes": 45
        }
      ]
    }
  ]
}
```

**RBAC**:
- Admin: sees all
- Team Lead: sees only their scoped projects
- Developer: sees only their own requests

---

### POST `/issues/{issue_id}/trigger-verify-scan`

Trigger a single-tool verify scan directly (without an existing rescan request). Admin/Team Lead path.

**Path params**:
- `issue_id` (int)

**Request body**:
```json
{
  "note": "Manual verification scan"
}
```

**Response 200**:
```json
{
  "issue_id": 1,
  "scan_id": "scan-2026-06-15-002",
  "tool": "sonar",
  "state": "RUNNING"
}
```

**Errors**:
- `403` — User lacks `can_verify_issues` permission
- `404` — Issue not found

---

### GET `/projects/{project_id}/code-snippet`

Fetch code snippet around a specific line. Proxies to Git provider API or local clone.

**Path params**:
- `project_id` (str)

**Query parameters**:
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | string | yes | File path relative to repo root, e.g., `src/components/UserForm.tsx` |
| `line` | int | yes | Center line number, e.g., 42 |
| `context` | int | 10 | Lines of context before/after. Default 10 (returns 21 lines total) |
| `branch` | string | — | Branch name. Default: project's configured branch |

**Response 200**:
```json
{
  "file": "src/components/UserForm.tsx",
  "language": "tsx",
  "branch": "main",
  "start_line": 32,
  "end_line": 52,
  "highlight_line": 42,
  "content": "  function handleSubmit(values) {\n    if (!values.name) return;\n    const container = document.getElementById('preview');\n    container.innerHTML = values.name;  // line 36\n    return values;\n  }"
}
```

**Errors**:
- `403` — User lacks project access
- `404` — File not found in repo
- `502` — Git provider API error

---

## Modified Endpoints

### GET `/issues/{issue_id}` — Enhanced

Now returns enriched fields:

**Response 200** (excerpt showing new fields):
```json
{
  "id": 1,
  "issue_id": "sonar:AVdXNjGJvqK4k0fGwL",
  "project_id": "proj-a",
  "tool_name": "sonar",
  "severity": "critical",
  "title": "XSS vulnerability in UserForm.tsx",
  "description": "User input is directly inserted into innerHTML without sanitization...",
  "status": "pending_verification",
  "assignee_id": "dev-1",
  "rule": "javascript:S2068",
  "recommendation": "Avoid using innerHTML. Use textContent or sanitize input.",

  "file_path": "src/components/UserForm.tsx",
  "line_number": 42,
  "effort": "30min",
  "tags": ["security", "xss", "cwe-79"],
  "code_snippet": "  function handleSubmit(values) {\n    if (!values.name) return;\n    container.innerHTML = values.name;  // line 42\n  }",
  "code_snippet_language": "tsx",
  "git_url": "https://github.com/org/repo/blob/main/src/components/UserForm.tsx#L42",

  "rescan_request": {
    "id": 42,
    "status": "pending",
    "requested_by": "dev-1",
    "fix_note": "Sanitized user input...",
    "created_at": "2026-06-15T10:30:00Z"
  }
}
```

**Notes**:
- `file_path`, `line_number`, `code_snippet`, `code_snippet_language`, `tags`, `effort` are **new** fields
- `git_url` is **new** — constructed from `projects.git_url` + branch + file path + line number
- `rescan_request` is **new** — only present when there's a pending/active rescan request for the issue

---

### GET `/issues/projects/{project_id}/tools/{tool_name}` — Enhanced

The `types` query param now actually filters at the SonarQube API level (or post-fetch for cached issues).

**Query parameters** (additions):
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `types` | string | — | **SonarQube only**: comma-separated types to fetch from SonarQube on next scan. Valid: `BUG,VULNERABILITY,CODE_SMELL,SECURITY_HOTSPOT`. |

**Response 200** (each issue in the list now has):
```json
{
  "id": 1,
  "issue_id": "sonar:AVdXNjGJvqK4k0fGwL",
  "tool_name": "sonar",
  "severity": "critical",
  "title": "XSS vulnerability in UserForm.tsx",
  "status": "pending_verification",
  "file_path": "src/components/UserForm.tsx",
  "line_number": 42,
  "effort": "30min",
  "last_seen_at": "2026-06-15T10:00:00Z"
}
```

---

## WebSocket Events

### `rescan_requested`
Sent when developer requests a rescan. Payload:
```json
{
  "issue_id": 1,
  "rescan_request_id": 42,
  "requested_by": "dev-1",
  "project_id": "proj-a"
}
```
Recipients: All users with access to the project (Admin, Team Lead)

### `rescan_approved`
Sent when user approves. Payload:
```json
{
  "issue_id": 1,
  "rescan_request_id": 42,
  "approved_by": "lead-1",
  "scan_id": "scan-2026-06-15-001"
}
```
Recipients: Original requester, project leads, admins

### `rescan_verification_complete`
Sent when verify scan finishes. Payload:
```json
{
  "issue_id": 1,
  "rescan_request_id": 42,
  "verdict": "verified",
  "scan_id": "scan-2026-06-15-001",
  "issue_still_present": false
}
```
Recipients: All watchers of the issue

---

## Endpoint Authorization Matrix

| Endpoint | Admin | Team Lead | Developer | Anonymous |
|----------|-------|-----------|-----------|-----------|
| POST `/issues/{id}/request-rescan` | ✓ | ✓ (assigned to dev) | ✓ (own assigned) | ✗ |
| POST `/issues/{id}/approve-rescan` | ✓ | ✓ (scoped) | ✗ | ✗ |
| GET `/issues/pending-verification` | ✓ | ✓ (scoped) | ✓ (own only) | ✗ |
| POST `/issues/{id}/trigger-verify-scan` | ✓ | ✓ (scoped) | ✗ | ✗ |
| GET `/projects/{id}/code-snippet` | ✓ | ✓ (scoped) | ✓ (assigned project) | ✗ |
| GET `/issues/{id}` | ✓ | ✓ (scoped) | ✓ (own assigned) | ✗ |

---

## Implementation Notes

### `request-rescan` flow
1. Validate issue is in `fixed` state (or `in_progress` if self-transition)
2. Create `RescanRequestDB(status='pending')`
3. Transition issue: `fixed → pending_verification`
4. Record audit history entry
5. Send `rescan_requested` WebSocket event
6. Return 201

### `approve-rescan` flow
1. Validate user has `can_verify_issues` permission
2. Find pending `RescanRequestDB` for issue
3. Trigger single-tool Jenkins scan (new endpoint in `scans/routes.py`)
4. Set `RescanRequestDB.status = "approved"`, `scan_id`, `reviewer_id`
5. Send `rescan_approved` WebSocket event
6. Return 200

### Verify scan completion (Celery task)
1. Scan callback fires
2. `migrate_scan_to_issues` runs (dedup check)
3. `auto_verify_fixed_issues` runs for the specific `(project_id, tool)`:
   - If issue not found in new scan → `verified`, set `RescanRequestDB.verdict = "verified"`, `status = "completed"`
   - If issue still found → `rejected`, set `RescanRequestDB.verdict = "rejected"`, `status = "completed"`
4. `detect_regressions` runs (unchanged)
5. Send `rescan_verification_complete` WebSocket event

### Code snippet retrieval strategies
**Strategy A — SonarQube textRange (preferred)**:
- Parser captures 20 lines around the issue from the Git repo at scan time
- Stored in `IssueDB.code_snippet`
- Zero runtime overhead

**Strategy B — Live Git API (fallback for freshness)**:
- Backend proxies to `https://api.github.com/repos/{owner}/{repo}/contents/{path}?ref={branch}`
- Returns raw file content; backend slices lines around the target
- Requires `git_url` parsing to extract owner/repo

**Strategy C — Local clone (for self-hosted Jenkins)**:
- Jenkins workspace already has the repo cloned
- Backend reads from `/var/jenkins_home/workspace/{job}/{branch}/{file}`
- Fastest but requires workspace persistence

**Recommendation**: Strategy A for default, Strategy B as fallback. Use `projects.git_provider` field to determine which to use.
