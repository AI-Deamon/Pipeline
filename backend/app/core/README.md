# Core Infrastructure

Core application infrastructure - configuration, database, authentication, and service setup.

## Files
| File | Purpose |
|------|---------|
| `config.py` | Application settings from environment variables |
| `db.py` | Database engine and session management |
| `auth.py` | JWT authentication logic |
| `celery_app.py` | Celery application configuration |
| `rate_limit.py` | SlowAPI rate limiting setup |
| `exceptions.py` | Custom exception classes |
| `security.py` | Password hashing, token generation |

## Key Settings (`config.py`)
- `DATABASE_URL` - PostgreSQL connection string
- `JENKINS_BASE_URL` - Jenkins server URL
- `API_KEY` - Backend API authentication key
- `CALLBACK_TOKEN` - Jenkins callback authentication
- `SCAN_TIMEOUT` - Default scan timeout (seconds)
- `ENV` - Environment (dev/test/staging)
- `CORS_ORIGINS` - Allowed CORS origins

## Connection to Other Modules
- Used by ALL API routes for config and dependencies
- Database engine used by SQLAlchemy models
- Celery app used by task definitions
- Rate limiter applied to API endpoints
