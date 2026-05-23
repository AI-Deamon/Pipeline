# Automated Scan Flow - Complete Pipeline Documentation

## Overview

This document explains the **end-to-end automated scan flow** in the DevSecOps platform, from triggering a scan to viewing results in the dashboard.

---

## Architecture Diagram

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Frontend  │────▶│    Backend    │────▶│   Jenkins   │
│  (React UI) │     │  (FastAPI)    │     │  (Pipeline) │
└─────────────┘     └──────────────┘     └─────────────┘
       ▲                    │                    │
       │                    │                    │
       │                    ▼                    │
       │            ┌──────────────┐             │
       │            │  PostgreSQL  │             │
       │            │   Database   │             │
       │            └──────────────┘             │
       │                                         │
       └─────────────────────────────────────────┘
                    (Callback with results)
```

---

## Complete Flow (11 Stages)

### Phase 1: Scan Trigger

#### Step 1: User Initiates Scan (Frontend)

**Location:** `src/pages/ProjectControlPage.tsx`

```typescript
// User clicks "Run Automated Scan" button
const handleRunAutomated = async () => {
  await api.scans.trigger({
    project_id: projectId,
    scan_mode: 'AUTOMATED',  // vs 'MANUAL'
  });
};
```

**What happens:**
1. User clicks "Run Automated Scan" button
2. Frontend validates project has required fields (git_url, credentials, etc.)
3. Frontend calls `POST /api/v1/scans` endpoint
4. Button shows loading spinner, disables to prevent double-click

---

#### Step 2: Backend Creates Scan Record

**Location:** `backend/app/api/scans.py` - `trigger_scan` endpoint

```python
@router.post("/scans", status_code=201)
async def trigger_scan(scan_data: ScanCreate, current_user: User = Depends(get_current_user)):
    # 1. Validate project exists and is not already scanning
    project = await get_project_or_404(scan_data.project_id)
    if project.last_scan_state in ACTIVE_STATES:
        raise HTTPException(409, "Scan already in progress")
    
    # 2. Create scan record in database
    scan = ScanDB(
        scan_id=str(uuid4()),
        project_id=project.project_id,
        scan_mode=scan_data.scan_mode,
        state=ScanState.CREATED,  # ← Initial state (not RUNNING!)
        created_by=current_user.user_id,
    )
    db.add(scan)
    db.commit()
    
    # 3. Trigger Jenkins pipeline asynchronously
    await jenkins_service.trigger_jenkins_scan_async(scan)
    
    return scan
```

**What happens:**
1. Validates project exists
2. Checks no active scan is running (prevents duplicates)
3. Creates scan record with `state=CREATED` (not RUNNING - this was a critical fix!)
4. Calls Jenkins service to start pipeline
5. Returns scan object to frontend

---

#### Step 3: Backend Calls Jenkins API

**Location:** `backend/app/services/jenkins_service.py`

```python
async def trigger_jenkins_scan_async(self, scan: ScanDB):
    # Build Jenkins API payload
    payload = {
        "SCAN_ID": scan.scan_id,
        "SCAN_MODE": scan.scan_mode.upper(),  # "AUTOMATED"
        "PROJECT_DATA": json.dumps({
            "project_id": scan.project.project_id,
            "name": scan.project.name,
            "git_url": scan.project.git_url,
            "branch": scan.project.branch,
            "credentials_id": scan.project.credentials_id,
            "sonar_key": scan.project.sonar_key,
            "target_ip": scan.project.target_ip,
            "target_url": scan.project.target_url,
        }),
        "SELECTED_STAGES": json.dumps(scan.selected_stages or []),
        "SCAN_TIMEOUT": str(scan.project.scan_timeout or 7200),
    }
    
    # Trigger Jenkins pipeline via REST API
    jenkins_url = f"{settings.JENKINS_BASE_URL}/job/{settings.JENKINS_JOB_NAME}/buildWithParameters"
    response = await httpx.post(jenkins_url, params=payload, auth=jenkins_auth)
    
    # Update scan state to QUEUED
    scan.state = ScanState.QUEUED
    db.commit()
```

**What happens:**
1. Builds payload with all project data
2. Calls Jenkins REST API to start pipeline
3. Updates scan state to `QUEUED`
4. Jenkins pipeline starts executing

---

### Phase 2: Jenkins Pipeline Execution

#### Step 4: Jenkins Pipeline Starts

**Location:** `Jenkinsfile`

```groovy
pipeline {
    agent any
    
    parameters {
        string(name: 'SCAN_ID', defaultValue: '')
        choice(name: 'SCAN_MODE', choices: ['AUTOMATED', 'MANUAL'])
        text(name: 'PROJECT_DATA', defaultValue: '{}')
        text(name: 'SELECTED_STAGES', defaultValue: '[]')
        text(name: 'SCAN_TIMEOUT', defaultValue: '7200')
    }
    
    stages {
        // ... 11 stages execute here ...
    }
    
    post {
        always {
            // Send callback to backend with results
            sendCallback()
        }
    }
}
```

**What happens:**
1. Jenkins receives parameters from backend
2. Initializes pipeline globals (`STAGES_RESULTS`, `PROJECT`, etc.)
3. Starts executing stages in order
4. Each stage calls `recordStage()` to track results

---

#### Step 5: Stage Execution (11 Stages)

### Stage 1: Git Checkout ✅

```groovy
stage('1. Git Checkout') {
    steps {
        script {
            checkout([
                $class: 'GitSCM',
                branches: [[name: PROJECT.branch ?: 'main']],
                userRemoteConfigs: [[
                    url: PROJECT.git_url,
                    credentialsId: PROJECT.credentials_id ?: 'github-credentials'
                ]]
            ])
            recordStage('git_checkout', 'PASS', 'Git checkout successful')
        }
    }
}
```

**What it does:**
- Clones the target Git repository
- Uses configured credentials (GitHub, GitLab, Bitbucket, etc.)
- Checks out the specified branch

**Backend receives:**
```json
{
  "stage": "git_checkout",
  "status": "PASS",
  "summary": "Git checkout successful",
  "timestamp": "2026-03-17T12:00:00Z"
}
```

---

### Stage 2: Sonar Scanner ✅

```groovy
stage('2. Sonar Scanner') {
    when { expression { shouldRun('sonar_scanner') } }
    steps {
        timeout(time: 15, unit: 'MINUTES') {
            script {
                def scannerHome = tool 'sonar-scanner'
                try {
                    withSonarQubeEnv('sonar-server') {
                        sh """
                            ${scannerHome}/bin/sonar-scanner \
                              -Dsonar.projectKey=${PROJECT.sonar_key ?: params.SCAN_ID} \
                              -Dsonar.sources=. \
                              -Dsonar.projectName=${PROJECT.project_name ?: params.SCAN_ID}
                        """
                    }
                    recordStage('sonar_scanner', 'PASS', 'Sonar scan completed')
                } catch (Exception e) {
                    echo "⚠️  SonarQube failed: ${e.message}"
                    recordStage('sonar_scanner', 'WARN', "SonarQube failed: ${e.message}")
                }
            }
        }
    }
}
```

**What it does:**
- Runs SonarQube static code analysis
- Scans for code smells, bugs, security vulnerabilities
- 15-minute timeout prevents hanging

**Status values:**
- `PASS` - Analysis completed successfully
- `WARN` - Analysis failed but pipeline continues (non-blocking)

---

### Stage 3: Sonar Quality Gate ⏭️

```groovy
stage('3. Sonar Quality Gate') {
    when { expression { shouldRun('sonar_quality_gate') } }
    steps {
        echo "⏭️  Skipping SonarQube Quality Gate check"
        recordStage('sonar_quality_gate', 'SKIPPED', 'Quality Gate check skipped')
    }
}
```

**What it does:**
- Currently skipped (by design)
- Would check if SonarQube quality gate passes
- Skipped to avoid blocking pipeline on code quality thresholds

**Status:** Always `SKIPPED`

---

### Stage 4: NPM / PIP Install 📦

```groovy
stage('4. NPM / PIP Install') {
    when { expression { shouldRun('npm_pip_install') } }
    steps {
        timeout(time: 10, unit: 'MINUTES') {
            script {
                // Auto-detect package.json location
                def npmDir = sh(
                    script: "find . -name 'package.json' -type f | head -1",
                    returnStdout: true
                ).trim()
                
                if (npmDir) {
                    dir(npmDir.replaceAll('/package.json', '')) {
                        sh 'npm ci'
                    }
                }
                
                // Auto-detect requirements.txt location
                def pipDir = sh(
                    script: "find . -name 'requirements.txt' -type f | head -1",
                    returnStdout: true
                ).trim()
                
                if (pipDir) {
                    dir(pipDir.replaceAll('/requirements.txt', '')) {
                        sh 'pip install -r requirements.txt'
                    }
                }
            }
        }
        recordStage('npm_pip_install', 'PASS', 'Dependencies installed')
    }
}
```

**What it does:**
- **Auto-detects** `package.json` for Node.js projects
- **Auto-detects** `requirements.txt` for Python projects
- Runs `npm ci` (clean install from lockfile)
- Runs `pip install -r requirements.txt`
- 10-minute timeout

**Key feature:** Works for any project structure - doesn't assume root-level manifests!

---

### Stage 5: Dependency Check 🔒

```groovy
stage('5. Dependency Check') {
    when { expression { shouldRun('dependency_check') } }
    steps {
        dependencyCheck additionalArguments: """
            --project ${params.SCAN_ID}
            --scan .
            --format JSON
            --format HTML
            --out ${env.REPORT_DIR}
            --enableExperimental
        """, odcInstallation: 'OWasp'
        recordStage('dependency_check', 'PASS', 'Dependency check completed')
    }
}
```

**What it does:**
- Runs OWASP Dependency-Check
- Scans for known vulnerabilities in dependencies (CVE database)
- Generates JSON and HTML reports
- Checks both npm and pip dependencies

**Output:** `reports/dependency-check-report.json`, `dependency-check-report.html`

---

### Stage 6: Trivy FS Scan 🛡️

```groovy
stage('6. Trivy FS Scan') {
    when { expression { shouldRun('trivy_fs_scan') } }
    steps {
        sh """
            /home/kali_linux/.local/bin/trivy fs --format json \
              -o ${env.REPORT_DIR}/trivy-fs.json . || true
        """
        recordStage('trivy_fs_scan', 'PASS', 'Trivy FS scan completed')
    }
}
```

**What it does:**
- Runs Trivy filesystem scanner
- Scans source code for secrets, misconfigurations, vulnerabilities
- Checks for exposed API keys, passwords, tokens
- Generates JSON report

**Output:** `reports/trivy-fs.json`

---

### Stage 7: Docker Build 🐳

```groovy
stage('7. Docker Build') {
    when { expression { shouldRun('docker_build') } }
    steps {
        script {
            // Auto-detect Dockerfile location
            def dockerfile = ''
            def context = '.'
            
            def locations = [
                [file: 'Dockerfile', context: '.'],
                [file: 'docker/Dockerfile', context: '.'],
                [file: 'backend/Dockerfile', context: 'backend'],
                [file: 'frontend/Dockerfile', context: 'frontend'],
                [file: 'api/Dockerfile', context: 'api'],
                [file: 'app/Dockerfile', context: 'app'],
                [file: 'server/Dockerfile', context: 'server'],
                [file: 'web/Dockerfile', context: 'web'],
            ]
            
            for (loc in locations) {
                if (fileExists(loc.file)) {
                    dockerfile = loc.file
                    context = loc.context
                    echo "✓ Using ${dockerfile} (context: ${context})"
                    break
                }
            }
            
            // Fallback to find command
            if (!dockerfile) {
                def output = sh(
                    script: "find . -name 'Dockerfile*' -type f | head -1",
                    returnStdout: true
                ).trim()
                if (output) {
                    dockerfile = output
                    context = output.contains('/') ? 
                        output.substring(0, output.lastIndexOf('/')) : '.'
                }
            }
            
            // Build or skip
            if (dockerfile) {
                IMAGE_TAG = "${PROJECT.project_id ?: 'scan'}:${params.SCAN_ID}"
                sh "docker build -t ${IMAGE_TAG} -f ${dockerfile} ${context}"
                recordStage('docker_build', 'PASS', 'Built from ${dockerfile}')
            } else {
                echo "⚠️  No Dockerfile found - skipping Docker build"
                recordStage('docker_build', 'SKIPPED', 'No Dockerfile found')
            }
        }
    }
}
```

**What it does:**
- **Auto-detects Dockerfile** in 8 common locations
- Builds Docker image with tag `project_id:scan_id`
- Skips gracefully if no Dockerfile found
- Stores `IMAGE_TAG` for Push and Trivy Image stages

**Key feature:** Works for `docker/Dockerfile`, `backend/Dockerfile`, etc.!

---

### Stage 8: Docker Push 📤

```groovy
stage('8. Docker Push') {
    when { expression { shouldRun('docker_push') } }
    steps {
        withCredentials([usernamePassword(credentialsId: 'docker-credentials',
                                          usernameVariable: 'DOCKER_USER',
                                          passwordVariable: 'DOCKER_PASS')]) {
            sh """
                echo "${DOCKER_PASS}" | \
                docker login -u "${DOCKER_USER}" --password-stdin || true
                docker push ${IMAGE_TAG} || true
            """
            recordStage('docker_push', 'PASS', 'Docker image pushed')
        }
    }
}
```

**What it does:**
- Logs into Docker registry (Docker Hub, ECR, GCR, etc.)
- Pushes built image to registry
- Uses Jenkins credentials for authentication
- Continues even if push fails (non-blocking)

---

### Stage 9: Trivy Image Scan 🛡️

```groovy
stage('9. Trivy Image Scan') {
    when { expression { shouldRun('trivy_image_scan') } }
    steps {
        sh """
            /home/kali_linux/.local/bin/trivy image --format json \
              -o ${env.REPORT_DIR}/trivy-image.json ${IMAGE_TAG} || true
        """
        recordStage('trivy_image_scan', 'PASS', 'Trivy image scan completed')
    }
}
```

**What it does:**
- Scans built Docker image for vulnerabilities
- Checks OS packages (Alpine, Debian, Ubuntu, etc.)
- Checks application dependencies
- Generates JSON report

**Output:** `reports/trivy-image.json`

---

### Stage 10: Nmap Scan 🌐

```groovy
stage('10. Nmap Scan') {
    when { expression { shouldRun('nmap_scan') } }
    steps {
        script {
            if (!PROJECT.target_ip) {
                if (IS_MANUAL) {
                    error("target_ip required for manual Nmap scan")
                }
                echo "SKIP: No target_ip provided"
                return
            }
            sh """
                nmap -sV -sC -oX ${env.REPORT_DIR}/nmap.xml ${PROJECT.target_ip} || true
            """
            recordStage('nmap_scan', 'PASS', 'Nmap scan completed')
        }
    }
}
```

**What it does:**
- Runs Nmap network scan against target IP
- `-sV` - Detect service versions
- `-sC` - Run default scripts
- Outputs XML report
- **Skipped if no `target_ip` provided** (automated mode only)

**Output:** `reports/nmap.xml`

---

### Stage 11: ZAP Scan 🕷️

```groovy
stage('11. ZAP Scan') {
    when { expression { shouldRun('zap_scan') } }
    steps {
        script {
            if (!PROJECT.target_url) {
                if (IS_MANUAL) {
                    error("target_url required for manual ZAP scan")
                }
                echo "SKIP: No target_url provided"
                return
            }
            sh """
                zap-baseline.py -t ${PROJECT.target_url} -r ${env.REPORT_DIR}/zap-report.html || true
            """
            recordStage('zap_scan', 'PASS', 'ZAP scan completed')
        }
    }
}
```

**What it does:**
- Runs OWASP ZAP baseline security scan
- Tests web application for vulnerabilities
- Checks for XSS, SQL injection, security headers, etc.
- Generates HTML report
- **Skipped if no `target_url` provided** (automated mode only)

**Output:** `reports/zap-report.html`

---

### Phase 3: Callback & Results

#### Step 6: Jenkins Sends Callback

**Location:** `Jenkinsfile` - `post` block

```groovy
post {
    always {
        script {
            // Build callback payload
            def payload = {
                status: currentBuild.currentResult,  // SUCCESS, FAILURE, ABORTED
                stages: STAGES_RESULTS,
                build_number: env.BUILD_NUMBER,
                queue_id: env.QUEUE_ID,
                error_message: env.ERROR_MESSAGE ?: null,
                error_type: env.ERROR_TYPE ?: null,
                jenkins_console_url: "${env.BUILD_URL}console",
            }
            
            // Send to backend
            sh """
                curl -X POST ${env.CALLBACK_URL} \
                  -H "Content-Type: application/json" \
                  -H "X-Callback-Token: ${env.CALLBACK_TOKEN}" \
                  -d '${groovy.json.JsonOutput.toJson(payload)}'
            """
        }
    }
}
```

**What happens:**
1. Pipeline completes (success, failure, or aborted)
2. Builds JSON payload with all stage results
3. POSTs to backend callback URL
4. Includes authentication token for security

**Payload example:**
```json
{
  "status": "SUCCESS",
  "stages": [
    {"stage": "git_checkout", "status": "PASS", "summary": "Git checkout successful"},
    {"stage": "sonar_scanner", "status": "PASS", "summary": "Sonar scan completed"},
    {"stage": "npm_pip_install", "status": "PASS", "summary": "Dependencies installed"},
    ...
  ],
  "build_number": 42,
  "jenkins_console_url": "http://jenkins:8080/job/Security-pipeline/42/console"
}
```

---

#### Step 7: Backend Processes Callback

**Location:** `backend/app/api/scans.py` - `scan_callback` endpoint

```python
@router.post("/scans/{scan_id}/callback")
async def scan_callback(scan_id: str, report: dict, x_callback_token: str = Header(...)):
    # 1. Validate callback token
    if x_callback_token != settings.CALLBACK_TOKEN:
        raise HTTPException(401, "Invalid callback token")
    
    # 2. Find scan record
    scan = await get_scan_or_404(scan_id)
    
    # 3. Normalize stage results
    normalized_stages = []
    for stage in report.get("stages", []):
        normalized = _normalize_stage(stage)
        normalized_stages.append(normalized)
    
    # 4. Update scan record
    scan.state = ScanState.COMPLETED if report["status"] == "SUCCESS" else ScanState.FAILED
    scan.stage_results = normalized_stages
    scan.jenkins_build_number = report.get("build_number")
    scan.jenkins_console_url = report.get("jenkins_console_url")
    
    # 5. Update project last_scan_state
    project = scan.project
    project.last_scan_state = scan.state.value
    
    db.commit()
    
    # 6. Broadcast WebSocket update
    await websocket_manager.broadcast(f"scans:{scan_id}", {
        "type": "scan_completed",
        "scan_id": scan_id,
        "state": scan.state.value,
    })
    
    return {"status": "ok"}
```

**What happens:**
1. Validates callback authentication token
2. Finds scan record in database
3. Normalizes stage names (Jenkins → backend format)
4. Updates scan with results
5. Updates project's `last_scan_state`
6. Broadcasts WebSocket message to connected clients

---

#### Step 8: Frontend Receives Update

**Location:** `src/hooks/useScanWebSocket.ts`

```typescript
export function useScanWebSocket(scanId?: string) {
  const [connected, setConnected] = useState(false);
  const queryClient = useQueryClient();
  
  useEffect(() => {
    if (!scanId) return;
    
    const ws = new WebSocket(
      `ws://localhost:8000/api/v1/ws/scans?scan_id=${scanId}`
    );
    
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      if (message.type === 'scan_completed') {
        // Update React Query cache
        queryClient.setQueryData(['scan', scanId], (old: any) => ({
          ...old,
          state: message.state,
        }));
        
        // Show browser notification
        if (Notification.permission === 'granted') {
          new Notification('Scan Complete', {
            body: `Scan ${scanId.slice(0, 8)}... finished`,
            icon: '/vite.svg',
          });
        }
      }
    };
    
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    
    return () => ws.close();
  }, [scanId]);
  
  return { connected };
}
```

**What happens:**
1. Frontend maintains WebSocket connection to backend
2. Receives `scan_completed` message
3. Updates React Query cache (UI updates automatically)
4. Shows browser notification if permission granted
5. User sees real-time status change without refreshing

---

## State Transitions

```
┌─────────────┐
│  INITIAL    │ (project created, no scan yet)
└──────┬──────┘
       │ User clicks "Run Scan"
       ▼
┌─────────────┐
│  CREATED    │ (scan record created in database)
└──────┬──────┘
       │ Jenkins API called
       ▼
┌─────────────┐
│   QUEUED    │ (waiting for Jenkins to start)
└──────┬──────┘
       │ Jenkins pipeline starts
       ▼
┌─────────────┐
│   RUNNING   │ (stages executing)
└──────┬──────┘
       │ All stages complete
       ▼
┌─────────────┐     ┌─────────────┐
│  COMPLETED  │     │   FAILED    │
│  (SUCCESS)  │     │  (ERROR)    │
└─────────────┘     └─────────────┘
```

---

## Automated vs. Manual Mode

| Aspect | Automated Mode | Manual Mode |
|--------|----------------|-------------|
| **Stage Selection** | All stages run automatically | User selects specific stages |
| **target_ip** | Optional (Nmap skipped if missing) | Required for Nmap |
| **target_url** | Optional (ZAP skipped if missing) | Required for ZAP |
| **Error Handling** | Continue on non-critical failures | Error and stop |
| **Use Case** | Regular security scanning | Targeted investigations |

---

## Timeout Configuration

| Stage | Timeout | Action on Timeout |
|-------|---------|-------------------|
| Sonar Scanner | 15 min | Stage fails, pipeline continues |
| NPM / PIP Install | 10 min | Stage fails, pipeline continues |
| Full Pipeline | 7200s (2h) default | Pipeline aborted |

Configured per-project in `ProjectDB.scan_timeout`.

---

## Error Handling

### Stage-Level Errors

```groovy
try {
    sh 'some-command'
    recordStage('stage_name', 'PASS', 'Success')
} catch (Exception e) {
    echo "⚠️  Failed: ${e.message}"
    recordStage('stage_name', 'WARN', "Failed: ${e.message}")
    // Pipeline continues
}
```

### Pipeline-Level Errors

```groovy
post {
    failure {
        // Send callback with error details
        error_message = "Pipeline failed at stage: ${env.STAGE_NAME}"
        error_type = "PIPELINE_ERROR"
        sendCallback()
    }
    aborted {
        error_type = "USER_CANCELLED"
        sendCallback()
    }
}
```

### Backend Error Recovery

```python
# backend/app/services/scan_recovery.py
def run_recovery_task():
    """Find stuck scans and mark as failed"""
    while True:
        stuck_scans = db.query(ScanDB).filter(
            ScanDB.state == ScanState.RUNNING,
            ScanDB.started_at < datetime.now() - timedelta(minutes=5)
        ).all()
        
        for scan in stuck_scans:
            scan.state = ScanState.FAILED
            scan.error_type = "TIMEOUT"
            scan.error_message = "Scan exceeded maximum execution time"
        
        db.commit()
        time.sleep(300)  # Check every 5 minutes
```

---

## Monitoring & Debugging

### Jenkins Console Logs

```
http://localhost:8080/job/Security-pipeline/{build_number}/console
```

Shows real-time pipeline execution with all `echo` statements.

### Backend Logs

```bash
docker logs docker-backend-1 -f
```

Shows API requests, callback processing, database updates.

### Frontend Network Tab

```
GET  /api/v1/scans/{scan_id}
WS   ws://localhost:8000/api/v1/ws/scans?scan_id={scan_id}
```

Shows API calls and WebSocket messages.

### Database Queries

```sql
-- Find recent scans
SELECT scan_id, state, created_at 
FROM scans 
ORDER BY created_at DESC 
LIMIT 10;

-- Find stuck scans
SELECT scan_id, state, started_at 
FROM scans 
WHERE state = 'RUNNING' 
  AND started_at < NOW() - INTERVAL '5 minutes';
```

---

## Summary

The automated scan flow is a **three-phase process**:

1. **Trigger** (Frontend → Backend → Jenkins)
2. **Execution** (11 Jenkins stages with auto-detection)
3. **Callback** (Jenkins → Backend → Frontend via WebSocket)

**Key Features:**
- ✅ Auto-detects dependency files (`package.json`, `requirements.txt`)
- ✅ Auto-detects Dockerfile in 8 common locations
- ✅ Graceful skipping for optional stages (Nmap, ZAP)
- ✅ Real-time updates via WebSocket
- ✅ Browser notifications on completion
- ✅ Error recovery for stuck scans
- ✅ Comprehensive logging at every step
