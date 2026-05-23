# Celery Tasks

Background task definitions for async processing.

## Tasks
| Task | Purpose |
|------|---------|
| `jenkins_tasks.py` | Async task to trigger Jenkins pipeline |

## How It Works
1. API endpoint creates scan record in DB
2. Calls `trigger_jenkins_scan_async.delay()` with scan params
3. Celery worker picks up task from Redis queue
4. Worker calls Jenkins API to start pipeline
5. Jenkins runs pipeline and callbacks back to backend

## Configuration
- Broker: Redis (`redis://redis:6379/0`)
- Backend: Redis result store
- Task serialization: JSON
- Retry logic for failed Jenkins calls

## Connection to Other Modules
- Imported by `app.api.scans.triggers` (scan trigger endpoint)
- Uses `app.services.jenkins_service` for Jenkins API
- Updates `app.models.db_models.ScanDB` with queue/build info
