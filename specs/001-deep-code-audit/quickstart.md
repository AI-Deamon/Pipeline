# Quickstart: Verifying Deep Code Audit Fixes

**Date**: 2026-05-22

## Prerequisites

- Docker Compose running (`python run.py dev` or `python run.py staging`)
- Node.js 20+ (for frontend tests)
- Python 3.11+ (for backend tests)

## Verification Steps

### 1. Run All Tests

```bash
# Frontend
npm run lint && npx tsc -b && npx vitest run

# Backend
pytest tests/ -v
```

**Expected**: All tests pass. Specifically, the 10 previously failing tests must now pass:
- `LoginPage.test.tsx` — 4/4
- `ManualScanPage.test.tsx` — 3/3
- `DashboardSearch.test.tsx` — 3/3

### 2. Verify Security Fixes

```bash
# S2: JWT secret separated from API_KEY
grep -r "JWT_SECRET_KEY" backend/app/core/

# S9: Constant-time token comparison
grep -r "hmac.compare_digest" backend/app/api/scans/utils.py

# S6: No dangerouslySetInnerHTML
grep -r "dangerouslySetInnerHTML" src/
# Should return 0 results

# S3: No hardcoded admin password
grep -r "admin123" backend/
# Should return 0 results
```

### 3. Verify Auth Fixes

```bash
# A1: 401 handler exists
grep -c "401" src/services/api.ts
# Should find the 401 check in response interceptor

# A3: API key cleared on logout
grep -A5 "logout" src/hooks/useAuth.tsx | grep "API_KEY"
# Should find sessionStorage.removeItem('API_KEY')

# A5: isManualClose reset
grep "isManualClose.current = false" src/hooks/useScanWebSocket.ts
# Should find it in the connect() function

# A6: Correct cache invalidation keys
grep "invalidateQueries" src/hooks/useScanReset.ts
# Should find ['scan', ...] not ['scans', ...]
```

### 4. Verify UI/UX Fixes

```bash
# U1: Focus trap in modals
grep -r "useFocusTrap\|focusTrap\|onKeyDown.*Escape" src/components/ConfirmModal.tsx

# U2: No native confirm/alert
grep -r "window\.confirm\|window\.alert\|[^.]confirm(" src/pages/
# Should return 0 results

# U3: Responsive grids
grep "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" src/pages/UnifiedReportPage.tsx
```

### 5. Manual Smoke Test

1. Login with `admin` / password from env var (not `admin123`)
2. Create a project
3. Navigate to scan status page — verify WebSocket connects/reconnects
4. Cancel a scan — verify cache invalidates (status updates without manual refresh)
5. Resize browser to mobile width — verify responsive layouts
6. Open a modal — verify Escape key closes it and Tab stays trapped
7. Logout — verify sessionStorage is completely empty
8. Access `/dashboard` while logged out — verify redirect to `/login`

### 6. Verify No Regressions

```bash
# Full validation pipeline (from AGENTS.md)
npm run lint && npm run build && npx vitest run && pytest tests/
```
