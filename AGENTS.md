# AGENTS.md

DevSecOps security scanning pipeline: React 19/TypeScript frontend + Python FastAPI backend + Jenkins CI/CD.

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

## Key architecture

| Layer | Path | Notes |
|-------|------|-------|
| Frontend | `src/` | React Router pages (lazy-loaded) + `@tanstack/react-query` |
| Backend | `backend/app/` | FastAPI, SQLAlchemy, Celery + Redis |
| Backend tests | `tests/` | `conftest.py` adds `backend/` to `sys.path`, sets test env vars |
| Frontend tests | `src/tests/` | Vitest + jsdom, setup in `src/test/setup.ts` |
| Jenkins | `Agent/` | Only `Jenkinsfile` — lives in separate Git repo |
| Docker | `docker/` | `docker-compose.yml` base + `dev`/`test`/`staging` overlays |
| AI context | `.ai/` | Architecture, gotchas, constraints, preferences |
| Vite proxy | `vite.config.ts` | `/api` → `http://localhost:8000` with WebSocket passthrough |

## Gotchas (agent likely to miss)

- **Dual scans module**: Both `backend/app/api/scans.py` AND `backend/app/api/scans/` exist. Python imports resolve to `scans.py` (the file), not the directory. Migration incomplete.
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
- **No `npm run typecheck`**: Type checking happens via `npm run build` (`tsc -b`). Run `npx tsc -b` for standalone typecheck.

## Style conventions

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
at `specs/001-deep-code-audit/plan.md`, the audit report at
`specs/001-deep-code-audit/AUDIT_REPORT.md`, and the research at
`specs/001-deep-code-audit/research.md`.
<!-- SPECKIT END -->
