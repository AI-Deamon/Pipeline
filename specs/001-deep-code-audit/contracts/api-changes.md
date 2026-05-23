# API Contracts: Deep Code Audit Fixes

**Date**: 2026-05-22

## Changes to Existing Endpoints

### 1. All Protected Endpoints — User Isolation (S1)

**Behavior change**: All project/scan/report queries now filter by `user_id` of the authenticated user.

**Before**: `GET /api/v1/projects` returns ALL projects.
**After**: `GET /api/v1/projects` returns only projects where `user_id == current_user.id`.

**API-key bypass**: Requests authenticated via `X-API-Key` see all data (service account pattern).

**Backward compatible**: Yes — the response format is unchanged; only the data scope changes.

### 2. `DELETE /api/v1/projects/{project_id}` — Block Active Scans (B1)

**Before**: Deletes project even with active scans.
**After**: Returns `409 Conflict` if project has scans in `CREATED`, `QUEUED`, or `RUNNING` state.

```json
{
  "detail": "Cannot delete project with active scans. Cancel or wait for completion."
}
```

### 3. `POST /api/v1/auth/register` — Rate Limiting + Validation (S4)

**Before**: No rate limit, no password validation.
**After**: 
- Rate limit: `5/minute`
- Password: `min_length=8`

```json
// 429 Too Many Requests
{
  "detail": "Rate limit exceeded: 5 per 1 minute"
}

// 422 Validation Error
{
  "detail": [
    {
      "loc": ["body", "password"],
      "msg": "ensure this value has at least 8 characters",
      "type": "value_error"
    }
  ]
}
```

### 4. `GET /api/v1/scans` — Pagination (B4)

**Before**: Returns ALL scans.
**After**: Supports `limit` and `offset` query params.

```
GET /api/v1/scans?limit=50&offset=0
```

Default: `limit=100`, `offset=0`. Response format unchanged (still returns array).

### 5. `GET /api/v1/reports/projects/{project_id}/reports` — Ownership Check (S10)

**Before**: Any auth user can access any project's reports.
**After**: Returns 404 if project doesn't belong to current user (or doesn't exist).

### 6. `GET /api/v1/reports/{report_id}` — Ownership Check (S10)

**Before**: Any auth user can access any report by ID.
**After**: Verifies the report's project belongs to the current user. Returns 404 if not.

### 7. `POST /api/v1/scans/{scan_id}/callback` — Timing-Safe Token (S9)

**No API change**. Internal implementation change: `!=` replaced with `hmac.compare_digest()`.

### 8. `POST /api/v1/scans/{scan_id}/force-unlock` — Admin Only (S11)

**Before**: Any auth user can force-unlock.
**After**: Requires API-key authentication (not just JWT). JWT-authenticated users get 403.

### 9. `POST /api/v1/scans` — Timeout Cap (S12)

**Before**: `X-Scan-Timeout` header accepts any positive integer.
**After**: Capped at `max(settings.SCAN_TIMEOUT * 3, 7200)` seconds (2 hours max).

## New Endpoints

None. All fixes are to existing endpoints.

## Response Format Changes

None. All responses maintain existing schemas.
