# Automated Scan Flow

Complete flow for executing an automated security scan with all 11 stages.

---

## 1. Scan Trigger Flow

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
│ Last Scan: None                                            │
│ Status: IDLE                                               │
│                                                            │
│ Actions                                                    │
│ ┌──────────────────────────────────────────────────────┐  │
│ │ [Run Automated Scan]  [Run Manual Scan]              │  │
│ │ [View Scan History]                                  │  │
│ │ [Delete Project]                                     │  │
│ └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
       │
       │ User clicks "Run Automated Scan"
       ▼
Confirmation dialog:
┌─────────────────────────────────────────────────────┐
│ Run Automated Security Scan?                        │
│                                                     │
│ This will execute all 11 security scanning stages   │
│ including SonarQube, Trivy, Nmap, ZAP, and more.    │
│                                                     │
│ Estimated time: 30-120 minutes                      │
│                                                     │
│ [Start Scan] [Cancel]                               │
└─────────────────────────────────────────────────────┘
       │
       │ User confirms
       ▼
POST /api/v1/scans
Authorization: Bearer eyJ...
X-API-Key: z9y8...

{
  "project_id": "abc-123-def",
  "scan_mode": "automated",
  "selected_stages": []
}
```

---

## 2. Backend Processing

### Scan Creation

```
Backend: scans/triggers.py::trigger_scan()
       │
       ├─ 1. Validate scan request
       │     validate_scan_request(scan)
       │     └─ Check scan_mode is valid ("automated" | "manual")
       │
       ├─ 2. Check project exists
       │     project = db.query(ProjectDB)
       │       .filter(ProjectDB.project_id == "abc-123-def")
       │       .first()
       │     └─ If not found → HTTP 404 "Project not found"
       │
       ├─ 3. Check no active scan
       │     if project.last_scan_state in {CREATED, QUEUED, RUNNING}:
       │       → HTTP 409 "An active scan already exists for this project"
       │
       ├─ 4. Generate scan ID
       │     scan_id = str(uuid.uuid4())
       │     → "scan-789-jkl"
       │
       ├─ 5. Calculate timeout
       │     timeout = sum(STAGE_TIMEOUTS.values())  # All stages
       │     → 300+900+600+600+900+600+900+600+600+300+1800 = 8400 seconds
       │     Add 20% buffer: 8400 × 1.2 = 10080 seconds
       │
       ├─ 6. Create ScanDB
       │     ScanDB(
       │       scan_id="scan-789-jkl",
       │       project_id="abc-123-def",
       │       scan_mode="automated",
       │       selected_stages=[],  # Empty = all stages
       │       state=ScanState.CREATED,
       │       created_at=datetime.now(utc),
       │       started_at=None,
       │       jenkins_build_number=None,
       │       stage_results=[],
       │       callback_digests=[]
       │     )
       │
       ├─ 7. Update project state
       │     project.last_scan_state = "CREATED"
       │
       ├─ 8. Commit to database
       │     db.add(scan_obj)
       │     db.commit()
       │
       ├─ 9. Broadcast WebSocket update
       │     websocket_manager.send_scan_update(
       │       scan_id="scan-789-jkl",
       │       project_id="abc-123-def",
       │       data=scan_to_response(scan_obj)
       │     )
       │
       └─ 10. Trigger async Celery task
            trigger_jenkins_scan_async.delay(
              scan_id="scan-789-jkl",
              scan_mode="automated",
              selected_stages=[],
              project_data={
                "project_id": "abc-123-def",
                "name": "My Application",
                "git_url": "https://github.com/user/myapp.git",
                "branch": "main",
                "credentials_id": "github-credentials",
                "sonar_key": "myapp-key",
                "target_ip": "192.168.1.100",
                "target_url": "http://myapp.com",
                "scan_timeout": 10080
              }
            )
       │
       ▼
Return 201 Created:
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
  "retry_count": 0
}
       │
       ▼
Frontend navigates to /scans/scan-789-jkl
```

---

## 3. Jenkins Trigger (Celery Task)

```
Celery Worker picks up task:
  trigger_jenkins_scan_async(
    scan_id="scan-789-jkl",
    scan_mode="automated",
    selected_stages=[],
    project_data={...}
  )
       │
       ▼
jenkins_service.py::trigger_scan_job()
       │
       ▼
jenkins_client.py::trigger_pipeline()
       │
       ├─ 1. Build Jenkins URL
       │     http://localhost:8080/job/Security-pipeline/buildWithParameters
       │
       ├─ 2. Get CSRF crumb
       │     GET http://localhost:8080/crumbIssuer/api/json
       │     Response: { "crumb": "abc123..." }
       │
       ├─ 3. Build parameters
       │     {
       │       "SCAN_ID": "scan-789-jkl",
       │       "SCAN_MODE": "AUTOMATED",
       │       "PROJECT_DATA": '{
       │         "project_id": "abc-123-def",
       │         "project_name": "My Application",
       │         "git_url": "https://github.com/user/myapp.git",
       │         "branch": "main",
       │         "credentials_id": "github-credentials",
       │         "sonar_key": "myapp-key",
       │         "target_ip": "192.168.1.100",
       │         "target_url": "http://myapp.com"
       │       }',
       │       "SELECTED_STAGES": '[]',
       │       "SCAN_TIMEOUT": "10080"
       │     }
       │
       ├─ 4. POST to Jenkins
       │     Headers:
       │       Authorization: Basic YWRtaW46dG9rZW4=  (admin:JENKINS_TOKEN)
       │       Jenkins-Crumb: abc123...
       │       Content-Type: application/x-www-form-urlencoded
       │
       └─ 5. Jenkins responds: 201 Created
            Response: { "queue_id": 42 }
       │
       ▼
Celery updates scan:
  scan_obj.jenkins_queue_id = "42"
  scan_obj.state = ScanState.QUEUED
  db.commit()
```

---

## 4. Jenkins Pipeline Execution (11 Stages)

### Stage 0: Init Context

```groovy
// Validate SCAN_ID
if (!params.SCAN_ID?.trim()) {
    error("SCAN_ID is mandatory")
}

// Unescape HTML entities
def projectData = params.PROJECT_DATA.replaceAll('&quot;', '"')
def selectedStages = params.SELECTED_STAGES.replaceAll('&quot;', '"')

// Parse JSON
PROJECT = readJSON text: projectData
SELECTED = readJSON text: selectedStages
IS_MANUAL = false  // AUTOMATED mode

// Create reports directory
sh "mkdir -p reports"
```

---

### Stage 1: Git Checkout

```groovy
checkout([
    $class: 'GitSCM',
    branches: [[name: 'main']],
    userRemoteConfigs: [[
        url: 'https://github.com/user/myapp.git',
        credentialsId: 'github-credentials'
    ]]
])

recordStage('git_checkout', 'PASS', 'Git checkout successful')
```

**Duration**: ~10-30 seconds (depends on repo size)

**Output**: Source code cloned to Jenkins workspace

---

### Stage 2: Sonar Scanner (15 min timeout)

```groovy
timeout(time: 15, unit: 'MINUTES') {
    def scannerHome = tool 'sonar-scanner'
    
    withSonarQubeEnv('sonar-server') {
        sh """
            ${scannerHome}/bin/sonar-scanner \\
              -Dsonar.projectKey=myapp-key \\
              -Dsonar.sources=. \\
              -Dsonar.projectName=My Application
        """
    }
    
    recordStage('sonar_scanner', 'PASS', 'Sonar scan completed')
}
```

**Duration**: ~2-5 minutes

**Output**: SonarQube analysis report sent to SonarQube server

**Note**: Continues even if SonarQube fails (WARN status)

---

### Stage 3: Sonar Quality Gate

```groovy
echo "⏭️  Skipping SonarQube Quality Gate check"
recordStage('sonar_quality_gate', 'SKIPPED', 'Quality Gate check skipped')
```

**Status**: Currently hardcoded to SKIPPED

**Future**: Should check SonarQube quality gate status

---

### Stage 4: NPM / PIP Install (10 min timeout)

```groovy
timeout(time: 10, unit: 'MINUTES') {
    // Find package.json
    def npmDir = sh(
        script: "find . -name 'package.json' -type f | head -1",
        returnStdout: true
    ).trim()
    
    if (npmDir) {
        dir(npmDir.replaceAll('/package.json', '')) {
            sh 'npm ci'
        }
    }
    
    // Find requirements.txt
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

recordStage('npm_pip_install', 'PASS', 'Dependencies installed')
```

**Duration**: ~1-3 minutes (depends on dependencies)

**Output**: node_modules/ and Python packages installed

---

### Stage 5: Dependency Check

```groovy
// Auto-detect dependency files
def scanPaths = getDependencyScanPaths()
// → ['./', './frontend', './backend']

// Build OWASP Dependency-Check arguments
def scanArgs = [
    "--project scan-789-jkl",
    "--format JSON",
    "--format HTML",
    "--out reports",
    "--enableExperimental"
]

scanPaths.each { path ->
    scanArgs << "--scan ${path}"
}

// Run scan
dependencyCheck additionalArguments: scanArgs.join(' '), odcInstallation: 'OWasp'

// Parse results
if (fileExists('reports/dependency-check-report.json')) {
    def depResult = readJSON file: 'reports/dependency-check-report.json'
    recordToolResult('dependency_check', 'owasp-dep-check', depResult)
}

recordStage('dependency_check', 'PASS', 'Dependency check completed')
```

**Duration**: ~5-10 minutes

**Output**: `reports/dependency-check-report.json` + `.html`

**Scans**: All package.json, requirements.txt, yarn.lock, pyproject.toml locations

---

### Stage 6: Trivy FS Scan

```groovy
sh """
    /home/kali_linux/.local/bin/trivy fs --format json \\
      -o reports/trivy-fs.json . || true
"""

recordStage('trivy_fs_scan', 'PASS', 'Trivy FS scan completed')
```

**Duration**: ~2-5 minutes

**Output**: `reports/trivy-fs.json`

**Scans**: Filesystem for secrets, misconfigurations, known vulnerabilities

---

### Stage 7: Docker Build

```groovy
// Auto-detect Dockerfile (priority order)
def locations = [
    [file: 'Dockerfile', context: '.'],
    [file: 'docker/Dockerfile', context: '.'],
    [file: 'backend/Dockerfile', context: 'backend'],
    // ... more locations
]

for (loc in locations) {
    if (fileExists(loc.file)) {
        dockerfile = loc.file
        context = loc.context
        break
    }
}

IMAGE_TAG = "My Application:scan-789-jkl"
sh "docker build -t ${IMAGE_TAG} -f ${dockerfile} ${context}"

recordStage('docker_build', 'PASS', 'Built from ${dockerfile}')
```

**Duration**: ~3-8 minutes

**Output**: Docker image tagged as `My Application:scan-789-jkl`

---

### Stage 8: Docker Push

```groovy
withCredentials([usernamePassword(
    credentialsId: 'docker-credentials',
    usernameVariable: 'DOCKER_USER',
    passwordVariable: 'DOCKER_PASS'
)]) {
    sh """
        echo "${DOCKER_PASS}" | \\
        docker login -u "${DOCKER_USER}" --password-stdin || true
        docker push ${IMAGE_TAG} || true
    """
}

recordStage('docker_push', 'PASS', 'Docker image pushed')
```

**Duration**: ~1-3 minutes (depends on image size)

**Output**: Image pushed to Docker registry

---

### Stage 9: Trivy Image Scan

```groovy
sh """
    /home/kali_linux/.local/bin/trivy image --format json \\
      -o reports/trivy-image.json ${IMAGE_TAG} || true
"""

if (fileExists('reports/trivy-image.json')) {
    def trivyImageResult = readJSON file: 'reports/trivy-image.json'
    recordToolResult('trivy_image_scan', 'trivy', trivyImageResult)
}

recordStage('trivy_image_scan', 'PASS', 'Trivy image scan completed')
```

**Duration**: ~2-5 minutes

**Output**: `reports/trivy-image.json`

**Scans**: Container image for vulnerabilities in OS packages and application dependencies

---

### Stage 10: Nmap Scan

```groovy
if (!PROJECT.target_ip) {
    echo "SKIP: No target_ip provided"
    return
}

sh """
    nmap -sV -sC -oX reports/nmap.xml ${PROJECT.target_ip} || true
"""

recordStage('nmap_scan', 'PASS', 'Nmap scan completed')
```

**Duration**: ~1-3 minutes

**Output**: `reports/nmap.xml`

**Scans**: Network ports, services, version detection on target IP

**Requires**: `target_ip` in project config (e.g., `192.168.1.100`)

---

### Stage 11: ZAP Scan

```groovy
if (!PROJECT.target_url) {
    echo "SKIP: No target_url provided"
    return
}

withEnv(["TARGET_URL=${PROJECT.target_url}"]) {
    sh '''
        # Start ZAP daemon
        zap.sh -daemon -host 127.0.0.1 -port 8090 -config api.disablekey=true &
        ZAP_PID=$!
        sleep 30  # Wait for ZAP to start
        
        # Spider scan
        curl "http://127.0.0.1:8090/JSON/spider/action/scan/?url=$TARGET_URL"
        sleep 60  # Wait for spider
        
        # Generate reports
        curl "http://127.0.0.1:8090/JSON/core/action/htmlreport/" -o reports/zap.html
        curl "http://127.0.0.1:8090/JSON/core/action/jsonreport/" -o reports/zap.json
        
        # Stop ZAP
        kill $ZAP_PID 2>/dev/null
    '''
}

recordStage('zap_scan', 'PASS', 'ZAP scan completed')
```

**Duration**: ~3-5 minutes

**Output**: `reports/zap.html` + `reports/zap.json`

**Scans**: Web application vulnerabilities (XSS, SQLi, misconfigurations, etc.)

**Requires**: `target_url` in project config (e.g., `http://myapp.com`)

---

## 5. Jenkins Callback

### Post-Build Actions

```groovy
post {
    always {
        // Archive all reports
        archiveArtifacts artifacts: 'reports/**', allowEmptyArchive: true
        
        // Build callback payload
        def payload = [
            status: currentBuild.currentResult,  // "SUCCESS"
            build_number: currentBuild.number,   // 42
            scan_id: "scan-789-jkl",
            scan_mode: "AUTOMATED",
            stages: STAGES_RESULTS ?: [],
            finished_at: new Date().format("yyyy-MM-dd'T'HH:mm:ss'Z'"),
            error_message: null,
            error_type: null,
            jenkins_console_url: "http://localhost:8080/job/Security-pipeline/42/console"
        ]
        
        writeFile file: 'callback.json', text: groovy.json.JsonOutput.toJson(payload)
        
        // Send callback to backend
        sh """
            curl -sS -X POST \\
              -H "Content-Type: application/json" \\
              -H "X-Callback-Token: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6" \\
              --data @callback.json \\
              "http://backend:8000/api/v1/scans/scan-789-jkl/callback"
        """
    }
}
```

### Callback Payload Example

```json
{
  "status": "SUCCESS",
  "build_number": 42,
  "scan_id": "scan-789-jkl",
  "scan_mode": "AUTOMATED",
  "stages": [
    {
      "stage": "git_checkout",
      "status": "PASS",
      "summary": "Git checkout successful",
      "timestamp": "2026-04-13T10:01:00Z"
    },
    {
      "stage": "sonar_scanner",
      "status": "PASS",
      "summary": "Sonar scan completed",
      "timestamp": "2026-04-13T10:04:00Z"
    },
    {
      "stage": "sonar_quality_gate",
      "status": "SKIPPED",
      "summary": "Quality Gate check skipped",
      "timestamp": "2026-04-13T10:04:30Z"
    },
    {
      "stage": "npm_pip_install",
      "status": "PASS",
      "summary": "Dependencies installed",
      "timestamp": "2026-04-13T10:07:00Z"
    },
    {
      "stage": "dependency_check",
      "status": "PASS",
      "summary": "Dependency check completed for: ./, ./frontend, ./backend",
      "timestamp": "2026-04-13T10:15:00Z"
    },
    {
      "stage": "trivy_fs_scan",
      "status": "PASS",
      "summary": "Trivy FS scan completed",
      "timestamp": "2026-04-13T10:18:00Z"
    },
    {
      "stage": "docker_build",
      "status": "PASS",
      "summary": "Built from Dockerfile",
      "timestamp": "2026-04-13T10:24:00Z"
    },
    {
      "stage": "docker_push",
      "status": "PASS",
      "summary": "Docker image pushed",
      "timestamp": "2026-04-13T10:26:00Z"
    },
    {
      "stage": "trivy_image_scan",
      "status": "PASS",
      "summary": "Trivy image scan completed",
      "timestamp": "2026-04-13T10:30:00Z"
    },
    {
      "stage": "nmap_scan",
      "status": "PASS",
      "summary": "Nmap scan completed",
      "timestamp": "2026-04-13T10:32:00Z"
    },
    {
      "stage": "zap_scan",
      "status": "PASS",
      "summary": "ZAP scan completed",
      "timestamp": "2026-04-13T10:36:00Z"
    }
  ],
  "finished_at": "2026-04-13T10:36:00Z",
  "error_message": null,
  "error_type": null,
  "jenkins_console_url": "http://localhost:8080/job/Security-pipeline/42/console"
}
```

---

## 6. Backend Callback Processing

```
POST /api/v1/scans/scan-789-jkl/callback
Headers: X-Callback-Token: a1b2c3d4e5f6...

callbacks.py::scan_callback()
       │
       ├─ 1. Validate auth
       │     if x_callback_token != settings.CALLBACK_TOKEN:
       │       → HTTP 401 "Invalid callback token"
       │
       ├─ 2. Check replay attack (SHA-256 digest)
       │     digest = sha256(json.dumps(report, sort_keys=True))
       │     if digest in scan.callback_digests:
       │       → Return 200 { status: "success", idempotent: true }
       │
       ├─ 3. Check terminal state
       │     if scan.state in {COMPLETED, FAILED, CANCELLED}:
       │       → Add digest, commit, return 200
       │
       ├─ 4. Normalize stages
       │     for stage in stages:
       │       stage_id = JENKINS_STAGE_NAME_TO_ID.get(stage.name)
       │       status = STAGE_STATUS_MAP.get(stage.status)
       │         # SUCCESS → PASS, FAILURE → FAIL, SKIPPED → SKIPPED
       │       Validate artifacts (URL, size, SHA-256)
       │
       ├─ 5. Update scan state
       │     if jenkins_status == "SUCCESS":
       │       scan_obj.state = ScanState.COMPLETED
       │     scan_obj.stage_results = normalized_stages
       │     scan_obj.jenkins_build_number = "42"
       │     scan_obj.finished_at = datetime.now(utc)
       │
       ├─ 6. Update project state
       │     project_obj.last_scan_state = "COMPLETED"
       │
       ├─ 7. Commit to database
       │     scan_obj.callback_digests.append(digest)
       │     db.commit()
       │
       └─ 8. Broadcast WebSocket update
            websocket_manager.send_scan_update(
              scan_id="scan-789-jkl",
              project_id="abc-123-def",
              data=scan_to_response(scan_obj)
            )
```

---

## 7. Frontend Real-time Updates

### WebSocket Connection

```
ScanStatusPage.tsx mounts at /scans/scan-789-jkl
       │
       ▼
useScanWebSocket(scanId="scan-789-jkl")
       │
       ▼
Connect to: ws://localhost:8000/api/v1/ws/scans?scan_id=scan-789-jkl
       │
       ▼
Backend: websockets/__init__.py::scan_websocket_endpoint()
       │
       ▼
manager.py::connect(websocket, scan_id="scan-789-jkl")
  ├─ websocket.accept()
  ├─ self.scan_connections["scan-789-jkl"].add(websocket)
  └─ Log: "WebSocket connected for scan scan-789-jkl"
       │
       ▼
Keepalive: Send 'ping' every 30 seconds
       │
       ▼
When callback arrives:
  manager.broadcast_to_scan("scan-789-jkl", message)
    │
    ▼
  message = {
    "event": "scan.state_changed",
    "scan_id": "scan-789-jkl",
    "project_id": "abc-123-def",
    "data": {
      "scan_id": "scan-789-jkl",
      "state": "COMPLETED",
      "stage_results": [
        { "stage": "git_checkout", "status": "PASS", ... },
        { "stage": "sonar_scanner", "status": "PASS", ... },
        ...  // All 11 stages
      ],
      "jenkins_build_number": "42",
      "finished_at": "2026-04-13T10:36:00Z"
    }
  }
    │
    ▼
  Frontend receives message:
    queryClient.setQueryData(['scan', 'scan-789-jkl'], message.data)
    │
    ▼
  UI re-renders:
    ├─ Progress bar: 11/11 stages (100%)
    ├─ Stage badges: All green (PASS)
    ├─ Status badge: "COMPLETED" (green)
    └─ Show results table with all 11 stages
```

### Browser Notification

```
notifications.ts::showNotification("Scan Completed", {
  body: "My Application security scan finished successfully",
  icon: "/scan-success.png"
})
       │
       ▼
Desktop notification appears:
┌─────────────────────────────────────────┐
│ DevSecOps Platform                      │
│                                         │
│ Scan Completed                          │
│ My Application security scan finished   │
│ successfully                            │
│                                         │
│ [Click to view]                         │
└─────────────────────────────────────────┘
       │
       │ User clicks notification
       ▼
Navigate to /scans/scan-789-jkl
```

---

## 8. Scan Results Display

### ScanStatusPage.tsx

```
┌─────────────────────────────────────────────────────────────────┐
│ Scan Status: scan-789-jkl                           [Refresh]   │
│ ─────────────────────────────────────────────────────────────── │
│                                                                 │
│ Status: ✅ COMPLETED                                           │
│ Mode: Automated                                                │
│ Duration: 36 minutes                                           │
│ Jenkins Build: #42                                             │
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
│ │ 3. Sonar Quality Gt  │ ⏭️ SKIP  │ Quality Gate skipped     │ │
│ │ 4. NPM/PIP Install   │ ✅ PASS  │ Dependencies installed   │ │
│ │ 5. Dependency Check  │ ✅ PASS  │ Dep check completed      │ │
│ │ 6. Trivy FS Scan     │ ✅ PASS  │ Trivy FS scan completed  │ │
│ │ 7. Docker Build      │ ✅ PASS  │ Built from Dockerfile    │ │
│ │ 8. Docker Push       │ ✅ PASS  │ Docker image pushed      │ │
│ │ 9. Trivy Image Scan  │ ✅ PASS  │ Trivy image completed    │ │
│ │ 10. Nmap Scan        │ ✅ PASS  │ Nmap scan completed      │ │
│ │ 11. ZAP Scan         │ ✅ PASS  │ ZAP scan completed       │ │
│ └──────────────────────┴──────────┴──────────────────────────┘ │
│                                                                 │
│ [View in Jenkins]  [View Reports]  [Run Again]                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. Timing Summary

| Stage | Estimated Duration | Timeout |
|-------|-------------------|---------|
| Git Checkout | 10-30s | - |
| Sonar Scanner | 2-5 min | 15 min |
| Sonar Quality Gate | <1s | - |
| NPM/PIP Install | 1-3 min | 10 min |
| Dependency Check | 5-10 min | - |
| Trivy FS Scan | 2-5 min | - |
| Docker Build | 3-8 min | - |
| Docker Push | 1-3 min | - |
| Trivy Image Scan | 2-5 min | - |
| Nmap Scan | 1-3 min | - |
| ZAP Scan | 3-5 min | - |
| **Total** | **30-52 min** | **10080s (2.8h)** |

---

## 10. Key Files

| Component | File |
|-----------|------|
| **Frontend Trigger** | `src/pages/ProjectControlPage.tsx` |
| **Frontend Status** | `src/pages/ScanStatusPage.tsx` |
| **Frontend WebSocket** | `src/hooks/useScanWebSocket.ts` |
| **Frontend Notifications** | `src/services/notifications.ts` |
| **Backend Trigger** | `backend/app/api/scans/triggers.py` |
| **Backend Callback** | `backend/app/api/scans/callbacks.py` |
| **Backend Celery** | `backend/app/tasks/jenkins_tasks.py` |
| **Jenkins Service** | `backend/app/services/jenkins_service.py` |
| **Jenkins Client** | `backend/app/infrastructure/jenkins/jenkins_client.py` |
| **Jenkins Pipeline** | `Agent/Jenkinsfile` |
| **Constants** | `backend/app/api/scans/constants.py` |
| **Helpers** | `backend/app/api/scans/helpers.py` |

---

*Generated: 2026-04-13 | Based on Jenkinsfile, triggers.py, callbacks.py*
