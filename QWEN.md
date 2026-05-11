# Pipeline Project - Context Guide

## Project Overview

This repository contains a **DevSecOps security scanning pipeline** with a web-based management interface. The project is organized into two main parts:

1. **Root directory** - Contains the main application code (React frontend, Python FastAPI backend, Jenkins pipeline)
2. **`/Agent`** - Contains only the Jenkins Jenkinsfile for the security pipeline

### Architecture

```
Pipeline/
├── Agent/
│   └── Jenkinsfile                    # Jenkins pipeline definition
├── backend/                           # Python FastAPI backend
│   └── app/
│       ├── api/                       # REST API endpoints
│       ├── core/                      # Configuration, security, database
│       ├── models/                    # SQLAlchemy database models
│       ├── schemas/                   # Pydantic request/response schemas
│       ├── services/                  # Business logic
│       ├── state/                     # State management
│       ├── tasks/                     # Celery async tasks
│       └── websockets/                # WebSocket managers
├── src/                               # React + TypeScript frontend
│   ├── components/                    # Reusable UI components
│   ├── pages/                         # Page-level route components
│   ├── services/                      # API client, notification service
│   ├── hooks/                         # Custom React hooks
│   ├── utils/                         # Utility functions
│   └── types.ts                       # TypeScript type definitions
├── docker/                            # Docker Compose configurations
│   ├── docker-compose.yml             # Base configuration
│   ├── docker-compose.dev.yml         # Development overlay
│   ├── docker-compose.test.yml        # Test overlay
│   ├── docker-compose.staging.yml     # Staging overlay
│   ├── backend.Dockerfile             # Backend Docker image
│   ├── frontend.Dockerfile            # Frontend Docker image
│   └── nginx.conf                     # Nginx configuration for staging
├── .env.dev                           # Development environment variables
├── .env.test                          # Test environment variables
├── .env.staging                       # Staging environment variables
├── run.py                             # Cross-platform Docker runner
└── Makefile                           # Unix command shortcuts
```

### Technology Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19, TypeScript, Vite 7, TailwindCSS 4, React Router 7, TanStack Query 5 |
| **Backend** | Python FastAPI, PostgreSQL, SQLAlchemy, Celery, Redis |
| **Testing** | Vitest, React Testing Library, pytest |
| **CI/CD** | Jenkins (Groovy Pipeline) |
| **Security Tools** | Trivy, SonarQube, Nmap, OWASP ZAP, Dependency-Check |
| **Containerization** | Docker, Docker Compose |

## Building and Running

### Prerequisites

- Docker & Docker Compose
- Python 3.x (for `run.py` script)
- Node.js 18+ (for local frontend development)

### Environment Profiles

The project supports three environments via Docker Compose overlays:

| Environment | Description |
|-------------|-------------|
| **dev** | Local backend/frontend/postgres, debug logging, mock execution |
| **test** | Isolated test database, CI-friendly test runner |
| **staging** | Persistent services with real Jenkins/Kali integration |

### Commands

**Using Python runner (cross-platform, recommended):**
```bash
python run.py dev       # Start development environment
python run.py test      # Run test environment
python run.py staging   # Start staging environment
python run.py down      # Stop all containers
```

**Using Makefile (Unix-like systems):**
```bash
make dev
make test
make staging
make down
```

**Frontend-only development:**
```bash
npm install
npm run dev      # Start Vite dev server
npm run build    # Build for production
npm run lint     # Run ESLint
npm run preview  # Preview production build
```

**Testing:**
```bash
npm run test     # Run Vitest test suite (frontend)
pytest tests/    # Run Python tests (backend)
```

### Docker Compose Files

- `docker/docker-compose.yml` - Base configuration
- `docker/docker-compose.dev.yml` - Development overlay
- `docker/docker-compose.test.yml` - Test overlay
- `docker/docker-compose.staging.yml` - Staging overlay

### Environment Variables

Key environment files:
- `.env.dev` - Development settings (mock execution, debug logging)
- `.env.test` - Test settings (isolated DB, mocked execution)
- `.env.staging` - Staging settings (real integrations)

**Important Environment Variables:**
- `API_KEY` - Backend API authentication key
- `VITE_API_KEY` - Frontend API key (must match API_KEY)
- `CALLBACK_TOKEN` - Jenkins callback authentication
- `DATABASE_URL` - PostgreSQL connection string
- `JENKINS_BASE_URL` - Jenkins server URL
- `SCAN_TIMEOUT` - Pipeline timeout in seconds (default: 7200)

## Jenkins Pipeline

The `Agent/Jenkinsfile` defines a comprehensive security scanning pipeline with the following stages:

| Stage | Description | Timeout |
|-------|-------------|---------|
| Init Context | Validates SCAN_ID and parses project data | - |
| Git Checkout | Clones target repository | - |
| Sonar Scanner | Static code analysis | 15 min |
| Sonar Quality Gate | Quality gate validation | 30 min |
| NPM / PIP Install | Dependency installation | 10 min |
| Dependency Check | Vulnerability scanning in dependencies | - |
| Trivy FS Scan | Filesystem vulnerability scan | - |
| Docker Build | Build Docker image | - |
| Docker Push | Push image to registry | - |
| Trivy Image Scan | Container image vulnerability scan | - |
| Nmap Scan | Network port scanning | - |
| ZAP Scan | Web application security scan | - |

### Pipeline Modes

- **AUTOMATED** - Auto-discovers and runs all applicable stages based on project files
- **MANUAL** - User selects specific stages to execute via JSON array

### Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `SCAN_ID` | `''` | Unique scan identifier |
| `SCAN_MODE` | `AUTOMATED` | Execution mode (AUTOMATED or MANUAL) |
| `PROJECT_DATA` | `{}` | JSON with git_url, branch, credentials_id, sonar_key, target_ip, target_url |
| `SELECTED_STAGES` | `[]` | JSON array for manual stage selection |
| `SCAN_TIMEOUT` | `7200` | Pipeline timeout in seconds (default 2 hours) |

### Callback Mechanism

Upon pipeline completion, results are posted to the backend via:
```
POST http://backend:8000/api/v1/scans/{SCAN_ID}/callback
```

The callback includes:
- Scan status (SUCCESS/FAILURE/ABORTED)
- Build number and scan metadata
- Stage results with status and summaries
- **Error details** (error_message, error_type, jenkins_console_url)
- Timestamps and artifact URLs
- Normalized stage statuses (PASS/FAIL/SKIPPED/WARN)

### Error Handling

The pipeline captures detailed error information:
- **TIMEOUT** - Scan exceeded maximum execution time
- **PIPELINE_ERROR** - Pipeline failed at a specific stage
- **USER_CANCELLED** - Scan manually cancelled
- **ADMIN_RECOVERY** - Scan recovered by administrator

Error details include:
- Descriptive error message
- Failed stage identification
- Direct link to Jenkins console logs

## Development Conventions

### Code Style

- **Frontend**: TypeScript with strict type checking, ESLint with React hooks rules
- **Backend**: Python with type hints (see `backend/requirements.txt` for linting tools)

### Project Structure

**Frontend (`src/`):**
- `components/` - Reusable UI components
- `pages/` - Page-level components (Dashboard, ProjectControl, ScanStatus, ScanHistory)
- `services/` - API client and notification services
- `hooks/` - Custom React hooks (useScanWebSocket, useScanReset, useScanCancel)
- `utils/` - Utility functions (apiError handling)
- `assets/` - Static assets
- `test/` - Frontend tests

**Backend (`backend/app/`):**
- `api/` - REST API endpoints (projects, scans, auth)
- `core/` - Core configuration, database, authentication, rate limiting
- `models/` - SQLAlchemy database models
- `schemas/` - Pydantic schemas for request/response validation
- `services/` - Business logic (Jenkins service, scan orchestration, validation)
- `state/` - Scan state management and persistence
- `tasks/` - Celery tasks for async operations
- `websockets/` - WebSocket managers for real-time updates

### Testing Practices

- Frontend uses Vitest with React Testing Library
- Tests co-located with source or in dedicated `tests/` directory
- Backend uses pytest with fastapi.testclient.TestClient
- CI runs tests in isolated Docker environment

### Key Configuration Files

| File | Purpose |
|------|---------|
| `package.json` | Frontend dependencies and scripts |
| `tsconfig.json` | TypeScript configuration |
| `vite.config.ts` | Vite build configuration |
| `vitest.config.ts` | Vitest test configuration |
| `tailwind.config.js` | TailwindCSS configuration |
| `eslint.config.js` | ESLint rules |
| `Makefile` | Unix command shortcuts |
| `run.py` | Cross-platform Docker runner |

## API Endpoints

### Authentication
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/register` - User registration

### Projects
- `GET /api/v1/projects` - List all projects
- `GET /api/v1/projects/{id}` - Get project details
- `POST /api/v1/projects` - Create new project
- `GET /api/v1/projects/{id}/scans` - Get project scan history

### Scans
- `GET /api/v1/scans` - List all scans
- `GET /api/v1/scans/{id}` - Get scan details
- `GET /api/v1/scans/{id}/results` - Get scan stage results
- `POST /api/v1/scans` - Trigger new scan
- `POST /api/v1/scans/{id}/reset` - Reset failed scan
- `POST /api/v1/scans/{id}/cancel` - Cancel running scan
- `POST /api/v1/scans/{id}/callback` - Jenkins callback endpoint

### WebSocket
- `ws://localhost:8000/api/v1/ws/scans?scan_id={id}` - Subscribe to scan updates
- `ws://localhost:8000/api/v1/ws/dashboard` - Subscribe to all scan updates

## Real-time Features

### WebSocket Integration
- Real-time scan status updates
- Auto-reconnect on connection loss
- Ping/pong keepalive mechanism
- Broadcasts to scan-specific and dashboard subscribers

### Browser Notifications
- Desktop notifications for scan completion
- Permission-based notification system
- Click-to-navigate functionality
- Auto-dismiss after 5 seconds

### Progress Tracking
- Visual progress bar with ETA estimation
- Stage-by-stage progress indicators
- Real-time status updates
- Color-coded stage status (green=pass, red=fail, blue=running)

### Error Identification
- Detailed error messages from Jenkins
- Error type classification (TIMEOUT, PIPELINE_ERROR, etc.)
- Failed stage highlighting
- Jenkins console log links
- Common causes and suggested fixes

## Security Integration

The pipeline integrates with Kali Linux security tools:
- **Trivy** - Container and filesystem vulnerability scanning
- **Nmap** - Network discovery and port scanning
- **OWASP ZAP** - Web application security testing
- **SonarQube** - Code quality and security analysis
- **Dependency-Check** - Third-party dependency vulnerability scanning

## Recent Improvements

### Phase 3 Implementation
1. ✅ WebSocket real-time scan updates
2. ✅ Browser notifications for scan completion
3. ✅ Scan progress bar with ETA estimation
4. ✅ Error recovery suggestions component
5. ✅ Enhanced error reporting in Jenkins callback
6. ✅ Improved scan failure identification UI
7. ✅ Fixed API authentication (VITE_API_KEY)
8. ✅ Database schema updates for error tracking

### Bug Fixes
- Fixed 401 Unauthorized errors on scan history endpoint
- Added VITE_API_KEY to environment configuration
- Fixed Jenkins callback to include error details
- Enhanced backend to store and return error information
- Improved UI error display with failed stage highlighting
- Fixed bcrypt/passlib compatibility with Python 3.13 (switched to argon2)

## Qwen Added Memories
- Jenkins server is running on localhost:8080 with all configurations already set up and ready to use. The URL is http://localhost:8080/job/Security-pipeline/ and requires authentication (403 Forbidden without credentials).
- Graphify is a codebase analysis tool located at /home/kali_linux/Pipeline/graphify-out/. It generates knowledge graphs of the codebase architecture with reports in GRAPH_REPORT.md. Key insights: 482 nodes, 877 edges, 44 communities. Main god nodes: ScanState (81 edges), ProjectDB/ScanDB (64 edges each), JenkinsClient (14 edges). Use graphify-out/GRAPH_REPORT.md for debugging and understanding codebase architecture, file organization, and structural insights.
- Use Graphify consistently for ALL development work: before making changes, during debugging, for architectural decisions, and keep changes tracking. Always reference graphify-out/GRAPH_REPORT.md when working on the codebase to understand architecture, trace code flow, identify affected components, and track structural impact of changes.
- ALWAYS use superpowers skills and ALWAYS use subagent-driven execution. Before any task, invoke relevant skills from the superpowers system. Delegate work to specialized subagents whenever possible instead of executing directly in the main conversation.
