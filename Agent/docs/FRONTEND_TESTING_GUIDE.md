# Frontend Testing Guide

**Status:** ✅ Ready for Testing  
**Date:** February 27, 2026

---

## Quick Start

### 1. Start the Environment

```bash
cd /home/kali_linux/Pipeline/Agent
python run.py dev
```

### 2. Access the Application

**Frontend:** http://localhost:5173  
**Backend API:** http://localhost:8000  
**Jenkins:** http://localhost:8080

### 3. Login Credentials

```
Username: admin
Password: admin123
```

---

## Test Scenarios

### ✅ Test 1: Create a Project

**Navigate to:** Dashboard → Create Project

**Required Fields:**
- **Name:** `Test Project`
- **Git URL:** `https://github.com/your-org/your-repo.git`
- **Branch:** `main`
- **Credentials ID:** `github-credentials`
- **Sonar Key:** `test-project`

**Optional Fields:**
- **Target IP:** `192.168.1.100` (for Nmap scan)
- **Target URL:** `http://example.com` (for ZAP scan)

---

### ✅ Test 2: Trigger Automated Scan

**Steps:**
1. Go to Dashboard
2. Click on your project
3. Click **"Run Now"** in the Automated Scan card
4. Confirm the action

**Expected Result:**
- ✅ Scan created with state `QUEUED`
- ✅ Redirected to `/scans/{scan_id}`
- ✅ Console shows: `Scan started successfully!`

**Backend API Call:**
```json
POST /api/v1/scans
{
  "project_id": "uuid-here",
  "scan_mode": "automated"
}
```

**Backend Timeout Calculation:**
- All 11 stages: ~126 minutes (with 20% buffer)

---

### ✅ Test 3: Trigger Manual Scan

**Steps:**
1. Go to Dashboard
2. Click on your project
3. Click **"Configure"** in the Manual Scan card
4. Select specific stages (e.g., Git Checkout, Sonar Scanner)
5. Click **"Start Scan"**

**Expected Result:**
- ✅ Scan created with selected stages
- ✅ Stage IDs sent as: `["git_checkout", "sonar_scanner"]`
- ✅ UI displays: "Git Checkout", "Sonar Scanner"

**Backend API Call:**
```json
POST /api/v1/scans
{
  "project_id": "uuid-here",
  "scan_mode": "manual",
  "selected_stages": ["git_checkout", "sonar_scanner"]
}
```

**Backend Timeout Calculation:**
- Selected stages only: ~24 minutes (for 2 stages)

---

### ✅ Test 4: Monitor Scan Status

**Auto-refresh:** Every 10 seconds

**Stage Statuses:**
| Status | Color | Meaning |
|--------|-------|---------|
| PASS | Green | Stage completed successfully |
| FAIL | Red | Stage failed |
| RUNNING | Blue | Stage in progress |
| SKIPPED | Yellow | Stage was skipped |
| WARN | Orange | Stage completed with warnings |

---

## API Endpoint Reference

### Trigger Scan (Manual Test)

```bash
# Login first
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=admin123" | jq -r '.access_token')

# Create a project
PROJECT_ID=$(curl -s -X POST http://localhost:8000/api/v1/projects \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Project",
    "git_url": "https://github.com/your-org/your-repo.git",
    "branch": "main",
    "credentials_id": "github-credentials",
    "sonar_key": "test-project"
  }' | jq -r '.project_id')

# Trigger automated scan
curl -s -X POST http://localhost:8000/api/v1/scans \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"project_id\": \"$PROJECT_ID\",
    \"scan_mode\": \"automated\"
  }" | jq

# Trigger manual scan (specific stages)
curl -s -X POST http://localhost:8000/api/v1/scans \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"project_id\": \"$PROJECT_ID\",
    \"scan_mode\": \"manual\",
    \"selected_stages\": [\"git_checkout\", \"sonar_scanner\"]
  }" | jq
```

---

## Expected Logs

### Frontend Console (Browser DevTools)

**Success:**
```javascript
API projects.list response: [...]
Scan trigger response: { scan_id: "...", state: "QUEUED" }
```

**Error (409 Conflict):**
```javascript
API error: 409 - "An active scan already exists for this project"
```

**Error (400 Bad Request):**
```javascript
API error: 400 - "Invalid stage identifier: invalid_stage"
```

---

### Backend Logs

```bash
# Watch backend logs
docker logs docker-backend-1 --tail=50 -f
```

**Expected Logs:**
```
INFO: Project data before sending to celery: {...}
INFO: Calculated scan timeout: 5400 seconds (90.0 minutes)
INFO: Scan {scan_id} started with timeout: 5400 seconds
INFO: Triggering Jenkins job for scan {scan_id}
```

---

### Jenkins Logs

```bash
# Watch Jenkins job
curl -s -u admin:YOUR_TOKEN "http://localhost:8080/job/Security-pipeline/lastBuild/consoleText" | tail -50
```

**Expected Output:**
```
Started by user admin
[Pipeline] timeout
Timeout set to 5400 seconds
[Pipeline] { (Init Context)
[Pipeline] echo
SCAN_ID received: {scan_id}
...
```

---

## Troubleshooting

### ❌ "Invalid stage identifier"

**Cause:** Frontend sending wrong stage format

**Solution:** Verify `src/types.ts` uses snake_case IDs:
```typescript
export const FIXED_STAGES = [
  'git_checkout',  // ✅ Correct
  'sonar_scanner', // ✅ Correct
  // NOT: 'Git Checkout' ❌
];
```

---

### ❌ "An active scan already exists"

**Cause:** Project already has a running scan

**Solution:** 
1. Wait for current scan to complete
2. Or check scan status at `/scans/{scan_id}`
3. Backend states: `CREATED`, `QUEUED`, `RUNNING` are active

---

### ❌ "Unauthorized" / "Invalid API key"

**Cause:** Missing or invalid authentication

**Solution:**
1. Re-login via UI
2. Check localStorage: `localStorage.getItem('token')`
3. Verify backend `.env.dev` has valid `CALLBACK_TOKEN`

---

### ❌ Jenkins not triggering

**Cause:** Jenkins connection issue

**Solution:**
1. Check Jenkins is running: `http://localhost:8080`
2. Verify `JENKINS_TOKEN` in `.env.dev`
3. Check backend logs for Jenkins connection errors

---

## Compatibility Summary

| Component | Status | Notes |
|-----------|--------|-------|
| **Stage IDs** | ✅ Compatible | Frontend sends `git_checkout`, backend accepts `git_checkout` |
| **Scan Mode** | ✅ Compatible | `automated` / `manual` both work |
| **Timeout System** | ✅ Compatible | Backend calculates based on selected stages |
| **Authentication** | ✅ Compatible | Bearer token for auth, API key fallback |
| **Scan Results** | ✅ Compatible | Stage results display correctly |
| **Error Handling** | ✅ Compatible | Proper error messages shown |

---

## Files Modified

| File | Change |
|------|--------|
| `src/types.ts` | Stage IDs now use snake_case |
| `src/services/api.ts` | Type-safe stage ID handling |
| `src/pages/ManualScanPage.tsx` | UI shows display names, sends IDs |

---

## Next Steps

1. **Start the environment:** `python run.py dev`
2. **Open browser:** http://localhost:5173
3. **Login:** admin / admin123
4. **Create a test project**
5. **Trigger a scan** (automated or manual)
6. **Monitor progress** in real-time

**Documentation:**
- Full compatibility report: `docs/FRONTEND_BACKEND_COMPATIBILITY.md`
- Timeout system: `docs/SCAN_TIMEOUT_IMPLEMENTATION_SUMMARY.md`
- Change tracking: `docs/CHANGE_TRACKING_FEB2026.md`

---

**Ready to test! 🚀**
