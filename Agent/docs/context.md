Full project context loaded. Here's the complete summary:

    ---

    DevSecOps Pipeline - Complete Context

    Project Structure

      1 /home/kali_linux/Pipeline/
      2 ├── Agent/                          # Main application
      3 │   ├── backend/app/                # FastAPI backend
      4 │   │   ├── api/                    # REST endpoints (auth, projects, scans)
      5 │   │   ├── core/                   # Config, DB, security, celery_app
      6 │   │   ├── infrastructure/         # HTTP client, Jenkins client
      7 │   │   ├── models/                 # SQLAlchemy models (db_models.py)
      8 │   │   ├── schemas/                # Pydantic schemas
      9 │   │   ├── services/               # Business logic (jenkins, orchestrator)
     10 │   │   ├── state/                  # Scan state management
     11 │   │   ├── tasks/                  # Celery async tasks
     12 │   │   └── main.py                 # FastAPI entry point
     13 │   ├── src/                        # React 19 + TypeScript frontend
     14 │   │   ├── components/             # Layout, ProtectedRoute
     15 │   │   ├── pages/                  # Login, Dashboard, ProjectControl, ManualScan, ScanStatus
     16 │   │   ├── services/api.ts         # API client with auth interceptors
     17 │   │   └── types.ts                # TypeScript type definitions
     18 │   ├── docker/                     # Docker Compose configs
     19 │   ├── tests/                      # Backend tests
     20 │   ├── docs/                       # 18 architecture/design docs
     21 │   └── run.py                      # Cross-platform Docker runner
     22 ├── Jenkinsfile                     # 11-stage security pipeline
     23 └── QWEN.md                         # Project context guide

    Technology Stack

    ┌────────────────┬─────────────────────────────────────────────────────────────┐
    │ Layer          │ Technology                                                  │
    ├────────────────┼─────────────────────────────────────────────────────────────┤
    │ Frontend       │ React 19, TypeScript, Vite 7, TailwindCSS 4, React Router 7 │
    │ State          │ @tanstack/react-query, localStorage                         │
    │ Backend        │ FastAPI, SQLAlchemy, Pydantic, Celery + Redis               │
    │ Database       │ PostgreSQL 16                                               │
    │ Auth           │ JWT (python-jose), Argon2/Bcrypt (passlib)                  │
    │ CI/CD          │ Jenkins LTS (Groovy pipeline)                               │
    │ Security Tools │ Trivy, SonarQube, Nmap, OWASP ZAP, Dependency-Check         │
    └────────────────┴─────────────────────────────────────────────────────────────┘


    Environment Profiles

    ┌─────────┬──────────────┬─────────────────────────────────┬───────────────────────────────────────────┐
    │ Env     │ File         │ Ports                           │ Features                                  │
    ├─────────┼──────────────┼─────────────────────────────────┼───────────────────────────────────────────┤
    │ dev     │ .env.dev     │ 8000 (BE), 8173 (FE), 5433 (DB) │ Mock execution, debug logging, hot reload │
    │ test    │ .env.test    │ Isolated DB                     │ CI-friendly, mocked Jenkins               │
    │ staging │ .env.staging │ Real integrations               │ Jenkins/Kali integration, Redis           │
    └─────────┴──────────────┴─────────────────────────────────┴───────────────────────────────────────────┘


    API Endpoints

     1 POST   /api/v1/auth/login          # OAuth2 token
     2 POST   /api/v1/auth/register       # User registration
     3 GET    /api/v1/projects            # List projects
     4 POST   /api/v1/projects            # Create project
     5 POST   /api/v1/scans               # Trigger scan (automated/manual)
     6 GET    /api/v1/scans               # List scans
     7 GET    /api/v1/scans/{id}          # Get scan status
     8 GET    /api/v1/scans/{id}/results  # Get stage results
     9 POST   /api/v1/scans/{id}/callback # Jenkins callback webhook

    Jenkins Pipeline (11 Stages)
     1. Git Checkout
     2. Sonar Scanner (15min timeout)
     3. Sonar Quality Gate (10min)
     4. NPM/PIP Install (10min)
     5. Dependency Check (15min)
     6. Trivy FS Scan
     7. Docker Build (15min)
     8. Docker Push (10min)
     9. Trivy Image Scan (10min)
     10. Nmap Scan (5min)
     11. ZAP Scan (30min)

    Pipeline Modes:
     - AUTOMATED - Auto-discovers and runs all applicable stages
     - MANUAL - User selects specific stages via JSON array

    Scan State Machine

     1 CREATED → QUEUED → RUNNING → COMPLETED/FAILED/CANCELLED

    Key Contracts
     - Callback Token: 32+ chars, validated via X-Callback-Token header
     - API Key: 32+ chars, validated via X-API-Key header
     - Scan Timeout: Dynamic (calculated from stages) or override via X-Scan-Timeout
     - Result Normalization: Jenkins statuses mapped to PASS/FAIL/SKIPPED/WARN

    Security Hardening (Implemented)
    ✅ Single-worker enforcement (WEB_CONCURRENCY=1)
    ✅ Atomic trigger serialization (lock + Jenkins call outside critical section)
    ✅ Disk persistence for restart survival
    ✅ Callback token validation (non-test envs)
    ✅ Global API key enforcement
    ✅ Background timeout worker
    ✅ Single active scan per project guard
    ✅ Jenkins disableConcurrentBuilds()

    Known Gaps (TODO.md)
    ⚠️ Project last_scan_state not synced on Jenkins failure (partially fixed)
    ⚠️ Race condition: async state updates (QUEUED→RUNNING delay)
    ⚠️ Multi-replica backend not supported
    ⚠️ Shell interpolation risks in Jenkins stages
    ⚠️ Callback payload not cryptographically signed

    Quick Commands

      1 cd Agent
      2 
      3 # Development
      4 python run.py dev
      5 npm run dev          # Frontend only
      6 
      7 # Testing
      8 npm run test         # Frontend tests
      9 pytest               # Backend tests
     10 
     11 # Build
     12 npm run build
     13 
     14 # Stop all
     15 python run.py down

