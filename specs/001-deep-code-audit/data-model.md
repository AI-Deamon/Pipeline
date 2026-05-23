# Data Model: Deep Code Audit Fixes

**Date**: 2026-05-22

## Schema Changes

### 1. `UserDB` — No Changes

The existing `UserDB` model is adequate. No fields added.

### 2. `ProjectDB` — Add `user_id` (S1)

**Change**: Add `user_id` column as a foreign key to `UserDB.id`.

| Field | Type | Nullable | Default | Notes |
|-------|------|----------|---------|-------|
| `user_id` | `String` | Yes (migration) | `NULL` | FK to `users.id`. Nullable during migration; new projects require it. |

**Migration strategy**: 
1. Add column as nullable
2. Backfill existing projects with the admin user's ID
3. Make non-nullable for new inserts
4. All queries filter by `current_user.id` (except API-key bypass)

**Impact**: `ScanDB`, `ScanReportDB` inherit isolation via `project_id` — no schema changes needed there.

### 3. `ScanDB` — No Changes

The `ix_scans_project_state` index remains. The race condition fix uses `SELECT FOR UPDATE` at the application level, not a schema change.

### 4. `ScanReportDB` — No Changes

Reports are already scoped by `project_id`. The ownership check (S10) validates that the report's project belongs to the current user.

### 5. `ProjectGroupDB` — No Changes

Groups are already scoped by `created_by`. No schema change needed.

## Validation Rules (New)

| Schema | Field | Rule | Issue |
|--------|-------|------|-------|
| `ProjectCreate` | `name` | `max_length=255` | S13 |
| `ProjectCreate` | `git_url` | `HttpUrl` format | S13 |
| `ProjectCreate` | `target_ip` | IP format or empty | S13 |
| `ProjectCreate` | `target_url` | `HttpUrl` format or empty | S13 |
| `ProjectGroupCreate` | `naming_pattern` | `max_length=200`, regex safety check | S5, S13 |
| `UserCreate` | `password` | `min_length=8` | S4 |

## State Transitions (No Changes)

The scan state machine remains: `CREATED → QUEUED → RUNNING → COMPLETED/FAILED/CANCELLED`. No changes to state transitions.

## Database Configuration (B13)

**Change**: Add pool configuration to `create_engine()`:

```python
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=20,
    max_overflow=10,
    pool_recycle=300,
)
```
