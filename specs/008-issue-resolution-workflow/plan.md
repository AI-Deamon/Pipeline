# Implementation Plan: Complete Issue Resolution Platform

**Branch**: `004-unified-issue-tracker` | **Date**: 2026-06-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-issue-resolution-workflow/spec.md`

## Summary

The Issue Resolution Platform unifies the existing spec 004 (unified issue tracker) and spec 005 (RBAC) implementations, then extends them with: (1) parser enrichment to capture SonarQube's full payload, (2) a new `pending_verification` state in the issue state machine, (3) a formal `RescanRequestDB` lifecycle with optimistic locking via a `version` column, (4) code snippet retrieval with PII sanitization, (5) a frontend deep-dive view with comprehensive empty/loading/error states, (6) a `PendingVerificationPage` with project filter chips, (7) a single-tool verify scan endpoint, (8) Prometheus metrics, and (9) per-user rate limiting on the dev workflow. Workflow is fully manual — only users (admin/team_lead) trigger scans; developers fix and submit fix notes for review.

## Technical Context

**Language/Version**: Python 3.13 (backend), TypeScript 5.x (frontend), React 19

**Primary Dependencies**:
- Backend: FastAPI, SQLAlchemy, Celery, Pydantic V2 (ConfigDict), httpx, python-jose, passlib, **prometheus-client** (3 metrics), **slowapi** (rate limiting)
- Frontend: React 19, React Router 7, @tanstack/react-query, react-syntax-highlighter, lucide-react, Tailwind CSS
- Infra: SonarQube 26.5, Jenkins 2.528.3, Redis, PostgreSQL/SQLite
- Testing: pytest (backend), Vitest + jsdom (frontend)

**Storage**: SQLite (test/dev) / PostgreSQL (staging/prod) via SQLAlchemy ORM. New `rescan_requests` table (with `version` column for optimistic locking); new `code_snippet` column on `issues` table. Redis for caching and rate-limit counters.

**Testing**: Vitest (frontend), pytest (backend). Mock external services (Jenkins, SonarQube, Redis). DB is `:memory:` SQLite with `StaticPool` for tests.

**Target Platform**: Linux server (Docker compose stack). Network mode `host` for service-to-service communication. Vite dev server on :5173, FastAPI on :8000.

**Project Type**: Web application (frontend + backend). Backend is FastAPI REST API + Celery workers; frontend is React 19 SPA.

**Performance Goals**:
- `GET /issues/{id}` p95 < 200ms (Redis cache 60s TTL)
- `GET /issues/pending-verification` p95 < 500ms (Redis cache 5s TTL)
- `POST /issues/{id}/request-rescan` p95 < 800ms (DB write + WebSocket broadcast)
- WebSocket event delivery p95 < 100ms
- 500 concurrent users, 100,000 total issues (per spec 004)
- Verify scan: 2-3 min (single tool, faster than full pipeline)

**Constraints**:
- WCAG 2.1 AA compliance (per spec 004)
- All endpoints require JWT or API key except `/auth/login`, `/auth/register`, `/docs`
- `/metrics` requires HTTP Basic auth using `METRICS_TOKEN` env var (Prometheus scrape config provides the token)
- PII in fix_notes: sanitize before storage, redact on display
- Files under 300 lines (per architecture)
- No `any` types in TypeScript (per spec 004)
- Comprehensive empty/loading/error states for `PendingVerificationPage` (per clarification 3rd pass)

**Scale/Scope**:
- 500 concurrent users, 100k total issues (inherited from spec 004)
- ~37.5 hours of work across 12 phases
- 84 implementation tasks
- 7 new components/pages, 7 new API endpoints, 1 new DB table, 1 new DB column, 3 Prometheus metrics

## Constitution Check

*Gate: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Notes |
|---|-----------|--------|-------|
| 1 | Security-First Architecture | ✓ PASS | All new endpoints under JWT auth. Fix note sanitization prevents secret leakage. RBAC enforced (clarification: devs can't trigger scans). Rate limiting 3/hour on dev endpoint. Admin-only `/fix-notes/{id}/raw` for raw access. |
| 2 | State Consistency & Data Integrity | ✓ PASS | `pending_verification` state is a first-class enum value. State machine transition validation. Optimistic locking via `version` column prevents concurrent updates. TanStack Query for all server state. WebSocket events trigger query invalidation. |
| 3 | Architectural Hygiene | ✓ PASS | All new files <300 lines. Follows existing API → Service → Data layering. New pages are default-exported; new components are named-exported with memo. New `RescanService` for optimistic locking logic. |
| 4 | Type Safety & Testing Rigor | ✓ PASS | Pydantic V2 `ConfigDict` used. No `any` types in new TS code. New tests for state machine, API endpoints, optimistic locking, sanitization, rate limiting, frontend components. Verification gate enforced. |
| 5 | UI/UX Integrity | ✓ PASS | `RescanRequestModal` follows existing modal patterns (focus trap, ARIA). Comprehensive empty/loading/error states for `PendingVerificationPage` (per 3rd pass). WebSocket connection indicator. Skeleton loading. Optimistic updates with rollback. Filter chips for project scope. |

**No violations. Plan proceeds.**

## Project Structure

### Documentation (this feature)

```text
specs/008-issue-resolution-workflow/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (10 technical decisions)
├── data-model.md        # Phase 1 output (rescan_requests table, version column)
├── quickstart.md        # Phase 1 output (10-step E2E demo)
├── contracts/
│   └── api.md           # Phase 1 output (5 new + 2 modified + 2 PATCH/DELETE)
├── tasks.md             # Phase 2 output (66 tasks in 12 phases)
├── spec.md              # Original spec (12 clarifications across 3 sessions)
└── checklists/
    └── requirements.md  # Quality validation
```

### Source Code (repository root)

```text
backend/
├── app/
│   ├── api/
│   │   ├── issues.py          # MODIFIED: +7 rescan endpoints (incl PATCH/DELETE)
│   │   ├── projects.py        # MODIFIED: +1 code-snippet endpoint
│   │   └── scans/
│   │       ├── routes.py      # MODIFIED: +1 trigger-verify endpoint
│   │       └── callback.py    # MODIFIED: +1 auto-verify task
│   ├── models/
│   │   └── db_models.py       # MODIFIED: +RescanRequestDB, +code_snippet column
│   ├── schemas/
│   │   └── issue.py           # MODIFIED: +RescanRequestCreate/Response
│   ├── services/
│   │   ├── issue_service.py   # MODIFIED: validate new transitions
│   │   ├── rescan_service.py  # NEW: optimistic locking logic
│   │   ├── fix_note_sanitizer.py  # NEW: regex-based PII redaction
│   │   └── rbac_service.py    # MODIFIED: +can_request_rescan, +can_approve_rescan
│   ├── state/
│   │   └── issue_state.py     # MODIFIED: +PENDING_VERIFICATION state
│   ├── tasks/
│   │   └── issue_tasks.py     # MODIFIED: +auto_verify_pending_rescans
│   ├── websockets/
│   │   └── manager.py         # MODIFIED: +3 event types
│   ├── metrics.py             # NEW: 3 Prometheus metrics
│   └── main.py                # MODIFIED: +/metrics endpoint
└── tests/
    ├── conftest.py            # MODIFIED: fix DB locking
    ├── test_issue_state.py    # MODIFIED: new state tests
    ├── test_issue_api.py      # MODIFIED: rescan API + locking + rate limit tests
    ├── test_issue_tasks.py    # MODIFIED: auto-verify tests
    ├── test_fix_note_sanitizer.py  # NEW: sanitization tests
    ├── test_metrics.py        # NEW: Prometheus tests
    └── test_issues_rbac.py    # FIX: register IssueDB before create_all

src/
├── App.tsx                    # MODIFIED: +1 lazy route
├── components/
│   ├── CodeSnippet.tsx        # NEW
│   ├── IssueDetailModal.tsx   # MODIFIED: expanded with deep-dive
│   ├── RescanRequestModal.tsx # NEW: includes Edit + Cancel actions
│   ├── RescanRequestCard.tsx  # NEW: props = {request: RescanRequestResponse, onVerify, onReject}; shows issue title, severity badge, developer, fix note (sanitized), Verify Now + Reject buttons
│   ├── FilterChips.tsx        # NEW: project filter chips
│   └── EmptyState.tsx         # NEW: comprehensive empty/loading/error states
├── pages/
│   ├── PendingVerificationPage.tsx  # NEW: filter chips, skeleton loading, error banner
│   ├── ToolDetailViewPage.tsx       # MODIFIED: +columns, +badge
│   └── MyIssuesPage.tsx             # MODIFIED: +badge
├── hooks/
│   ├── useRescanQueue.ts      # NEW
│   ├── useRescanRequest.ts    # NEW: PATCH/DELETE operations
│   └── useRescanWebSocket.ts  # NEW: subscribes to 3 WS events
├── services/
│   └── api.ts                 # MODIFIED: +7 rescan methods, +code snippet
└── types.ts                   # MODIFIED: +RescanRequest type, +code snippet type, +3 WebSocket event types

Agent/
└── Jenkinsfile                # MODIFIED: capture code snippets at scan time
```

**Structure Decision**: Web application (Option 2). Existing `backend/` and `src/` directories are extended. No new top-level modules added. New `RescanService` extracted as a separate file (consistent with `IssueService` pattern) for the optimistic locking logic. New `fix_note_sanitizer.py` as a utility module (could be inline but isolated for testability).

## Complexity Tracking

> **No constitution violations. Section is empty by design.**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none)    | (none)     | (none)                                |

---

## Summary of Generated Artifacts

| File | Status | Phase |
|------|--------|-------|
| `spec.md` | Complete (12 clarifications across 3 sessions) | Specify |
| `plan.md` | This file | Plan |
| `research.md` | Complete (10 decisions) | Phase 0 |
| `data-model.md` | Complete (1 new table with version column, 1 new column) | Phase 1 |
| `contracts/api.md` | Complete (5 new + 2 modified + 2 PATCH/DELETE) | Phase 1 |
| `quickstart.md` | Complete (10-step E2E) | Phase 1 |
| `tasks.md` | Complete (84 tasks in 12 phases) | Phase 2 (NOT created by plan) |
| `checklists/requirements.md` | Complete | Quality |

## Implementation Order

```
Phase 1 (Parser) ──→ Phase 2 (State) ──→ Phase 3 (Rescan API) ──→ Phase 4 (Auto-Verify)
                                                                       │
                                                                       ▼
Phase 12 (Post-Plan: PATCH/DELETE, sanitization, metrics, caching, rate limit)
                                                       │
                                                       ▼
                            Phase 5 (Code Snippet) ──→ Phase 6 (Frontend Deep-Dive)
                                                       │
                                                       ▼
                            Phase 7 (Pending Queue with filter chips) ──→ Phase 8 (Verify Scan)
                                                       │
                                                       ▼
                            Phase 9 (Infra Fixes) ──→ Phase 10 (Tests) ──→ Phase 11 (Polish)
```

## Next Steps

1. Begin implementation following Phase 1 (Parser Enrichment) → Phase 12 (Post-Plan)
2. After each phase, run the relevant test subset
3. Verification gate: `npm run lint && npm run build && npx vitest run && pytest tests/`
4. Update `AGENTS.md` SPECKIT markers to point to this spec (already done in previous run)
