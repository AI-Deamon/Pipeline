# Implementation Plan: Unified Issue Tracker

**Branch**: `004-unified-issue-tracker` | **Date**: 2026-06-09 | **Spec**: `specs/004-unified-issue-tracker/spec.md`

**Input**: Feature specification from `/specs/004-unified-issue-tracker/spec.md`

## Summary

Replace aggregated JSON-blob findings with individual issue records — deduplicated across scans, assignable to developers, with full lifecycle tracking (Open → Assigned → In Progress → Fixed → Verified/Rejected). Adds project overview page (tool cards with counts), tool-specific detail views with selective SonarQube type fetching, and a "My Issues" cross-project dashboard.

## Technical Context

**Language/Version**: Python 3.13 (backend), TypeScript 5.9 (frontend)

**Primary Dependencies**: FastAPI, SQLAlchemy 2.x, Celery + Redis, @tanstack/react-query, Axios

**Storage**: PostgreSQL 16 (new tables: `issues`, `issue_history`, `issue_scans`)

**Testing**: pytest + TestClient (backend), Vitest + React Testing Library (frontend)

**Target Platform**: Linux (Docker), modern browsers

**Project Type**: Web application (React SPA + FastAPI REST API)

**Performance Goals**: Issue detail views load within 2s for projects with ≤1000 issues (FR-014)

**Constraints**: 
- One active scan per project (DB constraint `ix_scans_project_state`)
- Files under 300 lines; split by responsibility
- No Alembic — use `Base.metadata.create_all`
- Dual-scans module: `scans.py` already migrated to `scans/` package; add issues as separate module

**Scale/Scope**: 500 concurrent users, 100,000 total issues across all projects

## Constitution Check

*GATE: Must pass before implementation. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| P1: Security-First | ✅ PASS | JWT auth on all issue endpoints; role-based access (admin views overview only) |
| P2: State Consistency | ✅ PASS | DB-level unique constraints for dedup; TanStack Query for frontend state |
| P3: Architectural Hygiene | ✅ PASS | New `issues.py` router + `IssueService` follows layered architecture; files under 300 lines |
| P4: Type Safety | ✅ PASS | Pydantic request/response schemas; TypeScript types in `src/types.ts` |
| P5: UI/UX Integrity | ✅ PASS | WCAG 2.1 AA; loading/empty/error states; WebSocket real-time updates |

No violations. Complexity tracking not required.

## Project Structure

### Documentation (this feature)

```
specs/004-unified-issue-tracker/
├── plan.md              ← This file
├── research.md          ← Technical decisions
├── data-model.md        ← Entity definitions, state machine
├── quickstart.md        ← Usage guide
├── contracts/
│   └── api.md           ← API contracts
├── checklists/
│   └── requirements.md  ← Quality checklist
└── spec.md              ← Feature specification
```

### Source Code (repository root)

```
backend/app/
├── models/
│   └── db_models.py           ← +IssueDB, +IssueHistoryDB, +IssueScanDB
├── schemas/
│   └── issue.py               ← New: Pydantic schemas for issues
├── api/
│   ├── scans/                 ← Existing (unchanged)
│   └── issues.py              ← New: issue CRUD, assignment, status, My Issues
├── services/
│   ├── reporting/             ← Existing (unchanged)
│   └── issue_service.py       ← New: business logic (state machine, dedup, migration)
└── tasks/
    ├── jenkins_tasks.py       ← Existing (unchanged)
    └── issue_tasks.py         ← New: migrate_findings_to_issues, auto-verify on re-scan

frontend/src/
├── types.ts                   ← +Issue, +IssueAssignment, +IssueHistory types
├── services/
│   └── api.ts                 ← +issue API methods
├── pages/
│   ├── ProjectOverviewPage.tsx ← New: tool cards with counts
│   ├── ToolDetailViewPage.tsx ← New: issue list per tool
│   └── MyIssuesPage.tsx       ← New: cross-project issue aggregation
├── components/
│   ├── IssueCard.tsx          ← New: issue summary card for My Issues
│   ├── IssueDetailModal.tsx   ← New: full issue detail with actions
│   ├── IssueFilterBar.tsx     ← New: filter by severity/type/status/location
│   ├── IssueTypeToggle.tsx    ← New: SonarQube issue type toggle (bugs/vulns/smells/hotspots)
│   └── ToolCard.tsx           ← New: project overview tool card
└── hooks/
    └── useIssues.ts           ← New: TanStack Query hooks for issues
```

**Structure Decision**: Follows existing project patterns — backend layered architecture (API → Service → Data), frontend pages + components + hooks + services.

## Implementation Order

### Phase 1: Data Layer (Backend Models)
1. Add `IssueDB`, `IssueHistoryDB`, `IssueScanDB` to `db_models.py`
2. Add `migration_status` column to `ScanReportDB`
3. Create `schemas/issue.py` with Pydantic request/response schemas

### Phase 2: Service Layer (Backend)
4. Create `services/issue_service.py` with:
   - `IssueService` class with CRUD, state machine transitions, assignment
   - Dedup logic for scan-to-scan issue matching
   - Migration from `ScanReportDB.findings` to `IssueDB`

### Phase 3: API Layer (Backend Routes)
5. Create `api/issues.py` with endpoints:
   - `GET /issues/projects/{id}/overview` — tool summary counts
   - `GET /issues/projects/{id}/tools/{tool}` — tool detail issue list
   - `GET /issues/my` — My Issues (cross-project)
   - `GET /issues/metrics` — counts by status, latency (FR-018)
   - `PUT /issues/{id}/assign` — assign to developer
   - `PUT /issues/{id}/status` — status transition
   - `POST /issues/{id}/comments` — add comment
   - `POST /issues/migrate` — trigger migration
6. Add structured issue event logging in `services/issue_service.py`

### Phase 4: Frontend Pages
7. Create `ProjectOverviewPage.tsx` with tool cards
8. Create `ToolDetailViewPage.tsx` with issue list, SonarQube type toggle
9. Create `MyIssuesPage.tsx` with cross-project aggregation
10. Create components: `ToolCard`, `IssueCard`, `IssueDetailModal`, `IssueFilterBar`, `IssueTypeToggle`

### Phase 5: Integration & Migration
11. Create `tasks/issue_tasks.py` with migration Celery task
12. Update `celery_app.py` to register new tasks
13. Run migration script for existing `ScanReportDB` data
14. Wire up WebSocket event types for issue updates
15. Add route registrations in `main.py`
16. Implement auto-verify logic in scan callback (re-scan confirms resolution)
17. Implement regression detection — previously fixed issue reappears → flagged (FR-012)
18. Add Celery periodic task to archive issues with `resolved_at > 6 months` (FR-016)

### Phase 6: Tests
19. Backend: pytest for `IssueService` (state machine, dedup, migration)
20. Backend: pytest for `issues.py` API routes
21. Frontend: Vitest for new pages and components
