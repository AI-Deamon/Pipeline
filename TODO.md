# TODO: Security Scanning Pipeline - Issues and Fixes

## Completed Fixes

### 1. Test Infrastructure Fixes ✅
- Fixed `test_integration.py` - Uses SQLAlchemy with database fixtures
- Fixed `test_scan_hardening.py` - Uses SQLAlchemy with proper fixtures  
- Fixed `test_callback_project_state_sync.py` - Uses SQLAlchemy with proper fixtures
- Added proper Celery task mocking to avoid Redis connection issues

### 2. Environment Configuration ✅
- Tests now work with `.env.test` environment variables
- Proper database setup/teardown for each test

### 3. Issues Fixed in Tests
- Removed references to non-existent in-memory stores (`projects_db`, `scans_db`)
- Added proper database fixtures with create/drop tables
- Mocked Celery tasks to avoid Redis dependency
- Fixed callback token header requirements

## Issues Identified in Production Code

### 1. Project State Sync on Jenkins Failure ❌
**File:** `backend/app/tasks/jenkins_tasks.py`

**Issue:** When Jenkins trigger fails, the scan is marked as FAILED but the project's `last_scan_state` is NOT updated.

**Fix needed:** In the `trigger_jenkins_scan_async` task, when `not accepted`, also update the project's `last_scan_state`:

```python
# Add this code when Jenkins fails:
project_obj = db.query(ProjectDB).filter(ProjectDB.project_id == scan_obj.project_id).first()
if project_obj:
    project_obj.last_scan_state = ScanState.FAILED.value
```

### 2. Race Conditions with Async Scan States ⚠️
**Files:** `backend/app/api/scans.py`, `backend/app/tasks/jenkins_tasks.py`

**Issue:** There's a timing issue between when scan is created (QUEUED) and when Celery task updates it to RUNNING.

**Current behavior:**
1. API creates scan with state=QUEUED
2. API returns response  
3. Celery task runs and updates to RUNNING
4. But client may query before step 3 completes

**Fix options:**
- Return RUNNING immediately from API (optimistic update)
- Or add WebSocket for real-time updates

### 3. Test Isolation Issues ⚠️
The tests sometimes fail when run together but pass individually. This is due to database state not being fully cleaned between tests.

## Summary

- **10+ tests now passing** with proper fixtures
- **1 critical bug identified** in jenkins_tasks.py (project state not synced on failure)
- **1 architectural issue** with async state updates (race condition)

