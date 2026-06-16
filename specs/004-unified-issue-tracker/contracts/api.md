# API Contracts: Unified Issue Tracker

Base URL: `/api/v1`

Auth: All endpoints except `/auth/login`, `/auth/register`, `/docs` require JWT (Bearer token) or API Key (`X-API-Key` header).

---

## GET /issues/projects/{project_id}/overview

Returns summary count of issues per tool for a project.

**Response 200**:
```json
{
  "project_id": "proj_abc123",
  "tools": [
    {
      "tool": "sonar",
      "total": 79,
      "severity": { "critical": 13, "high": 1, "medium": 64, "low": 1, "info": 0 },
      "by_type": {
        "bug": 10,
        "vulnerability": 13,
        "code_smell": 50,
        "security_hotspot": 6
      }
    },
    {
      "tool": "trivy_fs",
      "total": 1,
      "severity": { "critical": 0, "high": 1, "medium": 0, "low": 0, "info": 0 },
      "by_type": null
    },
    {
      "tool": "dependency_check",
      "total": 8,
      "severity": { "critical": 0, "high": 3, "medium": 4, "low": 1, "info": 0 },
      "by_type": null
    }
  ]
}
```

**Response 404**: `{"detail": "Project not found"}`

**Notes**: Admin users see overview only (this endpoint). Team Lead and Developer see this + detail views.

---

## GET /issues/projects/{project_id}/tools/{tool_name}

Returns individual issues for one tool in a project.

**Query Parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `severity` | string | — | Filter: `critical`, `high`, `medium`, `low` |
| `status` | string | — | Filter: `open`, `assigned`, `in_progress`, `fixed`, `verified`, `rejected` |
| `issue_type` | string | — | Filter: `bug`, `vulnerability`, `code_smell`, `security_hotspot`, `cve` |
| `assignee_id` | string | — | Filter by assigned user |
| `types` | string | — | **SonarQube only**: comma-separated types to fetch (`BUG,VULNERABILITY,CODE_SMELL,SECURITY_HOTSPOT`). Only sent to SonarQube API when provided. |
| `page` | int | 1 | Pagination page |
| `page_size` | int | 50 | Items per page (max 100) |
| `sort` | string | `severity` | Sort field: `severity`, `title`, `first_seen_at`, `last_seen_at`, `status` |
| `order` | string | `desc` | Sort order: `asc`, `desc` |

**Response 200**:
```json
{
  "project_id": "proj_abc123",
  "tool": "sonar",
  "total": 79,
  "page": 1,
  "page_size": 50,
  "total_pages": 2,
  "issues": [
    {
      "id": 1,
      "issue_id": "sonar:AV\"dXNjGJvqK4k0fGwL",
      "tool_name": "sonar",
      "severity": "critical",
      "issue_type": "bug",
      "title": "Remove this hardcoded password",
      "description": "Password found in configuration file",
      "location": {
        "file": "src/config/database.py",
        "line": 15,
        "code": "password = \"supersecret\""
      },
      "rule": "python:S2068",
      "effort": "15min",
      "status": "assigned",
      "assignee": {
        "id": "user_1",
        "username": "developer_a"
      },
      "priority": "critical",
      "first_seen_at": "2026-06-01T10:00:00Z",
      "last_seen_at": "2026-06-08T14:30:00Z",
      "is_new": false,
      "history": [
        {
          "change_type": "assignment",
          "old_value": null,
          "new_value": "developer_a",
          "comment": "Critical password issue — fix immediately",
          "actor": "team_lead_1",
          "created_at": "2026-06-08T15:00:00Z"
        }
      ]
    }
  ]
}
```

**Notes**: 
- `types` query param only applies to SonarQube. Other tools ignore it.
- History is returned as a summary (last 5 entries). Full history available via `GET /issues/{id}/history`.

---

## GET /issues/my

Returns all issues assigned to the authenticated user across all projects.

**Query Parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | string | — | Filter by status |
| `project_id` | string | — | Filter by project |
| `tool` | string | — | Filter by tool |
| `priority` | string | — | Filter by priority |
| `page` | int | 1 | Pagination |
| `page_size` | int | 50 | Items per page |

**Response 200**:
```json
{
  "total": 12,
  "page": 1,
  "page_size": 50,
  "projects": [
    {
      "project_id": "proj_abc123",
      "project_name": "Meraki API",
      "issues": [
        {
          "id": 1,
          "issue_id": "sonar:AVdXNjGJvqK4k0fGwL",
          "tool_name": "sonar",
          "severity": "critical",
          "issue_type": "bug",
          "title": "Remove this hardcoded password",
          "status": "assigned",
          "priority": "critical",
          "location": {"file": "src/config/database.py", "line": 15},
          "first_seen_at": "2026-06-01T10:00:00Z",
          "last_seen_at": "2026-06-08T14:30:00Z"
        }
      ]
    },
    {
      "project_id": "proj_def456",
      "project_name": "Web App",
      "issues": [...]
    }
  ]
}
```

**Notes**: Issues grouped by project, sorted by priority (critical first within each group).

---

## PUT /issues/{issue_id}/assign

Assign an issue to a developer.

**Request Body**:
```json
{
  "assignee_id": "user_2",
  "priority": "critical",
  "comment": "Please fix this ASAP — it's a hardcoded password"
}
```

**Response 200**:
```json
{
  "id": 1,
  "status": "assigned",
  "assignee": {"id": "user_2", "username": "developer_a"},
  "priority": "critical",
  "updated_at": "2026-06-09T10:00:00Z"
}
```

**Errors**:
- `403`: Authenticated user is not a Team Lead
- `404`: Issue or assignee not found
- `409`: Issue is already in `verified` state

---

## PUT /issues/{issue_id}/status

Transition issue to a new state.

**Request Body**:
```json
{
  "status": "fixed",
  "comment": "Moved hardcoded password to environment variable"
}
```

**Valid Transitions**:
| Current Status | Allowed Next Status | Role Required |
|---------------|---------------------|---------------|
| `assigned` | `in_progress` | Developer (must be assignee) |
| `in_progress` | `fixed` | Developer (must be assignee) |
| `fixed` | `verified` | Team Lead |
| `fixed` | `rejected` | Team Lead |
| `rejected` | `assigned` | Team Lead |

**Response 200**:
```json
{
  "id": 1,
  "status": "fixed",
  "updated_at": "2026-06-09T11:00:00Z",
  "comment": {
    "id": 5,
    "author": "developer_a",
    "message": "Moved hardcoded password to environment variable",
    "created_at": "2026-06-09T11:00:00Z"
  }
}
```

**Errors**:
- `403`: Invalid role or not the assignee
- `409`: Invalid state transition (e.g., `open → verified`)

---

## POST /issues/{issue_id}/comments

Add a comment to an issue.

**Request Body**:
```json
{
  "message": "I found the root cause — the config file was committed with real credentials"
}
```

**Response 201**:
```json
{
  "id": 10,
  "issue_id": 1,
  "author": "developer_a",
  "message": "I found the root cause...",
  "created_at": "2026-06-09T12:00:00Z"
}
```

---

## GET /issues/{issue_id}/history

Returns full audit history for an issue.

**Response 200**:
```json
{
  "issue_id": 1,
  "history": [
    {
      "change_type": "status_change",
      "field_name": "status",
      "old_value": "open",
      "new_value": "assigned",
      "actor": "team_lead_1",
      "comment": "Assigned to developer_a",
      "created_at": "2026-06-08T15:00:00Z"
    },
    {
      "change_type": "assignment",
      "field_name": "assignee_id",
      "old_value": null,
      "new_value": "user_2",
      "actor": "team_lead_1",
      "comment": "Please fix this ASAP",
      "created_at": "2026-06-08T15:00:00Z"
    }
  ]
}
```

---

## POST /issues/migrate

Trigger one-time migration of existing `ScanReportDB.findings` JSON to `IssueDB` records.

**Response 202**:
```json
{
  "task_id": "celery_task_uuid",
  "status": "started",
  "message": "Migration task enqueued"
}
```

**Notes**: Idempotent — safe to call multiple times. Skips already-migrated `ScanReportDB` records via `migration_status` column.

---

## WebSocket Events

Reuses existing WebSocket infrastructure at `/api/v1/ws/scans?scan_id={id}`.

New event types:

**Event: `issue_assigned`**
```json
{
  "type": "issue_assigned",
  "issue_id": 1,
  "assignee_id": "user_2",
  "assigned_by": "team_lead_1",
  "priority": "critical"
}
```

**Event: `issue_status_changed`**
```json
{
  "type": "issue_status_changed",
  "issue_id": 1,
  "old_status": "assigned",
  "new_status": "fixed",
  "changed_by": "developer_a"
}
```

**Event: `issue_comment_added`**
```json
{
  "type": "issue_comment_added",
  "issue_id": 1,
  "comment_id": 10,
  "author": "developer_a"
}
```
