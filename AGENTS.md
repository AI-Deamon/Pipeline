# AGENTS.md

Sentinel — DevSecOps security orchestration and reporting platform with React 19/TypeScript frontend, FastAPI backend, Jenkins-driven scan execution pipelines, and ingestion/normalization of security scan results from tools such as SonarQube.

## Commands

### Frontend
```bash
npm install
npm run dev             # Vite on :5173, proxies /api → localhost:8000
npm run build           # tsc -b && vite build (typechecks before build)
npm run lint            # ESLint
npx vitest run                              # All frontend tests
npx vitest run src/tests/pages/LoginPage.test.tsx  # Single test
npm run generate:types  # python3 scripts/generate-frontend-types.py
```

### Backend
```bash
pip install -r backend/requirements.txt
pytest tests/                                       # All backend tests
pytest tests/test_integration.py::test_integration_v1  # Single test
pytest -v
```

### Docker (3 env profiles via compose overlays)
```bash
python run.py dev       # Foreground, hot-reload
python run.py test      # Background, isolated DB, mocked execution
python run.py staging   # Background, real Jenkins/Kali
python run.py down      # Stops + removes volumes + orphans
```

### Default login (staging)
`admin` / `admin123` at http://localhost:5173

## Architecture

| Layer | Path | Notes |
|-------|------|-------|
| Frontend | `src/` | React Router pages (lazy-loaded) + `@tanstack/react-query` |
| Backend | `backend/app/` | FastAPI, SQLAlchemy, Celery + Redis |
| Backend tests | `tests/` | `conftest.py` adds `backend/` to `sys.path`, sets test env vars |
| Frontend tests | `src/tests/` | Vitest + jsdom, setup in `src/test/setup.ts` |
| Jenkins | `Agent/` | Only `Jenkinsfile` — lives in separate Git repo |
| Docker | `docker/` | `docker-compose.yml` base + `dev`/`test`/`staging` overlays |
| Specs | `specs/` | Speckit workflow: specify → clarify → plan → tasks → implement |
| Docs | `docs/` | API docs, Docker docs, flow diagrams, plans |
| AI context | `.ai/` | Architecture docs, gotchas, constraints, preferences |

## Routing Table

| User intent | Room | Context file |
|-------------|------|--------------|
| Add or fix a backend API endpoint | `backend/` | `backend/CONTEXT.md` |
| Fix a UI bug or add a React component | `src/` | `src/CONTEXT.md` |
| Write or fix a backend pytest test | `tests/` | `tests/CONTEXT.md` |
| Write or fix a frontend Vitest test | `src/tests/` | `src/tests/CONTEXT.md` |
| Edit docker-compose, Dockerfiles, or infra | `docker/` | `docker/CONTEXT.md` |
| Edit Jenkinsfile or pipeline stages | `Agent/` | `Agent/CONTEXT.md` |
| Write a feature spec or implementation plan | `specs/` | `specs/CONTEXT.md` |
| Read or edit API/Docker/flow documentation | `docs/` | `docs/CONTEXT.md` |

## Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Feature spec | `specs/NNN-feature-name/spec.md` | `specs/005-rbac/spec.md` |
| Spec plan | `specs/NNN-feature-name/plan.md` | `specs/005-rbac/plan.md` |
| Spec tasks | `specs/NNN-feature-name/tasks.md` | `specs/005-rbac/tasks.md` |
| Backend test | `tests/test_<feature>.py` | `tests/test_rbac_service.py` |
| Frontend component test | `src/tests/components/<Name>.test.tsx` | `src/tests/components/IssueCard.test.tsx` |
| Frontend page test | `src/tests/pages/<Name>.test.tsx` | `src/tests/pages/LoginPage.test.tsx` |
| Frontend hook test | `src/tests/hooks/<name>.test.tsx` | `src/tests/hooks/useIssues.test.tsx` |

## Gotchas

- **Scans module**: `backend/app/api/scans/` directory is the only module — `scans.py` was fully migrated and removed. Add new route modules (e.g., `issues.py`) at `api/` level, not inside `scans/`.
- **One active scan per project**: DB constraint `ix_scans_project_state`. Stuck in RUNNING blocks new scans — use force-unlock endpoint.
- **Callback token**: Test env skips validation. Prod must match `CALLBACK_TOKEN` exactly.
- **Jenkins callback keys**: Backend expects `stages` (not `STAGE_RESULTS`). Accepts both cases for error keys (`ERROR_MESSAGE`, `error_message`).
- **Celery tasks**: Moving tasks requires updating import path in `app/core/celery_app.py`.
- **API key lookup order**: Reset/cancel checks `localStorage.getItem('API_KEY')` first, then `import.meta.env.VITE_API_KEY`.
- **Nginx staging gotcha**: Don't mount `../dist:/usr/share/nginx/html:ro` — Dockerfile already bakes frontend. Causes 403.
- **Docker rebuild vs restart**: `python run.py down` runs `docker compose down --volumes` — **destroys all postgres data** (scans, reports, projects). Never run it if you want to keep data.
  - Frontend/backend code only → `docker compose -f docker/docker-compose.yml -f docker/docker-compose.staging.yml up -d --build --no-deps backend frontend` (no data loss)
  - Just restart without rebuild → `docker compose -f docker/docker-compose.yml -f docker/docker-compose.staging.yml restart backend frontend`
  - Rebuild a single service → `docker compose -f docker/docker-compose.yml -f docker/docker-compose.staging.yml up -d --build --no-deps <service>`
- **Startup time**: 2-3 min for all Docker services. Postgres must be healthy before backend.
- **Network mode**: `host` networking in compose — services reach each other via localhost.
- **SonarQube port conflict**: If SonarQube runs on the host at port 9000, the Docker container will fail to start. Stop the host service first (`systemctl stop sonarqube`).
- **No `npm run typecheck`**: Type checking happens via `npm run build` (`tsc -b`). Run `npx tsc -b` for standalone typecheck.
- **SonarQube findings filter**: `fetch_sonar_issues()` in `backend/app/services/reporting/parsers/sonar.py` uses `types=BUG,VULNERABILITY` — drops CODE_SMELL. Includes 3-attempt retry loop with 10s delay for ES index lag after container restart.
- **SonarQube JS/TS/CSS sensor fix**: Embedded Node.js v24 causes PostCSS crash. Fix uses Jenkins NodeJS plugin (name: `Nodejs`) with `nodejs('Nodejs')` wrapper + `-Dsonar.nodejs.executable=\$(which node)`. Never use `sonar.javascript.skip=true` — it skips all JS/TS analysis.
- **Celery worker must be rebuilt too**: When rebuilding backend for code changes, also rebuild celery_worker — it runs `process_scan_reports_task` which calls `fetch_sonar_issues()`. Without rebuilding, old code is used.
- **SonarQube container can die silently**: If SonarQube is down, celery_worker's fetch fails with "All connection attempts failed" and stores 0 findings. Restart with `docker compose ... up -d --no-deps sonarqube`.
- **DOCKER_BUILDKIT=1**: Added to docker build in `Agent/Jenkinsfile` `doDockerBuild()`. Required for repos with `# syntax=docker/dockerfile:1` (e.g., open-webui).
- **SonarQube token**: `squ_38aedbbc9186c8bf59f9e2f70d4cd2b83ca79969` — set in backend env, verified working on 26.5.
- **Jenkins Docker build failures**: Docker build stage in pipeline fails on repos with BuildKit-only Dockerfiles. Fixed by `DOCKER_BUILDKIT=1` env var. Docker daemon itself is healthy — issue is the repo's Dockerfile, not the system.
- **Generated files are read-only**: Never manually edit generated files (e.g., `src/types.ts` from `npm run generate:types`). Regenerate from source instead.
- **API contracts are authoritative**: Frontend-backend contracts are defined by OpenAPI schemas. Frontend work must not modify backend contracts unless explicitly requested and the corresponding backend implementation is updated. Backend work must preserve published API contracts unless a contract change is explicitly requested.

## Style

- **Imports**: external → internal → types. Use `import type` for TS types.
- **Components**: default export for pages, named export + `memo()` + arrow functions for reusable.
- **Backend**: absolute imports from `app.`, type hints required, `snake_case`.
- **Types**: `type` for shapes, `interface` for extensible contracts. Centralized in `src/types.ts`.
- **Files**: keep under 300 lines. Split by responsibility.
- **Testing**: mock external services. Backend uses `fastapi.testclient.TestClient`.
- **Auth**: All endpoints except `/api/v1/auth/login`, `/api/v1/auth/register`, `/docs` require JWT or API key.
- **Verify with**: `npm run lint && npm run build && npx vitest run && pytest tests/` before claiming done.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at specs/008-issue-resolution-workflow/plan.md
<!-- SPECKIT END -->
