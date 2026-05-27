# Implementation Plan: Upgrade SonarQube to Current Stable Version

**Branch**: `003-upgrade-sonarqube-image` | **Date**: 2026-05-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-upgrade-sonarqube-image/spec.md`

## Summary

Upgrade the SonarQube Docker instance from 9.9.8 (lts-community) to the latest LTA/LTS stable release that is compatible with PostgreSQL 15, with database backup, rollback procedure, scanner version compatibility, plugin audit, and end-to-end pipeline verification.

## Technical Context

**Language/Version**: N/A (Docker image upgrade — no code changes)

**Primary Dependencies**: Docker Compose, Docker Engine, PostgreSQL 15 (shared), Jenkins (pipeline), sonar-scanner (Jenkins agent)

**Storage**: PostgreSQL 15 (`sonarqube` database), Docker named volumes (`sonarqube_data`, `sonarqube_extensions`, `sonarqube_logs`)

**Testing**: Docker healthcheck (`wget`), manual end-to-end scan, `pytest tests/` (backend), `npm run build && npm run lint && npx vitest run` (frontend)

**Target Platform**: Linux (Docker host networking, Kali Linux on 192.168.1.101)

**Project Type**: Infrastructure / Docker configuration change

**Performance Goals**: N/A (no new code paths)

**Constraints**: PostgreSQL 15 only (no PG upgrade in scope), max 2-hour downtime, must preserve all existing project data and user accounts

**Scale/Scope**: 1 Docker service image tag change + 1 PostgreSQL database backup + 1 Jenkins credential/tool check + end-to-end verification scan

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Notes |
|-----------|-------|-------|
| P1: Security-First Architecture | ✅ Pass | Same token auth, same port, same network. No new attack surface. DB backup protects data integrity. |
| P2: State Consistency & Data Integrity | ✅ Pass | DB backup before upgrade. No changes to frontend/backend state management or query patterns. |
| P3: Architectural Hygiene | ✅ Pass | Docker compose change follows existing pattern. Single file change (`docker-compose.yml` image tag). Under 300 lines. |
| P4: Type Safety & Testing Rigor | ✅ Pass | No new code. Backend/frontend verification gate runs post-upgrade to confirm no regression. |
| P5: UI/UX Integrity | ✅ Pass | No UI changes. SonarQube dashboard accessed at same URL. |

**No violations — complexity tracking not required.**

## Project Structure

### Documentation (this feature)

```text
specs/003-upgrade-sonarqube-image/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
docker/
└── docker-compose.yml   # Single image tag change: sonarqube:lts-community → target version
docker-compose.dev.yml   # Dev overlay — may need image tag update
docker-compose.staging.yml  # Staging overlay — may need image tag update
docker-compose.test.yml  # Test overlay — may need image tag update
```

**Structure Decision**: Infrastructure-only change. Single image tag update in up to 4 Docker Compose files. No code changes in `backend/`, `src/`, or `Agent/`.

## Complexity Tracking

N/A — no constitution violations.
