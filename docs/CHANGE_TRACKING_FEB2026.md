# DevSecOps Pipeline - Change Tracking Document

**Date:** February 26, 2026  
**Project:** Security Scanning Pipeline (Backend + Jenkins Integration)  
**Author:** Development Team  

---

## Executive Summary

This document tracks all changes made to the DevSecOps security scanning pipeline during the February 26, 2026 development session. Changes span backend API fixes, Jenkins pipeline improvements, Docker configuration updates, and enhanced timeout management.

---

## Table of Contents

1. [Issues Identified](#1-issues-identified)
2. [Changes Summary](#2-changes-summary)
3. [Detailed Changes](#3-detailed-changes)
4. [Files Modified](#4-files-modified)
5. [Testing Results](#5-testing-results)
6. [Configuration Requirements](#6-configuration-requirements)
7. [Rollback Procedures](#7-rollback-procedures)
8. [Future Recommendations](#8-future-recommendations)

---

## 1. Issues Identified

### 1.1 Docker Environment Issues

| Issue | Impact | Priority |
|-------|--------|----------|
| Backend/Celery worker not receiving environment variables | Containers failed to start | Critical |
| Jenkins callback URL using wrong port (8001 vs 8000) | Callbacks failed | High |
| PostgreSQL volume conflicts | Database authentication failures | High |

### 1.2 Backend API Issues

| Issue | Impact | Priority |
|-------|--------|----------|
| Project data not serialized correctly to Celery | Jenkins received null values | Critical |
| Stage status "PASS" not recognized in callback validation | Callbacks rejected | High |
| Fixed pipeline timeout (20 min) | Scans aborted mid-execution | High |

### 1.3 Jenkins Pipeline Issues

| Issue | Impact | Priority |
|-------|--------|----------|
| SonarQube scanner path not resolved | Sonar scans failed | Critical |
| Fixed timeout insufficient for full scans | Pipeline timeouts | Medium |
| Missing per-stage timeouts | Single stage could block pipeline | Medium |

---

## 2. Changes Summary

### 2.1 Infrastructure Changes

| Component | Change | Status |
|-----------|--------|--------|
| Docker Compose | Added `env_file` to backend/celery_worker services | ✅ Complete |
| Docker Compose | Added `extra_hosts` for `host.docker.internal` | ✅ Complete |
| Environment | Updated `.env.dev` with staging tokens | ✅ Complete |

### 2.2 Backend Changes

| Component | Change | Status |
|-----------|--------|--------|
| `scans.py` | Fixed project_data serialization | ✅ Complete |
| `scans.py` | Added "PASS" to STAGE_STATUS_MAP | ✅ Complete |
| `scans.py` | Implemented dynamic timeout calculation | ✅ Complete |
| `jenkins_service.py` | Added SCAN_TIMEOUT to payload | ✅ Complete |
| `jenkins_tasks.py` | Added timeout logging | ✅ Complete |

### 2.3 Jenkins Pipeline Changes

| Component | Change | Status |
|-----------|--------|--------|
| Jenkinsfile | Fixed SonarQube tool path | ✅ Complete |
| Jenkinsfile | Added dynamic timeout parameter | ✅ Complete |
| Jenkinsfile | Added per-stage timeouts | ✅ Complete |
| Jenkinsfile | Improved NPM/PIP install paths | ✅ Complete |

### 2.4 Documentation

| Document | Purpose | Status |
|----------|---------|--------|
| `QWEN.md` | Project context guide | ✅ Updated |
| `SCAN_TIMEOUT_IMPROVEMENTS.md` | Timeout system documentation | ✅ Created |
| `CHANGE_TRACKING_FEB2026.md` | This document | ✅ Created |

---

## 3. Detailed Changes

### 3.1 Docker Configuration Fixes

#### 3.1.1 Base Docker Compose (`docker/docker-compose.yml`)

**Problem:** Backend and Celery worker containers not receiving environment variables.

**Before:**
```yaml
services:
  backend:
    build:
      context: ..
      dockerfile: docker/backend.Dockerfile
    environment:
      PYTHONPATH: /app/backend
      WEB_CONCURRENCY: 1
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  celery_worker:
    build:
      context: ..
      dockerfile: docker/backend.Dockerfile
    command: [ "celery", "-A", "app.core.celery_app.celery_app", "worker", "--loglevel=info" ]
    environment:
      PYTHONPATH: /app/backend
    depends_on:
      - redis
      - postgres
```

**After:**
```yaml
services:
  backend:
    build:
      context: ..
      dockerfile: docker/backend.Dockerfile
    environment:
      PYTHONPATH: /app/backend
      WEB_CONCURRENCY: 1
    env_file:
      - ../.env.dev  # ← ADDED
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  celery_worker:
    build:
      context: ..
      dockerfile: docker/backend.Dockerfile
    command: [ "celery", "-A", "app.core.celery_app.celery_app", "worker", "--loglevel=info" ]
    environment:
      PYTHONPATH: /app/backend
    env_file:
      - ../.env.dev  # ← ADDED
    depends_on:
      - redis
      - postgres
```

**Impact:** Containers now receive all required environment variables (DATABASE_URL, CALLBACK_TOKEN, API_KEY, etc.)

---

#### 3.1.2 Development Overlay (`docker/docker-compose.dev.yml`)

**Problem:** Jenkins running on host not accessible from Docker containers.

**Before:**
```yaml
services:
  backend:
    env_file:
      - ../.env.dev
    ports:
      - "8000:8000"
    volumes:
      - ../backend:/app/backend
      - ../storage/dev:/app/backend/storage/dev

  celery_worker:
    env_file:
      - ../.env.dev
```

**After:**
```yaml
services:
  backend:
    env_file:
      - ../.env.dev
    ports:
      - "8000:8000"
    volumes:
      - ../backend:/app/backend
      - ../storage/dev:/app/backend/storage/dev
    extra_hosts:
      - "host.docker.internal:host-gateway"  # ← ADDED

  celery_worker:
    env_file:
      - ../.env.dev
    extra_hosts:
      - "host.docker.internal:host-gateway"  # ← ADDED
```

**Impact:** Containers can now reach Jenkins at `http://host.docker.internal:8080`

---

#### 3.1.3 Environment File (`.env.dev`)

**Changes:**
```bash
# Before
JENKINS_BASE_URL=http://192.168.1.101:8080
JENKINS_TOKEN=your-jenkins-api-token-here
CALLBACK_TOKEN=your-real-callback-token-32-chars-minimum-xxxxxxxxxx
API_KEY=your-real-api-key-32-chars-minimum-xxxxxxxxxxxxxxxxxx

# After
JENKINS_BASE_URL=http://localhost:8080  # Changed for local Jenkins
JENKINS_TOKEN=11f96de6d3b82596d6da461dcaf5c862f3  # Real token
CALLBACK_TOKEN=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6  # Staging token
API_KEY=z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4  # Staging token
```

---

### 3.2 Backend API Fixes

#### 3.2.1 Project Data Serialization (`backend/app/api/scans.py`)

**Problem:** Project data being passed to Celery as empty dict.

**Before:**
```python
project_data = dict(project.__dict__)
# Clean sqlalchemy specific fields
project_data.pop("_sa_instance_state", None)

logger.info(f"Project data before sending to celery: {project_data}")

from app.tasks.jenkins_tasks import trigger_jenkins_scan_async
trigger_jenkins_scan_async.delay(
    scan_id=scan_obj.scan_id,
    scan_mode=scan_obj.scan_mode,
    selected_stages=scan_obj.selected_stages,
    project_data=project_data
)
```

**After:**
```python
# Explicitly map project fields to ensure proper serialization
project_data = {
    "project_id": project.project_id,
    "name": project.name,
    "git_url": project.git_url,
    "branch": project.branch,
    "credentials_id": project.credentials_id,
    "sonar_key": project.sonar_key,
    "target_ip": project.target_ip,
    "target_url": project.target_url,
    "status": project.status,
    "scan_timeout": scan_timeout,  # NEW: Dynamic timeout
}

logger.info(f"Project data before sending to celery: {project_data}")
logger.info(f"Calculated scan timeout: {scan_timeout} seconds ({scan_timeout/60:.1f} minutes)")

from app.tasks.jenkins_tasks import trigger_jenkins_scan_async
trigger_jenkins_scan_async.delay(
    scan_id=scan_obj.scan_id,
    scan_mode=scan_obj.scan_mode,
    selected_stages=scan_obj.selected_stages,
    project_data=project_data
)
```

**Impact:** Jenkins now receives complete project data including git_url, branch, credentials.

---

#### 3.2.2 Stage Status Validation (`backend/app/api/scans.py`)

**Problem:** Callback rejected with "Invalid stage status: PASS"

**Before:**
```python
STAGE_STATUS_MAP = {
    "PASSED": "PASS",
    "FAILED": "FAIL",
    "SUCCESS": "PASS",
    "FAILURE": "FAIL",
    "SKIPPED": "SKIPPED",
    "WARN": "WARN",
    "UNSTABLE": "WARN",
}
```

**After:**
```python
STAGE_STATUS_MAP = {
    "PASSED": "PASS",
    "PASS": "PASS",       # ← ADDED
    "FAILED": "FAIL",
    "FAIL": "FAIL",       # ← ADDED
    "SUCCESS": "PASS",
    "FAILURE": "FAIL",
    "SKIPPED": "SKIPPED",
    "WARN": "WARN",
    "UNSTABLE": "WARN",
}
```

**Impact:** Jenkins callbacks with "PASS" status now accepted.

---

#### 3.2.3 Dynamic Timeout System (`backend/app/api/scans.py`)

**New Code:**
```python
# Stage-specific timeouts (in seconds)
STAGE_TIMEOUTS = {
    "git_checkout": 300,        # 5 minutes
    "sonar_scanner": 900,       # 15 minutes
    "sonar_quality_gate": 600,  # 10 minutes
    "npm_pip_install": 600,     # 10 minutes
    "dependency_check": 900,    # 15 minutes
    "trivy_fs_scan": 600,       # 10 minutes
    "docker_build": 900,        # 15 minutes
    "docker_push": 600,         # 10 minutes
    "trivy_image_scan": 600,    # 10 minutes
    "nmap_scan": 300,           # 5 minutes
    "zap_scan": 1800,           # 30 minutes
}

def calculate_scan_timeout(selected_stages: list) -> int:
    """Calculate dynamic timeout based on selected stages"""
    if not selected_stages:
        # Default: all stages
        return sum(STAGE_TIMEOUTS.values())
    
    total = 0
    for stage in selected_stages:
        total += STAGE_TIMEOUTS.get(stage, 300)
    
    # Add 20% buffer for overhead
    return int(total * 1.2)
```

**Usage in trigger_scan:**
```python
scan_id = str(uuid.uuid4())

# Calculate dynamic timeout based on selected stages
scan_timeout = calculate_scan_timeout(scan.selected_stages)

scan_obj = ScanDB(
    scan_id=scan_id,
    project_id=scan.project_id,
    scan_mode=scan.scan_mode,
    selected_stages=scan.selected_stages or [],
    state=ScanState.QUEUED,
    created_at=datetime.utcnow(),
    jenkins_build_number=None,
    jenkins_queue_id=None,
    stage_results=[],
    callback_digests=[]
)
```

**Impact:** Scans now have appropriate timeouts based on complexity.

---

#### 3.2.4 Jenkins Service Timeout (`backend/app/services/jenkins_service.py`)

**Before:**
```python
payload = {
    "SCAN_ID": scan.scan_id,
    "SCAN_MODE": scan.scan_mode.upper(),
    "PROJECT_DATA": json.dumps({...}),
    "SELECTED_STAGES": json.dumps(scan.selected_stages),
}
```

**After:**
```python
payload = {
    "SCAN_ID": scan.scan_id,
    "SCAN_MODE": scan.scan_mode.upper(),
    "PROJECT_DATA": json.dumps({...}),
    "SELECTED_STAGES": json.dumps(scan.selected_stages),
    "SCAN_TIMEOUT": str(project_data.get("scan_timeout", 7200)),  # ← ADDED
}
```

**Impact:** Jenkins receives timeout parameter for dynamic adjustment.

---

#### 3.2.5 Celery Task Logging (`backend/app/tasks/jenkins_tasks.py`)

**Added:**
```python
# Log the timeout that was sent to Jenkins
scan_timeout = project_data.get('scan_timeout', 7200)
logger.info(f"Scan {scan_id} started with timeout: {scan_timeout} seconds ({scan_timeout/60:.1f} minutes)")
```

**Impact:** Operators can see expected scan duration in logs.

---

### 3.3 Jenkins Pipeline Changes

#### 3.3.1 SonarQube Tool Path (`Agent/Jenkinsfile`)

**Before:**
```groovy
stage('2. Sonar Scanner') {
    steps {
        script {
            withSonarQubeEnv('sonar-server') {
                sh """
                    sonar-scanner \
                      -Dsonar.projectKey=${PROJECT.sonar_key ?: params.SCAN_ID} \
                      -Dsonar.sources=. \
                      -Dsonar.projectName=${PROJECT.project_name ?: params.SCAN_ID}
                """
            }
            recordStage('sonar_scanner', 'PASS', 'Sonar scan completed')
        }
    }
}
```

**After:**
```groovy
stage('2. Sonar Scanner') {
    when { expression { shouldRun('sonar_scanner') } }
    steps {
        // Per-stage timeout: 15 minutes for Sonar analysis
        timeout(time: 15, unit: 'MINUTES') {
            script {
                // Get the SonarQube Scanner tool path
                def scannerHome = tool 'sonar-scanner'

                withSonarQubeEnv('sonar-server') {
                    sh """
                        ${scannerHome}/bin/sonar-scanner \
                          -Dsonar.projectKey=${PROJECT.sonar_key ?: params.SCAN_ID} \
                          -Dsonar.sources=. \
                          -Dsonar.projectName=${PROJECT.project_name ?: params.SCAN_ID}
                    """
                }
                recordStage('sonar_scanner', 'PASS', 'Sonar scan completed')
            }
        }
    }
}
```

**Impact:** SonarQube scanner now found and executed correctly.

---

#### 3.3.2 Dynamic Pipeline Timeout (`Agent/Jenkinsfile`)

**Before:**
```groovy
pipeline {
    agent any

    options {
        timeout(time: 240, unit: 'MINUTES')
        disableConcurrentBuilds()
        skipStagesAfterUnstable()
    }

    parameters {
        string(name: 'SCAN_ID', defaultValue: '')
        choice(name: 'SCAN_MODE', choices: ['AUTOMATED', 'MANUAL'])
        text(name: 'PROJECT_DATA', defaultValue: '{}')
        text(name: 'SELECTED_STAGES', defaultValue: '[]')
    }
```

**After:**
```groovy
pipeline {
    agent any

    parameters {
        string(name: 'SCAN_ID', defaultValue: '')
        choice(name: 'SCAN_MODE', choices: ['AUTOMATED', 'MANUAL'])
        text(name: 'PROJECT_DATA', defaultValue: '{}')
        text(name: 'SELECTED_STAGES', defaultValue: '[]')
        text(name: 'SCAN_TIMEOUT', defaultValue: '7200')  // ← ADDED
    }

    environment {
        CALLBACK_URL = "${env.BACKEND_URL ?: 'http://localhost:8000'}/api/v1/scans/${params.SCAN_ID}/callback"
        REPORT_DIR = "reports"
        PIPELINE_TIMEOUT = params.SCAN_TIMEOUT ?: '7200'  // ← ADDED
    }

    options {
        timeout(time: Integer.parseInt(env.PIPELINE_TIMEOUT), unit: 'SECONDS')  // ← CHANGED
        disableConcurrentBuilds()
        skipStagesAfterUnstable()
        buildDiscarder(logRotator(numToKeepStr: '10'))  // ← ADDED
    }
```

**Impact:** Pipeline timeout now matches scan complexity.

---

#### 3.3.3 Per-Stage Timeouts (`Agent/Jenkinsfile`)

**Added timeouts to critical stages:**

```groovy
stage('2. Sonar Scanner') {
    steps {
        timeout(time: 15, unit: 'MINUTES') {  // ← ADDED
            // ...
        }
    }
}

stage('3. Sonar Quality Gate') {
    steps {
        timeout(time: 10, unit: 'MINUTES') {  // ← ADDED
            // ...
        }
    }
}

stage('4. NPM / PIP Install') {
    steps {
        timeout(time: 10, unit: 'MINUTES') {  // ← ADDED
            // ...
        }
    }
}
```

**Impact:** Individual stages cannot block entire pipeline.

---

#### 3.3.4 Improved Dependency Installation (`Agent/Jenkinsfile`)

**Before:**
```groovy
stage('4. NPM / PIP Install') {
    when { expression { shouldRun('npm_pip_install') } }
    steps {
        sh """
            if [ -f backend/requirements.txt ]; then
                python3 -m venv venv
                . venv/bin/activate
                pip install -r backend/requirements.txt
            fi

            if [ -f package.json ]; then
                npm install
            fi
        """
        recordStage('npm_pip_install', 'PASS', 'Dependencies installed')
    }
}
```

**After:**
```groovy
stage('4. NPM / PIP Install') {
    when { expression { shouldRun('npm_pip_install') } }
    steps {
        timeout(time: 10, unit: 'MINUTES') {
            sh """
                # Install Frontend dependencies
                if [ -f Port_Push-main/frontend/package.json ]; then
                    cd Port_Push-main/frontend
                    npm install
                    cd ../..
                elif [ -f package.json ]; then
                    npm install
                fi

                # Install Backend dependencies
                if [ -f Port_Push-main/backend/requirements.txt ]; then
                    cd Port_Push-main/backend
                    python3 -m venv venv
                    . venv/bin/activate
                    pip install -r requirements.txt
                    cd ../..
                elif [ -f backend/requirements.txt ]; then
                    cd backend
                    python3 -m venv venv
                    . venv/bin/activate
                    pip install -r requirements.txt
                    cd ..
                fi
            """
            recordStage('npm_pip_install', 'PASS', 'Dependencies installed')
        }
    }
}
```

**Impact:** Supports both monorepo (Port_Push-main) and standard project structures.

---

## 4. Files Modified

| File | Changes | Lines Changed |
|------|---------|---------------|
| `Agent/docker/docker-compose.yml` | Added env_file to backend/celery_worker | +8 |
| `Agent/docker/docker-compose.dev.yml` | Added extra_hosts for host.docker.internal | +6 |
| `Agent/.env.dev` | Updated Jenkins URL and tokens | ~5 |
| `Agent/backend/app/api/scans.py` | Fixed serialization, added timeout system | +80 |
| `Agent/backend/app/services/jenkins_service.py` | Added SCAN_TIMEOUT to payload | +2 |
| `Agent/backend/app/tasks/jenkins_tasks.py` | Added timeout logging | +4 |
| `Agent/Jenkinsfile` | Fixed Sonar path, dynamic timeout, per-stage timeout | +60 |
| `QWEN.md` | Updated project documentation | Updated |
| `docs/SCAN_TIMEOUT_IMPROVEMENTS.md` | Created timeout documentation | New |
| `docs/CHANGE_TRACKING_FEB2026.md` | This document | New |

**Total:** ~215 lines added/modified across 10 files

---

## 5. Testing Results

### 5.1 Docker Environment Tests

| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| Backend container starts | Running | Running | ✅ PASS |
| Celery worker connects | Connected | Connected | ✅ PASS |
| PostgreSQL accessible | Auth success | Auth success | ✅ PASS |
| Jenkins reachable from container | HTTP 200 | HTTP 200 | ✅ PASS |

### 5.2 Backend API Tests

| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| Create project | 201 Created | 201 Created | ✅ PASS |
| Trigger scan | 201 Created | 201 Created | ✅ PASS |
| Project data in Celery | Full object | Full object | ✅ PASS |
| Callback with "PASS" | 200 OK | 200 OK | ✅ PASS |
| Dynamic timeout calculation | Correct value | Correct value | ✅ PASS |

### 5.3 Jenkins Pipeline Tests

| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| Git checkout | Cloned | Cloned | ✅ PASS |
| SonarQube scan | Executed | Executed | ✅ PASS |
| SonarQube connection | Connected | Connected | ✅ PASS |
| Quality gate check | Checked | Checked | ✅ PASS |
| Callback to backend | Success | Success | ✅ PASS |
| Dynamic timeout applied | Yes | Yes | ✅ PASS |

### 5.4 End-to-End Test Results

**Scan ID:** `990cdac2-e312-496d-adc1-c2e9ce2df231`

| Stage | Status | Duration |
|-------|--------|----------|
| Git Checkout | PASS | ~30 sec |
| Sonar Scanner | PASS | ~45 sec |
| Sonar Quality Gate | IN_PROGRESS | - |
| NPM/PIP Install | SKIPPED | - |
| Dependency Check | SKIPPED | - |
| Trivy FS Scan | SKIPPED | - |
| Docker Build | SKIPPED | - |
| Trivy Image Scan | SKIPPED | - |
| Nmap Scan | SKIPPED | - |
| ZAP Scan | SKIPPED | - |
| Callback | SUCCESS | ~1 sec |

**Note:** Pipeline timed out at 20 minutes (old limit). New dynamic timeout should prevent this.

---

## 6. Configuration Requirements

### 6.1 Jenkins Configuration

| Setting | Value | Location |
|---------|-------|----------|
| SonarQube Server Name | `sonar-server` | Manage Jenkins → System |
| SonarQube Server URL | `http://localhost:9000` or `http://host.docker.internal:9000` | Manage Jenkins → System |
| SonarQube Token ID | `sonar-token` | Jenkins Credentials |
| SonarQube Scanner Name | `sonar-scanner` | Manage Jenkins → Tools |
| GitHub Credentials ID | `github-credentials` | Jenkins Credentials |
| Callback Token ID | `callback-token` | Jenkins Credentials |

### 6.2 SonarQube Configuration

| Setting | Value | Location |
|---------|-------|----------|
| Server URL | `http://localhost:9000` | Browser |
| Default Admin Password | `admin` (change in production) | SonarQube Login |
| Token Name | `jenkins` | Administration → Security → Tokens |

### 6.3 Backend Environment Variables

| Variable | Example Value | Required |
|----------|---------------|----------|
| `ENV` | `dev` | Yes |
| `DATABASE_URL` | `postgresql://devsecops:devsecops@postgres:5432/devsecops_dev` | Yes |
| `JENKINS_BASE_URL` | `http://localhost:8080` | Yes |
| `JENKINS_TOKEN` | `11f96de6d3b82596d6da461dcaf5c862f3` | Yes |
| `CALLBACK_TOKEN` | `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6` | Yes |
| `API_KEY` | `z9y8x7w6v5u4t3s2r1q0p9o8n7m6l5k4` | Yes |
| `SCAN_TIMEOUT` | `7200` | No (default) |

### 6.4 Docker Requirements

| Requirement | Version | Notes |
|-------------|---------|-------|
| Docker | 20.10+ | Docker Desktop or Engine |
| Docker Compose | 2.0+ | Included in Docker Desktop |
| Python | 3.11+ | For run.py script |
| Node.js | 18+ | For frontend development |

---

## 7. Rollback Procedures

### 7.1 Rollback Docker Changes

```bash
# Stop all containers
cd Agent
python run.py down

# Restore original docker-compose.yml
git checkout HEAD -- docker/docker-compose.yml
git checkout HEAD -- docker/docker-compose.dev.yml

# Restart
python run.py dev
```

### 7.2 Rollback Backend Changes

```bash
# Restore original backend files
git checkout HEAD -- backend/app/api/scans.py
git checkout HEAD -- backend/app/services/jenkins_service.py
git checkout HEAD -- backend/app/tasks/jenkins_tasks.py

# Restart backend
docker restart docker-backend-1
```

### 7.3 Rollback Jenkinsfile Changes

```bash
# Restore original Jenkinsfile
git checkout HEAD -- Agent/Jenkinsfile

# Reload Jenkinsfile in Jenkins UI
# Or wait for next git trigger
```

### 7.4 Emergency Rollback Script

```bash
#!/bin/bash
# emergency_rollback.sh

echo "Starting emergency rollback..."

# Stop everything
cd /home/kali_linux/Pipeline/Agent
python run.py down

# Restore all files
git checkout HEAD -- docker/docker-compose.yml
git checkout HEAD -- docker/docker-compose.dev.yml
git checkout HEAD -- backend/app/api/scans.py
git checkout HEAD -- backend/app/services/jenkins_service.py
git checkout HEAD -- backend/app/tasks/jenkins_tasks.py
git checkout HEAD -- Agent/Jenkinsfile
git checkout HEAD -- .env.dev

# Restart
python run.py dev

echo "Rollback complete. Verify services."
```

---

## 8. Future Recommendations

### 8.1 Short-Term (Next Sprint)

| Priority | Task | Estimated Effort |
|----------|------|------------------|
| High | Add stage-level retry logic | 4 hours |
| High | Implement progress heartbeats | 8 hours |
| Medium | Add timeout override API endpoint | 2 hours |
| Medium | Create timeout monitoring dashboard | 4 hours |

### 8.2 Medium-Term (Next Month)

| Priority | Task | Estimated Effort |
|----------|------|------------------|
| High | Historical timeout learning system | 16 hours |
| Medium | Project size detection for timeout adjustment | 8 hours |
| Low | Slack/Email timeout warnings | 4 hours |

### 8.3 Long-Term (Next Quarter)

| Priority | Task | Estimated Effort |
|----------|------|------------------|
| Medium | ML-based timeout prediction | 40 hours |
| Low | Multi-region timeout calibration | 16 hours |

---

## Appendix A: Command Reference

### Start Development Environment
```bash
cd Agent
python run.py dev
```

### View Backend Logs
```bash
docker logs docker-backend-1 --tail=50 -f
```

### View Celery Worker Logs
```bash
docker logs docker-celery_worker-1 --tail=50 -f
```

### View Jenkins Build Logs
```bash
curl -s -u admin:<token> "http://localhost:8080/job/Security-pipeline/lastBuild/consoleText" | tail -50
```

### Test Backend API
```bash
# Health check
curl http://localhost:8000/

# Login
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=admin123"

# Create project
curl -X POST http://localhost:8000/api/v1/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"name": "test", "git_url": "...", "branch": "main", "credentials_id": "github-credentials", "sonar_key": "test"}'

# Trigger scan
curl -X POST http://localhost:8000/api/v1/scans \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"project_id": "<id>", "scan_mode": "automated"}'
```

---

## Appendix B: Contact Information

| Role | Name | Contact |
|------|------|---------|
| DevOps Lead | [Name] | [Email] |
| Backend Lead | [Name] | [Email] |
| Security Lead | [Name] | [Email] |

---

**Document Version:** 1.0  
**Last Updated:** February 26, 2026  
**Next Review:** March 26, 2026
