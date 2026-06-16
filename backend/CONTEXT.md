# CONTEXT.md — backend/

**Last updated**: 2026-06-10
**Location**: `backend/` at repo root
**Layer**: 2 (Distributed)

## 1. Room Definition

**Persona**: FastAPI / Celery / SQLAlchemy Engineer
**Objective**: Build and maintain REST API endpoints, background task orchestration, database models, and scan-report ingestion pipelines.

## 2. Token Budget

| Task | Load | Skip |
|------|------|------|
| Add a new API endpoint | `app/api/`, `app/schemas/`, `app/models/`, `app/main.py` | `src/`, `docker/`, `Agent/`, `specs/` |
| Wire or fix a Celery task | `app/tasks/`, `app/core/celery_app.py`, `app/services/scan_orchestrator.py` | `src/`, `app/api/auth.py`, `docker/jenkins/` |
| Fix a report parser bug | `app/services/reporting/parsers/`, `app/services/reporting/fetcher.py`, `app/services/reporting/cross_ref.py` | `app/api/`, `src/`, `docker/` |
| Update DB models or migrations | `app/models/`, `app/core/db.py` | `src/`, `docker/`, `Agent/` |
| Fix RBAC or auth logic | `app/core/auth.py`, `app/core/security.py`, `app/services/rbac_service.py`, `app/schemas/rbac.py` | `src/`, `docker/`, `app/services/reporting/` |
| Fix scan state machine | `app/api/scans/`, `app/state/scan_state.py`, `app/services/scan_orchestrator.py`, `app/services/scan_recovery.py` | `src/`, `app/services/reporting/` |
| Fix issue tracking | `app/api/issues.py`, `app/services/issue_service.py`, `app/state/issue_state.py`, `app/schemas/issue.py` | `src/`, `docker/` |
| Add WebSocket support | `app/websockets/manager.py`, relevant page in `src/` | `app/services/reporting/`, `docker/jenkins/` |

## 3. Local Map

```
backend/app/
├── api/                    # FastAPI routers
│   ├── auth.py             # Login, register, JWT refresh
│   ├── issues.py           # Issue CRUD + assignment
│   ├── project_groups.py   # Project grouping management
│   ├── projects.py         # Project CRUD
│   ├── reports.py          # Report retrieval + export
│   ├── scanner_tools.py    # Scanner tool config
│   ├── scans/              # Scan lifecycle (module, not file)
│   │   ├── routes.py       # Scan CRUD + trigger
│   │   ├── callback.py     # Jenkins callback handler
│   │   ├── state.py        # Scan state transitions
│   │   └── utils.py        # Scan helpers
│   └── users.py            # User management + RBAC
├── core/                   # App infrastructure
│   ├── auth.py             # Auth dependency injection
│   ├── celery_app.py       # Celery config + task imports
│   ├── config.py           # Settings (env-driven)
│   ├── db.py               # SQLAlchemy engine + session
│   ├── exceptions.py       # Custom exception handlers
│   ├── rate_limit.py       # Rate limiting middleware
│   └── security.py         # Password hashing, JWT utils
├── infrastructure/         # External service clients
│   ├── http/               # HTTP client wrappers
│   └── jenkins/            # Jenkins API client
├── models/                 # SQLAlchemy ORM models
│   ├── db_models.py        # Shared/generic models
│   ├── project.py          # Project + ProjectGroup models
│   └── scan.py             # Scan + ScanResult models
├── schemas/                # Pydantic request/response models
│   ├── issue.py            # Issue schemas
│   ├── project.py          # Project schemas
│   ├── rbac.py             # RBAC schemas
│   ├── scan.py             # Scan schemas
│   ├── token.py            # Token schemas
│   └── user.py             # User schemas
├── services/               # Business logic
│   ├── issue_service.py    # Issue CRUD logic
│   ├── jenkins_service.py  # Jenkins job orchestration
│   ├── project_grouping.py # Grouping logic
│   ├── rbac_service.py     # RBAC authorization decisions
│   ├── scan_orchestrator.py # Scan lifecycle orchestration
│   ├── scan_recovery.py    # Stuck scan recovery
│   ├── validation.py       # Input validation helpers
│   └── reporting/          # Report processing pipeline
│       ├── fetcher.py      # Multi-tool report fetching
│       ├── reporter.py     # Report aggregation
│       ├── ai_validator.py # AI-powered validation
│       ├── compliance_mapper.py # Compliance mapping
│       ├── risk_calculator.py   # Risk scoring
│       └── parsers/        # Per-tool parsers
│           ├── base.py     # Base parser interface
│           ├── sonar.py    # SonarQube parser
│           ├── trivy.py    # Trivy parser
│           ├── zap.py      # ZAP parser
│           ├── nmap.py     # nmap parser
│           ├── depcheck.py # OWASP Dependency-Check parser
│           └── npm.py      # npm audit parser
├── state/                  # In-memory state management
│   ├── scan_state.py       # Scan state machine
│   ├── issue_state.py      # Issue state tracking
│   ├── store.py            # State persistence
│   └── persistence.py      # State file I/O
├── tasks/                  # Celery task definitions
│   ├── cleanup_tasks.py    # Periodic cleanup
│   ├── issue_tasks.py      # Issue sync tasks
│   ├── jenkins_tasks.py    # Jenkins job tasks
│   └── report_tasks.py     # Report processing tasks
├── websockets/             # WebSocket support
│   └── manager.py          # Connection manager
└── main.py                 # FastAPI app entrypoint
```

## 4. The Process

1. **Source** — read the relevant `app/` module + `app/core/celery_app.py` if wiring tasks
2. **Plan** — draft the function signature, Pydantic models, task decorator, retry policy
3. **Execute** — write the module; update celery_app.py imports if task moved; add pytest
4. **Refine** — `pytest tests/ -v`; rebuild `celery_worker` alongside `backend`; full stack bring-up via `python run.py staging`

## 5. What Good Looks Like

- All functions type-hinted (no `Any`). All imports start from `app.`.
- Every new endpoint has at least one success + one failure test via TestClient.
- Celery tasks have explicit retry policies and idempotency guards.
- Parser changes include a test with a real sample payload (stored in `tests/fixtures/` or inline).
- No `# type: ignore` without a comment explaining why.

## 6. Constraints

- **Single active scan per project**: DB unique constraint `ix_scans_project_state`. Must check state before triggering.
- **Callback token validation**: Skipped in test env. In prod, must match `CALLBACK_TOKEN` env var exactly.
- **SonarQube ES index lag**: After SonarQube container restart, ES takes ~30s to index. Parser has 3-attempt retry with 10s delay — don't remove it.
- **Celery worker code sync**: Worker runs separate process. Code changes require rebuilding both `backend` and `celery_worker` containers.

## 7. Hard Rules

- **Thou shalt NOT add route files inside `app/api/scans/`.** The `scans/` directory is a module with `routes.py`, `callback.py`, `state.py`, `utils.py`. New API modules (e.g., `issues.py`) go at `app/api/` level. Adding inside `scans/` breaks the router registration pattern.

- **Thou shalt NOT rebuild `backend` without `celery_worker`.** The worker runs `process_scan_reports_task` which calls `fetch_sonar_issues()`. Without rebuilding, old code runs and reports contain stale data or crash on new parser logic.

- **Thou shalt NOT hardcode the SonarQube token.** It lives in backend env only (`SONARQUBE_TOKEN`). Hardcoding it causes it to be committed to git and invalidated on rotation.

- **Thou shalt NOT remove the retry loop in `fetch_sonar_issues()`.** SonarQube's Elasticsearch index has lag after container restart. The 3-attempt retry with 10s delay prevents 0-finding reports from being stored.

- **Thou shalt NOT use `sonar.javascript.skip=true`.** It skips ALL JS/TS analysis, not just the crashing sensor. The fix is the Jenkins NodeJS plugin wrapper, not skipping.

- **Thou shalt NOT move Celery tasks without updating `app/core/celery_app.py`.** The celery app explicitly imports task modules. Moving a task file without updating the import causes the task to silently disappear from the worker.
