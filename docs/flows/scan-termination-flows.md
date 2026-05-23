# Scan Termination Flows

Complete flows for canceling, resetting, timing out, and force-unlocking scans.

---

## 1. Cancel Scan Flow

### UI Flow

```
User on /scans/scan-789-jkl (scan is RUNNING)
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│ Scan Status: scan-789-jkl                           [Refresh]   │
│ ─────────────────────────────────────────────────────────────── │
│                                                                 │
│ Status: 🔵 RUNNING                                             │
│ Mode: Automated                                                │
│ Duration: Running for 8m 32s                                   │
│ Jenkins Build: #42                                             │
│                                                                 │
│ ┌───────────────────────────────────────────────────────────┐  │
│ │ Progress: ████████░░░░░░░░░░░░░░░░░░ 36% (4/11)          │  │
│ └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│ Stage Results                                                   │
│ ┌──────────────────────┬──────────┬──────────────────────────┐ │
│ │ 1. Git Checkout      │ ✅ PASS  │ Git checkout successful  │ │
│ │ 2. Sonar Scanner     │ ✅ PASS  │ Sonar scan completed     │ │
│ │ 3. Sonar Quality Gt  │ ✅ PASS  │ Quality Gate passed      │ │
│ │ 4. NPM/PIP Install   │ ✅ PASS  │ Dependencies installed   │ │
│ │ 5. Dependency Check  │ 🔵 RUN   │ Scanning dependencies... │ │
│ │ 6. Trivy FS Scan     │ ⏳ WAIT  │                          │ │
│ │ ...                  │ ⏳ WAIT  │                          │ │
│ └──────────────────────┴──────────┴──────────────────────────┘ │
│                                                                 │
│ [Cancel Scan]  [View in Jenkins]                                │
└─────────────────────────────────────────────────────────────────┘
       │
       │ User clicks "Cancel Scan"
       ▼
Confirmation dialog:
┌─────────────────────────────────────────────────────┐
│ Cancel Running Scan?                                │
│                                                     │
│ Are you sure you want to cancel scan                │
│ scan-789-jkl?                                       │
│                                                     │
│ The Jenkins job will continue running but the       │
│ scan state will be marked as CANCELLED.             │
│                                                     │
│ [Yes, Cancel] [No, Continue]                        │
└─────────────────────────────────────────────────────┘
       │
       │ User confirms
       ▼
POST /api/v1/scans/scan-789-jkl/cancel
Authorization: Bearer eyJ...
X-API-Key: z9y8...
       │
       ▼
Backend: management.py::cancel_scan()
       │
       ├─ 1. Find scan by ID
       │     scan_obj = db.query(ScanDB)
       │       .filter(ScanDB.scan_id == "scan-789-jkl")
       │       .first()
       │     └─ If not found → HTTP 404 "Scan not found"
       │
       ├─ 2. Check if scan can be cancelled
       │     if scan_obj.state in TERMINAL_STATES:
       │       # TERMINAL_STATES = {COMPLETED, FAILED, CANCELLED}
       │       → HTTP 400 "Cannot cancel scan in COMPLETED state"
       │
       ├─ 3. Cancel scan
       │     scan_obj.state = ScanState.CANCELLED
       │     scan_obj.finished_at = datetime.now(utc)
       │     scan_obj.error_message = "Cancelled by user"
       │     scan_obj.error_type = "USER_CANCELLED"
       │
       ├─ 4. Update project state
       │     project_obj = db.query(ProjectDB)
       │       .filter(ProjectDB.project_id == scan_obj.project_id)
       │       .first()
       │     project_obj.last_scan_state = "CANCELLED"
       │
       ├─ 5. Commit to database
       │     db.commit()
       │
       └─ 6. Broadcast WebSocket update
            websocket_manager.send_scan_update(
              scan_id="scan-789-jkl",
              project_id="abc-123-def",
              data=scan_to_response(scan_obj)
            )
       │
       ▼
Return 200:
{
  "status": "success",
  "message": "Scan scan-789-jkl cancelled successfully",
  "scan_id": "scan-789-jkl"
}
       │
       ▼
Frontend receives response
       │
       ▼
UI updates:
  ├─ Status badge: "CANCELLED" (yellow/orange)
  ├─ Progress bar freezes
  ├─ Cancel button disappears
  ├─ "Reset" button appears
  └─ Stage results remain as-is (4 PASS, 1 RUNNING → FAIL)
       │
       ▼
Browser notification (if enabled):
┌─────────────────────────────────────────┐
│ DevSecOps Platform                      │
│                                         │
│ Scan Cancelled                          │
│ My Application scan cancelled by user   │
│                                         │
│ [Click to view]                         │
└─────────────────────────────────────────┘
```

### Important Notes

⚠️ **Jenkins job is NOT cancelled!**
- Current implementation only updates database state
- Jenkins pipeline continues running until completion
- Would need Jenkins API: `POST /job/Security-pipeline/42/stop`

### Database State After Cancel

```sql
UPDATE scans
SET state = 'CANCELLED',
    finished_at = '2026-04-13T10:08:32Z',
    error_message = 'Cancelled by user',
    error_type = 'USER_CANCELLED'
WHERE scan_id = 'scan-789-jkl';

UPDATE projects
SET last_scan_state = 'CANCELLED'
WHERE project_id = 'abc-123-def';
```

---

## 2. Reset Failed Scan Flow

### UI Flow

```
User on /scans/scan-789-jkl (scan is FAILED)
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│ Scan Status: scan-789-jkl                           [Refresh]   │
│ ─────────────────────────────────────────────────────────────── │
│                                                                 │
│ Status: ❌ FAILED                                              │
│ Mode: Automated                                                │
│ Duration: 12 minutes                                           │
│ Error Type: PIPELINE_ERROR                                     │
│ Error: Pipeline failed at stage: sonar_scanner                 │
│                                                                 │
│ ┌───────────────────────────────────────────────────────────┐  │
│ │ Progress: ████████████░░░░░░░░░░░░░░░░ 55% (6/11)        │  │
│ └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│ Stage Results                                                   │
│ ┌──────────────────────┬──────────┬──────────────────────────┐ │
│ │ 1. Git Checkout      │ ✅ PASS  │ Git checkout successful  │ │
│ │ 2. Sonar Scanner     │ ❌ FAIL  │ SonarQube failed: ...    │ │
│ │ 3. Sonar Quality Gt  │ ⏭️ SKIP  │ Quality Gate skipped     │ │
│ │ 4. NPM/PIP Install   │ ⏳ SKIP  │                          │ │
│ │ ...                  │ ⏳ SKIP  │                          │ │
│ └──────────────────────┴──────────┴──────────────────────────┘ │
│                                                                 │
│ [Reset & Retry]  [View Jenkins Console]                         │
└─────────────────────────────────────────────────────────────────┘
       │
       │ User clicks "Reset & Retry"
       ▼
POST /api/v1/scans/scan-789-jkl/reset
Authorization: Bearer eyJ...
X-API-Key: z9y8...
       │
       ▼
Backend: management.py::reset_scan()
       │
       ├─ 1. Find scan by ID
       │     scan_obj = db.query(ScanDB)
       │       .filter(ScanDB.scan_id == "scan-789-jkl")
       │       .first()
       │     └─ If not found → HTTP 404 "Scan not found"
       │
       ├─ 2. Find project
       │     project_obj = db.query(ProjectDB)
       │       .filter(ProjectDB.project_id == scan_obj.project_id)
       │       .first()
       │     └─ If not found → HTTP 404 "Project not found"
       │
       ├─ 3. Check retry limit
       │     current_retry_count = scan_obj.retry_count or 0
       │     if current_retry_count >= MAX_RETRY_COUNT:  # 10
       │       → HTTP 400 "Maximum retry count (10) reached"
       │
       ├─ 4. Reset scan state
       │     scan_obj.state = ScanState.CREATED
       │     scan_obj.retry_count = current_retry_count + 1  # 0 → 1
       │     scan_obj.started_at = None
       │     scan_obj.finished_at = None
       │     scan_obj.error_message = None
       │     scan_obj.error_type = None
       │     scan_obj.jenkins_console_url = None
       │     scan_obj.stage_results = []
       │     scan_obj.callback_digests = []
       │
       ├─ 5. Commit to database
       │     db.commit()
       │
       └─ 6. Broadcast WebSocket update
            websocket_manager.send_scan_update(
              scan_id="scan-789-jkl",
              project_id="abc-123-def",
              data=scan_to_response(scan_obj)
            )
       │
       ▼
Return 200:
{
  "scan_id": "scan-789-jkl",
  "project_id": "abc-123-def",
  "scan_mode": "automated",
  "state": "CREATED",
  "selected_stages": [],
  "created_at": "2026-04-13T10:00:00Z",
  "started_at": null,
  "finished_at": null,
  "stage_results": [],
  "error_message": null,
  "error_type": null,
  "retry_count": 1
}
       │
       ▼
Frontend receives response
       │
       ▼
UI updates:
  ├─ Status badge: "CREATED" (gray)
  ├─ Progress bar resets to 0%
  ├─ Error message disappears
  ├─ "Reset" button disappears
  └─ "Run Scan" button appears (or auto-triggers)
       │
       ▼
Important: project.last_scan_state is NOT updated!
  └─ Dashboard will show "no active scan" for this project
  └─ User must trigger new scan manually or automatically
```

### Database State After Reset

```sql
UPDATE scans
SET state = 'CREATED',
    retry_count = 1,
    started_at = NULL,
    finished_at = NULL,
    error_message = NULL,
    error_type = NULL,
    jenkins_console_url = NULL,
    stage_results = '[]',
    callback_digests = '[]'
WHERE scan_id = 'scan-789-jkl';

-- Note: project.last_scan_state is NOT updated
-- This allows dashboard to correctly show "no active scan"
```

### Retry Count

```sql
-- Each reset increments retry_count
-- Maximum: 10 retries (MAX_RETRY_COUNT)
-- After 10 retries, scan cannot be reset again

SELECT scan_id, retry_count, state
FROM scans
WHERE scan_id = 'scan-789-jkl';

-- Result:
-- scan_id        | retry_count | state
-- scan-789-jkl   | 1           | CREATED
```

---

## 3. Scan Timeout Flow

### Backend Enforcement

**Timeout checking happens on every GET request:**

```
User visits /scans or /scans/scan-789-jkl
       │
       ▼
GET /api/v1/scans
       │
       ▼
Backend: triggers.py::list_scans()
       │
       ├─ 1. Query all scans
       │     scans = db.query(ScanDB).all()
       │
       ├─ 2. Filter active scans
       │     active_scans = [s for s in scans
       │                     if s.state not in TERMINAL_STATES]
       │     # TERMINAL_STATES = {COMPLETED, FAILED, CANCELLED}
       │
       ├─ 3. For each active scan, check timeout
       │     for scan_obj in active_scans:
       │       expire_scan_if_timed_out(
       │         db, scan_obj, project_obj,
       │         now=datetime.now(utc),
       │         timeout_seconds=settings.SCAN_TIMEOUT
       │       )
       │
       └─ 4. If any expired, commit to database
```

### Timeout Check Logic

```python
# backend/app/api/scans/helpers.py

def expire_scan_if_timed_out(db, scan_obj, project_obj, now, timeout_seconds):
    """Check if scan has exceeded timeout and mark as failed"""
    
    # Only check active scans
    if scan_obj.state not in {CREATED, QUEUED, RUNNING}:
        return False
    
    # Check if started_at is set
    if not scan_obj.started_at:
        return False
    
    # Calculate elapsed time
    elapsed = now - scan_obj.started_at
    
    # Check if exceeded timeout
    if elapsed.total_seconds() > timeout_seconds:
        # Mark scan as failed
        scan_obj.state = ScanState.FAILED
        scan_obj.finished_at = now
        scan_obj.error_type = "TIMEOUT"
        scan_obj.error_message = (
            f"Scan timed out after {timeout_seconds} seconds "
            f"({timeout_seconds / 60:.0f} minutes)"
        )
        
        # Update project state
        project_obj.last_scan_state = "FAILED"
        
        # Broadcast WebSocket update
        websocket_manager.send_scan_update(
            scan_id=scan_obj.scan_id,
            project_id=scan_obj.project_id,
            data=scan_to_response(scan_obj)
        )
        
        return True  # Scan was expired
    
    return False  # Scan still within timeout
```

### Timeout Configuration

| Environment | SCAN_TIMEOUT | Per-Stage Calculation |
|-------------|--------------|----------------------|
| Dev | 7200s (2h) | Sum of all stages + 20% |
| Test | 120s (2min) | Sum of selected + 20% |
| Staging | 7200s (1h) | Sum of selected + 20% |

### Timeout Flow Diagram

```
Scan starts:
  started_at = 2026-04-13T10:00:00Z
  SCAN_TIMEOUT = 7200 seconds (2 hours)
       │
       ▼
Scan running...
  User visits /scans page
       │
       ▼
Backend checks timeout:
  now = 2026-04-13T12:05:00Z
  elapsed = now - started_at = 7500 seconds
  7500 > 7200? YES → TIMEOUT!
       │
       ▼
Mark scan as failed:
  state = FAILED
  error_type = "TIMEOUT"
  error_message = "Scan timed out after 7200 seconds (120 minutes)"
  finished_at = now
       │
       ▼
Broadcast WebSocket update:
  { event: "scan.state_changed", data: { state: "FAILED", error_type: "TIMEOUT" } }
       │
       ▼
Frontend receives update:
  ├─ Status badge: "FAILED" (red)
  ├─ Error type badge: "TIMEOUT" (orange)
  ├─ Error message: "Scan timed out after 120 minutes"
  └─ "Reset" button appears
```

### User Experience After Timeout

```
┌─────────────────────────────────────────────────────────────────┐
│ Scan Status: scan-789-jkl                           [Refresh]   │
│ ─────────────────────────────────────────────────────────────── │
│                                                                 │
│ Status: ❌ FAILED                                              │
│ Error Type: ⏱️ TIMEOUT                                         │
│ Error: Scan timed out after 7200 seconds (120 minutes)         │
│                                                                 │
│ The scan exceeded the maximum allowed execution time.           │
│ Consider running fewer stages or increasing SCAN_TIMEOUT.       │
│                                                                 │
│ ┌───────────────────────────────────────────────────────────┐  │
│ │ Progress: ████████████████████░░░░░░░░ 82% (9/11)        │  │
│ └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│ Stage Results                                                   │
│ ┌──────────────────────┬──────────┬──────────────────────────┐ │
│ │ 1-9. Various Stages  │ ✅ PASS  │ Completed before timeout │ │
│ │ 10. Nmap Scan        │ 🔵 FAIL  │ Timed out                │ │
│ │ 11. ZAP Scan         │ ⏳ SKIP  │ Not reached              │ │
│ └──────────────────────┴──────────┴──────────────────────────┘ │
│                                                                 │
│ [Reset & Retry]  [Adjust Timeout]                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Force Unlock Flow (Admin)

### Purpose

Force unlock is an **admin-only endpoint** to recover from stuck scans that are:
- In RUNNING state but Jenkins job failed/crashed
- In QUEUED state but Jenkins never started the job
- In CREATED state but Jenkins never acknowledged

### UI Flow (Admin Only)

```
Admin on /scans/scan-789-jkl (scan stuck in RUNNING)
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│ Scan Status: scan-789-jkl                           [Refresh]   │
│ ─────────────────────────────────────────────────────────────── │
│                                                                 │
│ Status: 🔵 RUNNING (stuck for 45 minutes)                      │
│ Jenkins Build: #42 (no updates)                                │
│                                                                 │
│ [Cancel Scan]  [Force Unlock] ⚠️ Admin Only                    │
└─────────────────────────────────────────────────────────────────┘
       │
       │ Admin clicks "Force Unlock"
       ▼
Confirmation dialog:
┌─────────────────────────────────────────────────────┐
│ Force Unlock Scan?                                  │
│                                                     │
│ This will mark the scan as FAILED and allow new     │
│ scans to be triggered. This is an admin operation.   │
│                                                     │
│ The Jenkins job will continue running.              │
│                                                     │
│ [Yes, Force Unlock] [Cancel]                        │
└─────────────────────────────────────────────────────┘
       │
       │ Admin confirms
       ▼
POST /api/v1/scans/scan-789-jkl/force-unlock
Authorization: Bearer eyJ...
X-API-Key: z9y8...
       │
       ▼
Backend: management.py::force_unlock_scan()
       │
       ├─ 1. Find scan by ID
       │     scan_obj = db.query(ScanDB)
       │       .filter(ScanDB.scan_id == "scan-789-jkl")
       │       .first()
       │     └─ If not found → HTTP 404 "Scan not found"
       │
       ├─ 2. Check if scan is active
       │     if scan_obj.state in TERMINAL_STATES:
       │       → HTTP 400 "Cannot unlock scan in COMPLETED state"
       │       # Can only unlock active scans
       │
       ├─ 3. Force-unlock scan
       │     scan_obj.state = ScanState.FAILED
       │     scan_obj.finished_at = datetime.now(utc)
       │     scan_obj.error_message = "Scan unlocked by administrator"
       │     scan_obj.error_type = "ADMIN_RECOVERY"
       │
       ├─ 4. Update project state
       │     project_obj.last_scan_state = "FAILED"
       │
       ├─ 5. Commit to database
       │     db.commit()
       │
       └─ 6. Broadcast WebSocket update
            websocket_manager.send_scan_update(...)
       │
       ▼
Return 200:
{
  "status": "success",
  "message": "Scan scan-789-jkl unlocked successfully",
  "scan_id": "scan-789-jkl"
}
       │
       ▼
Frontend updates:
  ├─ Status badge: "FAILED" (red)
  ├─ Error type: "ADMIN_RECOVERY"
  ├─ Error message: "Scan unlocked by administrator"
  └─ "Reset" button appears
```

### Database State After Force Unlock

```sql
UPDATE scans
SET state = 'FAILED',
    finished_at = '2026-04-13T10:45:00Z',
    error_message = 'Scan unlocked by administrator',
    error_type = 'ADMIN_RECOVERY'
WHERE scan_id = 'scan-789-jkl';

UPDATE projects
SET last_scan_state = 'FAILED'
WHERE project_id = 'abc-123-def';
```

### When to Use Force Unlock

| Scenario | Cancel | Reset | Force Unlock |
|----------|--------|-------|--------------|
| User wants to stop running scan | ✅ Yes | ❌ No | ❌ No |
| Scan failed, want to retry | ❌ No | ✅ Yes | ❌ No |
| Scan stuck (Jenkins crashed) | ❌ No | ❌ No | ✅ Yes |
| Scan in CREATED but Jenkins never started | ❌ No | ❌ No | ✅ Yes |
| Scan in RUNNING but no progress for 30min | ⚠️ Maybe | ❌ No | ✅ Yes |

---

## 5. Error Types Summary

| Error Type | Trigger | User Action | Retry Allowed |
|------------|---------|-------------|---------------|
| **USER_CANCELLED** | User clicks "Cancel Scan" | Reset scan | ✅ Yes |
| **PIPELINE_ERROR** | Jenkins stage failed | Reset scan, view Jenkins console | ✅ Yes |
| **TIMEOUT** | Scan exceeded SCAN_TIMEOUT | Reset, adjust timeout | ✅ Yes |
| **ADMIN_RECOVERY** | Admin force-unlocked | Reset scan | ✅ Yes |
| **SECURITY_ISSUE** | (Future) Critical vulnerabilities found | Review results | N/A |

---

## 6. State Transition Diagram

```
                    ┌─────────────┐
                    │   CREATED   │
                    └──────┬──────┘
                           │
                           │ Trigger Jenkins
                           ▼
                    ┌─────────────┐
                    │   QUEUED    │
                    └──────┬──────┘
                           │
                           │ Jenkins starts build
                           ▼
                    ┌─────────────┐
                    │   RUNNING   │◄────────────────────┐
                    └──────┬──────┘                     │
                           │                            │
            ┌──────────────┼──────────────┐             │
            │              │              │             │
     Cancel │       Timeout│    Force     │             │
      by    │       by     │    Unlock    │             │
     User   │    Backend   │    by Admin  │             │
            │              │              │             │
            ▼              ▼              ▼             │
     ┌──────────┐    ┌──────────┐  ┌──────────┐        │
     │CANCELLED │    │ FAILED   │  │ FAILED   │        │
     │(user)    │    │(timeout) │  │(admin)   │        │
     └──────────┘    └──────────┘  └──────────┘        │
                                                       │
     ┌─────────────────────────────────────────────────┘
     │
     │ Jenkins callback (FAILURE/ABORTED)
     ▼
┌──────────┐
│ FAILED   │
│(jenkins) │
└──────────┘
     │
     │ Reset (retry_count < 10)
     ▼
┌──────────┐
│ CREATED  │  ──→ Back to start
└──────────┘

     ┌─────────────────────────────────────────────────┐
     │
     │ Jenkins callback (SUCCESS)
     ▼
┌──────────┐
│COMPLETED │  (Terminal state, no recovery needed)
└──────────┘
```

---

## 7. Key Files

| Component | File |
|-----------|------|
| **Backend Management** | `backend/app/api/scans/management.py` |
| **Timeout Helpers** | `backend/app/api/scans/helpers.py` |
| **Constants** | `backend/app/api/scans/constants.py` |
| **Scan State Enum** | `backend/app/state/scan_state.py` |
| **Database Model** | `backend/app/models/db_models.py::ScanDB` |
| **Frontend Status** | `src/pages/ScanStatusPage.tsx` |
| **WebSocket Hook** | `src/hooks/useScanWebSocket.ts` |
| **Scan Cancel Hook** | `src/hooks/useScanCancel.ts` |
| **Scan Reset Hook** | `src/hooks/useScanReset.ts` |

---

*Generated: 2026-04-13 | Files: management.py, helpers.py, constants.py*
