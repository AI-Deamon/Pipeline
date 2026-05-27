# Tasks: SonarQube Docker Container

**Input**: Design documents from `/specs/002-sonarqube-docker/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Not requested — all verification is manual (Docker Compose infrastructure changes, no code to test).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Docker config**: `docker/`
- **Environment**: `.env.staging`, `config/.env.dev`
- **Database init**: `docker/postgres/init/`

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T001 [P] Create PostgreSQL init script at `docker/postgres/init/02-create-sonarqube-db.sql` to create the `sonarqube` database and user (data-model.md §2)
- [ ] T002 [P] Add `sonarqube` service definition to `docker/docker-compose.yml` with `sonarqube:lts-community` image, `network_mode: host`, three named volumes (`sonarqube_data`, `sonarqube_extensions`, `sonarqube_logs`), environment variables (`SONAR_JDBC_URL`, `SONAR_JDBC_USERNAME`, `SONAR_JDBC_PASSWORD`, `SONAR_ES_BOOTSTRAP_CHECKS_DISABLE=true`), depends_on postgres with healthy condition, and curl-based healthcheck at `http://localhost:9000/api/system/status` (research R1-R6)
- [ ] T003 [P] Add `sonarqube` env_file and volumes section to `docker/docker-compose.dev.yml` overlay (research R7)
- [ ] T004 [P] Add `sonarqube` env_file and volumes section to `docker/docker-compose.staging.yml` overlay (research R7)
- [ ] T005 Add `SONARQUBE_URL=localhost:9000`, `SONARQUBE_PROTOCOL=http`, `SONAR_JDBC_URL=jdbc:postgresql://localhost:5433/sonarqube`, `SONAR_JDBC_USERNAME=sonarqube`, `SONAR_JDBC_PASSWORD=sonarqube`, `SONAR_ES_BOOTSTRAP_CHECKS_DISABLE=true` to `config/.env.dev` (was missing SonarQube vars entirely)
- [ ] T006 Add `SONARQUBE_PROTOCOL=http`, `SONAR_JDBC_URL=jdbc:postgresql://localhost:5433/sonarqube`, `SONAR_JDBC_USERNAME=sonarqube`, `SONAR_JDBC_PASSWORD=sonarqube`, `SONAR_ES_BOOTSTRAP_CHECKS_DISABLE=true` to `.env.staging` (research R7)
- [ ] T007 Register the three new named volumes (`sonarqube_data`, `sonarqube_extensions`, `sonarqube_logs`) in the `volumes:` section of `docker/docker-compose.yml`

**Checkpoint**: Foundation ready — SonarQube service is defined in Docker Compose with database init, health checks, and env vars across all environments.

---

## Phase 2: User Story 1 — Run SonarQube as Container (Priority: P1) 🎯 MVP

**Goal**: SonarQube runs as a managed container alongside other services, reachable over the network, with data surviving restarts.

**Independent Test**: Start the stack. Verify SonarQube is reachable at `http://localhost:9000` and the health endpoint returns `{"health": "GREEN"}`. Stop and restart — verify data is preserved.

### Implementation for User Story 1

- [ ] T008 [P] [US1] Start the full stack with `python run.py staging` and verify SonarQube container starts, becomes healthy, and responds at `http://localhost:9000` (quickstart.md §1-2)
- [ ] T009 [P] [US1] Verify SonarQube connected to PostgreSQL by checking for system tables: `docker compose exec postgres psql -U sonarqube -d sonarqube -c "\dt"` (quickstart.md §3)
- [ ] T010 [US1] Verify data persistence: stop stack with `python run.py staging` (ctrl+c), restart, and confirm SonarQube returns same state (quickstart.md §7)

**Checkpoint**: SonarQube container is operational — accessible via browser, connected to PostgreSQL, data persists across restarts.

---

## Phase 3: User Story 2 — Jenkins Integration Compatibility (Priority: P1)

**Goal**: Existing Jenkins pipeline Sonar Scanner stage and backend issue fetching work with containerized SonarQube.

**Independent Test**: Trigger a scan from the application. Verify `sonar_scanner` stage passes with `PASS` status. Verify backend `fetch_sonar_issues()` retrieves results without auth errors.

### Implementation for User Story 2

- [ ] T011 [P] [US2] Trigger a scan from the application UI with `sonar_scanner` stage enabled; verify Jenkins pipeline connects to containerized SonarQube and stage completes with `PASS` status (quickstart.md §4)
- [ ] T012 [US2] After scan completes, verify backend fetched SonarQube issues: check `docker compose logs backend | grep -i sonar` for successful fetch; verify findings appear in the scan report UI (quickstart.md §5)

**Checkpoint**: SonarQube integration is fully functional — Jenkins pipeline analyzes code, backend fetches issues, results visible in UI.

---

## Phase 4: User Story 3 — Authentication Token Renewal (Priority: P2)

**Goal**: Old SonarQube tokens are replaced with new tokens across all integration points (config files, Jenkins credentials).

**Independent Test**: Generate a new token via the SonarQube web UI. Update all config files. Restart services. Verify backend can fetch issues and Jenkins can authenticate.

### Implementation for User Story 3

- [ ] T013 [P] [US3] Generate a new SonarQube authentication token via the web UI at `http://localhost:9000` (Administration → Security → Users → admin → Tokens) and copy the token value
- [ ] T014 [P] [US3] Update `SONARQUBE_TOKEN` in `.env.staging` with the new token value
- [ ] T015 [P] [US3] Update `SONARQUBE_TOKEN` in `config/.env.dev` with the new token value
- [ ] T016 [US3] Update the `sonar-token` credential in Jenkins UI with the new token value (external action, documented in quickstart.md §6 step 8)
- [ ] T017 [US3] Restart backend and celery_worker: `docker compose -f docker/docker-compose.yml -f docker/docker-compose.staging.yml restart backend celery_worker` to pick up new token env vars
- [ ] T018 [US3] Verify token works: trigger a scan and check that `fetch_sonar_issues()` succeeds with no authentication errors (quickstart.md §6 step 10)

**Checkpoint**: All SonarQube integrations use the new token. Old token is completely replaced.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Full verification and documentation updates.

- [ ] T019 Run full verification per `quickstart.md`: stack start, health check, DB connection, Jenkins integration, token renewal, persistence
- [ ] T020 [P] Run existing test suites to confirm no regressions: `npm run lint && npm run build && npx vitest run && pytest tests/`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 1)**: No dependencies — tasks T001-T007 can start immediately. BLOCKS all user stories.
- **User Story 1 (Phase 2)**: Depends on Phase 1 completion (service must exist in compose).
- **User Story 2 (Phase 3)**: Depends on US1 (container must be running for Jenkins to connect).
- **User Story 3 (Phase 4)**: Depends on US1 (need running SonarQube to generate token). Independent of US2.
- **Polish (Phase 5)**: Depends on all user stories complete.

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 1) — No dependencies on other stories
- **User Story 2 (P1)**: Depends on US1 (container must be running) — Independent of US3
- **User Story 3 (P2)**: Depends on US1 (need web UI to generate token) — Independent of US2

### Within Each User Story

- Verification tasks come after implementation tasks
- Story complete before moving to next priority

### Parallel Opportunities

- T001 and T002 can run in parallel (different files: Postgres init vs docker-compose.yml)
- T003 and T004 can run in parallel (different overlay files)
- T005 and T006 can run in parallel (different env files)
- All Foundational [P] tasks can run in parallel
- US1 tasks T008 and T009 can run in parallel (independent checks)
- US2 tasks are sequential (need scan to complete first)
- US3 tasks T013, T014, T015 can run in parallel (token generation + config updates)
- US3 and US2 can run in parallel
- T019 and T020 in Polish phase can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch all verification tasks together:
Task: "Start stack and verify SonarQube is healthy"
Task: "Verify PostgreSQL connection"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Foundational
2. Complete Phase 2: User Story 1
3. **STOP and VALIDATE**: Verify SonarQube container is running, healthy, and persists data
4. Deploy/demo if ready

### Incremental Delivery

1. Complete Foundational → SonarQube service defined
2. Add User Story 1 → Stack verified with SonarQube (MVP!)
3. Add User Story 2 → Jenkins pipeline verified with containerized SonarQube
4. Add User Story 3 → Tokens renewed across all integrations
5. Polish → Full verification pass

### Parallel Team Strategy

With multiple developers:

1. Team completes Phase 1 together
2. Once Foundational is done:
   - Developer A: User Story 1 (verify container, DB, persistence)
   - Developer B: User Story 3 (token generation + config updates) — independent of US2
3. Developer A continues to User Story 2 (Jenkins integration)
4. All verify together in Polish phase

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- **Total tasks**: 20
- **Task distribution**: Foundational (7), US1 (3), US2 (2), US3 (6), Polish (2)
