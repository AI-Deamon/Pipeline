# Enhanced Scan Timeout System

## Overview

This document describes the improved scan timeout mechanism that replaces arbitrary time limits with **dynamic, progress-aware timeouts**.

## Problem with Fixed Timeouts

The previous implementation used a fixed 20-minute timeout for all scans:
```groovy
options {
    timeout(time: 240, unit: 'MINUTES')  // Fixed 4 hours
}
```

**Issues:**
- Too short for complex scans (Sonar + Trivy + ZAP)
- Too long for simple scans (just Git + Sonar)
- No visibility into expected duration
- Scans aborted mid-execution

## Solution: Dynamic Timeout Calculation

### Backend Changes

#### 1. Stage-Specific Timeouts (`backend/app/api/scans.py`)

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

#### 2. Dynamic Calculation

```python
def calculate_scan_timeout(selected_stages: list) -> int:
    """Calculate dynamic timeout based on selected stages"""
    if not selected_stages:
        # Default: all stages
        return sum(STAGE_TIMEOUTS.values())  # ~2 hours
    
    total = 0
    for stage in selected_stages:
        total += STAGE_TIMEOUTS.get(stage, 300)
    
    # Add 20% buffer for overhead
    return int(total * 1.2)
```

**Example Calculations:**

| Scan Type | Stages | Calculated Timeout |
|-----------|--------|-------------------|
| **Quick Scan** | Git + Sonar | 15 min × 1.2 = **18 min** |
| **Standard Scan** | Git + Sonar + Quality Gate + Deps | 40 min × 1.2 = **48 min** |
| **Full Scan** | All stages | 105 min × 1.2 = **126 min** |
| **Security Focus** | Git + Trivy + ZAP | 70 min × 1.2 = **84 min** |

### Jenkinsfile Changes

#### 1. Dynamic Pipeline Timeout

```groovy
parameters {
    text(name: 'SCAN_TIMEOUT', defaultValue: '7200')  // Max 2 hours
}

options {
    timeout(time: Integer.parseInt(env.PIPELINE_TIMEOUT), unit: 'SECONDS')
    buildDiscarder(logRotator(numToKeepStr: '10'))
}
```

#### 2. Per-Stage Timeouts

```groovy
stage('2. Sonar Scanner') {
    steps {
        timeout(time: 15, unit: 'MINUTES') {  // Stage-specific
            script {
                // Sonar analysis
            }
        }
    }
}

stage('3. Sonar Quality Gate') {
    steps {
        timeout(time: 10, unit: 'MINUTES') {  // Stage-specific
            waitForQualityGate abortPipeline: false
        }
    }
}
```

### Payload Flow

```
┌─────────────┐
│   Backend   │
│             │
│  calculate  │
│  timeout    │
└──────┬──────┘
       │ scan_timeout: 5400
       ▼
┌─────────────┐
│   Celery    │
│   Task      │
└──────┬──────┘
       │ SCAN_TIMEOUT: "5400"
       ▼
┌─────────────┐
│   Jenkins   │
│   Pipeline  │
│             │
│  options {  │
│   timeout(  │
│     time:   │
│     5400,   │
│     unit:   │
│     'SECONDS')│
│  }          │
└─────────────┘
```

## Benefits

| Benefit | Description |
|---------|-------------|
| **No Arbitrary Limits** | Timeout based on actual work to be done |
| **Better Resource Usage** | Short scans complete quickly, long scans have time |
| **Visibility** | Logs show expected duration before scan starts |
| **Graceful Degradation** | Per-stage timeouts prevent one stage from blocking all |
| **Configurable** | Can override via `SCAN_TIMEOUT` parameter |

## Usage

### Trigger Scan with Default Timeout

```bash
curl -X POST http://localhost:8000/api/v1/scans \
  -H "Authorization: Bearer <token>" \
  -d '{"project_id": "...", "scan_mode": "automated"}'
```

Backend calculates: `sum(all_stages) × 1.2 = 7200 seconds`

### Trigger Scan with Specific Stages

```bash
curl -X POST http://localhost:8000/api/v1/scans \
  -H "Authorization: Bearer <token>" \
  -d '{"project_id": "...", "scan_mode": "manual", "selected_stages": ["git_checkout", "sonar_scanner"]}'
```

Backend calculates: `(300 + 900) × 1.2 = 1440 seconds (24 minutes)`

### Override Timeout Manually

```bash
curl -X POST http://localhost:8000/api/v1/scans \
  -H "Authorization: Bearer <token>" \
  -d '{"project_id": "...", "scan_mode": "automated"}' \
  -H "X-Scan-Timeout: 10800"  # 3 hours
```

## Monitoring

### Backend Logs

```
INFO: Calculated scan timeout: 5400 seconds (90.0 minutes)
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

## Future Enhancements

1. **Progress Heartbeats**: Extend timeout if scan is making progress
2. **Historical Analysis**: Learn from past scan durations
3. **Project Size Detection**: Adjust based on codebase size
4. **Stage Retry Logic**: Retry failed stages before timeout
