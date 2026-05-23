# Architecture Overview

## System Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FRONTEND (React 19 + TypeScript)                                           │
│                                                                             │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────────────┐    │
│  │ Pages        │────▶│ Components   │────▶│ Services                 │    │
│  │ Dashboard    │     │ ScanProgress │     │ api.ts (Axios)          │    │
│  │ ProjectCtrl  │     │ ErrorModal   │     │ notifications.ts        │    │
│  │ ScanStatus   │     │ Layout       │     │ useScanWebSocket.ts     │    │
│  │ ManualScan   │     │ ProtectedRt  │     │ useAuth.tsx             │    │
│  └──────────────┘     └──────────────┘     └──────────────────────────┘    │
│                                                                             │
│  Routes: /dashboard, /projects/:id, /scans/:id, /login, /register          │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                    HTTP/REST + WebSocket
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  BACKEND (Python FastAPI)                                                   │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ API Layer (app/api/)                                                 │  │
│  │  auth.py          │  projects.py       │  scans/                     │  │
│  │  POST /login      │  CRUD projects     │  triggers.py (scan start)   │  │
│  │  POST /register   │  GET/POST/PATCH    │  callbacks.py (Jenkins)     │  │
│  │                  │  DELETE projects   │  management.py (reset/cancel)│  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Service Layer (app/services/)                                        │  │
│  │  jenkins_service.py  │  scan_orchestrator.py  │  scan_recovery.py   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Infrastructure (app/infrastructure/)                                 │  │
│  │  jenkins/jenkins_client.py  │  http/client.py                       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Database (app/models/)                                               │  │
│  │  ProjectDB  │  ScanDB  │  UserDB  │  ScanState enum                 │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Real-time (app/websockets/)                                          │  │
│  │  manager.py (ConnectionManager - broadcast to scan/project/global)   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  Async: Celery worker (Redis broker) for Jenkins trigger tasks             │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                    Jenkins REST API
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  JENKINS (Groovy Pipeline - Agent/Jenkinsfile)                             │
│                                                                             │
│  Job: Security-pipeline (http://localhost:8080)                            │
│                                                                             │
│  Parameters: SCAN_ID, SCAN_MODE, PROJECT_DATA, SELECTED_STAGES, TIMEOUT    │
│                                                                             │
│  Stages:                                                                   │
│  1. Git Checkout          │  7. Docker Build                               │
│  2. Sonar Scanner         │  8. Docker Push                                │
│  3. Sonar Quality Gate    │  9. Trivy Image Scan                           │
│  4. NPM/PIP Install       │  10. Nmap Scan                                 │
│  5. Dependency Check      │  11. ZAP Scan                                  │
│  6. Trivy FS Scan         │                                               │
│                                                                             │
│  Post: Archive reports + Callback to backend                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Frontend** | React | 19.2.0 | UI framework |
| | TypeScript | 5.9.3 | Type safety |
| | Vite | 7.2.4 | Build tool |
| | TailwindCSS | 4.1.18 | Styling |
| | React Router | 7.13.0 | Routing |
| | TanStack Query | 5.90.21 | Server state |
| | Axios | 1.13.4 | HTTP client |
| | Lucide React | 0.563.0 | Icons |
| **Backend** | FastAPI | 0.111+ | REST API |
| | SQLAlchemy | 2.0+ | ORM |
| | Pydantic | 2.7+ | Validation |
| | Celery | 5.4+ | Async tasks |
| | Redis | 7.x | Message broker |
| | PostgreSQL | 16 | Database |
| | Argon2 | 23.1+ | Password hashing |
| | PyJWT | 2.8+ | JWT tokens |
| **CI/CD** | Jenkins | Local:8080 | Pipeline execution |
| **Security** | Trivy | Local | FS/Image scanning |
| | SonarQube | Server | Code quality |
| | Nmap | Local | Network scanning |
| | OWASP ZAP | Local | Web app security |
| | Dependency-Check | Plugin | Dep vulnerabilities |
| **Containerization** | Docker | 3.9 | Containerization |
| | Docker Compose | 3 overlays | Environment mgmt |
| | Nginx | Config only | Reverse proxy (not wired) |

---

## Service Topology

### Docker Services (All Environments)

```
┌─────────────┐     ┌──────────────┐
│  Frontend   │────▶│   Backend    │
│  React SPA  │     │   FastAPI    │
│  Port: 3000 │     │   Port: 8000 │
└─────────────┘     └──────┬───────┘
                           │
                      ┌────┴─────┐
                      │          │
                ┌─────┴──┐  ┌───┴────┐
                │Postgres│  │ Redis  │
                │  :5432 │  │ :6379  │
                └────────┘  └────────┘
```

### Network Configuration

| Service | Internal DNS | Host Port (dev) | Purpose |
|---------|-------------|-----------------|---------|
| Frontend | `frontend` | 3000 | React SPA |
| Backend | `backend` | 8000 | FastAPI |
| PostgreSQL | `postgres` | 5432 | Database |
| Redis | `redis` | 6379 | Celery broker |

**Connection Strings:**
- Database: `postgresql://devsecops:devsecops@postgres:5432/devsecops_dev`
- Redis: `redis://redis:6379/0`
- Jenkins: `http://host.docker.internal:8080` (dev), `http://192.168.1.101:8080` (staging)

---

## Environment Comparison

| Aspect | Dev | Test | Staging |
|--------|-----|------|---------|
| **Frontend Port** | 3000 | 3000 | 80 |
| **Backend Port** | 8000 | 8000 | 8000 |
| **Postgres Exposed** | ✅ | ❌ | ✅ |
| **Redis Exposed** | ✅ | ❌ | ✅ |
| **HMR** | ✅ Bind mounts | ✅ Bind mounts | ❌ Baked |
| **Restart Policy** | No | No | unless-stopped |
| **Workers** | 1 (--reload) | 1 (--reload) | 4 workers |
| **DB Volume** | postgres_data_dev | postgres_data_test | postgres_data_staging |
| **Mock Execution** | false | false | false |
| **Scan Timeout** | 7200s | 120s | 7200s |

---

## Database Schema

### ProjectDB (`projects` table)
```sql
project_id      VARCHAR PRIMARY KEY
name            VARCHAR NOT NULL
status          VARCHAR DEFAULT 'CREATED'
last_scan_state VARCHAR NULLABLE
git_url         VARCHAR NULLABLE
branch          VARCHAR NULLABLE
credentials_id  VARCHAR NULLABLE
sonar_key       VARCHAR NULLABLE
target_ip       VARCHAR NULLABLE
target_url      VARCHAR NULLABLE
created_at      TIMESTAMP
updated_at      TIMESTAMP
```

### ScanDB (`scans` table)
```sql
scan_id             VARCHAR PRIMARY KEY
project_id          VARCHAR NOT NULL (FK → projects)
scan_mode           VARCHAR NOT NULL ('automated' | 'manual')
selected_stages     JSON DEFAULT []
state               ENUM (CREATED, QUEUED, RUNNING, COMPLETED, FAILED, CANCELLED)
created_at          TIMESTAMP
updated_at          TIMESTAMP
started_at          TIMESTAMP NULLABLE
finished_at         TIMESTAMP NULLABLE
jenkins_build_number VARCHAR NULLABLE
jenkins_queue_id    VARCHAR NULLABLE
stage_results       JSON DEFAULT []
callback_digests    JSON DEFAULT []
error_message       VARCHAR NULLABLE
error_type          VARCHAR NULLABLE
jenkins_console_url VARCHAR NULLABLE
retry_count         INTEGER DEFAULT 0

INDEX ix_scans_project_state (project_id, state)
CONSTRAINT: Only ONE active scan per project
```

### UserDB (`users` table)
```sql
id              VARCHAR PRIMARY KEY
username        VARCHAR UNIQUE NOT NULL
hashed_password VARCHAR NOT NULL (Argon2)
created_at      TIMESTAMP
updated_at      TIMESTAMP
```

---

## Graphify Analysis

### God Nodes (Most Connected)

| Node | Edges | Role |
|------|-------|------|
| **ScanState** | 81 | Central scan lifecycle management |
| **ProjectDB** | 64 | Project data persistence |
| **ScanDB** | 64 | Scan result persistence |
| **JenkinsClient** | 14 | Jenkins API integration |
| **main()** | 11 | FastAPI application entry |

### Community Structure

| Community | Nodes | Domain | Key Files |
|-----------|-------|--------|-----------|
| **0** | 105 | Database models & state | `db_models.py`, `scan_state.py`, `scan.py` |
| **1** | 77 | Frontend React components | `App.tsx`, all pages, all components |
| **2** | 32 | API endpoints | `auth.py`, `projects.py`, `scans/*.py` |
| **3** | 30 | Jenkins integration | `jenkins_client.py`, `jenkins_service.py`, `Jenkinsfile` |
| **4** | 28 | Validation & utilities | `validation.py`, `helpers.py`, `constants.py` |
| **5** | 24 | WebSocket handlers | `websockets/__init__.py`, `manager.py` |
| **6** | 23 | Test suites | `tests/test_integration.py`, etc. |

### Architectural Observations

**✅ Strengths:**
- Frontend and backend well-separated in communities
- API routes cluster appropriately
- Tests form their own community (good isolation)
- ScanState as central abstraction (81 edges) makes sense

**⚠️ Areas for Improvement:**
- `backend/app/api/scans.py` (732 lines) too large - already being split
- `src/pages/ScanStatusPage.tsx` (651 lines) too large - hook already extracted
- Consider feature-based structure: `/scans/triggers.py`, `/scans/results.py`

---

## Key Files

### Frontend
| File | Purpose |
|------|---------|
| `src/App.tsx` | Router configuration, lazy loading |
| `src/services/api.ts` | Axios client, interceptors, API methods |
| `src/services/notifications.ts` | Browser desktop notifications |
| `src/hooks/useScanWebSocket.ts` | WebSocket connection with auto-reconnect |
| `src/hooks/useAuth.tsx` | Auth context provider |
| `src/types.ts` | TypeScript type definitions |
| `src/pages/ScanStatusPage.tsx` | Real-time scan monitoring |
| `src/pages/ManualScanPage.tsx` | Stage selection UI |

### Backend
| File | Purpose |
|------|---------|
| `backend/app/main.py` | FastAPI entry, routers, CORS, startup |
| `backend/app/core/config.py` | Pydantic Settings validation |
| `backend/app/core/security.py` | Argon2 password hashing, JWT |
| `backend/app/api/auth.py` | Login/register endpoints |
| `backend/app/api/projects.py` | Project CRUD |
| `backend/app/api/scans/triggers.py` | Scan triggering logic |
| `backend/app/api/scans/callbacks.py` | Jenkins callback handler |
| `backend/app/api/scans/management.py` | Reset/cancel/force-unlock |
| `backend/app/services/jenkins_service.py` | Jenkins API integration |
| `backend/app/infrastructure/jenkins/jenkins_client.py` | HTTP client for Jenkins |
| `backend/app/websockets/manager.py` | WebSocket connection management |
| `backend/app/tasks/jenkins_tasks.py` | Celery async tasks |

### Infrastructure
| File | Purpose |
|------|---------|
| `Agent/Jenkinsfile` | 11-stage security pipeline |
| `docker/docker-compose.yml` | Base service topology |
| `docker/docker-compose.dev.yml` | Development overlay |
| `docker/docker-compose.staging.yml` | Staging overlay |
| `docker/backend.Dockerfile` | FastAPI container |
| `docker/frontend.Dockerfile` | React container |
| `run.py` | Cross-platform Docker runner |

---

*Generated: 2026-04-13 | Based on Graphify analysis (482 nodes, 877 edges, 44 communities)*
