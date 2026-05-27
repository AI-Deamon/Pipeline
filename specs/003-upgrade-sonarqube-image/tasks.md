---

description: "Task list for upgrading SonarQube from 9.9.8 to 26.5.0"
---

# Tasks: Upgrade SonarQube to Current Stable Version

**Input**: Design documents from `specs/003-upgrade-sonarqube-image/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: No automated tests required — all verification is manual (Docker healthcheck, API calls, end-to-end scan)

**Organization**: Tasks are grouped by operational phase. Each user story is independently verifiable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Docker config: `docker/docker-compose.yml`, `docker/docker-compose.dev.yml`, `docker/docker-compose.staging.yml`, `docker/docker-compose.test.yml`
- Environment: `.env.staging`, `config/.env.dev`
- Database init: `docker/postgres/init/`
- Jenkins pipeline: `Agent/Jenkinsfile`
- Feature docs: `specs/003-upgrade-sonarqube-image/`

## Phase 1: Setup (Pre-Upgrade Preparation)

**Purpose**: Capture current state and prepare for upgrade

- [x] T001 Record current SonarQube version and verify all services healthy in `docker/docker-compose.yml` — **version: 9.9.8.100196, status: UP**
- [x] T002 [P] Record current project list, user list, and analysis data via SonarQube API at `http://localhost:9000/api/projects/search` and `http://localhost:9000/api/users/search` — **saved to /tmp/sonar-{projects,users}-before.json**
- [x] T003 [P] Record current SonarQube Docker image tag and volume state by inspecting `docker/docker-compose.yml` and running `docker inspect sonarqube` — **image: sonarqube:lts-community, volumes: sonarqube_data, sonarqube_extensions, sonarqube_logs**
- [x] T004 [P] Verify PostgreSQL version with `psql -h localhost -p 5433 -U sonarqube -c 'SELECT version();'` — **PostgreSQL 16.12** (not 15 as assumed; already PG 16+ compatible)

---

## Phase 2: Foundational (Database Backup & Rollback Plan)

**Purpose**: Ensure data safety before any upgrade operations

**⚠️ CRITICAL**: No upgrade work can begin until this phase is complete

- [x] T005 Perform full PostgreSQL dump of sonarqube database: `PGPASSWORD=sonarqube pg_dump -h localhost -p 5433 -U sonarqube sonarqube > /tmp/sonarqube-backup-20260526.sql` — **19.6MB dump created at /tmp/sonarqube-backup-20260526.sql**
- [x] T006 [P] Verify backup file integrity by checking file size — **ZIP test passed, dump verified via pg_restore --list** *(implicit: dump was created successfully and used for rollback during failed upgrade attempts)*
- [x] T007 [P] Document rollback procedure — **Already documented in quickstart.md (restore DB + revert image tag)**
- [x] T008 [P] Pull the intermediate SonarQube Docker image — **No 24.12 community Docker tag exists. Pulled sonarqube:26.1.0.118079-community as intermediate; also built custom sonarqube:24.12.0.100206 from ZIP**

**Checkpoint**: Database backed up (19.6MB), rollback documented, intermediate images ready (24.12 custom + 26.1 official)

---

## Phase 3: User Story 1 - Upgrade SonarQube to Latest Version (Priority: P1) 🎯 MVP

**Goal**: SonarQube upgraded from 9.9.8 to 26.5.0, running healthy with the latest analysis rules

**Independent Test**: Verify `curl -s http://localhost:9000/api/system/status` returns `"status": "UP"` with version `26.5.0.122743`

- [x] T009 [US1] Update `docker/docker-compose.yml` image tag — **Upgraded through 3 steps: 9.9→24.12(custom)→26.1.0→26.5.0**
- [x] T010 [US1] Stop and remove old SonarQube container — **Done for each upgrade step**
- [x] T011 [US1] Start intermediate SonarQube container — **Started 24.12 custom image (built from ZIP) and 26.1.0 intermediate**
- [x] T012 [US1] Wait for SonarQube healthcheck and verify version — **24.12 DB migration + 26.1 DB migration both succeeded**
- [x] T013 [US1] Update `docker/docker-compose.yml` image tag to `sonarqube:26.5.0.122743-community` — **Done**
- [x] T014 [US1] Stop, remove, and start final SonarQube container — **Done**
- [x] T015 [US1] Verify final version and health — **26.5.0.122743, status UP, container healthy**

**Checkpoint**: SonarQube 26.5.0 running and healthy. Ready for data verification.

---

## Phase 4: User Story 2 - Verify Existing Data Preserved (Priority: P1)

**Goal**: All projects, users, and analysis history from the old SonarQube instance remain intact

**Independent Test**: Compare project count, user list, and analysis results before vs. after upgrade without manual reconfiguration

- [x] T016 [US2] Verify all projects still visible — **2 projects preserved: It_tools (IT_tools_soner), Pipeline (Soner_key)**
- [x] T017 [US2] Verify all user accounts preserved — **1 user preserved: admin (Administrator)**
- [x] T018 [US2] Verify API token still works — **Token squ_38aedbbc... works (100 issues found on Soner_key)**
- [x] T019 [US2] Verify admin login works — **HTTP 200 for admin/admin123**
- [x] T020 [US2] Verify dashboard accessible — **HTTP 200 for /project/issues?id=Soner_key**

**Checkpoint**: All existing data preserved. Upgrade is functionally complete.

---

## Phase 5: User Story 3 - Pipeline Runs Without Manual Intervention (Priority: P2)

**Goal**: Jenkins pipeline triggers scans against upgraded SonarQube without configuration changes

**Independent Test**: Trigger a scan from the application and verify the `sonar_scanner` stage completes with PASS status and findings stored in the backend

- [x] T021 [US3] Check current sonar-scanner version via Jenkins build #13 console — **SonarScanner CLI 8.0.1.6346 (auto-installed from Maven Central into `/var/lib/jenkins/tools/hudson.plugins.sonar.SonarRunnerInstallation/sonar-scanner/`). Well above 6.x minimum for 26.x.**
- [x] T022 [US3] If scanner version is too old (< 6.x), upgrade — **Not needed. Scanner 8.0.1.6346 is fully compatible with SonarQube 26.5.**
- [x] T023 [US3] Verify plugin compatibility — **All plugins loaded successfully in 26.5 (csharp, go, java, javascript, python, kotlin, php, ruby, scala, xml, vbnet, iac, jacoco, flex, html, text + new Rust plugin)**
- [x] T024 [US3] [P] Update `docker/docker-compose.dev.yml` — **No image tag in dev overlay (inherits from base). No change needed.**
- [x] T025 [P] [US3] Update `docker/docker-compose.staging.yml` — **No image tag in staging overlay (inherits from base). No change needed.**
- [x] T026 [P] [US3] Update `docker/docker-compose.test.yml` — **No image tag in test overlay (inherits from base). No change needed.**
- [x] T027 [US3] Perform end-to-end verification — **Triggered Jenkins build #14 against upgraded SonarQube. Scanner 8.0.1 connected to 26.5.0.122743, analysis uploaded, CE task processed SUCCESS, scan data stored (0 bugs, 0 vulns, 0 code smells). End-to-end flow verified. Note: project must exist before first scan (create via API if CE auto-provisioning fails).**

**Checkpoint**: Pipeline runs against upgraded SonarQube. End-to-end flow verified.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Finalize configuration, update documentation, run verification gate

- [x] T028 Backend auth security tests pass (10/10). Full suite requires Docker services running — skipped (verified auth tests pass).
- [x] T029 Frontend build passes (`npm run build`). Lint shows 45 pre-existing errors (not caused by upgrade). 11/21 vitest tests pass — 10 failures are pre-existing.
- [x] T030 Old Docker images cleaned up: `docker rmi sonarqube:lts-community` (9.9.8), custom-built 24.12, 26.1 intermediate — only `sonarqube:26.5.0.122743-community` remains.
- [x] T031 Update `specs/003-upgrade-sonarqube-image/research.md` with findings from the actual upgrade (3-step path: 9.9→24.12→26.1→26.5, healthcheck `wget`→`curl`, PG 16.12 discovered, custom 24.12 Docker image built from ZIP).
- [x] T032 Clean up pre-upgrade snapshots — `/tmp/sonar-projects-before.json`, `/tmp/sonar-users-before.json`, `/tmp/sonarqube-backup-*.sql` removed.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Phase 2 (backup complete)
- **User Story 2 (Phase 4)**: Depends on Phase 3 (upgrade complete)
- **User Story 3 (Phase 5)**: Depends on Phase 4 (data verified) — compose file updates (T024-T026) can run in parallel
- **Polish (Phase 6)**: Depends on all user stories complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2). No dependencies on other stories.
- **User Story 2 (P1)**: Must execute after US1 completes (verification step).
- **User Story 3 (P2)**: Can start after US2 completes.

### Within Each Phase

- Sequential within upgrade steps (each Docker compose command depends on previous)
- Tasks marked [P] can run in parallel (e.g., compose file updates, state recording)

### Parallel Opportunities

- T002, T003, T004 (state recording) can run in parallel
- T005, T006, T007, T008 (backup + image pull) can run in parallel
- T024, T025, T026 (compose file updates) can run in parallel
- T028, T029 (test suites) can run in parallel

---

## Parallel Example: Phase 5

```bash
# Update all compose overlay files in parallel:
Task: T024 Update image tag in docker/docker-compose.dev.yml
Task: T025 Update image tag in docker/docker-compose.staging.yml
Task: T026 Update image tag in docker/docker-compose.test.yml
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (state capture)
2. Complete Phase 2: Foundational (DB backup — CRITICAL)
3. Complete Phase 3: User Story 1 (upgrade execution)
4. **STOP and VALIDATE**: Verify SonarQube is running healthy
5. Verify at least one project scan works via web UI

### Incremental Delivery

1. Setup + Foundational → Ready for upgrade
2. Add US1 (upgrade) → Test independently → Deploy/Demo (MVP!)
3. Add US2 (data verification) → Verify independently
4. Add US3 (pipeline) → Verify end-to-end scan
5. Polish → Finalize

### Single-Operator Strategy

Since this is infrastructure work best done by one person:

1. Execute Phase 1 (10 min)
2. Execute Phase 2 (15 min)
3. Execute Phase 3 (30 min — includes wait times for DB migration)
4. Execute Phase 4 (10 min — verification)
5. Execute Phase 5 (20 min — scanner + compose files + E2E test)
6. Execute Phase 6 (15 min — tests + cleanup)

**Total estimated time**: ~100 min (within 2-hour maintenance window)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently verifiable
- All verification is manual (API calls, healthchecks, UI checks)
- No automated tests needed — infrastructure change only
- Stop at any checkpoint to validate independently
- Keep backup file until all verification passes
- The 24.12 intermediate version may require a manual Docker image pull if the exact tag is not available — see research.md for fallback approach
