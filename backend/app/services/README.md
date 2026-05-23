# Business Services

Core business logic and external service integrations.

## Services
| Service | Purpose |
|---------|---------|
| `jenkins_service.py` | Jenkins API integration (trigger pipeline, get results) |
| `validation.py` | Scan request validation (stage selection, dependencies) |
| `scan_recovery.py` | Background task to recover stuck scans |

## Jenkins Service
- Authenticates with Jenkins server using token
- Triggers pipeline with scan parameters
- Polls for scan completion
- Handles callback processing

## Validation Service
- Validates scan mode (AUTOMATED/MANUAL)
- Checks stage selection against VALID_STAGES
- Verifies stage dependencies (e.g., trivy_image requires docker_build)
- Ensures project doesn't have active scan

## Scan Recovery
- Runs as background thread on app startup
- Detects scans stuck in RUNNING state past timeout
- Marks them as FAILED with appropriate error
- Signals shutdown on app teardown

## Connection to Other Modules
- Called by `app.api.*` endpoints
- Uses `app.infrastructure.*` for HTTP clients
- Updates `app.models.*` database records
- Broadcasts via `app.websockets.*`
