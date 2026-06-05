# Implementation Plan: Containerize Jenkins

**Branch**: `005-containerize-jenkins` | **Date**: 2026-05-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/005-containerize-jenkins/spec.md`

## Summary

Containerize the existing systemd Jenkins installation (v2.528.3) into a portable Docker image with all plugins, scan tools (ZAP, Trivy, SonarScanner, Nmap, ODC), and JENKINS_HOME volume persistence, managed via a standalone `docker-compose.jenkins.yml` file.

## Technical Context

**Language/Version**: Jenkins 2.528.3 (Java), Docker, Docker Compose

**Base Image**: `jenkins/jenkins:2.528.3` — pinned to currently installed version

**Primary Dependencies**: Docker, Docker Compose, `jenkins/jenkins:2.528.3` official image

**Storage**: Docker named volume (`jenkins_home`) mapped to `/var/jenkins_home` for persistence of jobs, credentials, build history, and plugin data

**Testing**: Manual verification — `docker compose -f docker/docker-compose.jenkins.yml up`, check UI at port 8080, trigger test pipeline

**Target Platform**: Linux (Docker host with host networking)

**Project Type**: Infrastructure / containerization (Dockerfile + compose file)

**Performance Goals**: N/A — Jenkins performance is container-runtime bound

**Constraints**:
- JVM heap: `-Xmx7g -Xms512m` via `JAVA_OPTS` env var
- Docker socket bind-mount: `/var/run/docker.sock:/var/run/docker.sock` for in-pipeline Docker builds
- Host networking to reach SonarQube/ZAP/backend on localhost
- All scan tools bundled in image — zero host dependencies

**Scale/Scope**: Single Jenkins instance, portable across any Linux Docker host

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|------|--------|-------|
| P1: Security-First Architecture | ✅ PASS | Secrets stay in JENKINS_HOME (encrypted at rest). Admin creds via env vars. No hardcoded secrets in image. |
| P2: State Consistency & Data Integrity | ✅ PASS | Not directly applicable — Jenkins manages its own state via JENKINS_HOME volume. |
| P3: Architectural Hygiene | ✅ PASS | Dockerfile in `docker/`, compose file in `docker/`, spec artifacts in `specs/005-containerize-jenkins/`. |
| P4: Type Safety & Testing Rigor | ⚠️ N/A | Containerization is infrastructure — no frontend/backend code changes. Verify via `docker compose up`. |
| P5: UI/UX Integrity | ✅ PASS | Jenkins UI is upstream-managed. No frontend changes in this feature. |
| Scope (Agent/ directory) | ✅ PASS | Constitution governs `backend/`, `src/`, `docker/`, `tests/`. Jenkins compose file in `docker/` IS in scope. |

## Project Structure

### Documentation (this feature)

```text
specs/005-containerize-jenkins/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: technology research
├── data-model.md        # Phase 1: entity model
├── quickstart.md        # Phase 1: runbook
├── contracts/           # Phase 1: interface contracts
├── checklists/          # Quality checklists
└── tasks.md             # Phase 2: task decomposition (via /speckit-tasks)
```

### Source Code (repository root)

```text
docker/
├── docker-compose.yml              # Base compose (existing)
├── docker-compose.dev.yml          # Dev overlay (existing)
├── docker-compose.test.yml         # Test overlay (existing)
├── docker-compose.staging.yml      # Staging overlay (existing)
├── docker-compose.jenkins.yml      # NEW: Standalone Jenkins service
└── jenkins/
    ├── Dockerfile                  # NEW: Custom Jenkins image with tools
    ├── plugins.txt                 # NEW: Plugin list for jenkins-plugin-cli
    └── tools.sh                    # NEW: Scan tool install script
```

**Structure Decision**: `docker/` subdirectory for Jenkins-specific files. Standalone compose file (`docker-compose.jenkins.yml`) independent of existing overlays.

## Complexity Tracking

No constitution violations — project structure follows existing `docker/` layout.
