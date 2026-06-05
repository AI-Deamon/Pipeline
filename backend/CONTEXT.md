# CONTEXT.md — backend/

**Last updated**: 2026-06-05
**Location**: `backend/` at repo root
**Layer**: 2 (Distributed)
**Authoritative**: This file. No other context file.

## 1. ROOM DEFINITION

**Persona**: FastAPI / Celery Engineer.
**Objective**: Ship backend services, scan APIs, async task pipelines. Touch only this folder unless types or schemas cross the boundary.

## 2. LOCAL TOKEN BUDGET

| Task | Load | Skip |
|------|------|------|
| Add a scan API endpoint | `app/api/scans/`, `app/api/scans.py`, `app/schemas/`, `app/models/` | `src/`, `docker/jenkins/`, `specs/` |
| Wire a Celery task | `app/core/celery_app.py`, `app/tasks/`, `app/services/scan_orchestrator.py` | `src/`, `app/api/auth.py` |
| Fix a parser bug | `app/services/reporting/parsers/`, `app/services/reporting/cross_ref.py` | `app/api/`, `src/` |
| Update DB models | `app/models/`, `app/core/db.py` | `src/`, `docker/` |
| Add a service module | `app/services/`, `app/api/` | `src/`, `app/core/celery_app.py` (read-only) |
| Shared types | `app/schemas/`, `app/models/` | — |

## 3. LOCAL MAP

```
backend/
├── app/
│   ├── api/            # FastAPI routers (auth, scans, reports, projects, ...)
│   ├── services/       # Business logic (scan_orchestrator, jenkins_service, reporting/)
│   ├── core/           # config, db, celery_app, security
│   ├── models/         # SQLAlchemy ORM
│   ├── schemas/        # Pydantic
│   ├── tasks/          # Celery task modules
│   ├── websockets/     # Real-time push
│   └── main.py         # FastAPI entrypoint
├── requirements.txt
└── tests/              # pytest (NOT in src/tests/)
```

## 4. THE PROCESS

1. **Source** — read the relevant `app/` module + `app/core/celery_app.py` if wiring tasks
2. **Plan** — draft signature (Pydantic models, task decorator, retry policy) and list callers
3. **Execute** — write the module, update `celery_app.py` imports if task moved, add pytest in `tests/`
4. **Refine** — `pytest tests/ -v`; rebuild `celery_worker` alongside `backend`; full stack bring-up

## 5. WHAT GOOD LOOKS LIKE

- ≥80% pytest coverage on new endpoints. All functions type-hinted (no `Any`). No `# type: ignore` without a ticket.
- Every new endpoint has at least one success + one failure test via `fastapi.testclient.TestClient`.
- Celery tasks have explicit retry policies. All imports start from `app.`.

## 6. CONSTRAINTS

- **API surface**: Don't expose internal models as response schemas. Use Pydantic views.
- **Retries**: Don't skip the SonarQube 3-attempt retry loop. ES index lag produces false-empty reports.
- **Scans**: Don't let a scan stay `RUNNING`. DB constraint `ix_scans_project_state` blocks new scans. Use force-unlock.
- **Callbacks**: Don't skip `CALLBACK_TOKEN` validation in prod. Test env skips it; prod must match exactly.
- **SonarQube false PASS**: SonarScanner exits 0 with zero findings when JS/TS/CSS analysis silently fails. Always verify `findings.count > 0` in the callback handler, not just tool exit code.

## 7. MANDATORY SKILL TRIGGERS

- A pytest case fails → trigger `systematic-debugging` (state hypothesis before editing)
- All endpoints of a feature done → trigger `verification-before-completion` (lint + build + pytest)
- Celery task signature changes → trigger `requesting-code-review` before merge
- DB migration needed → trigger `dispatching-parallel-agents` for migration + test in parallel
- API surface conflict suspected → trigger `superdesign` for endpoint naming review

## 8. HARD RULES

- **Thou shalt NOT edit `scans.py` as a module.** The directory `scans/` exists. Imports resolve to the file.
- **Thou shalt NOT rebuild `backend` without `celery_worker`.** Worker runs `process_scan_reports_task`.
- **Thou shalt NOT hardcode the SonarQube token** (`squ_38ae...`). It lives in backend env only.
- **Thou shalt NOT rename a Celery task without updating `app/core/celery_app.py`.** Imports are explicit.
