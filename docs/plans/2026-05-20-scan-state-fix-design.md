# Design: Fix Scan State to Prevent Stuck "Scanning" on Dashboard

## Problem

Scans that fail to complete properly remain stuck in `CREATED` state forever, causing the dashboard to show them as "Scanning" indefinitely. The current "Reset & Retry" flow is confusing — it resets state to `CREATED` without auto-retrying, and the user must manually start a new scan anyway.

## Root Causes

1. **Celery task doesn't transition CREATED→QUEUED** — After Jenkins accepts a build, the scan stays `CREATED` (`jenkins_tasks.py:44-48`). The state only progresses via Jenkins callback, which may never arrive.

2. **Recovery service misses CREATED** — `recover_stuck_scans()` only queries `QUEUED` and `RUNNING` states (`scan_recovery.py:180-183`), so scans stuck in `CREATED` are never auto-expired.

3. **`GET /projects` has no timeout check** — The dashboard's data source never expires stuck scans. Only `GET /scans` and `GET /scans/{id}` have this logic.

## Changes

### 1. Celery task: transition to QUEUED after Jenkins accepts

**File:** `backend/app/tasks/jenkins_tasks.py:44-48`

When Jenkins accepts the build, set `scan_obj.state = ScanState.QUEUED` and `project_obj.last_scan_state = ScanState.QUEUED.value`.

### 2. Recovery service: include CREATED

**File:** `backend/app/services/scan_recovery.py:180-183`

Change the stuck-scans query to include `ScanState.CREATED` alongside `QUEUED` and `RUNNING`.

### 3. `GET /projects`: add timeout expiration

**File:** `backend/app/api/projects.py:46-75`

Before returning projects, query for active scans and run `_expire_scan_if_timed_out` (same pattern as `routes.py:list_scans()`).

### 4. Remove Reset & Retry

**Backend:** Remove `POST /scans/{scan_id}/reset` endpoint from `backend/app/api/scans/state.py`
**Frontend:** Remove reset button/modal from `ScanStatusPage.tsx` and `ScanErrorModal.tsx`, remove `useScanReset` usage.

## No-Risk Items

- Transition to QUEUED is the correct state after Jenkins accepts (was a missing state transition)
- Recovery including CREATED has a 2-hour timeout guard — new scans unaffected
- `GET /projects` timeout check matches existing `GET /scans` pattern exactly
- Removing Reset & Retry: user workflow is identical — start a new scan from project page
