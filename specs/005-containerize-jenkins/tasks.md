# Tasks: Containerize Jenkins

**Input**: Design documents from `/specs/005-containerize-jenkins/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: No test tasks — this is infrastructure containerization, verified via `docker compose up` and manual checks.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Infrastructure**: `docker/jenkins/` for Dockerfile and build scripts, `docker/docker-compose.jenkins.yml` for compose

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create directory structure and gather source data

- [X] T001 Create `docker/jenkins/` directory structure for Dockerfile, plugins, and tools
- [X] T002 Extract current Jenkins version (`2.528.3`) and verify base image `jenkins/jenkins:2.528.3` exists on Docker Hub
- [X] T003 Verify current installed plugins list (133 plugins) and determine which are essential vs optional
- [X] T004 Check versions of scan tools currently installed on the system (ZAP 2.17.0, Trivy 0.67.2, Nmap 7.99; SonarScanner/ODC not found locally)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Docker image with plugins — blocks all user stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 Create `docker/jenkins/plugins.txt` with all 133 installed plugins (one per line, no version pinning — let CLI resolve)
- [X] T006 Create `docker/jenkins/tools.sh` — script to install ZAP 2.17.0, Trivy 0.67.2, SonarScanner 7.0.2, Nmap, ODC 12.1.0 into the image
- [X] T007 Create `docker/jenkins/Dockerfile` with:
  - Base: `jenkins/jenkins:2.528.3`
  - Copy `plugins.txt` and run `jenkins-plugin-cli`
  - Copy and execute `tools.sh`
  - Set `ENV JAVA_OPTS=-Djava.awt.headless=true -Xmx7g -Xms512m`
- [X] T008 [P] Create `.dockerignore` in `docker/jenkins/` to exclude unnecessary files from build context

**Checkpoint**: Jenkins image can be built successfully

---

## Phase 3: User Story 1 — Bootstrap Jenkins from Docker (Priority: P1) 🎯 MVP

**Goal**: A server with only Docker can start Jenkins via `docker compose up` and access the web UI

**Independent Test**: `docker compose -f docker/docker-compose.jenkins.yml up -d` succeeds and Jenkins UI is reachable at `http://localhost:8080`

### Implementation for User Story 1

- [X] T009 [US1] Create `docker/docker-compose.jenkins.yml` with:
  - `build` context pointing to `./jenkins`
  - Service name `jenkins`, container name `jenkins`
  - Port mapping `8080:8080`
  - Named volume `jenkins_home` mounted at `/var/jenkins_home`
  - `network_mode: host`
  - Docker socket bind-mount: `/var/run/docker.sock:/var/run/docker.sock`
  - Environment: `JAVA_OPTS`, `JENKINS_ADMIN_ID`, `JENKINS_ADMIN_PASSWORD`, `JENKINS_OPTS`
  - `restart: unless-stopped`
- [X] T010 [US1] Build the image: `docker compose -f docker/docker-compose.jenkins.yml build`
- [X] T011 [US1] Start the container: `docker compose -f docker/docker-compose.jenkins.yml up -d`
- [X] T012 [US1] Verify Jenkins web UI is accessible at `http://localhost:8080` and admin login works with configured credentials

**Checkpoint**: Jenkins is containerized and accessible from browser

---

## Phase 4: User Story 2 — Persist Configuration Across Restarts (Priority: P1)

**Goal**: Jenkins jobs, credentials, and build history survive container restart/recreation

**Independent Test**: Create a job, restart the container, verify the job still exists

### Implementation for User Story 2

- [X] T013 [US2] Verify `jenkins_home` named volume is properly configured in `docker/docker-compose.jenkins.yml`
- [X] T014 [US2] Create a test job/pipeline in Jenkins UI
- [X] T015 [US2] Restart the container: `docker compose -f docker/docker-compose.jenkins.yml restart`
- [X] T016 [US2] Verify the test job persists after restart
- [X] T017 [US2] Destroy and recreate container: `docker compose -f docker/docker-compose.jenkins.yml down && docker compose -f docker/docker-compose.jenkins.yml up -d`
- [X] T018 [US2] Verify the test job persists after full recreation

**Checkpoint**: Container data survives restart and recreation

---

## Phase 5: User Story 3 — Network Integration with Pipeline Services (Priority: P2)

**Goal**: Jenkins container reaches SonarQube, ZAP, and backend API via localhost

**Independent Test**: Inside the Jenkins container, `curl http://localhost:9000` returns SonarQube (when running)

### Implementation for User Story 3

- [X] T019 [US3] Verify `network_mode: host` in compose file allows Jenkins to reach SonarQube (`localhost:9000`), backend (`localhost:8000`), and ZAP (`localhost:8090`)
- [X] T020 [US3] Verify Docker socket bind-mount allows `docker build` inside the Jenkins container
- [X] T021 [US3] Verify pipeline callback to backend API succeeds
- [X] T022 [US3] Verify ZAP can access target URLs from inside the container

**Checkpoint**: Jenkins container integrates with all pipeline services

---

## Phase 6: User Story 4 — JVM Heap Limits (Priority: P2)

**Goal**: Jenkins JVM respects `-Xmx7g -Xms512m` heap limit

**Independent Test**: `docker exec jenkins ps aux | grep java` shows `-Xmx7g -Xms512m` in JVM args

### Implementation for User Story 4

- [X] T023 [US4] Verify `JAVA_OPTS=-Djava.awt.headless=true -Xmx7g -Xms512m` is set in compose file environment
- [X] T024 [US4] Verify JVM args inside container: `docker exec jenkins ps aux | grep java | grep -oE 'Xmx[0-9]+[gmk]'`
- [X] T025 [US4] Verify heap does not exceed 7GB under normal pipeline load

**Checkpoint**: JVM heap is properly limited

---

## Phase 7: User Story 5 — Migration Path from Systemd (Priority: P3)

**Goal**: Documented procedure to export systemd Jenkins data and import into Docker container

**Independent Test**: Run migration steps on staging, all jobs/credentials are present after switch

### Implementation for User Story 5

- [X] T026 [US5] Document migration steps in `specs/005-containerize-jenkins/quickstart.md`:
  - Stop systemd Jenkins
  - Copy `/var/lib/jenkins` to temp location
  - Create Docker volume and populate with copied data
  - Start Docker Jenkins
  - Verify all jobs and credentials
- [X] T027 [US5] Create migration helper script at `docker/jenkins/migrate.sh` to automate the copy
- [X] T028 [US5] Test migration on staging or test server

**Checkpoint**: Documented, tested migration path exists

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, agent context, and final verification

- **No test tasks**

- [X] T029 [P] Update `AGENTS.md` SPECKIT context to reference `specs/005-containerize-jenkins/`
- [X] T030 Run full verification: build image, start container, run a test pipeline job
- [X] T031 Document any gotchas discovered during implementation in `AGENTS.md`
- [X] T032 Clean up unused files or stale references

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — can start immediately
- **Phase 2 (Foundational)**: Depends on Setup — BLOCKS all user stories
- **Phase 3 (US1)**: Depends on Phase 2 — compose file references built image
- **Phase 4 (US2)**: Depends on US1 — needs running container to test persistence
- **Phase 5 (US3)**: Depends on US1 — needs running container to test networking
- **Phase 6 (US4)**: Depends on US1 — needs running container to verify JVM
- **Phase 7 (US5)**: Depends on US1 — needs Docker Jenkins as migration target
- **Phase 8 (Polish)**: Depends on all user stories

### User Story Dependencies

- **US1 (P1)**: Blocks all other stories — first to implement and verify
- **US2 (P1)**: Can start after US1 — independently verifiable by restarting container
- **US3 (P2)**: Can start after US1 — independently verifiable via curl
- **US4 (P2)**: Can start after US1 — independently verifiable via docker exec
- **US5 (P3)**: Can start after US1 — independently verifiable on staging server

### Within Each User Story

- File creation before verification
- Start/restart container as needed for verification
- Each story is independently testable

### Parallel Opportunities

- T001, T002, T003, T004 (Setup) can run in parallel
- T005, T006, T007, T008 (Foundational) — T005/T006/T008 can run in parallel, T007 depends on them
- US1 tasks T009-T012 are sequential (create → build → start → verify)
- US3, US4, US6 verifications can run in parallel against the same running container
- US5 migration docs and script can be written in parallel with other stories

---

## Parallel Example: User Story 1

```bash
# Sequential (compose file → build → start → verify):
Task: "Create docker/docker-compose.jenkins.yml"
Task: "Build the image"
Task: "Start the container"
Task: "Verify web UI is accessible"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (Dockerfile + plugins + tools)
3. Complete Phase 3: User Story 1 (compose file + build + start)
4. **STOP and VALIDATE**: Jenkins is accessible at http://localhost:8080
5. Can deploy/demo the containerized Jenkins at this point

### Incremental Delivery

1. Setup + Foundational → Image can be built
2. US1: Compose + run → Containerized Jenkins running (MVP!)
3. US2: Volume verified → Persistent (restart-safe)
4. US3: Network verified → Pipeline-ready
5. US4: JVM limits verified → Memory-safe
6. US5: Migration documented → Systemd→Docker path complete

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. One person creates compose file (US1) and starts container
3. Once container is running:
   - Person A: US2 persistence verification
   - Person B: US3 network + Docker socket verification
   - Person C: US4 JVM verification
4. US5 migration script can be written in parallel with other stories
