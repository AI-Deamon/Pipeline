# Data-Loss Preservation Checklist

**Purpose**: Catalog every distinct unit of information in the original `AGENTS.md` (105 lines, pre-restructure) so zero content is lost during the 8-section restructure.
**Source**: `AGENTS.md` at git HEAD before Phase 2 of feature 006-icm-workspace-config.
**Verification**: Side-by-side review against the restructured `AGENTS.md` (T010, T044).

---

## A. Commands (15 commands across 3 bash blocks + 1 login line)

### Frontend (7 commands, lines 8-16)

| # | Command | Purpose |
|---|---------|---------|
| 1 | `npm install` | Install frontend deps |
| 2 | `npm run dev` | Vite dev server on :5173; proxies `/api` → `localhost:8000` |
| 3 | `npm run build` | `tsc -b && vite build` (typechecks before build) |
| 4 | `npm run lint` | ESLint |
| 5 | `npx vitest run` | All frontend tests |
| 6 | `npx vitest run src/tests/pages/LoginPage.test.tsx` | Single test |
| 7 | `npm run generate:types` | `python3 scripts/generate-frontend-types.py` |

### Backend (4 commands, lines 19-24)

| # | Command | Purpose |
|---|---------|---------|
| 8 | `pip install -r backend/requirements.txt` | Install backend deps |
| 9 | `pytest tests/` | All backend tests |
| 10 | `pytest tests/test_integration.py::test_integration_v1` | Single test |
| 11 | `pytest -v` | Verbose pytest run |

### Docker (4 commands, lines 27-32)

| # | Command | Purpose |
|---|---------|---------|
| 12 | `python run.py dev` | Foreground, hot-reload |
| 13 | `python run.py test` | Background, isolated DB, mocked execution |
| 14 | `python run.py staging` | Background, real Jenkins/Kali |
| 15 | `python run.py down` | Stops + removes volumes + orphans (DESTROYS postgres data) |

### Default Login (1 entry, lines 34-35)

| # | Item | Value |
|---|------|-------|
| 16 | Username | `admin` |
| 17 | Password | `admin123` |
| 18 | URL | `http://localhost:5173` |

---

## B. Key Architecture Table (8 rows, lines 39-48)

| # | Layer | Path | Notes |
|---|-------|------|-------|
| 1 | Frontend | `src/` | React Router pages (lazy-loaded) + `@tanstack/react-query` |
| 2 | Backend | `backend/app/` | FastAPI, SQLAlchemy, Celery + Redis |
| 3 | Backend tests | `tests/` | `conftest.py` adds `backend/` to `sys.path`, sets test env vars |
| 4 | Frontend tests | `src/tests/` | Vitest + jsdom, setup in `src/test/setup.ts` |
| 5 | Jenkins | `Agent/` | Only `Jenkinsfile` — lives in separate Git repo |
| 6 | Docker | `docker/` | `docker-compose.yml` base + `dev`/`test`/`staging` overlays |
| 7 | AI context | `.ai/` | Architecture, gotchas, constraints, preferences |
| 8 | Vite proxy | `vite.config.ts` | `/api` → `http://localhost:8000` with WebSocket passthrough |

---

## C. Gotchas (26 items, lines 52-80)

| # | Title | Core message |
|---|-------|--------------|
| 1 | Dual scans module | Both `backend/app/api/scans.py` AND `backend/app/api/scans/` exist. Python imports resolve to `scans.py` (the file), not the directory. Migration incomplete. |
| 2 | One active scan per project | DB constraint `ix_scans_project_state`. Stuck in RUNNING blocks new scans — use force-unlock endpoint. |
| 3 | Callback token | Test env skips validation. Prod must match `CALLBACK_TOKEN` exactly. |
| 4 | Jenkins callback keys | Backend expects `stages` (not `STAGE_RESULTS`). Accepts both cases for error keys (`ERROR_MESSAGE`, `error_message`). |
| 5 | Celery tasks | Moving tasks requires updating import path in `app/core/celery_app.py`. |
| 6 | API key lookup order | Reset/cancel checks `localStorage.getItem('API_KEY')` first, then `import.meta.env.VITE_API_KEY`. |
| 7 | Nginx staging gotcha | Don't mount `../dist:/usr/share/nginx/html:ro` — Dockerfile already bakes frontend. Causes 403. |
| 8a | Docker rebuild vs restart — data loss warning | `python run.py down` runs `docker compose down --volumes` — **destroys all postgres data** (scans, reports, projects). Never run it if you want to keep data. |
| 8b | Docker rebuild — code only | `docker compose -f docker/docker-compose.yml -f docker/docker-compose.staging.yml up -d --build --no-deps backend frontend` (no data loss) |
| 8c | Docker restart — no rebuild | `docker compose -f docker/docker-compose.yml -f docker/docker-compose.staging.yml restart backend frontend` |
| 8d | Docker rebuild — single service | `docker compose -f docker/docker-compose.yml -f docker/docker-compose.staging.yml up -d --build --no-deps <service>` |
| 9 | Startup time | 2-3 min for all Docker services. Postgres must be healthy before backend. |
| 10 | Network mode | `host` networking in compose — services reach each other via localhost. |
| 11 | SonarQube port conflict | If SonarQube runs on the host at port 9000, the Docker container will fail to start. Stop the host service first (`systemctl stop sonarqube`). |
| 12 | No `npm run typecheck` | Type checking happens via `npm run build` (`tsc -b`). Run `npx tsc -b` for standalone typecheck. |
| 13 | SonarQube 26.5 upgrade | Upgraded from 9.9.8 → 24.12.0 (custom ZIP) → 26.1.0 → 26.5.0.122743-community. Image tag in `docker/docker-compose.yml`. Healthcheck uses `curl`. |
| 14 | SonarQube findings filter | `fetch_sonar_issues()` in `backend/app/services/reporting/parsers/sonar.py` uses `types=BUG,VULNERABILITY` — drops CODE_SMELL. Includes 3-attempt retry loop with 10s delay for ES index lag after container restart. |
| 15 | SonarQube JS/TS/CSS sensor fix | Embedded Node.js v24 causes PostCSS crash. Fix uses Jenkins NodeJS plugin (name: `Nodejs`) with `nodejs('Nodejs')` wrapper + `-Dsonar.nodejs.executable=\$(which node)`. Never use `sonar.javascript.skip=true` — it skips all JS/TS analysis. |
| 16 | Celery worker must be rebuilt too | When rebuilding backend for code changes, also rebuild celery_worker — it runs `process_scan_reports_task` which calls `fetch_sonar_issues()`. Without rebuilding, old code is used. |
| 17 | SonarQube container can die silently | If SonarQube is down, celery_worker's fetch fails with "All connection attempts failed" and stores 0 findings. Restart with `docker compose ... up -d --no-deps sonarqube`. |
| 18 | DOCKER_BUILDKIT=1 | Added to docker build in `Agent/Jenkinsfile` `doDockerBuild()`. Required for repos with `# syntax=docker/dockerfile:1` (e.g., open-webui). |
| 19 | SonarQube token | `squ_38aedbbc9186c8bf59f9e2f70d4cd2b83ca79969` — set in backend env, verified working on 26.5. |
| 20 | Jenkins Docker build failures | Docker build stage in pipeline fails on repos with BuildKit-only Dockerfiles. Fixed by `DOCKER_BUILDKIT=1` env var. Docker daemon itself is healthy — issue is the repo's Dockerfile, not the system. |
| 21 | Jenkins container port conflict | systemd Jenkins runs on 8080, containerized Jenkins also uses 8080. Use `JENKINS_OPTS=--httpPort=8081` env var to test the container alongside systemd Jenkins without stopping it. |
| 22 | Jenkins container host networking | With `network_mode: host`, `ports:` directive is ignored. Port is set via `JENKINS_OPTS` (e.g., `--httpPort=8081`). Container reaches all services (SonarQube, backend, ZAP) via localhost. |
| 23 | Jenkins container build | `docker/jenkins/Dockerfile` pins `jenkins/jenkins:2.528.3`. Plugin count is 133 (not 114 as originally documented). Plugins.txt is at `docker/jenkins/plugins.txt`. |
| 24 | SonarScanner not in container | SonarScanner CLI is not bundled in the Docker image — it's installed as a Jenkins managed tool via the SonarQube plugin (at `/var/lib/jenkins/tools/`). ODC CLI is similarly managed by the DependencyCheck plugin. ZAP, Trivy, Nmap are bundled in the image. |
| 25 | Docker CLI not in Jenkins container | The Docker socket is bind-mounted, but `docker` CLI binary is NOT installed in the container. Jenkins uses the Docker plugin (which communicates via the socket) for pipeline Docker builds, not the CLI. |
| 26 | Container migration | Use `docker/jenkins/migrate.sh` to migrate from systemd Jenkins. Test persistence: `docker compose restart` and `docker compose down && up -d` both preserve JENKINS_HOME volume data. |

---

## D. Style Conventions (8 items, lines 84-91)

| # | Convention | Rule |
|---|-----------|------|
| 1 | Imports | external → internal → types. Use `import type` for TS types. |
| 2 | Components | default export for pages, named export + `memo()` + arrow functions for reusable. |
| 3 | Backend | absolute imports from `app.`, type hints required, `snake_case`. |
| 4 | Types | `type` for shapes, `interface` for extensible contracts. Centralized in `src/types.ts`. |
| 5 | Files | keep under 300 lines. Split by responsibility. |
| 6 | Testing | mock external services. Backend uses `fastapi.testclient.TestClient`. |
| 7 | Auth | All endpoints except `/api/v1/auth/login`, `/api/v1/auth/register`, `/docs` require JWT or API key. |
| 8 | Verify with | `npm run lint && npm run build && npx vitest run && pytest tests/` before claiming done. |

---

## E. SPECKIT Markers (lines 93-105)

| # | Marker | Content |
|---|--------|---------|
| 1 | `<!-- SPECKIT START -->` (line 93) | Marker comment |
| 2 | Reference block (lines 94-98) | "read the current plan at `specs/006-icm-workspace-config/plan.md`, the spec at `specs/006-icm-workspace-config/spec.md`, and the research at `specs/006-icm-workspace-config/research.md`." |
| 3 | Workspace block (lines 100-104) | "The workspace is configured using the Interpretable Context Methodology (ICM) with AGENTS.md as the Layer 1 Global Map and three room manuals in `.ai/`: `CONTEXT-planning.md`, `CONTEXT-coding.md`, and `CONTEXT-reviewing.md`. For the data model, see `specs/006-icm-workspace-config/data-model.md`." |
| 4 | `<!-- SPECKIT END -->` (line 105) | Marker comment |

**Action**: SPECKIT markers MUST be preserved at top and bottom of the restructured AGENTS.md. Update spec/plan/research paths in marker block to point to the new feature directory if changed (already points to `specs/006-icm-workspace-config/`).

---

## Summary Counts

- **Commands**: 15 (7 frontend + 4 backend + 4 docker)
- **Login entries**: 3 (user, pass, URL)
- **Architecture rows**: 8
- **Gotchas**: 26 (item 8 has 4 sub-bullets, so 29 total bullets in original)
- **Style conventions**: 8
- **SPECKIT markers**: 4 (2 comment markers + 2 content blocks)
- **Total distinct information units**: ~67

## Verification Procedure (T010)

1. Print this checklist.
2. Print the restructured `AGENTS.md`.
3. For every row in sections A–E above, confirm the new AGENTS.md contains the same information.
4. Mark each row `[✓]` in this checklist when verified.
5. Any unchecked row = data loss → revert and fix.
