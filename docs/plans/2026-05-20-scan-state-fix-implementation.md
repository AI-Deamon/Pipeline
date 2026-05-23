# Scan State Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix stuck "Scanning" on dashboard by: (1) transitioning CREATED→QUEUED after Jenkins accepts, (2) including CREATED in recovery service, (3) adding timeout check to GET /projects, (4) removing Reset & Retry flow.

**Architecture:** Backend state transitions were incomplete — the Celery task never advanced scan state from CREATED after Jenkins accepted a build, and the recovery service missed CREATED scans. Fixes are 4 independent changes across 4 files, followed by removing the frontend reset flow.

**Tech Stack:** Python FastAPI, SQLAlchemy, Celery, React/TypeScript

---

### Task 1: Celery task — transition to QUEUED after Jenkins accepts

**Files:**
- Modify: `backend/app/tasks/jenkins_tasks.py:44-48`
- Test: `tests/test_jenkins_logic.py`

**Step 1: Modify the Celery task to transition state**

In `jenkins_tasks.py`, after the `if accepted:` block (currently just sets `jenkins_queue_id`), add state transition:

```python
else:
    scan_obj.state = ScanState.QUEUED
    scan_obj.jenkins_queue_id = str(queue_id) if queue_id else None

    project_obj = db.query(ProjectDB).filter(ProjectDB.project_id == scan_obj.project_id).first()
    if project_obj:
        project_obj.last_scan_state = ScanState.QUEUED.value
```

Restructure the full block to handle both accepted and not-accepted cases properly. The `project_obj` query already exists in the not-accepted branch — lift it before the if/else to avoid duplicating.

**Step 2: Run existing tests**

Run: `pytest tests/ -v`
Expected: All passing

---

### Task 2: Recovery service — include CREATED in stuck-scan query

**Files:**
- Modify: `backend/app/services/scan_recovery.py:180-183`

**Step 1: Add CREATED to the stuck-scan filter**

Change:
```python
stuck_scans = db.query(ScanDB).filter(
    ScanDB.state.in_([ScanState.QUEUED, ScanState.RUNNING]),
    ScanDB.created_at < timeout_threshold
).all()
```

To:
```python
stuck_scans = db.query(ScanDB).filter(
    ScanDB.state.in_([ScanState.CREATED, ScanState.QUEUED, ScanState.RUNNING]),
    ScanDB.created_at < timeout_threshold
).all()
```

---

### Task 3: GET /projects — add timeout expiration

**Files:**
- Modify: `backend/app/api/projects.py:46-75`

**Step 1: Import the expiration utility**

Add import at top of `projects.py`:
```python
from app.api.scans.utils import _expire_scan_if_timed_out, ACTIVE_STATES as SCAN_ACTIVE_STATES
from datetime import datetime, timezone
```

**Step 2: Add timeout check inside `list_projects()`**

After `db_projects = db.query(ProjectDB).all()`, add:
```python
    now = datetime.now(timezone.utc)
    any_expired = False
    for p in db_projects:
        if p.last_scan_state in ACTIVE_STATES:
            active_scan = (
                db.query(ScanDB)
                .filter(ScanDB.project_id == p.project_id, ScanDB.state.in_(
                    [ScanState.CREATED, ScanState.QUEUED, ScanState.RUNNING]
                ))
                .first()
            )
            if active_scan:
                if _expire_scan_if_timed_out(db, active_scan, p, now, auto_commit=False):
                    any_expired = True
    if any_expired:
        db.commit()
```

Note: `ACTIVE_STATES` already exists in `projects.py` (lines 16-20), no need to import.

---

### Task 4: Remove Reset & Retry backend endpoint

**Files:**
- Modify: `backend/app/api/scans/state.py:23-72` (remove reset endpoint)
- Verify: callback routes still included in `routes.py`

**Step 1: Remove the `reset_scan` function and its route**

Delete the `@router.post("/scans/{scan_id}/reset")` endpoint (lines 23-72) from `state.py`.

Keep `cancel_scan` and `force_unlock_scan`.

Verify `routes.py` still includes `from .state import router as state_router` and `router.include_router(state_router)`.

---

### Task 5: Remove Reset & Retry frontend

**Files:**
- Modify: `src/pages/ScanStatusPage.tsx` — remove reset button, confirmation modal, handleReset, resetMutation usage
- Modify: `src/hooks/useScanStatus.ts` — remove handleReset, resetMutation, showResetConfirm, showErrorModal references
- Modify: `src/components/ScanErrorModal.tsx` — remove "Reset & Retry" button (onRetry prop)

**Step 1: Remove reset from ScanErrorModal**

In `ScanErrorModal.tsx`: Remove the `onRetry` prop, remove the "Reset & Retry" button from the footer (lines 180-201), keep only "Dismiss" and "View Logs".

**Step 2: Remove reset from ScanStatusPage**

In `ScanStatusPage.tsx`:
- Remove `showResetConfirm` state and related JSX (lines 365-388)
- Remove `handleReset` function (lines 103-118)
- Remove `resetMutation` usage (line 58)
- Remove `useScanReset` import
- Remove the `onRetry` and `isRetrying` props from `<ScanErrorModal>` (lines 361-362)
- Remove `useLocation` import if no longer needed

**Step 3: Verify build passes**

Run: `npx tsc -b`
Expected: No errors

---

### Verification

**Step 1: Backend tests**

Run: `pytest tests/ -v`
Expected: All tests pass

**Step 2: Frontend build**

Run: `npm run build`
Expected: Build succeeds

**Step 3: Lint**

Run: `npm run lint`
Expected: No errors
