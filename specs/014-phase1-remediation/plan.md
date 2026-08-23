# Implementation Plan: Phase 1 Audit Remediation

**Branch**: `main` | **Date**: 2026-07-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/014-phase1-remediation/spec.md`

## Summary

Remediate five audit findings (FR-1 through FR-5) to improve data integrity, worker reliability, dashboard correctness, authentication security, and API performance. Backend changes span PostgreSQL constraints, Celery configuration, FastAPI auth endpoints, and the projects API. Frontend changes span four dashboard pages, the auth hook, the API service, and the settings page.

## Technical Context

**Language/Version**: Python 3.11+ (backend), TypeScript 5.x (frontend)

**Primary Dependencies**: FastAPI, SQLAlchemy, Celery + Redis, React 19, @tanstack/react-query, axios, jose (JWT), passlib (password hashing)

**Storage**: PostgreSQL (scan_reports, users, projects, scans tables)

**Testing**: pytest (backend), Vitest + jsdom (frontend)

**Target Platform**: Linux server (Docker), modern browsers (Chrome/Firefox/Edge)

**Project Type**: web-service + web-application (full-stack DevSecOps platform)

**Performance Goals**: GET /projects < 2s for 500 projects; < 20 DB queries per request

**Constraints**: Files < 300 lines; Python type hints required; no TypeScript `any` types; import type for TS type-only imports

**Scale/Scope**: 500+ projects, multiple concurrent scans, ~5 files backend changes, ~6 files frontend changes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| 1. Security-First Architecture | PASS | FR-4 moves tokens to httpOnly cookies; retires shared API key for end-user flows. Aligns with "no secrets in client-side bundles." |
| 2. State Consistency & Data Integrity | PASS | FR-1 adds unique constraint + upsert on ScanReportDB. FR-5 eliminates N+1 queries. FR-3 adds error handling to dashboards. |
| 3. Architectural Hygiene | PASS | No new layers or patterns. Changes fit within existing API → Service → Data layers. |
| 4. Type Safety & Testing Rigor | PASS | All changes require type hints (Python) and typed props (TS). Tests required for each FR. Verification gate must pass. |
| 5. UI/UX Integrity | PASS | FR-3 adds error states, empty states, and retry actions to all four dashboard pages. FR-5 adds empty state for zero projects. |

**Gate result**: PASS — no violations. Proceeding to Phase 0.

*Post-Phase 1 re-check*: All 5 principles still PASS after data-model, contracts, and research artifacts are complete. No new violations introduced.

## Project Structure

### Documentation (this feature)

```text
specs/014-phase1-remediation/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── api-changes.md
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
backend/
├── app/
│   ├── api/
│   │   ├── auth.py                    # FR-4: cookie-based auth + refresh endpoint
│   │   ├── projects.py                # FR-5: pagination + N+1 fix
│   │   └── scans/
│   │       └── routes.py              # FR-1: no changes (upsert is in fetcher)
│   ├── core/
│   │   ├── celery_app.py              # FR-2: add task_time_limit / task_soft_time_limit
│   │   ├── config.py                  # FR-4: add COOKIE_*, REFRESH_TOKEN_* settings
│   │   └── security.py               # FR-4: shorten token lifetime, add refresh token creation
│   ├── models/
│   │   └── db_models.py               # FR-1: add unique index on (scan_id, tool_name)
│   └── services/
│       └── reporting/
│           └── fetcher.py             # FR-1: upsert instead of INSERT
tests/
├── test_scan_report_dedup.py          # FR-1: unique constraint + upsert tests
├── test_celery_timeouts.py            # FR-2: timeout configuration tests
├── test_auth_cookie.py                # FR-4: cookie auth + refresh flow tests
└── test_projects_pagination.py        # FR-5: pagination + query count tests

src/
├── pages/
│   ├── ExecutiveSummaryPage.tsx        # FR-3: NaN fix, isError, real trends
│   ├── PortfolioDashboardPage.tsx      # FR-3: isError, real trends, backend scores
│   ├── TeamWorkloadPage.tsx            # FR-3: isError handling
│   ├── TrendAnalysisPage.tsx           # FR-3: isError handling
│   └── SettingsPage.tsx               # FR-4: remove API key display for end users
├── hooks/
│   └── useAuth.tsx                     # FR-4: cookie-based auth, refresh mechanism
├── services/
│   └── api.ts                          # FR-4: remove sessionStorage reads, cookie-based
└── components/
    └── ui/
        └── ErrorDisplay.tsx            # FR-3: reuse existing component (no new file)
```

**Structure Decision**: Existing full-stack layout unchanged. All changes fit within current file structure — no new directories or files needed (except test files and one contracts doc).

## Complexity Tracking

> No constitution violations — no complexity justification needed.
