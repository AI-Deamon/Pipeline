# FINALIZED ARCHITECTURE: UI ↔ BACKEND WIRING

This document defines the authoritative and finalized architectural contracts for the DevSecOps scanning platform. These specifications supersede all earlier implicit assumptions.

## 1. API BASE CONTRACT
- **Base URL**: `/api/v1`
- **Versioning**: Mandatory for production readiness and forward compatibility.

## 2. DATA IDENTIFIERS AND CASING
- **Naming Convention**: All API JSON keys must use `snake_case`.
- **Identifiers**:
  - `project_id` must be used for project identification.
  - `scan_id` must be used for scan identification.
- **Project Fields**:
  - `name`
  - `git_url`
  - `branch`
  - `credentials_id`
  - `sonar_key`
  - `target_ip`
  - `target_url`

## 3. PROJECT LIFECYCLE FLOW
### Create Project
- **API**: `POST /api/v1/projects`
- **Response**: `{"project_id": "...", "status": "CREATED"}`

### List Projects
- **API**: `GET /api/v1/projects`
- **Response**: `[{"project_id": "...", "name": "...", "last_scan_state": "..."}]`

## 4. SCAN EXECUTION FLOW
### Trigger Scan
- **API**: `POST /api/v1/scans`
- **Response**: `{"scan_id": "...", "state": "QUEUED"}`

### Get Scan Status
- **API**: `GET /api/v1/scans/{scan_id}`
- **Response**: `{"scan_id": "...", "state": "RUNNING", "started_at": "..."}`

### Get Scan Results
- **API**: `GET /api/v1/scans/{scan_id}/results`
- **Response**: `{"scan_id": "...", "results": [{"stage": "...", "status": "...", "summary": "..."}]}`

## 5. SCAN STATE MAPPING
- `CREATED` -> UI: Initial
- `QUEUED` -> UI: Waiting
- `RUNNING` -> UI: In Progress
- `COMPLETED` -> UI: Finished
- `FAILED` -> UI: Failed
- `CANCELLED` -> UI: Cancelled
