# Quickstart: Phase 1 Audit Remediation

**Date**: 2026-07-13
**Feature**: Phase 1 Audit Remediation

---

## What This Delivers

Five fixes from the 2026-07-13 comprehensive audit:

1. **FR-1**: Scan reports are deduplicated — `(scan_id, tool_name)` is now unique. Concurrent fetches update instead of duplicating.
2. **FR-2**: Background tasks have a 10-minute hard kill and 9-minute soft kill. Hung workers are freed automatically.
3. **FR-3**: Executive dashboards show errors (not silent failures), never display `NaN`, and only show trend indicators when real historical data exists.
4. **FR-4**: Authentication tokens move to httpOnly cookies (`SameSite=Lax`). Access tokens last 1 hour. Refresh tokens are session-only. The shared API key is retired from the browser.
5. **FR-5**: The project list API is paginated (25 per page default) and uses batch queries instead of N+1.

---

## How to Verify

### FR-1: Deduplication
```bash
# Trigger the same report fetch twice
curl -X POST http://localhost:8000/api/v1/scans/retry-reports/SCAN_ID
curl -X POST http://localhost:8000/api/v1/scans/retry-reports/SCAN_ID

# Verify exactly one row
psql -c "SELECT COUNT(*) FROM scan_reports WHERE scan_id='SCAN_ID' AND tool_name='trivy_fs';"
# Expected: 1
```

### FR-2: Task Timeouts
```bash
# Check Celery config
docker compose exec celery_worker python -c "
from app.core.celery_app import celery_app
print('time_limit:', celery_app.conf.task_time_limit)
print('soft_time_limit:', celery_app.conf.task_soft_time_limit)
"
# Expected: time_limit: 600, soft_time_limit: 540
```

### FR-3: Dashboard Error Handling
1. Stop the backend: `docker compose stop backend`
2. Open Executive Summary page in browser
3. Expected: `ErrorDisplay` component with "Something went wrong" and a Retry button
4. Expected: No `NaN` values visible anywhere
5. Restart backend: `docker compose start backend`

### FR-4: Cookie-Based Auth
```bash
# Login and inspect response headers
curl -v -X POST http://localhost:8000/api/v1/auth/login \
  -d "username=admin&password=admin123" \
  2>&1 | grep -i set-cookie

# Expected: Set-Cookie headers for access_token and refresh_token
# Verify access_token is NOT readable by JavaScript:
# Open browser console → document.cookie → access_token should NOT appear
```

### FR-5: Paginated Projects
```bash
# First page
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/v1/projects?page=1&page_size=25
# Expected: { "items": [...], "total": N, "page": 1, "page_size": 25, "total_pages": ... }

# Verify query count
psql -c "SELECT pg_stat_statements.query, calls FROM pg_stat_statements WHERE query LIKE '%projects%' ORDER BY calls DESC LIMIT 5;"
# Expected: No single query called > total_pages times
```

---

## Migration Notes

### 24-Hour Grace Period (FR-4)
- During the grace period, both cookie and `sessionStorage` token paths work.
- After 24 hours, the `sessionStorage` fallback is removed from both backend and frontend.
- Deploy plan: deploy backend with both paths → deploy frontend → after 24 hours, deploy backend again with fallback removed.

### Breaking Change: Projects API Response (FR-5)
- Response changes from `list[dict]` to `{ items: list[dict], total, page, page_size, total_pages }`.
- Frontend must be deployed simultaneously with backend.
- No external API consumers expected (internal use only per project scope).

### Database Migration (FR-1)
- Add unique index: `CREATE UNIQUE INDEX ix_scan_reports_scan_tool ON scan_reports (scan_id, tool_name);`
- No data cleanup needed (audit confirmed no existing duplicates).
