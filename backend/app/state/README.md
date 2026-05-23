# Scan State Management

Defines the lifecycle states for security scans.

## ScanState Enum
```python
CREATED     → Scan record created, not yet queued
QUEUED      → Waiting for Jenkins to pick up
RUNNING     → Jenkins pipeline executing
COMPLETED   → Scan finished successfully
FAILED      → Scan failed (timeout, error, etc.)
CANCELLED   → User/admin cancelled the scan
```

## State Transitions
```
CREATED → QUEUED → RUNNING → COMPLETED
                         ↘     FAILED
                         ↘     CANCELLED
```

## State Categories
- **Active States:** CREATED, QUEUED, RUNNING (scan in progress)
- **Terminal States:** COMPLETED, FAILED, CANCELLED (scan finished)

## Usage
- Used by `app.models.db_models.ScanDB.state`
- Checked by API endpoints to prevent duplicate scans
- Used by recovery service to detect stuck scans
- Returned to frontend in scan responses
