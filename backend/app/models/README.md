# Database Models

SQLAlchemy ORM models for the application.

## Models
| Model | Table | Purpose |
|-------|-------|---------|
| `ProjectDB` | `projects` | Project configuration (git URL, credentials, target info) |
| `ScanDB` | `scans` | Scan execution records (state, results, error info) |

## Key Fields

### ProjectDB
- `project_id` - UUID primary key
- `name`, `git_url`, `branch` - Repository info
- `credentials_id`, `sonar_key` - Authentication
- `target_ip`, `target_url` - Scan targets
- `last_scan_state` - Most recent scan status
- `status` - Project active/inactive status

### ScanDB
- `scan_id` - UUID primary key
- `project_id` - Foreign key to ProjectDB
- `scan_mode` - AUTOMATED or MANUAL
- `selected_stages` - JSON list of stages to run
- `state` - ScanState enum (CREATED, QUEUED, RUNNING, COMPLETED, FAILED, CANCELLED)
- `stage_results` - JSON array of stage results
- `error_message`, `error_type`, `jenkins_console_url` - Error details
- `callback_digests` - Replay attack prevention

## Connection to Other Modules
- Used by `app.api.*` for database queries
- Referenced by `app.schemas.*` for response serialization
- Updated by `app.services.*` and `app.tasks.*`
- State tracked by `app.state.scan_state`
