# AGENTS.md - Development Guidelines for AI Coding Agents

## Project Overview

DevSecOps security scanning pipeline: React/TypeScript frontend + Python FastAPI backend + Jenkins for scanning.

## Developer Commands

### Frontend (React + TypeScript + Vite)
```bash
npm install                              # Install deps
npm run dev                              # Start Vite dev server
npm run build                            # Production build
npm run lint                             # ESLint
npm run typecheck                        # TypeScript check

npx vitest run                           # Run tests
npx vitest run src/pages/LoginPage.test.tsx  # Single test
```

### Backend (Python FastAPI)
```bash
pip install -r backend/requirements.txt  # Install deps
pytest tests/                            # Run all tests
pytest tests/test_integration.py::test_integration_v1  # Single test
pytest -v                                # Verbose
```

### Docker
```bash
python run.py dev        # Development
python run.py test      # Test (runs in Docker)
python run.py staging  # Staging (rebuilds containers)
python run.py down     # Stop containers
```

### Default Login (staging)
- URL: http://localhost:5173
- Username: `admin`
- Password: `admin123`

## Code Style

### TypeScript/React
- Imports: external → internal modules → types. Use `import type` for types.
- Types: `type` for shapes, `interface` for extensible contracts. Export from `src/types.ts`.
- Components: default export pages, named export reusable. Use `memo()`, arrow functions.
- Fetching: @tanstack/react-query, custom hooks, useMemo.

### Python/FastAPI
- Imports: stdlib → third-party → local. Use absolute imports from `app.`
- Type hints required on all functions.
- Naming: snake_case vars/funcs, PascalCase classes.

## Critical Gotchas (Would Agent Miss This?)

### Docker
1. **Nginx volume mount conflict**: Don't mount `../dist:/usr/share/nginx/html:ro` in staging - it overrides built files and causes 403. Dockerfile already bakes in frontend.
2. **Startup time**: Wait 2-3 minutes for all services to be healthy. PostgreSQL must be ready before backend.
3. **Default admin user**: Created on startup with username=`admin`, password=`admin123`. Check `backend/app/main.py` for creation code.

### Backend
4. **Dual scans module**: Both `app/api/scans.py` AND `app/api/scans/` exist. Python imports resolve to `.py` file, not the directory.
5. **One active scan per project**: Database constraint `ix_scans_project_state`. If scan stuck in RUNNING, can't start new one - use force-unlock endpoint.
6. **Callback token validation**: In test env, validation is skipped. In prod, `CALLBACK_TOKEN` must match exactly.
7. **Jenkins callback keys**: Backend expects `stages` not `STAGE_RESULTS`. Accepts both uppercase and lowercase error keys (`ERROR_MESSAGE`, `error_message`).
8. **Celery task imports**: If you move task functions, update import in `app/core/celery_app.py`.

### Frontend
9. **API key lookup order**: Reset/cancel features check `localStorage.getItem('API_KEY')` first, then `import.meta.env.VITE_API_KEY`.
10. **WebSocket states not shown**: `useScanWebSocket` has `connected`/`connecting` but no UI indicator.
11. **Scan progress**: Real-time updates come via WebSocket. Jenkins sends intermediate callbacks after each stage completes.

### Architecture
12. **Root vs Agent/**: Source code at root (`backend/`, `src/`, `tests/`, `docker/`). `Agent/` contains only Jenkins files - separate GitHub repo.
13. **Git**: Don't commit `.env.*` files, secrets, or credentials.

### Jenkins
14. **Jenkins URL**: http://localhost:8080/job/Security-pipeline/ - requires authentication.
15. **Callback URL**: `http://192.168.1.101:8000` (or set via `BACKEND_URL` env var).
16. **ZAP API endpoints**: Use `/OTHER/core/other/` not `/JSON/core/action/`.
17. **Docker push**: Image needs username prefix like `dockerhub-user/scan-uuid:tag`.
18. **Real-time progress**: `recordStage()` now calls `sendIntermediateCallback()` after each stage.

## Workflow Guidelines

- **Always use superpowers skills** - Before any task, invoke relevant skills from `/home/kali_linux/.config/opencode/skills/superpowers/`.
- **Use Graphify for architecture** - Reference `graphify-out/GRAPH_REPORT.md`.

## API Reference

### Key Endpoints
- `POST /api/v1/auth/login` - Login (form data: username, password)
- `POST /api/v1/auth/register` - Register
- `GET/POST /api/v1/projects` - Projects CRUD
- `GET/POST /api/v1/scans` - Trigger/list scans
- `GET /api/v1/scans/{id}/results` - Scan results
- `POST /api/v1/scans/{id}/reset` - Reset failed scan
- `POST /api/v1/scans/{id}/cancel` - Cancel running scan
- WebSocket: `ws://localhost:8000/api/v1/ws/scans?scan_id={id}`

## Project Structure
```
/home/kali_linux/Pipeline/
├── backend/app/        # FastAPI: api/, core/, models/, schemas/, services/, state/, tasks/
├── src/               # React: components/, pages/, services/, hooks/, types.ts
├── tests/             # Python tests
├── docker/            # Docker configs (backend.Dockerfile, frontend.Dockerfile)
├── Agent/             # Jenkinsfile only - separate GitHub repo
└── .ai/memory/       # Gotchas and constraints docs
```