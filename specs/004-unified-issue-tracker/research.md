# Research: Unified Issue Tracker

## Decision 1: Storage Model — Separate Issues Table vs JSON Column

**Decision**: New `IssueDB` table (separate from `ScanReportDB.findings` JSON column).

**Rationale**: Individual issue records need stable IDs for dedup across scans, status tracking (Assigned → In Progress → Fixed → Verified), assignment to users, history/audit trail, and relational queries (filter, sort, join). JSON column in `ScanReportDB` cannot support indexes, foreign keys, or atomic row-level updates. The existing `findings` JSON is preserved for backward compatibility; migration script copies data to new table.

**Alternatives considered**:
- Keep everything in `ScanReportDB.findings` — rejected: no dedup, no per-issue status, no foreign keys
- Document store (MongoDB) — rejected: overkill for 100k issues, adds operational complexity

---

## Decision 2: Deduplication Strategy — Identifier-Based Matching

**Decision**: Stable external ID as primary dedup key, per tool:
- SonarQube: `issue_key` (SonarQube's stable issue GUID)
- Trivy/DepCheck: `CVE_ID + package_name` 
- ZAP: `alert_id + url`
- Nmap: `host + port + service`

When same ID appears in a new scan: update `last_seen`, update metadata (severity, line number, version), append to scan history. If issue disappears from new scan: set `resolved_at` but keep record for 6-month retention.

**Rationale**: Follows FR-005 spec. External tool IDs are stable and tool-maintained. Content-hash dedup (existing approach in `ProjectGroupingService`) is unreliable — same vulnerability at different line numbers would merge incorrectly.

**Alternatives considered**:
- Content-hash (`title||severity||cve||package`) — rejected: false matches when metadata shifts slightly
- Composite key (external_id + tool + project) — used as unique constraint, same as external ID per project

---

## Decision 3: SonarQube Selective Fetching — API Filtering

**Decision**: Use SonarQube `api/issues/search?types=BUG,VULNERABILITY,CODE_SMELL,SECURITY_HOTSPOT` to filter server-side. Frontend toggle selects which types to include → backend passes as query param → SonarQube returns only matching issues.

**Rationale**: Server-side filtering reduces payload size (projects with 400+ code smells send 10KB instead of 200KB) and API latency. The SonarQube API already supports `types` filter parameter.

**Alternatives considered**:
- Fetch all, filter client-side — rejected: wastes bandwidth, slower for users toggling
- Store all, filter in backend API — rejected: same bandwidth issue, more storage

---

## Decision 4: Issue Lifecycle State Machine

**Decision**: 6-state lifecycle with explicit transitions:

```
Open → Assigned → In Progress → Fixed → Verified (terminal)
                                    → Rejected → Assigned (loop back)
Open → Fixed (auto-verified via re-scan)
```

Transitions enforced at service layer. Frontend only shows valid next states per role.

**Rationale**: FR-006 maps cleanly to a state machine. Enforcing transitions prevents invalid states (e.g., skipping from Open to Verified).

---

## Decision 5: Database Migrations — No Alembic, Use create_all

**Decision**: Add new models to `db_models.py`. Since project uses `Base.metadata.create_all(bind=engine)` at startup, new tables are auto-created. The existing `ScanReportDB.findings` data is migrated via a one-time idempotent script (Celery task or CLI command).

**Rationale**: Project has no Alembic setup and all existing models follow this pattern. Adding Alembic mid-project is scope creep.

**Risk**: `create_all` is a no-op on existing tables (won't add columns). If we need to add columns to existing tables later, we'll need a migration strategy.

---

## Decision 6: New API Module — `backend/app/api/issues.py`

**Decision**: Create a new `issues.py` router module (separate from `scans/` submodule).

**Rationale**: Issue management is a distinct domain from scan lifecycle. The `scans/` module handles scan creation, execution, and callback. Issues handle post-scan findings management (CRUD, assignment, status transitions, My Issues). Following layered architecture (API → Service → Data).

**Alternatives considered**:
- Add to `scans/routes.py` — rejected: file already at complexity limit, mixes concerns
- New submodule `scans/issues/` — rejected: issues span across scans, not a sub-domain of scan lifecycle

---

## Decision 7: Frontend — New Pages, Lazy-Loaded

**Decision**: Three new pages (all lazy-loaded via `React.lazy`):
1. `ProjectOverviewPage.tsx` — tool cards with summary counts (replaces current project detail view)
2. `ToolDetailViewPage.tsx` — individual issues for one tool with filtering
3. `MyIssuesPage.tsx` — cross-project, cross-tool issue aggregation for developers

Existing `FindingsTable.tsx` component can be reused/adapted for the tool detail view. New `IssueCard.tsx` component for My Issues list.

**Rationale**: Follows existing frontend patterns (lazy-loaded pages, TanStack Query, `api.ts` service layer). Reuses existing FindingsTable component where possible.

---

## Decision 8: Migration Script — Idempotent One-Time Task

**Decision**: A Celery task `migrate_findings_to_issues` that:
1. Queries `ScanReportDB` records where `migration_status IS NULL`
2. For each `findings` JSON array entry, creates an `IssueDB` record
3. Sets `migration_status = 'DONE'` on the `ScanReportDB` record
4. Is idempotent: re-running skips already-migrated records

A CLI trigger endpoint `POST /api/v1/issues/migrate` to start migration.

**Rationale**: FR-013 requires idempotent migration. Tracking migration per ScanReport avoids duplicates on re-run. Celery async task prevents timeout on large datasets.

---

## Decision 9: Role-Based Access — Admin Sees Overview Only

**Decision**: Introduce a `role` field on `UserDB` (future spec 005-rbac). For now, use a hardcoded check: any existing user is treated as "developer". The admin role is identified by username `admin`. Team Lead role is identified by a `is_team_lead` column or a configurable list.

**Rationale**: FR-025 requires role-based view control. Spec 005-rbac will formalize this later. Interim solution uses existing data (admin username check) plus a simple `is_team_lead` flag on `UserDB`.

---

## Decision 10: Real-Time Notifications — WebSocket Reuse

**Decision**: Reuse existing WebSocket manager for issue updates. Add new event types: `issue_assigned`, `issue_status_changed`, `issue_comment_added`. Existing `useScanWebSocket` hook extended or a new `useIssueWebSocket` hook.

**Rationale**: The existing WebSocket infrastructure (`ConnectionManager` in `websockets/manager.py`) supports arbitrary event types. No new infrastructure needed.
