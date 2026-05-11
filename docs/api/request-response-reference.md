# API Request/Response Reference

Complete documentation for all REST API endpoints with request/response examples.

---

## Base URL

| Environment | URL |
|-------------|-----|
| Dev | `http://localhost:8000/api/v1` |
| Test | `http://localhost:8000/api/v1` |
| Staging | `http://localhost:8000/api/v1` |

---

## Authentication

### Headers Required

| Header | Value | Required |
|--------|-------|----------|
| `Authorization` | `Bearer <jwt_token>` | ✅ Yes (protected routes) |
| `X-API-Key` | `<api_key>` | ✅ Yes (service-to-service) |
| `Content-Type` | `application/json` | ✅ Yes (POST/PATCH) |

---

## 1. Authentication Endpoints

### 1.1 User Login

**Endpoint:** `POST /api/v1/auth/login`

**Auth Required:** No

**Request:**
```http
POST /api/v1/auth/login
Content-Type: application/x-www-form-urlencoded

username=alice&password=secret123
```

**Response (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhbGljZSIsImV4cCI6MTcxMzAxNjgwMH0.abc123",
  "token_type": "bearer"
}
```

**Error Responses:**

| Status | Body | Scenario |
|--------|------|----------|
| 401 | `{"detail": "Incorrect username or password"}` | Wrong credentials |
| 422 | `{"detail": [...]}` | Missing required fields |

---

### 1.2 User Registration

**Endpoint:** `POST /api/v1/auth/register`

**Auth Required:** No

**Request:**
```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "username": "alice",
  "password": "secret123",
  "email": "alice@example.com"
}
```

**Response (201 Created):**
```json
{
  "username": "alice",
  "id": "uuid-123-abc",
  "created_at": "2026-04-13T10:00:00Z"
}
```

**Error Responses:**

| Status | Body | Scenario |
|--------|------|----------|
| 400 | `{"detail": "Username already registered"}` | Duplicate username |
| 422 | `{"detail": [...]}` | Invalid input |

---

## 2. Project Endpoints

### 2.1 List Projects

**Endpoint:** `GET /api/v1/projects`

**Auth Required:** Yes

**Request:**
```http
GET /api/v1/projects
Authorization: Bearer eyJ...
X-API-Key: z9y8...
```

**Response (200 OK):**
```json
[
  {
    "project_id": "abc-123-def",
    "name": "My Application",
    "last_scan_state": "COMPLETED",
    "last_scan_id": "scan-456-ghi"
  },
  {
    "project_id": "def-456-ghi",
    "name": "WebApp",
    "last_scan_state": "RUNNING",
    "last_scan_id": "scan-789-jkl"
  }
]
```

---

### 2.2 Get Project Details

**Endpoint:** `GET /api/v1/projects/{project_id}`

**Auth Required:** Yes

**Request:**
```http
GET /api/v1/projects/abc-123-def
Authorization: Bearer eyJ...
```

**Response (200 OK):**
```json
{
  "project_id": "abc-123-def",
  "name": "My Application",
  "git_url": "https://github.com/user/myapp.git",
  "branch": "main",
  "credentials_id": "github-credentials",
  "sonar_key": "myapp-key",
  "target_ip": "192.168.1.100",
  "target_url": "http://myapp.com",
  "status": "CREATED",
  "last_scan_state": "COMPLETED",
  "last_scan_id": "scan-456-ghi",
  "created_at": "2026-04-13T09:00:00Z",
  "updated_at": "2026-04-13T10:36:00Z"
}
```

**Error Responses:**

| Status | Body | Scenario |
|--------|------|----------|
| 404 | `{"detail": "Project not found"}` | Invalid project_id |

---

### 2.3 Create Project

**Endpoint:** `POST /api/v1/projects`

**Auth Required:** Yes

**Request:**
```http
POST /api/v1/projects
Authorization: Bearer eyJ...
X-API-Key: z9y8...
Content-Type: application/json

{
  "name": "My Application",
  "git_url": "https://github.com/user/myapp.git",
  "branch": "main",
  "credentials_id": "github-credentials",
  "sonar_key": "myapp-key",
  "target_ip": "192.168.1.100",
  "target_url": "http://myapp.com"
}
```

**Response (201 Created):**
```json
{
  "project_id": "abc-123-def",
  "name": "My Application",
  "git_url": "https://github.com/user/myapp.git",
  "branch": "main",
  "credentials_id": "github-credentials",
  "sonar_key": "myapp-key",
  "target_ip": "192.168.1.100",
  "target_url": "http://myapp.com",
  "status": "CREATED",
  "last_scan_state": null,
  "last_scan_id": null,
  "created_at": "2026-04-13T10:00:00Z",
  "updated_at": "2026-04-13T10:00:00Z"
}
```

---

### 2.4 Update Project

**Endpoint:** `PATCH /api/v1/projects/{project_id}`

**Auth Required:** Yes

**Request:**
```http
PATCH /api/v1/projects/abc-123-def
Authorization: Bearer eyJ...
Content-Type: application/json

{
  "name": "My Updated Application",
  "target_ip": "192.168.1.105"
}
```

**Response (200 OK):**
```json
{
  "project_id": "abc-123-def",
  "name": "My Updated Application",
  "git_url": "https://github.com/user/myapp.git",
  "branch": "main",
  "credentials_id": "github-credentials",
  "sonar_key": "myapp-key",
  "target_ip": "192.168.1.105",
  "target_url": "http://myapp.com",
  "status": "CREATED",
  "last_scan_state": "COMPLETED",
  "last_scan_id": "scan-456-ghi",
  "created_at": "2026-04-13T10:00:00Z",
  "updated_at": "2026-04-13T11:00:00Z"
}
```

**Error Responses:**

| Status | Body | Scenario |
|--------|------|----------|
| 404 | `{"detail": "Project not found"}` | Invalid project_id |
| 409 | `{"detail": "Project cannot be edited while a scan is active"}` | Scan in progress |

---

### 2.5 Delete Project

**Endpoint:** `DELETE /api/v1/projects/{project_id}`

**Auth Required:** Yes

**Request:**
```http
DELETE /api/v1/projects/abc-123-def
Authorization: Bearer eyJ...
```

**Response (200 OK):**
```json
{
  "detail": "Project deleted successfully",
  "deleted_scans": 5,
  "deleted_artifact_paths": 3
}
```

---

### 2.6 Get Project Scan History

**Endpoint:** `GET /api/v1/projects/{project_id}/scans`

**Auth Required:** Yes

**Request:**
```http
GET /api/v1/projects/abc-123-def/scans
Authorization: Bearer eyJ...
```

**Response (200 OK):**
```json
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
    "jenkins_queue_id": "41",
    "stage_results": [
      {
        "stage": "git_checkout",
        "status": "PASS",
        "summary": "Git checkout successful",
        "artifact_url": null,
        "artifact_size_bytes": null,
        "artifact_sha256": null
      },
      ...
    ],
    "error_message": null,
    "error_type": null,
    "jenkins_console_url": null,
    "retry_count": 0
  },
  ...
]
```

---

## 3. Scan Endpoints

### 3.1 Trigger Scan

**Endpoint:** `POST /api/v1/scans`

**Auth Required:** Yes

**Request (Automated):**
```http
POST /api/v1/scans
Authorization: Bearer eyJ...
X-API-Key: z9y8...
Content-Type: application/json

{
  "project_id": "abc-123-def",
  "scan_mode": "automated",
  "selected_stages": []
}
```

**Request (Manual):**
```http
POST /api/v1/scans
Authorization: Bearer eyJ...
Content-Type: application/json

{
  "project_id": "abc-123-def",
  "scan_mode": "manual",
  "selected_stages": [
    "git_checkout",
    "npm_pip_install",
    "trivy_fs_scan"
  ]
}
```

**Response (201 Created):**
```json
{
  "scan_id": "scan-789-jkl",
  "project_id": "abc-123-def",
  "scan_mode": "automated",
  "state": "CREATED",
  "selected_stages": [],
  "created_at": "2026-04-13T10:00:00Z",
  "started_at": null,
  "finished_at": null,
  "jenkins_build_number": null,
  "jenkins_queue_id": null,
  "stage_results": [],
  "error_message": null,
  "error_type": null,
  "jenkins_console_url": null,
  "retry_count": 0
}
```

**Error Responses:**

| Status | Body | Scenario |
|--------|------|----------|
| 400 | `{"detail": "Invalid scan mode"}` | Invalid scan_mode value |
| 400 | `{"detail": "docker_push requires docker_build"}` | Missing dependency |
| 404 | `{"detail": "Project not found"}` | Invalid project_id |
| 409 | `{"detail": "An active scan already exists for this project"}` | Scan in progress |
| 429 | `{"detail": "Rate limit exceeded"}` | Too many requests |

**Optional Headers:**

| Header | Description | Example |
|--------|-------------|---------|
| `X-Scan-Timeout` | Override calculated timeout (seconds) | `X-Scan-Timeout: 9000` |

---

### 3.2 List All Scans

**Endpoint:** `GET /api/v1/scans`

**Auth Required:** Yes

**Request:**
```http
GET /api/v1/scans
Authorization: Bearer eyJ...
```

**Response (200 OK):**
```json
[
  {
    "scan_id": "scan-789-jkl",
    "project_id": "abc-123-def",
    "scan_mode": "automated",
    "state": "COMPLETED",
    "selected_stages": [],
    "created_at": "2026-04-13T10:00:00Z",
    "started_at": "2026-04-13T10:00:30Z",
    "finished_at": "2026-04-13T10:36:00Z",
    "jenkins_build_number": "42",
    "jenkins_queue_id": "41",
    "stage_results": [...],
    "error_message": null,
    "error_type": null,
    "jenkins_console_url": null,
    "retry_count": 0
  },
  ...
]
```

**Note:** This endpoint checks for timed-out scans and marks them as FAILED.

---

### 3.3 Get Scan Details

**Endpoint:** `GET /api/v1/scans/{scan_id}`

**Auth Required:** Yes

**Request:**
```http
GET /api/v1/scans/scan-789-jkl
Authorization: Bearer eyJ...
```

**Response (200 OK):**
```json
{
  "scan_id": "scan-789-jkl",
  "project_id": "abc-123-def",
  "scan_mode": "automated",
  "state": "COMPLETED",
  "selected_stages": [],
  "created_at": "2026-04-13T10:00:00Z",
  "started_at": "2026-04-13T10:00:30Z",
  "finished_at": "2026-04-13T10:36:00Z",
  "jenkins_build_number": "42",
  "jenkins_queue_id": "41",
  "stage_results": [
    {
      "stage": "git_checkout",
      "status": "PASS",
      "summary": "Git checkout successful",
      "artifact_url": null,
      "artifact_size_bytes": null,
      "artifact_sha256": null
    },
    ...
  ],
  "error_message": null,
  "error_type": null,
  "jenkins_console_url": null,
  "retry_count": 0
}
```

**Note:** This endpoint checks if scan has timed out.

---

### 3.4 Get Scan Stage Results

**Endpoint:** `GET /api/v1/scans/{scan_id}/results`

**Auth Required:** Yes

**Request:**
```http
GET /api/v1/scans/scan-789-jkl/results
Authorization: Bearer eyJ...
```

**Response (200 OK):**
```json
{
  "scan_id": "scan-789-jkl",
  "results": [
    {
      "stage": "git_checkout",
      "status": "PASS",
      "summary": "Git checkout successful",
      "artifact_url": null,
      "artifact_size_bytes": null,
      "artifact_sha256": null
    },
    {
      "stage": "sonar_scanner",
      "status": "PASS",
      "summary": "Sonar scan completed",
      "artifact_url": null,
      "artifact_size_bytes": null,
      "artifact_sha256": null
    },
    ...
  ]
}
```

---

### 3.5 Jenkins Callback

**Endpoint:** `POST /api/v1/scans/{scan_id}/callback`

**Auth Required:** Yes (via `X-Callback-Token` header)

**Request:**
```http
POST /api/v1/scans/scan-789-jkl/callback
Content-Type: application/json
X-Callback-Token: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6

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
    ...
  ],
  "finished_at": "2026-04-13T10:36:00Z",
  "error_message": null,
  "error_type": null,
  "jenkins_console_url": "http://localhost:8080/job/Security-pipeline/42/console"
}
```

**Response (200 OK):**
```json
{
  "status": "success"
}
```

**Idempotent Response (duplicate callback):**
```json
{
  "status": "success",
  "idempotent": true
}
```

**Error Responses:**

| Status | Body | Scenario |
|--------|------|----------|
| 401 | `{"detail": "Invalid callback token"}` | Wrong token |
| 404 | `{"detail": "Scan not found"}` | Invalid scan_id |
| 400 | `{"detail": "Invalid stage identifier"}` | Unknown stage |
| 400 | `{"detail": "Invalid stage status"}` | Unknown status |

---

## 4. Scan Management Endpoints

### 4.1 Reset Scan

**Endpoint:** `POST /api/v1/scans/{scan_id}/reset`

**Auth Required:** Yes

**Request:**
```http
POST /api/v1/scans/scan-789-jkl/reset
Authorization: Bearer eyJ...
```

**Response (200 OK):**
```json
{
  "scan_id": "scan-789-jkl",
  "project_id": "abc-123-def",
  "scan_mode": "automated",
  "state": "CREATED",
  "selected_stages": [],
  "created_at": "2026-04-13T10:00:00Z",
  "started_at": null,
  "finished_at": null,
  "jenkins_build_number": null,
  "jenkins_queue_id": null,
  "stage_results": [],
  "error_message": null,
  "error_type": null,
  "jenkins_console_url": null,
  "retry_count": 1
}
```

**Error Responses:**

| Status | Body | Scenario |
|--------|------|----------|
| 404 | `{"detail": "Scan not found"}` | Invalid scan_id |
| 404 | `{"detail": "Project not found"}` | Project deleted |
| 400 | `{"detail": "Maximum retry count (10) reached"}` | Retry limit exceeded |

---

### 4.2 Cancel Scan

**Endpoint:** `POST /api/v1/scans/{scan_id}/cancel`

**Auth Required:** Yes

**Request:**
```http
POST /api/v1/scans/scan-789-jkl/cancel
Authorization: Bearer eyJ...
```

**Response (200 OK):**
```json
{
  "status": "success",
  "message": "Scan scan-789-jkl cancelled successfully",
  "scan_id": "scan-789-jkl"
}
```

**Error Responses:**

| Status | Body | Scenario |
|--------|------|----------|
| 404 | `{"detail": "Scan not found"}` | Invalid scan_id |
| 400 | `{"detail": "Cannot cancel scan in COMPLETED state"}` | Already terminal |

---

### 4.3 Force Unlock Scan (Admin)

**Endpoint:** `POST /api/v1/scans/{scan_id}/force-unlock`

**Auth Required:** Yes (admin only in production, bypassed in test)

**Request:**
```http
POST /api/v1/scans/scan-789-jkl/force-unlock
Authorization: Bearer eyJ...
```

**Response (200 OK):**
```json
{
  "status": "success",
  "message": "Scan scan-789-jkl unlocked successfully",
  "scan_id": "scan-789-jkl"
}
```

**Error Responses:**

| Status | Body | Scenario |
|--------|------|----------|
| 404 | `{"detail": "Scan not found"}` | Invalid scan_id |
| 400 | `{"detail": "Cannot unlock scan in COMPLETED state"}` | Already terminal |

---

## 5. WebSocket Endpoints

### 5.1 Scan-Specific Updates

**Endpoint:** `ws://localhost:8000/api/v1/ws/scans?scan_id={scan_id}`

**Auth Required:** No (but scan_id required)

**Connection:**
```
ws://localhost:8000/api/v1/ws/scans?scan_id=scan-789-jkl
```

**Message Format:**
```json
{
  "event": "scan.state_changed",
  "scan_id": "scan-789-jkl",
  "project_id": "abc-123-def",
  "data": {
    "scan_id": "scan-789-jkl",
    "state": "COMPLETED",
    "stage_results": [...],
    "jenkins_build_number": "42",
    "finished_at": "2026-04-13T10:36:00Z"
  }
}
```

**Keepalive:**
- Client sends: `"ping"`
- Server responds: `"pong"`
- Interval: Every 30 seconds

---

### 5.2 Dashboard Updates

**Endpoint:** `ws://localhost:8000/api/v1/ws/dashboard`

**Auth Required:** No

**Connection:**
```
ws://localhost:8000/api/v1/ws/dashboard
```

**Receives:** All scan state changes across all projects

---

## 6. Health Check

### 6.1 Root Endpoint

**Endpoint:** `GET /`

**Auth Required:** No

**Request:**
```http
GET /
```

**Response (200 OK):**
```json
{
  "message": "DevSecOps Control Plane is live (via PostgreSQL)"
}
```

---

## 7. Error Response Format

All error responses follow this format:

```json
{
  "detail": "Human-readable error message"
}
```

**Validation Errors (422):**
```json
{
  "detail": [
    {
      "loc": ["body", "name"],
      "msg": "field required",
      "type": "value_error.missing"
    }
  ]
}
```

---

## 8. Rate Limiting

| Endpoint | Limit | Environment |
|----------|-------|-------------|
| `POST /scans` | 10/minute | Dev/Staging |
| `POST /scans` | 1000/minute | Test |
| `GET /scans` | 50/minute | Dev/Staging |
| `POST /scans/{id}/reset` | 10/minute | All |
| `POST /scans/{id}/cancel` | 10/minute | All |
| `POST /scans/{id}/force-unlock` | 10/minute | All |

**Rate Limit Exceeded (429):**
```json
{
  "detail": "Rate limit exceeded"
}
```

---

## 9. CORS Configuration

**Allowed Origins:**
- Dev: `["http://localhost:5173"]`
- Test: `["http://localhost:5173"]`
- Staging: `["http://localhost:5173"]`

**Allowed Methods:** `*` (all)

**Allowed Headers:** `*` (all)

**Credentials:** `true`

---

*Generated: 2026-04-13 | Based on backend/app/api/*.py*
