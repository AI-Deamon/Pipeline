# Gotchas

Weird hacks, edge cases, and "don't touch this" notes extracted from the codebase.

---

## Docker

### 1. Nginx Volume Mount Conflict
**Problem:** Mounting `../dist:/usr/share/nginx/html:ro` in staging overrides the Docker-built files.
**Symptom:** 403 Forbidden - nginx can't find index.html
**Fix:** Remove the volume mount. The Dockerfile already bakes in the frontend files.
**File:** `docker/docker-compose.staging.yml`

### 2. PostgreSQL Environment Variables
**Problem:** Docker compose warns about missing `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`.
**Why:** The base compose file uses `${POSTGRES_USER}` variable substitution, but `.env.staging` defines them while the compose command may not load the file correctly.
**Impact:** Warnings only - containers still start with defaults from env file.
**Note:** Not critical but noisy. Could fix by hardcoding in compose or ensuring env file loading.

### 3. Container Startup Time
**Problem:** Backend and celery worker depend on PostgreSQL being ready.
**Symptom:** Container starts fail if DB not ready yet.
**Current Fix:** `depends_on` with health checks in compose file.
**Wait Time:** 2-3 minutes for all services to be fully healthy.

## Backend

### 4. Dual Scans Module
**Problem:** Both `backend/app/api/scans.py` (732 lines) AND `backend/app/api/scans/` directory exist.
**Symptom:** Python imports resolve to `scans.py` (the file), not `scans/` (the directory).
**Status:** New module has foundation but old file still active. Migration incomplete.
**Risk:** If you edit one, the other won't reflect changes.

### 5. Callback Token Validation
**Problem:** `CALLBACK_TOKEN` must match exactly between Jenkins and backend.
**Gotcha:** In test environment, validation is skipped (`if settings.ENV == "test": return`).
**Debug Tip:** If callback fails, check `CALLBACK_TOKEN` in both Jenkins config and `.env` file.

### 6. Scan Timeout Calculation
**Problem:** Default timeout is 7200 seconds (2 hours) from env var `SCAN_TIMEOUT`.
**Gotcha:** Can be overridden per-scan via `X-Scan-Timeout` header.
**Dynamic Calculation:** `calculate_scan_timeout()` in `scans/helpers.py` sums stage timeouts + 20% buffer.

### 7. Celery Task Import Paths
**Problem:** Celery must be able to import task functions.
**Gotcha:** If you move a task function, update the import in `app/core/celery_app.py` or tasks won't be found.
**Current Task:** `trigger_jenkins_scan_async` in `app/tasks/jenkins_tasks.py`

### 8. Database Constraint on Active Scans
**Problem:** Only one active scan per project allowed.
**Implementation:** Database unique constraint `ix_scans_project_state`.
**Error Handling:** Backend catches `IntegrityError` and returns 409 conflict.
**Gotcha:** If a scan gets stuck in RUNNING state, you can't start a new one. Use force-unlock endpoint.

## Frontend

### 9. API Key Configuration
**Problem:** Reset/cancel features require API key.
**Lookup Order:** `localStorage.getItem('API_KEY')` → `import.meta.env.VITE_API_KEY`
**Gotcha:** If neither is set, reset/cancel calls will 401 silently.
**Current State:** No UI guidance for users to set API key.

### 10. WebSocket Connection State
**Problem:** `useScanWebSocket` has `connected` and `connecting` states but they're never shown in UI.
**Impact:** Users can't tell if real-time updates are working or if they're seeing stale data.
**Fix Needed:** Add "Live" indicator near Refresh button.

### 11. Notification Permission Request
**Problem:** `notificationService.requestPermission()` fires on component mount unconditionally.
**Impact:** Users get browser permission prompt immediately, before they understand why they need it.
**Fix:** Only request when scan enters RUNNING, or add opt-in banner.

### 12. Login Registration Message Not Shown
**Problem:** `LoginPage` reads `location.state?.message` but never renders it.
**Impact:** Users who register successfully don't see the "Registration successful" success message.
**Fix:** Add success banner at top of login form.

## Jenkins

### 13. Pipeline Callback URL
**Problem:** Jenkins must reach backend at `http://backend:8000/api/v1/scans/{SCAN_ID}/callback`.
**Gotcha:** This is the Docker internal hostname. If running Jenkins outside Docker, use `host.docker.internal` or actual IP.
**Current Config:** `JENKINS_BASE_URL=http://host.docker.internal:8080` in dev env.

### 14. Stage Dependencies
**Problem:** Some stages depend on others (e.g., `trivy_image_scan` requires `docker_build`).
**Gotcha:** Backend validates stage dependencies on scan trigger.
**UX Issue:** Manual scan page doesn't show dependency visualization - users discover errors after clicking Start.

### 15. Jenkins Authentication
**Problem:** Jenkins server requires authentication (403 without credentials).
**Current Setup:** Jenkins token configured in `.env.*` files as `JENKINS_TOKEN`.
**URL:** http://localhost:8080/job/Security-pipeline/

## Git

### 16. Agent/ Has Separate Git Repo
**Problem:** `Agent/` directory had its own `.git/` folder (separate repo on different branch).
**Status:** Cleaned up - `Agent/` now just contains Jenkins files.
**Warning:** If you see `.git` inside `Agent/` again, it's a mistake. Remove it.

### 17. Root vs Agent/ Structure
**Problem:** Documentation says code should be in `Agent/`, but git tracking is at root level.
**Decision:** Source code stays at root (`backend/`, `src/`, `docker/`, `tests/`) where it's git-tracked.
**Agent/ Contains:** Only `Jenkinsfile` and `JENKINSFILE_TEST_READY.md`.

### 18. Jenkinsfile → Separate Git Repo (CRITICAL)
**Problem:** `Agent/Jenkinsfile` is in a SEPARATE Git repository (`Bhaskar-ITM/Agent`).
**Rule:** Only push `Agent/Jenkinsfile` changes to `origin pr-49`. Do NOT push Pipeline repo changes for Jenkins updates.
**How to push:**
```bash
cd /home/kali_linux/Pipeline
git add Agent/Jenkinsfile
git commit -m "message"
git push origin pr-49
```
**Why:** `Agent/` is tracked separately from Pipeline source code.

---

*Add gotchas as you discover them. Future AI will thank you.*
