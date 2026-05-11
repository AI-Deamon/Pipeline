# Scan History Flow

Complete flow for viewing and managing scan history.

---

## 1. View Project Scan History

### UI Flow

```
User on /projects/abc-123-def
       │
       ▼
┌────────────────────────────────────────────────────────────┐
│ ProjectControlPage.tsx                                     │
│                                                            │
│ My Application                                 [Edit]      │
│ ─────────────────────────────────────────────────────────  │
│ Last Scan: COMPLETED                                       │
│                                                            │
│ Actions                                                    │
│ ┌──────────────────────────────────────────────────────┐  │
│ │ [Run Automated Scan]  [Run Manual Scan]              │  │
│ │ [View Scan History]                                  │  │
│ │ [Delete Project]                                     │  │
│ └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
       │
       │ User clicks "View Scan History"
       ▼
Navigate to /projects/abc-123-def/history
       │
       ▼
Frontend: GET /api/v1/projects/abc-123-def/scans
Authorization: Bearer eyJ...
X-API-Key: z9y8...
       │
       ▼
Backend: (projects.py or scans/results.py)
       │
       ├─ 1. Query project scan history
       │     scans = db.query(ScanDB)
       │       .filter(ScanDB.project_id == "abc-123-def")
       │       .order_by(ScanDB.created_at.desc())
       │       .all()
       │
       └─ 2. Return array of scan summaries
            [
              {
                "scan_id": "scan-456-ghi",
                "project_id": "abc-123-def",
                "scan_mode": "automated",
                "state": "COMPLETED",
                "selected_stages": [],
                "created_at": "2026-04-13T10:00:00Z",
                "started_at": "2026-04-13T10:00:30Z",
                "finished_at": "2026-04-13T10:36:00Z",
                "jenkins_build_number": "42",
                "jenkins_queue_id": null,
                "stage_results": [
                  { "stage": "git_checkout", "status": "PASS", ... },
                  ...
                ],
                "error_message": null,
                "error_type": null,
                "jenkins_console_url": null,
                "retry_count": 0
              },
              {
                "scan_id": "scan-123-abc",
                "project_id": "abc-123-def",
                "scan_mode": "manual",
                "state": "FAILED",
                "selected_stages": ["git_checkout", "sonar_scanner"],
                "created_at": "2026-04-12T15:00:00Z",
                "started_at": "2026-04-12T15:00:15Z",
                "finished_at": "2026-04-12T15:05:30Z",
                "jenkins_build_number": "41",
                "jenkins_queue_id": "40",
                "stage_results": [...],
                "error_message": "Pipeline failed at stage: sonar_scanner",
                "error_type": "PIPELINE_ERROR",
                "jenkins_console_url": "http://localhost:8080/job/.../41/console",
                "retry_count": 1
              },
              ...
            ]
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│ ScanHistoryPage.tsx                                             │
│                                                                 │
│ My Application - Scan History                          [Back]   │
│ ─────────────────────────────────────────────────────────────── │
│                                                                 │
│ ┌───────────────────────────────────────────────────────────┐  │
│ │ Scan History                                              │  │
│ │                                                           │  │
│ │ ┌──────────┬────────┬──────────┬──────────┬───────────┐  │  │
│ │ │ Scan ID  │ Status │ Mode     │ Date     │ Actions   │  │  │
│ │ ├──────────┼────────┼──────────┼──────────┼───────────┤  │  │
│ │ │ scan-456 │ ✅ PASS│ automated│ Apr 13   │ [→] [🔄] │  │  │
│ │ │          │        │          │ 10:36    │           │  │  │
│ │ ├──────────┼────────┼──────────┼──────────┼───────────┤  │  │
│ │ │ scan-123 │ ❌ FAIL│ manual   │ Apr 12   │ [→] [🔄] │  │  │
│ │ │          │        │          │ 15:05    │           │  │  │
│ │ ├──────────┼────────┼──────────┼──────────┼───────────┤  │  │
│ │ │ scan-789 │ ⚠️ WARN│ automated│ Apr 11   │ [→] [🔄] │  │  │
│ │ │          │        │          │ 09:30    │           │  │  │
│ │ ├──────────┼────────┼──────────┼──────────┼───────────┤  │  │
│ │ │ scan-234 │ ⏱️TIME │ automated│ Apr 10   │ [→] [🔄] │  │  │
│ │ │          │        │          │ 14:20    │           │  │  │
│ │ ├──────────┼────────┼──────────┼──────────┼───────────┤  │  │
│ │ │ scan-567 │ 🚫CNCL │ manual   │ Apr 09   │ [→]      │  │  │
│ │ │          │        │          │ 11:15    │           │  │  │
│ │ └──────────┴────────┴──────────┴──────────┴───────────┘  │  │
│ │                                                           │  │
│ │ Total Scans: 5                                            │  │
│ │ Success Rate: 40% (2/5)                                   │  │
│ │ Avg Duration: 28 minutes                                  │  │
│ └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Scan History Table Columns

| Column | Description | Example |
|--------|-------------|---------|
| **Scan ID** | Short UUID (first 8 chars) | `scan-456` |
| **Status** | Color-coded badge | ✅ PASS, ❌ FAIL, ⚠️ WARN, ⏱️ TIME, 🚫 CNCL |
| **Mode** | Scan execution mode | `automated` or `manual` |
| **Date** | Finished timestamp | `Apr 13 10:36` |
| **Actions** | Quick actions | `[→]` View details, `[🔄]` Retry |

---

## 3. Click-Through to Scan Details

```
User clicks scan row (scan-456)
       │
       ▼
Navigate to /scans/scan-456-ghi
       │
       ▼
ScanStatusPage.tsx loads (same as real-time monitoring)
       │
       ▼
Frontend: GET /api/v1/scans/scan-456-ghi
       │
       ▼
Backend: GET single scan endpoint
  ├─ Query ScanDB by scan_id
  ├─ Return full scan details
  └─ Response: ScanResponse object
       │
       ▼
Display completed scan results:
┌─────────────────────────────────────────────────────────────────┐
│ Scan Status: scan-456-ghi                           [Refresh]   │
│ ─────────────────────────────────────────────────────────────── │
│                                                                 │
│ Status: ✅ COMPLETED                                           │
│ Mode: Automated                                                │
│ Duration: 36 minutes                                           │
│ Jenkins Build: #42                                             │
│ Created: 2026-04-13 10:00:00 UTC                               │
│ Finished: 2026-04-13 10:36:00 UTC                              │
│                                                                 │
│ ┌───────────────────────────────────────────────────────────┐  │
│ │ Progress: ████████████████████████████████ 100% (11/11)   │  │
│ └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│ Stage Results                                                   │
│ ┌──────────────────────┬──────────┬──────────────────────────┐ │
│ │ Stage                │ Status   │ Summary                  │ │
│ ├──────────────────────┼──────────┼──────────────────────────┤ │
│ │ 1. Git Checkout      │ ✅ PASS  │ Git checkout successful  │ │
│ │ 2. Sonar Scanner     │ ✅ PASS  │ Sonar scan completed     │ │
│ │ ...                  │ ...      │ ...                      │ │
│ │ 11. ZAP Scan         │ ✅ PASS  │ ZAP scan completed       │ │
│ └──────────────────────┴──────────┴──────────────────────────┘ │
│                                                                 │
│ [View in Jenkins]  [View Reports]  [Run Again]                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Retry Quick Action (Failed Scans)

```
User on Scan History page
       │
       ▼
Clicks [🔄] on failed scan row
       │
       ▼
Confirmation dialog:
┌─────────────────────────────────────────────────────┐
│ Retry Failed Scan?                                  │
│                                                     │
│ This will reset scan scan-123-abc and trigger       │
│ a new scan with the same configuration.             │
│                                                     │
│ Mode: manual                                        │
│ Stages: git_checkout, sonar_scanner                 │
│ Retry count: 1/10                                   │
│                                                     │
│ [Retry] [Cancel]                                    │
└─────────────────────────────────────────────────────┘
       │
       │ User confirms
       ▼
POST /api/v1/scans/scan-123-abc/reset
       │
       ▼
Backend resets scan (same as reset flow)
  ├─ state = CREATED
  ├─ retry_count = 2
  ├─ Clear errors, stage_results, callback_digests
  └─ Commit to DB
       │
       ▼
After reset, trigger new scan automatically:
POST /api/v1/scans
  {
    "project_id": "abc-123-def",
    "scan_mode": "manual",
    "selected_stages": ["git_checkout", "sonar_scanner"]
  }
       │
       ▼
New scan created: scan-999-xyz
       │
       ▼
Navigate to /scans/scan-999-xyz (real-time monitoring)
```

---

## 5. Statistics Calculation

### Frontend Statistics

```typescript
// ScanHistoryPage.tsx

const scans = response.data;  // Array of ScanResponse

const totalScans = scans.length;
const completedScans = scans.filter(s => s.state === 'COMPLETED').length;
const failedScans = scans.filter(s => s.state === 'FAILED').length;
const cancelledScans = scans.filter(s => s.state === 'CANCELLED').length;

const successRate = totalScans > 0 
  ? (completedScans / totalScans * 100).toFixed(0) 
  : 0;

const avgDuration = scans
  .filter(s => s.started_at && s.finished_at)
  .map(s => {
    const start = new Date(s.started_at);
    const end = new Date(s.finished_at);
    return (end.getTime() - start.getTime()) / 1000 / 60;  // minutes
  })
  .reduce((sum, dur) => sum + dur, 0) / totalScans;

// Display:
// Total Scans: 5
// Success Rate: 40% (2/5)
// Avg Duration: 28 minutes
```

---

## 6. Filtering and Sorting (Future Enhancement)

### Proposed Filters

```
┌────────────────────────────────────────────────────────────┐
│ Filters                                                    │
│ ┌────────────┬────────────┬────────────┬────────────────┐ │
│ │ Status:    │ Mode:      │ Date:      │ [Apply]        │ │
│ │ [All ▼]    │ [All ▼]    │ [30d ▼]    │ [Clear]        │ │
│ └────────────┴────────────┴────────────┴────────────────┘ │
│                                                          │
│ Status options: All, PASS, FAIL, WARN, CANCELLED, TIMEOUT │
│ Mode options: All, Automated, Manual                      │
│ Date options: 7 days, 30 days, 90 days, All time          │
└────────────────────────────────────────────────────────────┘
```

### Backend Query with Filters

```python
@router.get("/projects/{project_id}/scans")
def get_scan_history(
    project_id: str,
    status: str = Query(None),
    mode: str = Query(None),
    days: int = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(ScanDB).filter(ScanDB.project_id == project_id)
    
    if status:
        query = query.filter(ScanDB.state == status)
    
    if mode:
        query = query.filter(ScanDB.scan_mode == mode)
    
    if days:
        cutoff = datetime.now(utc) - timedelta(days=days)
        query = query.filter(ScanDB.created_at >= cutoff)
    
    scans = query.order_by(ScanDB.created_at.desc()).all()
    return [scan_to_response(s) for s in scans]
```

---

## 7. Pagination (Future Enhancement)

For projects with many scans, pagination will be needed:

```
GET /api/v1/projects/abc-123-def/scans?page=1&limit=20

Response:
{
  "scans": [...],  // 20 scan objects
  "total": 156,
  "page": 1,
  "limit": 20,
  "pages": 8
}
```

---

## 8. Export Scan History (Future Enhancement)

```
┌────────────────────────────────────┐
│ [Export CSV]  [Export JSON]       │
└────────────────────────────────────┘
```

### CSV Export

```csv
scan_id,state,mode,created_at,finished_at,duration_minutes,jenkins_build,error_type
scan-456,COMPLETED,automated,2026-04-13T10:00:00Z,2026-04-13T10:36:00Z,36,42,
scan-123,FAILED,manual,2026-04-12T15:00:00Z,2026-04-12T15:05:30Z,5,41,PIPELINE_ERROR
scan-789,COMPLETED,automated,2026-04-11T09:00:00Z,2026-04-11T09:28:00Z,28,40,
```

---

## 9. Key Files

| Component | File |
|-----------|------|
| **Frontend UI** | `src/pages/ScanHistoryPage.tsx` |
| **Backend Endpoint** | `backend/app/api/projects.py` or `scans/results.py` |
| **API Client** | `src/services/api.ts` (getScanHistory) |
| **Database Model** | `backend/app/models/db_models.py::ScanDB` |
| **Scan Schema** | `backend/app/schemas/scan.py` |
| **Helper Functions** | `backend/app/api/scans/helpers.py` |

---

## 10. Database Query

```sql
-- Get all scans for a project, ordered by date (newest first)
SELECT 
  scan_id,
  project_id,
  scan_mode,
  state,
  selected_stages,
  created_at,
  started_at,
  finished_at,
  jenkins_build_number,
  jenkins_queue_id,
  stage_results,
  error_message,
  error_type,
  jenkins_console_url,
  retry_count
FROM scans
WHERE project_id = 'abc-123-def'
ORDER BY created_at DESC;

-- Count scans by status
SELECT state, COUNT(*) as count
FROM scans
WHERE project_id = 'abc-123-def'
GROUP BY state;

-- Result:
-- state      | count
-- COMPLETED  | 2
-- FAILED     | 2
-- CANCELLED  | 1
```

---

*Generated: 2026-04-13 | Files: ScanHistoryPage.tsx, projects.py, api.ts*
