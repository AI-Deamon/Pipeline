# Data Model: Issue Resolution Platform

**Supersedes**: Spec 004 `data-model.md` (which is preserved for the parts that are unchanged)

This document defines the new and modified database entities for the Complete Issue Resolution Platform.

---

## New Tables

### `rescan_requests` — Rescan Request Lifecycle

Tracks formal requests from developers to verify their fixes via a new scan, plus the approval/completion lifecycle.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `Integer` | PK, autoincrement | Internal primary key |
| `issue_id` | `Integer` | FK → `issues.id`, NOT NULL, indexed | The issue being verified |
| `requested_by` | `String` | NOT NULL, indexed | Username/id of developer who requested the rescan |
| `fix_note` | `Text` | Nullable | Developer's note describing what was changed in the code (sanitized for secrets; raw version kept for admin audit) |
| `status` | `String` | NOT NULL, default `pending` | One of: `pending`, `approved`, `rejected`, `completed` |
| `scan_id` | `String` | FK → `scans.scan_id`, nullable | The verification scan that was triggered |
| `verdict` | `String` | Nullable | `verified` (issue gone) or `rejected` (issue still present) — set when status = `completed` |
| `reviewer_id` | `String` | Nullable, indexed | Username/id of user who approved/rejected |
| `reviewer_note` | `Text` | Nullable | Reviewer's note (e.g., why rejected) |
| `version` | `Integer` | NOT NULL, default `0` | **NEW** Optimistic locking version. Incremented on every update. Endpoints accept the current version; mismatch returns 409. |
| `created_at` | `DateTime` | NOT NULL, UTC | When the request was created |
| `updated_at` | `DateTime` | NOT NULL, UTC, onupdate | Last update |
| `completed_at` | `DateTime` | Nullable, UTC | When the verification scan completed and verdict was set |

**Indexes**:
- `ix_rescan_requests_issue` on `(issue_id)` — fast lookup of requests per issue
- `ix_rescan_requests_status` on `(status, created_at)` — pending queue queries
- `ix_rescan_requests_requested_by` on `(requested_by)` — developer's request history
- `ix_rescan_requests_reviewer` on `(reviewer_id)` — reviewer's history

**State transitions**:
```
pending → approved   (user clicks "Verify Now")
pending → rejected   (user clicks "Reject" without triggering scan)
approved → completed (verify scan finishes; verdict set)
```

---

## Modified Tables

### `issues` — Added Fields

The existing IssueDB already has many fields. The following are **new or modified** for this spec.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `code_snippet` | `Text` | **NEW** Nullable | 20 lines of code around the issue location, captured from SonarQube `textRange` or fetched from Git API. Used by `CodeSnippet` component. |
| `extra_metadata` | `JSON` | **MODIFIED usage** Nullable, default `{}` | Now stores: `tags` (list of strings), `sonar_status` (string), `sonar_resolution` (string), `text_range` (object: startLine, endLine, startOffset, endOffset), `flows` (list of vulnerability execution paths) |

All other existing IssueDB columns are unchanged. See spec 004 `data-model.md` for the complete reference.

**Schema migration note**: The `code_snippet` column needs a new migration. Use Alembic or a startup-time `ALTER TABLE` check in `app/core/db.py`.

---

### `scan_reports` — Verified

The existing ScanReportDB columns are sufficient. No changes needed. The `findings` JSON blob will now contain enriched data from the parser, but this is a payload change, not a schema change.

---

## SecurityFinding Dataclass — Added Fields (Python)

In `backend/app/services/reporting/parsers/base.py`:

```python
@dataclass
class SecurityFinding:
    # ... existing fields ...

    # NEW: SonarQube location details
    line_number: Optional[int] = None
    file_path: Optional[str] = None

    # NEW: SonarQube effort and classification
    effort: Optional[str] = None          # e.g., "5min", "1h", "3d"
    tags: List[str] = field(default_factory=list)

    # NEW: SonarQube issue state
    sonar_status: Optional[str] = None    # OPEN, CONFIRMED, REOPENED, RESOLVED
    sonar_resolution: Optional[str] = None  # FIXED, WONTFIX, FALSE-POSITIVE, REMOVED

    # NEW: Code snippet context
    code_snippet: Optional[str] = None    # 20 lines around the issue line
    code_snippet_language: Optional[str] = None  # "ts", "py", "java", etc.
```

**Update `to_dict()`** to include all new fields.

---

## IssueDB ↔ SecurityFinding Mapping

When `migrate_scan_to_issues()` reads a `SecurityFinding` from `ScanReportDB.findings`:

| SecurityFinding field | IssueDB column |
|----------------------|----------------|
| `id`, `issue_id` | `issue_id` (stable external ID) |
| `tool` | `tool_name` |
| `severity` (normalized) | `severity` |
| `title` / `message` | `title` |
| `description` | `description` |
| `file_path` | `location["file_path"]` |
| `line_number` | `location["line"]` |
| `effort` | `effort` |
| `tags` | `extra_metadata["tags"]` |
| `sonar_status` | `extra_metadata["sonar_status"]` |
| `sonar_resolution` | `extra_metadata["sonar_resolution"]` |
| `code_snippet` | `code_snippet` |
| `code_snippet_language` | `extra_metadata["code_snippet_language"]` |
| `rule` | `rule` |
| `recommendation` | `recommendation` |
| `finding_type` | `finding_type` |
| `raw_evidence` | `raw_evidence` |

The `location` JSON column shape:
```json
{
  "file_path": "src/components/UserForm.tsx",
  "line": 42,
  "column": 8
}
```

---

## Issue State Machine — New State

In `backend/app/state/issue_state.py`, add:

```python
class IssueState(str, Enum):
    OPEN = "open"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    FIXED = "fixed"
    PENDING_VERIFICATION = "pending_verification"  # NEW
    VERIFIED = "verified"
    REJECTED = "rejected"

TRANSITIONS: dict[IssueState, set[IssueState]] = {
    IssueState.OPEN: {IssueState.ASSIGNED},
    IssueState.ASSIGNED: {IssueState.IN_PROGRESS},
    IssueState.IN_PROGRESS: {IssueState.FIXED},
    IssueState.FIXED: {IssueState.PENDING_VERIFICATION, IssueState.VERIFIED, IssueState.REJECTED},
    IssueState.PENDING_VERIFICATION: {IssueState.VERIFIED, IssueState.REJECTED, IssueState.FIXED},  # NEW transitions
    IssueState.REJECTED: {IssueState.ASSIGNED},
    IssueState.VERIFIED: set(),
}
```

---

## Project.code_snippet_endpoint (Optional Enhancement)

If using Git provider API for code snippets, no new column is needed — the `projects` table already has `git_url` and `branch`. The code snippet endpoint can construct the URL on demand.

If using a cached approach (Option B: store snippet inline in IssueDB), then `code_snippet` on `issues` is sufficient.

**Decision: Use both** — IssueDB.code_snippet stores SonarQube's textRange content as a fallback. The code snippet endpoint fetches live from Git for freshness.

---

## Data Retention

Per Spec 004:
- Resolved issues retained for **6 months** (180 days) before archival
- The `archive_old_resolved_issues` Celery task needs updating to also archive `pending_verification` issues older than 6 months (shouldn't happen, but defensive)

**Update to `archive_old_resolved_issues`**:
```python
old_issues = (
    db.query(IssueDB)
    .filter(
        IssueDB.resolved_at.isnot(None),
        IssueDB.resolved_at < cutoff,
        IssueDB.status.in_(["verified", "rejected", "pending_verification"]),
    )
    .all()
)
```

---

## Database Migrations

Two migrations needed:

1. **Add `code_snippet` column to `issues` table**:
   ```sql
   ALTER TABLE issues ADD COLUMN code_snippet TEXT;
   ```

2. **Create `rescan_requests` table** (full DDL):
   ```sql
   CREATE TABLE rescan_requests (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       issue_id INTEGER NOT NULL REFERENCES issues(id),
       requested_by VARCHAR NOT NULL,
       fix_note TEXT,
       status VARCHAR NOT NULL DEFAULT 'pending',
       scan_id VARCHAR REFERENCES scans(scan_id),
       verdict VARCHAR,
       reviewer_id VARCHAR,
       reviewer_note TEXT,
       created_at TIMESTAMP NOT NULL,
       updated_at TIMESTAMP NOT NULL,
       completed_at TIMESTAMP
   );
   CREATE INDEX ix_rescan_requests_issue ON rescan_requests(issue_id);
   CREATE INDEX ix_rescan_requests_status ON rescan_requests(status, created_at);
   CREATE INDEX ix_rescan_requests_requested_by ON rescan_requests(requested_by);
   CREATE INDEX ix_rescan_requests_reviewer ON rescan_requests(reviewer_id);
   ```

**Recommendation**: Add Alembic if not already in use. If the project uses simple startup-time migration, add the new DDL to `app/core/db.py` or a startup hook.

---

## Entity Relationship Diagram

```
┌──────────────┐         ┌──────────────┐         ┌──────────────────┐
│   projects   │◄────────│   issues     │◄────────│  rescan_requests │
│              │ 1     * │              │ 1     * │                  │
└──────────────┘         └──────┬───────┘         └────────┬─────────┘
                                │                          │
                                │ 1                        │ *
                                ▼                          ▼
                        ┌──────────────┐         ┌──────────────────┐
                        │ issue_history│         │      scans       │
                        └──────────────┘         └──────────────────┘
                                                        ▲
                                                        │
                                                        │ 1
                                                ┌───────┴──────┐
                                                │  scan_reports│
                                                └──────────────┘
```
