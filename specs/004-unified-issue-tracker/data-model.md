# Data Model: Unified Issue Tracker

## Entities

### IssueDB — `issues`

The core entity representing a single actionable finding from a security scanning tool. One issue is uniquely identified across scans by its stable external ID.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `Integer` | PK, autoincrement | Internal primary key |
| `issue_id` | `String` | Unique, indexed | Stable external ID from tool (SonarQube key, CVE+package, ZAP alert ID, host:port:service) |
| `project_id` | `String` | FK → `projects.project_id`, indexed | Project this issue belongs to |
| `tool_name` | `String` | Not null | Source tool: `sonar`, `trivy_fs`, `trivy_image`, `dependency_check`, `zap`, `nmap` |
| `scan_id` | `String` | FK → `scans.scan_id`, indexed, nullable | The scan that most recently reported this issue |
| `first_seen_scan_id` | `String` | FK → `scans.scan_id`, nullable | The scan that first detected this issue |
| `first_seen_at` | `DateTime` | Not null, UTC | When this issue was first detected |
| `last_seen_at` | `DateTime` | Not null, UTC | When this issue was last observed |
| `resolved_at` | `DateTime` | Nullable, UTC | When this issue was confirmed resolved |
| `severity` | `String` | Not null | `critical`, `high`, `medium`, `low`, `info`, `none` |
| `issue_type` | `String` | Nullable | Tool-specific: `bug`, `vulnerability`, `code_smell`, `security_hotspot`, `cve`, `port_open`, etc. |
| `title` | `String` | Not null | Short description |
| `description` | `Text` | Nullable | Full description / evidence |
| `location` | `JSON` | Nullable | Tool-specific location: `{"file": "src/main.py", "line": 42, "code": "..."}` or `{"cve": "CVE-2024-...", "package": "lodash", "version": "4.17.21"}` or `{"host": "10.0.0.1", "port": 22, "service": "ssh"}` or `{"url": "https://example.com/login", "parameter": "username"}` |
| `severity_v2` | `String` | Nullable | Tool-specific secondary severity (e.g., SonarQube's SQALE rating) |
| `effort` | `String` | Nullable | Time estimate: SonarQube effort minutes, ZAP alert confidence |
| `rule` | `String` | Nullable | Rule/standard violated: SonarQube rule key, CWE ID, OWASP category |
| `recommendation` | `Text` | Nullable | Fix recommendation from tool |
| `finding_type` | `String` | Nullable | Tool-specific classification |
| `raw_evidence` | `Text` | Nullable | Raw tool output for this issue |
| `is_new` | `Boolean` | Default `true` | True if first_seen_scan matches latest scan for project |
| `status` | `String` | Default `open` | `open`, `assigned`, `in_progress`, `fixed`, `verified`, `rejected` |
| `assignee_id` | `String` | FK → `users.id`, indexed, nullable | Currently assigned user |
| `assigned_by` | `String` | FK → `users.id`, nullable | Team Lead who made the assignment |
| `priority` | `String` | Nullable | `critical`, `high`, `medium`, `low` (set by Team Lead on assignment) |
| `metadata` | `JSON` | Default `{}` | Flexible key-value store for tool-specific extra fields |
| `created_at` | `DateTime` | Not null, UTC |
| `updated_at` | `DateTime` | Not null, UTC, onupdate |

**Indexes**:
- `ix_issues_project_tool` on `(project_id, tool_name)` — tool detail view queries
- `ix_issues_assignee_status` on `(assignee_id, status)` — My Issues queries
- `ix_issues_project_status` on `(project_id, status)` — overview counts
- `ix_issues_issue_id_project` unique on `(issue_id, project_id)` — dedup constraint

---

### IssueHistoryDB — `issue_history`

Audit log for all changes to an issue. Every status transition, assignment, comment, and metadata update creates a record.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `Integer` | PK, autoincrement |
| `issue_id` | `Integer` | FK → `issues.id`, indexed | The issue this history belongs to |
| `change_type` | `String` | Not null | `status_change`, `assignment`, `comment`, `verification`, `metadata_update`, `system` |
| `field_name` | `String` | Nullable | Which field changed (e.g., `status`, `assignee_id`, `priority`) |
| `old_value` | `Text` | Nullable | Previous value |
| `new_value` | `Text` | Nullable | New value |
| `comment` | `Text` | Nullable | User comment or system note |
| `actor_id` | `String` | FK → `users.id`, nullable | Who made the change |
| `created_at` | `DateTime` | Not null, UTC |

**Indexes**: `ix_issue_history_issue` on `(issue_id, created_at)`

---

### IssueScanDB — `issue_scans`

Links an issue to the scans where it appeared. Enables the "first seen / last seen / resolved in" tracking and dedup querying.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `Integer` | PK, autoincrement |
| `issue_id` | `Integer` | FK → `issues.id`, indexed |
| `scan_id` | `String` | FK → `scans.scan_id`, indexed |
| `project_id` | `String` | FK → `projects.project_id`, indexed |
| `tool_name` | `String` | Not null |
| `is_present` | `Boolean` | Default `true` | True if issue appeared in this scan, false if scan confirmed it's resolved |
| `finding_snapshot` | `JSON` | Nullable | Snapshot of the issue's metadata as it appeared in this scan |

**Indexes**: `ix_issue_scans_issue_scan` unique on `(issue_id, scan_id)` — one record per issue per scan

---

## State Machine

### Issue Status Transitions

```
                    ┌────────────────────────────────────┐
                    |                                    |
    open ──→ assigned ──→ in_progress ──→ fixed ──→ verified
      ↑                    ↑    ↑   |          |
      |                    |    |   |          └──→ rejected ──→ assigned
      |                    |    |   └──────────────────┘        (re-open)
      |                    |    |
      └──── scan_resolved ─┘    └── scan_regression ──→ assigned
                                        (re-appeared)
```

**Transition Rules**:
| From | To | Role | Trigger |
|------|----|------|---------|
| `open` | `assigned` | Team Lead | Assign to developer |
| `assigned` | `in_progress` | Developer | Start working |
| `in_progress` | `fixed` | Developer | Mark as fixed (with comment) |
| `fixed` | `verified` | Team Lead | Verify fix (manual) |
| `fixed` | `verified` | System | Auto-verified by re-scan (issue no longer present) |
| `fixed` | `rejected` | Team Lead | Reject fix with feedback |
| `rejected` | `assigned` | Team Lead | Re-assign to developer |
| `open` | `verified` | System | Auto-verified by re-scan (never re-appeared) |
| `assigned` | `open` | Team Lead | Unassign |
| `in_progress` | `assigned` | Team Lead | Re-assign to different developer |
| Any | `open` | System | Scan regression (issue re-appeared after resolution) |

---

## Migration: ScanReportDB → IssueDB

### Mapping

| Source (`ScanReportDB.findings[n]`) | Target (`IssueDB`) |
|--------------------------------------|---------------------|
| `.id` | `issue_id` (prefixed: `{tool_name}:{id}`) |
| `.tool` | `tool_name` |
| `.severity` | `severity` |
| `.title` | `title` |
| `.description` | `description` |
| `.cve` | `location.cve` |
| `.host` | `location.host` |
| `.port` | `location.port` |
| `.service` | `location.service` |
| `.uri` | `location.url` |
| `.package` | `location.package` |
| `.recommendation` | `recommendation` |
| `.raw_evidence` | `raw_evidence` |
| `.rule` | `rule` |
| `.finding_type` | `finding_type` |

### Idempotency
- Add `migration_status` column to `ScanReportDB`: nullable String (`NULL` = pending, `'DONE'` = migrated)
- Migration script skips records where `migration_status = 'DONE'`
- Dedup: run after migration, `ON CONFLICT (issue_id, project_id) DO NOTHING`
