# Quickstart: Verifying SonarQube Docker Container

**Date**: 2026-05-26

## Prerequisites

- Docker Compose running (`python run.py dev` or `python run.py staging`)
- Port 9000 is free on the host (no existing SonarQube or other service)

## Verification Steps

### 1. Start the Stack

```bash
python run.py staging
```

Wait for all services to become healthy (2-3 minutes for SonarQube first startup).

### 2. Verify SonarQube is Running

```bash
# Check SonarQube container status
docker compose -f docker/docker-compose.yml -f docker/docker-compose.staging.yml ps sonarqube

# Check SonarQube health endpoint
curl -f http://localhost:9000/api/system/status

# Check SonarQube web UI
curl -s http://localhost:9000 | head -5
```

**Expected**: Status endpoint returns JSON with `"status": "UP"`. Web UI returns HTML with "SonarQube" in the title.

### 3. Verify Database Connection

```bash
# Check that SonarQube tables were created in PostgreSQL
docker compose exec postgres psql -U sonarqube -d sonarqube -c "\dt"
```

**Expected**: SonarQube system tables exist (e.g., `projects`, `issues`, `users`).

### 4. Verify Jenkins Integration

Trigger a scan from the application UI with `sonar_scanner` stage enabled. After the scan completes:

```bash
# Check Jenkins pipeline console output for SonarQube connection
# Look for: "SonarQube server 'sonar-server' connected"
# Look for: "ANALYSIS SUCCESSFUL"
```

**Expected**: `sonar_scanner` stage passes with `PASS` status.

### 5. Verify Backend Issue Fetching

After a scan completes:

```bash
# Check backend logs for SonarQube issue fetch
docker compose logs backend | grep -i sonar

# Or check the scan report in the application UI
```

**Expected**: Backend successfully fetches and stores SonarQube issues. No authentication errors in logs.

### 6. Token Renewal Procedure

If tokens need to be reset:

1. Open `http://localhost:9000` in a browser
2. Log in with default credentials (`admin`/`admin` — change password on first login)
3. Go to **Administration → Security → Users**
4. Click on the **admin** user and generate a new token (name: `sentinel-backend`)
5. Copy the generated token value
6. Update `.env.staging`:
   ```
   SONARQUBE_TOKEN=<new-token-value>
   ```
7. Update `config/.env.dev`:
   ```
   SONARQUBE_TOKEN=<new-token-value>
   ```
8. In Jenkins UI, update the `sonar-token` credential with the new value
9. Restart backend and celery_worker:
   ```bash
   docker compose -f docker/docker-compose.yml -f docker/docker-compose.staging.yml restart backend celery_worker
   ```
10. Verify: trigger a scan and check that `fetch_sonar_issues()` succeeds

### 7. Verify Persistence

```bash
# Stop the stack
python run.py down

# Start again
python run.py staging

# Verify SonarQube data is preserved
curl -f http://localhost:9000/api/system/status
```

**Expected**: SonarQube returns with same status and data as before restart.

### 8. Verify No Regressions

```bash
# Run existing test suites (no code changes expected, but verify)
npm run lint && npm run build && npx vitest run && pytest tests/
```

**Expected**: All existing tests pass unchanged.
