# Manual Scan Flow

Complete flow for executing a manual security scan with user-selected stages.

---

## 1. Stage Selection Flow

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
│ └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
       │
       │ User clicks "Run Manual Scan"
       ▼
Navigate to /projects/abc-123-def/manual
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│ ManualScanPage.tsx                                              │
│                                                                 │
│ Manual Scan Configuration                                       │
│ ─────────────────────────────────────────────────────────────── │
│                                                                 │
│ Select Security Stages to Execute                               │
│                                                                 │
│ ┌───────────────────────────────────────────────────────────┐  │
│ │ ☑ Stage 1: Git Checkout                                   │  │
│ │   Clone source repository                                 │  │
│ │                                                           │  │
│ │ ☐ Stage 2: Sonar Scanner                                  │  │
│ │   Static code analysis (SonarQube)                        │  │
│ │                                                           │  │
│ │ ☐ Stage 3: Sonar Quality Gate                             │  │
│ │   Quality gate validation                                 │  │
│ │                                                           │  │
│ │ ☑ Stage 4: NPM / PIP Install                              │  │
│ │   Install project dependencies                            │  │
│ │                                                           │  │
│ │ ☑ Stage 5: Dependency Check                               │  │
│ │   Vulnerability scanning in dependencies (OWASP)          │  │
│ │                                                           │  │
│ │ ☑ Stage 6: Trivy FS Scan                                  │  │
│ │   Filesystem vulnerability scan                           │  │
│ │                                                           │  │
│ │ ☐ Stage 7: Docker Build                                   │  │
│ │   Build Docker image                                      │  │
│ │                                                           │  │
│ │ ☐ Stage 8: Docker Push                                    │  │
│ │   Push image to registry                                  │  │
│ │   ⓘ Requires: Docker Build                                │  │
│ │                                                           │  │
│ │ ☐ Stage 9: Trivy Image Scan                               │  │
│ │   Container image vulnerability scan                      │  │
│ │   ⓘ Requires: Docker Build                                │  │
│ │                                                           │  │
│ │ ☐ Stage 10: Nmap Scan                                     │  │
│ │   Network port scanning                                   │  │
│ │                                                           │  │
│ │ ☑ Stage 11: ZAP Scan                                      │  │
│ │   Web application security scan                           │  │
│ │                                                           │  │
│ │                                                           │  │
│ │ Selected: 5 of 11 stages                                  │  │
│ │ Estimated time: 15-25 minutes                             │  │
│ │                                                           │  │
│ │ [Start Scan] [Cancel]                                     │  │
│ └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Stage Dependencies

The backend validates stage dependencies before allowing scan to proceed:

| Stage | Requires | Validation |
|-------|----------|------------|
| Sonar Quality Gate | Sonar Scanner | If Quality Gate selected without Scanner → Error |
| Docker Push | Docker Build | If Push selected without Build → Error |
| Trivy Image Scan | Docker Build | If Image Scan selected without Build → Error |

**Dependency validation happens on backend** before scan is created.

```python
# backend/app/services/validation.py
VALID_STAGES = {
    "git_checkout", "sonar_scanner", "sonar_quality_gate",
    "npm_pip_install", "dependency_check", "trivy_fs_scan",
    "docker_build", "docker_push", "trivy_image_scan",
    "nmap_scan", "zap_scan"
}

def validate_scan_request(scan: ScanCreate):
    if scan.scan_mode == "manual":
        selected = set(scan.selected_stages)
        
        # Check dependencies
        if "sonar_quality_gate" in selected and "sonar_scanner" not in selected:
            raise ValueError("sonar_quality_gate requires sonar_scanner")
        
        if "docker_push" in selected and "docker_build" not in selected:
            raise ValueError("docker_push requires docker_build")
        
        if "trivy_image_scan" in selected and "docker_build" not in selected:
            raise ValueError("trivy_image_scan requires docker_build")
```

---

## 3. Scan Trigger Flow

### User Clicks "Start Scan"

```
User selects stages:
  ☑ git_checkout
  ☑ npm_pip_install
  ☑ dependency_check
  ☑ trivy_fs_scan
  ☑ zap_scan
       │
       ▼
POST /api/v1/scans
Authorization: Bearer eyJ...
X-API-Key: z9y8...

{
  "project_id": "abc-123-def",
  "scan_mode": "manual",
  "selected_stages": [
    "git_checkout",
    "npm_pip_install",
    "dependency_check",
    "trivy_fs_scan",
    "zap_scan"
  ]
}
       │
       ▼
Backend: scans/triggers.py::trigger_scan()
       │
       ├─ 1. Validate scan request
       │     validate_scan_request(scan)
       │     └─ Check dependencies ✓
       │
       ├─ 2. Check project exists ✓
       │
       ├─ 3. Check no active scan ✓
       │
       ├─ 4. Generate scan ID
       │     scan_id = "scan-456-mno"
       │
       ├─ 5. Calculate timeout
       │     timeout = sum of selected stages:
       │       git_checkout:       300s
       │       npm_pip_install:    600s
       │       dependency_check:   900s
       │       trivy_fs_scan:      600s
       │       zap_scan:          1800s
       │       ───────────────────────
       │       Total:             4200s
       │       Add 20% buffer:    4200 × 1.2 = 5040 seconds
       │
       ├─ 6. Create ScanDB
       │     ScanDB(
       │       scan_id="scan-456-mno",
       │       project_id="abc-123-def",
       │       scan_mode="manual",
       │       selected_stages=[
       │         "git_checkout",
       │         "npm_pip_install",
       │         "dependency_check",
       │         "trivy_fs_scan",
       │         "zap_scan"
       │       ],
       │       state=ScanState.CREATED,
       │       ...
       │     )
       │
       ├─ 7. Update project.last_scan_state = "CREATED"
       │
       ├─ 8. Commit to database
       │
       ├─ 9. Broadcast WebSocket update
       │
       └─ 10. Trigger Celery task
            trigger_jenkins_scan_async.delay(
              scan_id="scan-456-mno",
              scan_mode="manual",
              selected_stages=[
                "git_checkout",
                "npm_pip_install",
                "dependency_check",
                "trivy_fs_scan",
                "zap_scan"
              ],
              project_data={...}
            )
       │
       ▼
Return 201 Created:
{
  "scan_id": "scan-456-mno",
  "project_id": "abc-123-def",
  "scan_mode": "manual",
  "state": "CREATED",
  "selected_stages": [
    "git_checkout",
    "npm_pip_install",
    "dependency_check",
    "trivy_fs_scan",
    "zap_scan"
  ],
  "created_at": "2026-04-13T14:00:00Z",
  ...
}
       │
       ▼
Navigate to /scans/scan-456-mno
```

---

## 4. Jenkins Execution (Manual Mode)

### Jenkinsfile Processing

```groovy
// Parse parameters
PROJECT = readJSON text: params.PROJECT_DATA
SELECTED = readJSON text: params.SELECTED_STAGES
IS_MANUAL = true  // SCAN_MODE == "MANUAL"

// SELECTED = ["git_checkout", "npm_pip_install", "dependency_check",
//             "trivy_fs_scan", "zap_scan"]
```

### Stage Execution Logic

```groovy
def shouldRun(stageName) {
    if (IS_MANUAL == false) {
        return true  // AUTOMATED: run all stages
    }
    return SELECTED.contains(stageName)  // MANUAL: run only selected
}
```

### Stage Execution Results

| Stage | shouldRun() | Status |
|-------|-------------|--------|
| 1. Git Checkout | SELECTED.contains("git_checkout") → **true** | ✅ EXECUTES |
| 2. Sonar Scanner | SELECTED.contains("sonar_scanner") → **false** | ⏭️ SKIPPED |
| 3. Sonar Quality Gate | SELECTED.contains("sonar_quality_gate") → **false** | ⏭️ SKIPPED |
| 4. NPM/PIP Install | SELECTED.contains("npm_pip_install") → **true** | ✅ EXECUTES |
| 5. Dependency Check | SELECTED.contains("dependency_check") → **true** | ✅ EXECUTES |
| 6. Trivy FS Scan | SELECTED.contains("trivy_fs_scan") → **true** | ✅ EXECUTES |
| 7. Docker Build | SELECTED.contains("docker_build") → **false** | ⏭️ SKIPPED |
| 8. Docker Push | SELECTED.contains("docker_push") → **false** | ⏭️ SKIPPED |
| 9. Trivy Image Scan | SELECTED.contains("trivy_image_scan") → **false** | ⏭️ SKIPPED |
| 10. Nmap Scan | SELECTED.contains("nmap_scan") → **false** | ⏭️ SKIPPED |
| 11. ZAP Scan | SELECTED.contains("zap_scan") → **true** | ✅ EXECUTES |

**Result**: 5 stages execute, 6 stages skipped

---

## 5. Progress Calculation

### Manual vs Automated Progress

**Automated Scan** (all 11 stages):
```
Progress = completed_stages / 11
```

**Manual Scan** (selected stages only):
```
Progress = completed_stages / selected_stages.length
```

### Example

```
User selected 5 stages:
  [git_checkout, npm_pip_install, dependency_check, trivy_fs_scan, zap_scan]

Progress calculation:
  After git_checkout:      1/5 = 20%
  After npm_pip_install:   2/5 = 40%
  After dependency_check:  3/5 = 60%
  After trivy_fs_scan:     4/5 = 80%
  After zap_scan:          5/5 = 100% ✅ COMPLETED
```

**Important**: Progress bar uses `selected_stages.length` as denominator, not 11.

---

## 6. Jenkins Callback (Manual)

### Callback Payload

```json
{
  "status": "SUCCESS",
  "build_number": 43,
  "scan_id": "scan-456-mno",
  "scan_mode": "MANUAL",
  "stages": [
    {
      "stage": "git_checkout",
      "status": "PASS",
      "summary": "Git checkout successful",
      "timestamp": "2026-04-13T14:01:00Z"
    },
    {
      "stage": "npm_pip_install",
      "status": "PASS",
      "summary": "Dependencies installed",
      "timestamp": "2026-04-13T14:04:00Z"
    },
    {
      "stage": "dependency_check",
      "status": "PASS",
      "summary": "Dependency check completed",
      "timestamp": "2026-04-13T14:12:00Z"
    },
    {
      "stage": "trivy_fs_scan",
      "status": "PASS",
      "summary": "Trivy FS scan completed",
      "timestamp": "2026-04-13T14:16:00Z"
    },
    {
      "stage": "zap_scan",
      "status": "PASS",
      "summary": "ZAP scan completed",
      "timestamp": "2026-04-13T14:20:00Z"
    }
  ],
  "finished_at": "2026-04-13T14:20:00Z",
  "error_message": null,
  "error_type": null,
  "jenkins_console_url": "http://localhost:8080/job/Security-pipeline/43/console"
}
```

**Note**: Only 5 stages in callback (the ones that executed)

---

## 7. Backend Processing (Same as Automated)

```
POST /api/v1/scans/scan-456-mno/callback
       │
       ├─ 1. Validate callback token ✓
       ├─ 2. Check replay attack (SHA-256 digest) ✓
       ├─ 3. Check terminal state ✓
       ├─ 4. Normalize stages (5 stages) ✓
       ├─ 5. Update scan state: COMPLETED ✓
       ├─ 6. Update project state: "COMPLETED" ✓
       ├─ 7. Commit to database ✓
       └─ 8. Broadcast WebSocket update ✓
```

---

## 8. Frontend Display

### ScanStatusPage.tsx

```
┌─────────────────────────────────────────────────────────────────┐
│ Scan Status: scan-456-mno                           [Refresh]   │
│ ─────────────────────────────────────────────────────────────── │
│                                                                 │
│ Status: ✅ COMPLETED                                           │
│ Mode: Manual                                                   │
│ Duration: 20 minutes                                           │
│ Jenkins Build: #43                                             │
│ Stages: 5 of 5 selected                                        │
│                                                                 │
│ ┌───────────────────────────────────────────────────────────┐  │
│ │ Progress: ████████████████████ 100% (5/5)                 │  │
│ └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│ Stage Results                                                   │
│ ┌──────────────────────┬──────────┬──────────────────────────┐ │
│ │ Stage                │ Status   │ Summary                  │ │
│ ├──────────────────────┼──────────┼──────────────────────────┤ │
│ │ 1. Git Checkout      │ ✅ PASS  │ Git checkout successful  │ │
│ │ 2. Sonar Scanner     │ ⏭️ SKIP  │ Not selected             │ │
│ │ 3. Sonar Quality Gt  │ ⏭️ SKIP  │ Not selected             │ │
│ │ 4. NPM/PIP Install   │ ✅ PASS  │ Dependencies installed   │ │
│ │ 5. Dependency Check  │ ✅ PASS  │ Dep check completed      │ │
│ │ 6. Trivy FS Scan     │ ✅ PASS  │ Trivy FS scan completed  │ │
│ │ 7. Docker Build      │ ⏭️ SKIP  │ Not selected             │ │
│ │ 8. Docker Push       │ ⏭️ SKIP  │ Not selected             │ │
│ │ 9. Trivy Image Scan  │ ⏭️ SKIP  │ Not selected             │ │
│ │ 10. Nmap Scan        │ ⏭️ SKIP  │ Not selected             │ │
│ │ 11. ZAP Scan         │ ✅ PASS  │ ZAP scan completed       │ │
│ └──────────────────────┴──────────┴──────────────────────────┘ │
│                                                                 │
│ [View in Jenkins]  [View Reports]  [Run Again]                 │
└─────────────────────────────────────────────────────────────────┘
```

**Visual Indicators:**
- ✅ Green badge: Stage executed and passed
- ⏭️ Gray badge: Stage not selected (manual mode)
- ❌ Red badge: Stage executed but failed
- ⚠️ Yellow badge: Stage executed with warnings

---

## 9. Key Differences: Manual vs Automated

| Aspect | Automated | Manual |
|--------|-----------|--------|
| **scan_mode** | `"automated"` | `"manual"` |
| **selected_stages** | `[]` (empty) | `["stage1", "stage2", ...]` |
| **Jenkins SCAN_MODE** | `"AUTOMATED"` | `"MANUAL"` |
| **Jenkins SELECTED** | `[]` | `["stage1", "stage2", ...]` |
| **IS_MANUAL** | `false` | `true` |
| **shouldRun()** | Always `true` | `SELECTED.contains(stageName)` |
| **Stages executed** | All 11 | Only selected |
| **Progress denominator** | 11 | `selected_stages.length` |
| **Timeout calculation** | Sum of all stages + 20% | Sum of selected + 20% |
| **Callback stages** | 11 stages | N stages (selected only) |

---

## 10. Timing Comparison

| Scan Type | Selected Stages | Estimated Time | Timeout |
|-----------|----------------|----------------|---------|
| **Automated** | All 11 | 30-52 min | 10080s (2.8h) |
| **Manual** | 5 stages | 15-25 min | 5040s (1.4h) |
| **Manual** | 3 stages | 10-15 min | 3240s (54min) |
| **Manual** | 1 stage | 2-5 min | 720s (12min) |

---

## 11. Key Files

| Component | File |
|-----------|------|
| **Frontend UI** | `src/pages/ManualScanPage.tsx` |
| **Backend Validation** | `backend/app/services/validation.py` |
| **Backend Trigger** | `backend/app/api/scans/triggers.py` |
| **Jenkins Pipeline** | `Agent/Jenkinsfile` (shouldRun function) |
| **Constants** | `backend/app/api/scans/constants.py` |
| **Helpers** | `backend/app/api/scans/helpers.py` (calculate_scan_timeout) |

---

*Generated: 2026-04-13 | Files: ManualScanPage.tsx, validation.py, triggers.py, Jenkinsfile*
