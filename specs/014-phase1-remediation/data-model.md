# Data Model: Phase 1 Audit Remediation

**Date**: 2026-07-13
**Feature**: Phase 1 Audit Remediation

---

## Entities Modified

### ScanReport (FR-1)

**Table**: `scan_reports`
**Change**: Add unique composite index on `(scan_id, tool_name)`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | Integer | PK, autoincrement | Unchanged |
| scan_id | String | NOT NULL, indexed | Unchanged |
| project_id | String | NOT NULL, indexed | Unchanged |
| tool_name | String | NOT NULL | **NEW: part of unique constraint** |
| severity_summary | JSON | default={} | Unchanged |
| findings | JSON | default=[] | Unchanged |
| raw_report | String | nullable | Unchanged |
| report_url | String | nullable | Unchanged |
| created_at | DateTime | NOT NULL, default=utcnow | Unchanged |
| expires_at | DateTime | nullable | Unchanged |
| migration_status | String | NOT NULL, default="pending" | Unchanged |

**New index**:
```python
Index('ix_scan_reports_scan_tool', 'scan_id', 'tool_name', unique=True)
```

**Upsert pattern** (replaces INSERT in `fetch_and_process_tool`):
```python
# Delete existing row for this (scan_id, tool_name) if present
db.query(ScanReportDB).filter(
    ScanReportDB.scan_id == scan_id,
    ScanReportDB.tool_name == tool_name,
).delete(synchronize_session=False)
# Then insert the new row
db.add(new_report)
db.commit()
```

**Migration**: Add the unique index. Existing data has no duplicates per audit confirmation — no data cleanup needed.

---

### Project (FR-5)

**Table**: `projects`
**Change**: No schema change. Query pattern changes for pagination.

**Paginated response shape**:
```json
{
  "items": [
    {
      "project_id": "string",
      "name": "string",
      "last_scan_state": "string",
      "last_scan_id": "string | null",
      "last_scan_time": "string | null"
    }
  ],
  "total": 150,
  "page": 1,
  "page_size": 25,
  "total_pages": 6
}
```

**Query changes**:
- `list_projects` accepts `limit: int = 25` and `offset: int = 0` query parameters
- Response envelope wraps the existing project list in `items` with pagination metadata
- `_build_project_list` uses pre-fetched scan map instead of per-project queries
- `_expire_active_scans` uses batch query instead of per-project queries

---

## Entities Unchanged

### User, Scan, Issue, ProjectGroup
No schema changes. These entities are not affected by Phase 1.

---

## State Transitions

### ScanReport.migration_status
No change to the state machine. Values remain: `pending → processing → completed | failed`.

### Authentication Token Lifecycle (FR-4)

**New state model**:

```
Login
  ├─→ Access token (1 hour, httpOnly cookie, SameSite=Lax)
  └─→ Refresh token (session-only, httpOnly cookie, destroyed on browser close)

Active session
  ├─→ Access token expires → browser calls POST /auth/refresh
  │   ├─→ Refresh token valid → new access token issued
  │   └─→ Refresh token invalid (browser closed/reopened) → redirect to login
  └─→ User closes browser → both tokens destroyed

Migration grace period (24 hours)
  ├─→ Access token in httpOnly cookie (new path)
  └─→ Access token in sessionStorage (old path, deprecated)
  └─→ After 24 hours → old path removed
```

**Cookie attributes**:
| Cookie | HttpOnly | SameSite | Secure | Max-Age | Path |
|--------|----------|----------|--------|---------|------|
| access_token | true | Lax | true (in production) | 3600 (1 hour) | / |
| refresh_token | true | Lax | true (in production) | 0 (session) | /auth |

**Notes**:
- `Secure` flag should be `true` in production (HTTPS), `false` in dev/test (HTTP localhost).
- `Max-Age=0` for refresh token means it's deleted when the browser closes (session cookie).
- The `access_token` cookie is set by the login endpoint and the refresh endpoint.
- The `refresh_token` cookie is set only by the login endpoint.

---

## Relationships

No new relationships introduced. Existing relationships:
- ScanReport → Scan (via `scan_id`)
- ScanReport → Project (via `project_id`)
- Project → User (via RBAC, not a direct FK)
