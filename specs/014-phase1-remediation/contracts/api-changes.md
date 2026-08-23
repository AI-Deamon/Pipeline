# API Changes: Phase 1 Audit Remediation

**Date**: 2026-07-13
**Feature**: Phase 1 Audit Remediation

---

## Modified Endpoints

### POST /api/v1/auth/login

**Change**: Sets httpOnly cookies in addition to JSON response body.

**Request** (unchanged):
```
Content-Type: application/x-www-form-urlencoded

username=admin&password=admin123
```

**Response** (unchanged body, new cookies):
```http
HTTP/1.1 200 OK
Set-Cookie: access_token=eyJ...; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600; Secure
Set-Cookie: refresh_token=eyJ...; Path=/auth; HttpOnly; SameSite=Lax; Max-Age=0; Secure

{
  "access_token": "eyJ...",
  "token_type": "bearer"
}
```

**Notes**:
- `token_type` remains `"bearer"` for backward compatibility during grace period.
- The `access_token` in the JSON body is deprecated after the 24-hour grace period.
- `Max-Age=0` on `refresh_token` makes it a session cookie (destroyed on browser close).

---

### POST /api/v1/auth/refresh (NEW)

**Purpose**: Issue a new access token using the session-only refresh token.

**Request**:
```
No body required. Refresh token is read from the httpOnly cookie.
Cookie: refresh_token=eyJ...
```

**Response (success)**:
```http
HTTP/1.1 200 OK
Set-Cookie: access_token=eyJ...; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600; Secure

{
  "access_token": "eyJ...",
  "token_type": "bearer"
}
```

**Response (refresh token missing/invalid)**:
```http
HTTP/1.1 401 Unauthorized

{
  "detail": "Invalid or missing refresh token"
}
```

---

### GET /api/v1/projects

**Change**: Add pagination parameters and response envelope.

**Request**:
```
GET /api/v1/projects?page=1&page_size=25
Authorization: Bearer eyJ...
```

**Response**:
```json
{
  "items": [
    {
      "project_id": "my-app",
      "name": "My Application",
      "last_scan_state": "COMPLETED",
      "last_scan_id": "scan-abc-123",
      "last_scan_time": "2026-07-12T14:30:00Z"
    }
  ],
  "total": 150,
  "page": 1,
  "page_size": 25,
  "total_pages": 6
}
```

**Query Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| page | int | 1 | Page number (1-indexed) |
| page_size | int | 25 | Items per page (max 100) |

**Notes**:
- Response shape changes from `list[dict]` to `{ items: list[dict], total: int, page: int, page_size: int, total_pages: int }`.
- This is a **breaking change** to the response shape. Frontend must be updated simultaneously.
- Existing consumers expecting a plain array will need to read `.items` instead.

---

## Unchanged Endpoints

All other endpoints remain unchanged:
- `POST /api/v1/auth/register` — same cookie behavior as login (new cookies added)
- `GET /api/v1/scans/*` — no changes
- `POST /api/v1/scans/*` — no changes
- `GET /api/v1/issues/*` — no changes
- `GET /api/v1/reports/*` — no changes
- `WebSocket /ws/*` — no changes
- `GET /docs`, `GET /openapi.json` — no changes
