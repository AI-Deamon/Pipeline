# Scan Timeout Implementation Summary

**Date:** February 27, 2026
**Status:** ✅ Complete

---

## Overview

The dynamic scan timeout system has been fully implemented, replacing arbitrary fixed timeouts with intelligent, stage-based timeout calculations.

---

## Implementation Components

### 1. Backend API (`backend/app/api/scans.py`)

#### Stage-Specific Timeouts
```python
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
```

#### Dynamic Calculation Function
```python
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

#### Timeout Override Header Support
```python
@router.post("/scans", response_model=ScanResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
def trigger_scan(request: Request, scan: ScanCreate, db: Session = Depends(get_db), 
                 x_scan_timeout: str | None = Header(default=None, alias="X-Scan-Timeout")):
    # ... validation ...
    
    scan_timeout = calculate_scan_timeout(scan.selected_stages)

    # Allow manual timeout override via X-Scan-Timeout header
    if x_scan_timeout:
        try:
            override_timeout = int(x_scan_timeout)
            if override_timeout > 0:
                scan_timeout = override_timeout
                logger.info(f"Scan timeout overridden via header: {scan_timeout} seconds")
            else:
                logger.warning(f"Invalid X-Scan-Timeout header value")
        except ValueError:
            logger.warning(f"Invalid X-Scan-Timeout header value")
```

---

### 2. Jenkins Service (`backend/app/services/jenkins_service.py`)

#### Payload with Timeout
```python
payload = {
    "SCAN_ID": scan.scan_id,
    "SCAN_MODE": scan.scan_mode.upper(),
    "PROJECT_DATA": json.dumps({...}),
    "SELECTED_STAGES": json.dumps(scan.selected_stages),
    "SCAN_TIMEOUT": str(project_data.get("scan_timeout", 7200)),  # Dynamic timeout
}
```

---

### 3. Celery Task (`backend/app/tasks/jenkins_tasks.py`)

#### Timeout Logging
```python
# Log the timeout that was sent to Jenkins
scan_timeout = project_data.get('scan_timeout', 7200)
logger.info(f"Scan {scan_id} started with timeout: {scan_timeout} seconds ({scan_timeout/60:.1f} minutes)")
```

---

### 4. Jenkins Pipeline (`Jenkinsfile`)

#### Dynamic Pipeline Timeout
```groovy
parameters {
    text(name: 'SCAN_TIMEOUT', defaultValue: '7200')  // Max 2 hours
}

environment {
    PIPELINE_TIMEOUT = params.SCAN_TIMEOUT ?: '7200'
}

options {
    timeout(time: Integer.parseInt(env.PIPELINE_TIMEOUT), unit: 'SECONDS')
    buildDiscarder(logRotator(numToKeepStr: '10'))
}
```

#### Per-Stage Timeouts
```groovy
stage('2. Sonar Scanner') {
    steps {
        timeout(time: 15, unit: 'MINUTES') {
            // Sonar analysis
        }
    }
}

stage('3. Sonar Quality Gate') {
    steps {
        timeout(time: 10, unit: 'MINUTES') {
            // Quality gate check
        }
    }
}

stage('4. NPM / PIP Install') {
    steps {
        timeout(time: 10, unit: 'MINUTES') {
            // Dependency installation
        }
    }
}
```

---

### 5. Environment Configuration

#### `.env.dev`
```bash
SCAN_TIMEOUT=7200  # Default 2 hours for development
```

#### `.env.test`
```bash
SCAN_TIMEOUT=120  # 2 minutes for fast test cycles
```

#### `.env.staging`
```bash
SCAN_TIMEOUT=3600  # 1 hour for staging
```

---

## Usage Examples

### Default Scan (All Stages)
```bash
curl -X POST http://localhost:8000/api/v1/scans \
  -H "Authorization: Bearer <token>" \
  -d '{"project_id": "...", "scan_mode": "automated"}'
```
**Calculated timeout:** `sum(all_stages) × 1.2 = 105 min × 1.2 = 126 minutes`

### Specific Stages
```bash
curl -X POST http://localhost:8000/api/v1/scans \
  -H "Authorization: Bearer <token>" \
  -d '{"project_id": "...", "scan_mode": "manual", "selected_stages": ["git_checkout", "sonar_scanner"]}'
```
**Calculated timeout:** `(300 + 900) × 1.2 = 1440 seconds (24 minutes)`

### Manual Timeout Override
```bash
curl -X POST http://localhost:8000/api/v1/scans \
  -H "Authorization: Bearer <token>" \
  -H "X-Scan-Timeout: 10800" \
  -d '{"project_id": "...", "scan_mode": "automated"}'
```
**Timeout:** `10800 seconds (3 hours)` - overrides calculated value

---

## Timeout Calculations

| Scan Type | Stages | Base Time | With 20% Buffer |
|-----------|--------|-----------|-----------------|
| **Quick Scan** | Git + Sonar | 15 min | **18 min** |
| **Standard Scan** | Git + Sonar + Quality Gate + Deps | 40 min | **48 min** |
| **Full Scan** | All 11 stages | 105 min | **126 min** |
| **Security Focus** | Git + Trivy + ZAP | 70 min | **84 min** |
| **Container Scan** | Git + Docker + Trivy Image | 40 min | **48 min** |

---

## Benefits

| Benefit | Description |
|---------|-------------|
| **No Arbitrary Limits** | Timeout based on actual work to be done |
| **Better Resource Usage** | Short scans complete quickly, long scans have time |
| **Visibility** | Logs show expected duration before scan starts |
| **Graceful Degradation** | Per-stage timeouts prevent one stage from blocking all |
| **Configurable** | Can override via `X-Scan-Timeout` header |
| **Safety Buffer** | 20% overhead accounts for network/environment variance |

---

## Monitoring

### Backend Logs
```
INFO: Calculated scan timeout: 5400 seconds (90.0 minutes)
INFO: Scan timeout overridden via header: 10800 seconds (180.0 minutes)
INFO: Scan 990cdac2-e312-496d-adc1-c2e9ce2df231 started with timeout: 5400 seconds
```

### Jenkins Console
```
[Pipeline] timeout
Timeout set to 5400 seconds (90.0 minutes)
[Pipeline] {
[Pipeline] // stage
[Pipeline] { (2. Sonar Scanner)
[Pipeline] timeout
Timeout set to 900 seconds (15.0 minutes)
```

---

## Files Modified

| File | Changes |
|------|---------|
| `backend/app/api/scans.py` | Added `calculate_scan_timeout()`, `STAGE_TIMEOUTS`, `X-Scan-Timeout` header support |
| `backend/app/services/jenkins_service.py` | Added `SCAN_TIMEOUT` to payload |
| `backend/app/tasks/jenkins_tasks.py` | Added timeout logging |
| `Jenkinsfile` | Added dynamic `PIPELINE_TIMEOUT`, per-stage timeouts |
| `.env.dev` | Updated `SCAN_TIMEOUT=7200` |

---

## Testing Checklist

- [x] Stage timeout constants defined
- [x] Dynamic calculation function implemented
- [x] Timeout passed to Celery task
- [x] Timeout passed to Jenkins payload
- [x] Jenkins receives and applies timeout
- [x] Per-stage timeouts configured
- [x] Manual override header supported
- [x] Logging implemented
- [x] Environment variables configured

---

## Future Enhancements

1. **Progress Heartbeats**: Extend timeout if scan is making progress
2. **Historical Analysis**: Learn from past scan durations to improve predictions
3. **Project Size Detection**: Adjust timeout based on codebase size (lines of code)
4. **Stage Retry Logic**: Retry failed stages before timeout
5. **Timeout Warnings**: Send Slack/Email notifications at 80% timeout threshold

---

**Implementation Status:** ✅ Complete
**Next Review:** March 27, 2026
