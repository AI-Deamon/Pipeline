# CONTEXT.md — docker/

**Last updated**: 2026-06-05
**Location**: `docker/` at repo root
**Layer**: 2 (Distributed)
**Authoritative**: This file.

## 1. ROOM DEFINITION

**Persona**: Docker Compose / Infrastructure Engineer.
**Objective**: Service composition, env profiles, image build. Touch only this folder unless a service binds to source.

## 2. LOCAL TOKEN BUDGET

| Task | Load | Skip |
|------|------|------|
| Edit base compose | `docker/docker-compose.yml`, `docker/<svc>.Dockerfile` | `src/`, `specs/` |
| Add an env profile | `docker/docker-compose.<env>.yml` (dev/test/staging) | `src/`, `backend/app/api/` |
| Add a service | `docker/docker-compose.yml`, `docker/<svc>/`, `docker/<svc>.Dockerfile` | `src/`, `specs/00*/` |
| Wire a network | `docker/docker-compose*.yml`, `docker/nginx.conf` | `src/`, `Agent/Jenkinsfile` |
| Fix container port conflict | `docker/docker-compose*.yml`, `docker/jenkins/JENKINS_OPTS` | `src/`, `backend/app/` |
| Debug a network | `docker/`, `docker/postgres/`, host network settings | `src/`, `Agent/notes_track` |

## 3. LOCAL MAP

```
docker/
├── docker-compose.yml             # Base service composition
├── docker-compose.dev.yml         # Dev overlay (hot-reload)
├── docker-compose.test.yml        # Test overlay (isolated DB)
├── docker-compose.staging.yml     # Staging overlay (real Jenkins/Kali)
├── docker-compose.jenkins.yml     # Containerized Jenkins overlay
├── backend.Dockerfile
├── frontend.Dockerfile
├── nginx.conf
├── jenkins/                       # Jenkins image build (see docker/jenkins/CONTEXT.md)
└── postgres/                      # Postgres image build (see docker/postgres/CONTEXT.md)
```

## 4. THE PROCESS

1. **Source** — read `docker-compose.yml` (base) + the env profile overlay
2. **Plan** — identify the service to add/change; decide env-var scope; pick the right Dockerfile
3. **Execute** — edit compose; add or update Dockerfile; update `nginx.conf` if exposing UI
4. **Refine** — `docker compose config` (validate); `docker compose -f ... -f ...<env>.yml up -d --no-deps <service>`; check logs

## 5. WHAT GOOD LOOKS LIKE

- Healthchecks on all DB-dependent services. Volumes preserved across restarts. `python run.py down` only when intentional.
- Correct env profile overlay used (dev/test/staging). `network_mode: host` respected. Port conflicts resolved before compose up.
- Service-to-service calls via `localhost`. Dockerfiles use BuildKit syntax.

## 6. CONSTRAINTS

- **Restart vs down**: Don't run `python run.py down` to "just restart". It destroys all Postgres data. Use env-specific restart.
- **Nginx staging**: Don't mount `../dist:/usr/share/nginx/html:ro` in staging overlay. Dockerfile already bakes frontend. Causes 403.
- **Healthcheck order**: Don't skip Postgres healthcheck before backend start. 2-3 min startup. Backend depends on healthy DB.
- **Port conflict**: Don't start a new SonarQube container on host port 9000 while one runs on the host. Stop host service first (`systemctl stop sonarqube`).
- **Host address**: Don't use `localhost` for host SonarQube from inside the network. `host.docker.internal` is the host address.
- **BuildKit**: Don't set `DOCKER_BUILDKIT=0` for repos with `# syntax=docker/dockerfile:1`.
- **SonarQube silent death**: SonarQube container can die silently. If down, fetch fails with "All connection attempts failed" — stores 0 findings. Check `docker ps` on callback failure.

## 7. MANDATORY SKILL TRIGGERS

- A compose change breaks startup → trigger `systematic-debugging` (check healthy order, network mode, volumes)
- A new env profile is added → trigger `verification-before-completion` (lint + config + smoke up)
- Two services share the same image → trigger `dispatching-parallel-agents` (extract to base)
- A port conflict surfaces → trigger `superdesign` (re-architect port mapping)

## 8. HARD RULES

- **Thou shalt NOT assume `localhost` works for service-to-service calls.** With `network_mode: host`, services reach each other via `localhost`.
- **Thou shalt NOT set `DOCKER_BUILDKIT=0` for repos with `# syntax=docker/dockerfile:1`.** BuildKit is required.
