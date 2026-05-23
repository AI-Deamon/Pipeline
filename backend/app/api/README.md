# API Routes

REST API endpoints for the application.

## Public API
- **`auth.py`** - Login, registration endpoints (no auth required)

## Protected API (require JWT)
- **`projects.py`** - Project CRUD operations
- **`scans/`** - Scan management module (being split from monolithic `scans.py`)

## Module Structure
```
api/
├── scans/          # Scan endpoints (modular, in progress)
│   ├── constants.py    # Stage timeouts, status mappings
│   ├── helpers.py      # Utility functions for scan operations
│   ├── triggers.py     # POST /scans - Trigger new scan
│   └── __init__.py
├── auth.py         # POST /auth/login, POST /auth/register
└── projects.py     # GET/POST /projects, GET /projects/{id}
```

## Connection to Other Modules
- Uses `app.core.db` for database sessions
- Uses `app.core.auth` for JWT validation
- Uses `app.core.rate_limit` for rate limiting
- Calls `app.services.*` for business logic
- Returns `app.schemas.*` Pydantic models

## Authentication
- Public endpoints: auth routes only
- All other endpoints require `X-API-Key` header or JWT token
- Jenkins callback uses `CALLBACK_TOKEN` validation
