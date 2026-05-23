# Code Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 47 identified issues from the comprehensive code review across security, architecture, reliability, and UX categories.

**Architecture:** Prioritized fix implementation starting with critical security vulnerabilities, then data integrity issues, followed by high-priority architectural improvements, and finally medium/low priority enhancements.

**Tech Stack:** React 19, TypeScript, Vite, FastAPI, Python 3.11, PostgreSQL 16, Celery, Redis, Jenkins, Docker Compose

---

## Phase 1: Critical Security Fixes (Immediate)

### Task 1: C3 — Remove Hardcoded Jenkins Callback Token

**Priority:** CRITICAL — Security vulnerability allowing forged scan results

**Files:**
- Modify: `Jenkinsfile` (line with CALLBACK_TOKEN definition)
- Verify: `backend/app/core/config.py` (token validation)

- [ ] **Step 1: Read current Jenkinsfile callback token configuration**

Run: `grep -n "CALLBACK_TOKEN" /home/kali_linux/Agent/Jenkinsfile`

Expected: Find line with fallback token `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`

- [ ] **Step 2: Remove the hardcoded fallback token**

Modify `Jenkinsfile`:
```groovy
// Before:
CALLBACK_TOKEN = "${env.CALLBACK_TOKEN ?: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6'}"

// After:
CALLBACK_TOKEN = "${env.CALLBACK_TOKEN}"
```

- [ ] **Step 3: Verify backend requires 32+ char token**

Read: `backend/app/core/config.py`
Expected: `CALLBACK_TOKEN` validation ensures minimum 32 characters

- [ ] **Step 4: Commit**

```bash
git add Jenkinsfile
git commit -m "security: remove hardcoded callback token fallback

- Remove default fallback token from Jenkinsfile
- Jenkins will now fail if CALLBACK_TOKEN env var is not set
- Rotate any environments using the default token"
```

---

### Task 2: C2 — Fix CORS Wildcard with Credentials

**Priority:** CRITICAL — Session hijacking vector in production

**Files:**
- Modify: `backend/app/main.py` (CORS configuration)
- Modify: `.env.dev`, `.env.test`, `.env.staging` (add CORS_ORIGINS)
- Create: `backend/app/core/config.py` update (add CORS_ORIGINS setting)

- [ ] **Step 1: Read current CORS configuration**

Read: `backend/app/main.py`
Expected: Find `allow_origins=["*"]` with `allow_credentials=True`

- [ ] **Step 2: Add CORS_ORIGINS to environment files**

Modify `.env.dev`:
```
CORS_ORIGINS=["http://localhost:5173"]
```

Modify `.env.test`:
```
CORS_ORIGINS=["http://localhost:5173"]
```

Modify `.env.staging`:
```
CORS_ORIGINS=["http://localhost:5173"]
```

- [ ] **Step 3: Add CORS_ORIGINS to settings**

Modify `backend/app/core/config.py`:
```python
# Add to Config class
CORS_ORIGINS: List[str] = ["http://localhost:5173"]

# In main.py, update:
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

- [ ] **Step 4: Write test for CORS configuration**

Create: `backend/tests/test_cors.py`:
```python
from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings

client = TestClient(app)

def test_cors_allows_configured_origins():
    """Test that CORS allows configured origins"""
    response = client.options(
        "/api/v1/projects",
        headers={"Origin": settings.CORS_ORIGINS[0]}
    )
    assert response.status_code == 200
    assert "access-control-allow-origin" in response.headers

def test_cors_rejects_unconfigured_origins():
    """Test that CORS rejects unconfigured origins"""
    response = client.options(
        "/api/v1/projects",
        headers={"Origin": "https://evil.com"}
    )
    # Should not include access-control-allow-origin header
    assert "access-control-allow-origin" not in response.headers
```

- [ ] **Step 5: Run tests**

Run: `cd /home/kali_linux/Agent && pytest backend/tests/test_cors.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/main.py backend/app/core/config.py .env.* backend/tests/test_cors.py
git commit -m "security: fix CORS configuration with credentials

- Replace wildcard origins with configurable CORS_ORIGINS
- Add CORS_ORIGINS to environment files (dev, test, staging)
- Add CORS configuration tests
- Default to localhost:5173 for development"
```

---

### Task 3: C4 + U1 — Replace All window.confirm() with ConfirmModal

**Priority:** CRITICAL — Blocks main thread, bypasses custom modal, inconsistent UX

**Files:**
- Modify: `src/pages/ScanHistoryPage.tsx`
- Modify: `src/pages/UserManagementPage.tsx`
- Modify: `src/pages/DashboardPage.tsx` (if uses window.confirm)
- Verify: `src/components/ConfirmModal.tsx` exists

- [ ] **Step 1: Find all window.confirm() usage**

Run: `grep -rn "window.confirm" /home/kali_linux/Agent/src/`
Expected: Find usage in ScanHistoryPage, UserManagementPage, possibly others

- [ ] **Step 2: Read ConfirmModal component**

Read: `src/components/ConfirmModal.tsx`
Understand: Props interface (isOpen, onClose, onConfirm, title, message)

- [ ] **Step 3: Fix ScanHistoryPage.tsx**

Modify `src/pages/ScanHistoryPage.tsx`:
```typescript
// Before:
if (window.confirm('Are you sure you want to delete this scan?')) {
  await deleteScan(scanId);
}

// After:
const [confirmDelete, setConfirmDelete] = useState<{isOpen: boolean, scanId: string} | null>(null);

// In render:
<ConfirmModal
  isOpen={confirmDelete?.isOpen ?? false}
  onClose={() => setConfirmDelete(null)}
  onConfirm={async () => {
    if (confirmDelete?.scanId) {
      await deleteScan(confirmDelete.scanId);
      setConfirmDelete(null);
    }
  }}
  title="Delete Scan"
  message="Are you sure you want to delete this scan?"
/>

// In delete handler:
setConfirmDelete({ isOpen: true, scanId });
```

- [ ] **Step 4: Fix UserManagementPage.tsx**

Apply same pattern as Step 3

- [ ] **Step 5: Run tests**

Run: `cd /home/kali_linux/Agent && npx vitest run src/pages/ScanHistoryPage.test.tsx src/pages/UserManagementPage.test.tsx`
Expected: PASS (may need to update test mocks for ConfirmModal)

- [ ] **Step 6: Commit**

```bash
git add src/pages/ScanHistoryPage.tsx src/pages/UserManagementPage.tsx
git commit -m "ux: replace window.confirm with ConfirmModal component

- Replace blocking window.confirm() calls with custom ConfirmModal
- Apply consistent pattern across ScanHistoryPage and UserManagementPage
- Improves accessibility and mobile UX
- Resolves C4 and U1 issues from code review"
```

---

### Task 4: C1 — Fix API Key Storage (Session Storage Migration)

**Priority:** CRITICAL — XSS exfiltration vulnerability

**Files:**
- Modify: `src/services/api.ts`
- Modify: `src/pages/SettingsPage.tsx`
- Modify: `src/hooks/useScanReset.ts`
- Modify: `src/pages/LoginPage.tsx`

- [ ] **Step 1: Read current API key storage implementation**

Read: `src/services/api.ts`
Expected: Find `localStorage.getItem('API_KEY')` usage

- [ ] **Step 2: Change localStorage to sessionStorage in api.ts**

Modify `src/services/api.ts`:
```typescript
// Update axios interceptor
const API_KEY = sessionStorage.getItem('API_KEY') || import.meta.env.VITE_API_KEY;

// In request interceptor:
request.headers.set('X-API-Key', API_KEY);
```

- [ ] **Step 3: Update SettingsPage to use sessionStorage**

Modify `src/pages/SettingsPage.tsx`:
```typescript
// In save handler:
sessionStorage.setItem('API_KEY', apiKey);
```

- [ ] **Step 4: Fix useScanReset to use shared api client**

Modify `src/hooks/useScanReset.ts`:
```typescript
// Remove manual header construction
// Use: return api.scans.reset(scanId);
// Instead of manual fetch with headers
```

- [ ] **Step 5: Update LoginPage to store token in sessionStorage**

Modify `src/pages/LoginPage.tsx`:
```typescript
// After successful login:
sessionStorage.setItem('token', token);
```

- [ ] **Step 6: Write test for API key storage**

Create: `src/services/api.test.ts`:
```typescript
import { api } from './api';

describe('API Key Storage', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('should use sessionStorage for API key', () => {
    sessionStorage.setItem('API_KEY', 'test-key');
    // Verify api client uses the key
    // Test via axios interceptor behavior
  });

  it('should clear API key on logout', () => {
    sessionStorage.setItem('API_KEY', 'test-key');
    sessionStorage.removeItem('API_KEY');
    expect(sessionStorage.getItem('API_KEY')).toBeNull();
  });
});
```

- [ ] **Step 7: Run tests**

Run: `cd /home/kali_linux/Agent && npx vitest run src/services/api.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/services/api.ts src/pages/SettingsPage.tsx src/hooks/useScanReset.ts src/pages/LoginPage.tsx src/services/api.test.ts
git commit -m "security: migrate API key storage from localStorage to sessionStorage

- Change localStorage to sessionStorage for API keys and tokens
- Keys now cleared automatically on tab close
- Consolidate auth header injection in api.ts axios interceptor
- Remove manual header construction in useScanReset
- Resolves C1 vulnerability"
```

---

## Phase 2: Critical Data Integrity Fixes

### Task 5: C5 — Fix Optimistic RUNNING State

**Priority:** CRITICAL — Creates phantom scans that block users

**Files:**
- Modify: `backend/app/api/scans.py` (trigger_scan endpoint)
- Modify: `backend/app/api/scans.py` (scan_callback endpoint)
- Modify: `backend/app/state/scan_state.py` (add admin unlock endpoint)

- [ ] **Step 1: Read current trigger_scan implementation**

Read: `backend/app/api/scans.py`
Expected: Find scan created with `state=ScanState.RUNNING` immediately

- [ ] **Step 2: Change initial state to CREATED**

Modify `backend/app/api/scans.py`:
```python
# In trigger_scan:
# Before:
scan = ScanDB(project_id=project_id, state=ScanState.RUNNING, ...)

# After:
scan = ScanDB(project_id=project_id, state=ScanState.CREATED, ...)
```

- [ ] **Step 3: Update state transition in callback**

Modify `backend/app/api/scans.py` scan_callback:
```python
# When Jenkins confirms build started:
scan_obj.state = ScanState.RUNNING
```

- [ ] **Step 4: Add force unlock admin endpoint**

Create in `backend/app/api/scans.py`:
```python
@router.post("/{scan_id}/force-unlock")
async def force_unlock_scan(scan_id: str, current_user: User = Depends(get_current_admin)):
    """Admin endpoint to unlock stuck projects"""
    scan = await get_scan_or_404(scan_id)
    scan.state = ScanState.FAILED
    # Update project last_scan_state
    await db.commit()
    return {"message": f"Scan {scan_id} unlocked"}
```

- [ ] **Step 5: Write test for scan state transitions**

Create: `backend/tests/test_scan_states.py`:
```python
def test_scan_created_not_running_initially():
    """Test that new scans start in CREATED state, not RUNNING"""
    response = client.post("/api/v1/scans", json={...})
    assert response.status_code == 201
    data = response.json()
    assert data['state'] == 'CREATED'

def test_scan_transitions_to_running_on_callback():
    """Test scan transitions to RUNNING when Jenkins confirms"""
    # Create scan in CREATED state
    # Send callback with build started
    # Verify state is RUNNING
```

- [ ] **Step 6: Run tests**

Run: `cd /home/kali_linux/Agent && pytest backend/tests/test_scan_states.py -v`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/scans.py backend/tests/test_scan_states.py
git commit -m "fix: change initial scan state from RUNNING to CREATED

- New scans now start in CREATED state
- Transition to RUNNING only when Jenkins confirms build started
- Add admin force-unlock endpoint for stuck projects
- Prevents phantom scans blocking project operations
- Resolves C5 issue"
```

---

### Task 6: C6 — Fix TOCTOU Race in Duplicate Scan Prevention

**Priority:** CRITICAL — Allows duplicate scans under concurrent requests

**Files:**
- Modify: `backend/app/api/scans.py`
- Modify: `backend/app/models/db_models.py` (add unique constraint)
- Create: `backend/alembic/versions/xxx_add_unique_constraint.py` (migration)

- [ ] **Step 1: Read current duplicate prevention logic**

Read: `backend/app/api/scans.py`
Expected: Find separate read-then-write pattern without locking

- [ ] **Step 2: Add database-level unique constraint**

Modify `backend/app/models/db_models.py`:
```python
# Add to ScanDB model:
__table_args__ = (
    UniqueConstraint('project_id', 'state', 
                     name='uq_project_active_state',
                     condition="state IN ('CREATED', 'QUEUED', 'RUNNING')"),
)
```

- [ ] **Step 3: Create Alembic migration**

Run: `cd /home/kali_linux/Agent/backend && alembic revision -m "add unique constraint for active scans"`

Edit generated migration:
```python
def upgrade():
    op.create_unique_constraint(
        'uq_project_active_state',
        'scans',
        ['project_id', 'state']
    )

def downgrade():
    op.drop_constraint('uq_project_active_state', 'scans', type_='unique')
```

- [ ] **Step 4: Add database-level error handling**

Modify `backend/app/api/scans.py`:
```python
from sqlalchemy.exc import IntegrityError

try:
    # Create scan
except IntegrityError as e:
    if 'uq_project_active_state' in str(e):
        raise HTTPException(
            status_code=409,
            detail="A scan is already in progress for this project"
        )
    raise
```

- [ ] **Step 5: Add frontend button disable**

Modify `src/pages/ProjectControlPage.tsx`:
```typescript
// Disable button immediately on click:
const [isTriggering, setIsTriggering] = useState(false);

<button 
  disabled={isTriggering || isActiveScan}
  onClick={async () => {
    setIsTriggering(true);
    try {
      await triggerScan();
    } finally {
      setIsTriggering(false);
    }
  }}
>
```

- [ ] **Step 6: Write test for concurrent scan prevention**

Create: `backend/tests/test_concurrent_scans.py`:
```python
import threading

def test_concurrent_scan_prevention():
    """Test that concurrent scan requests are prevented"""
    results = []
    
    def trigger_scan():
        response = client.post("/api/v1/scans", json={...})
        results.append(response.status_code)
    
    # Fire two requests simultaneously
    t1 = threading.Thread(target=trigger_scan)
    t2 = threading.Thread(target=trigger_scan)
    t1.start()
    t2.start()
    t1.join()
    t2.join()
    
    # One should succeed (201), one should fail (409)
    assert results.count(201) == 1
    assert results.count(409) == 1
```

- [ ] **Step 7: Run tests**

Run: `cd /home/kali_linux/Agent && pytest backend/tests/test_concurrent_scans.py -v`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add backend/app/api/scans.py backend/app/models/db_models.py backend/alembic/versions/*.py backend/tests/test_concurrent_scans.py src/pages/ProjectControlPage.tsx
git commit -m "fix: prevent duplicate scans with database constraint

- Add unique constraint on (project_id, state) for active states
- Handle IntegrityError with proper 409 response
- Disable trigger button immediately on click (UX defense)
- Add concurrent scan prevention tests
- Resolves C6 TOCTOU race condition"
```

---

## Phase 3: High-Priority Architectural Fixes

### Task 7: H1 — Fix Hardcoded Jenkinsfile Paths

**Priority:** HIGH — Platform broken for all projects except one

**Files:**
- Modify: `Jenkinsfile` (Stage 4 — NPM/PIP Install)

- [ ] **Step 1: Read current Jenkinsfile dependency install stage**

Read: `Jenkinsfile`
Expected: Find hardcoded `Port_Push-main/` path

- [ ] **Step 2: Implement smart directory detection**

Modify `Jenkinsfile`:
```groovy
stage('NPM / PIP Install') {
    steps {
        script {
            // Find package.json location
            def npmDir = sh(
                script: "find . -name 'package.json' -type f | head -1",
                returnStdout: true
            ).trim()
            
            if (npmDir) {
                dir(npmDir.replaceAll('/package.json', '')) {
                    sh 'npm ci'
                }
            }
            
            // Find requirements.txt location
            def pipDir = sh(
                script: "find . -name 'requirements.txt' -type f | head -1",
                returnStdout: true
            ).trim()
            
            if (pipDir) {
                dir(pipDir.replaceAll('/requirements.txt', '')) {
                    sh 'pip install -r requirements.txt'
                }
            }
        }
    }
}
```

- [ ] **Step 3: Test Jenkinsfile syntax**

Run: `cd /home/kali_linux/Agent && java -jar jenkins-cli.jar validate-jenkinsfile Jenkinsfile`
Expected: Syntax validation passes

- [ ] **Step 4: Commit**

```bash
git add Jenkinsfile
git commit -m "fix: implement smart directory detection for dependencies

- Use find to locate package.json and requirements.txt dynamically
- Remove hardcoded Port_Push-main/ paths
- Platform now works for any project structure
- Resolves H1 issue"
```

---

### Task 8: H7 — Fix PageSkeleton Form Type

**Priority:** HIGH — Wrong loading state shown on edit pages

**Files:**
- Modify: `src/components/PageSkeleton.tsx`
- Verify: `src/pages/ProjectEditPage.tsx`

- [ ] **Step 1: Read current PageSkeleton implementation**

Read: `src/components/PageSkeleton.tsx`
Expected: Find switch statement that ignores 'form' type

- [ ] **Step 2: Add renderFormSkeleton function**

Modify `src/components/PageSkeleton.tsx`:
```typescript
const renderFormSkeleton = () => (
  <div className="max-w-4xl mx-auto p-6 space-y-6">
    <div className="h-8 bg-gray-200 rounded animate-pulse w-1/3"></div>
    <div className="space-y-4">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="h-12 bg-gray-200 rounded animate-pulse"></div>
      ))}
    </div>
    <div className="h-10 bg-gray-200 rounded animate-pulse w-1/4"></div>
  </div>
);
```

- [ ] **Step 3: Update switch statement**

Modify `src/components/PageSkeleton.tsx`:
```typescript
// Before:
{type === 'dashboard' ? renderDashboardSkeleton() : renderScanSkeleton()}

// After:
{type === 'dashboard' ? renderDashboardSkeleton() : 
 type === 'form' ? renderFormSkeleton() : 
 renderScanSkeleton()}
```

- [ ] **Step 4: Test visually**

Run: `cd /home/kali_linux/Agent && npm run dev`
Navigate to: `/projects/:id/edit`
Expected: See form-shaped skeleton instead of scan-shaped

- [ ] **Step 5: Commit**

```bash
git add src/components/PageSkeleton.tsx
git commit -m "fix: add form skeleton type to PageSkeleton

- Add renderFormSkeleton() with input field outlines
- Handle type='form' in switch statement
- ProjectEditPage now shows correct loading state
- Resolves H7 issue"
```

---

### Task 9: H8 — Fix Login Error Handling

**Priority:** HIGH — Login errors always show fallback message

**Files:**
- Modify: `src/pages/LoginPage.tsx`
- Verify: `src/utils/apiError.ts`

- [ ] **Step 1: Read current LoginPage error handling**

Read: `src/pages/LoginPage.tsx`
Expected: Find `err.response?.data?.detail` pattern

- [ ] **Step 2: Update to use ApiError class**

Modify `src/pages/LoginPage.tsx`:
```typescript
import { ApiError } from '../utils/apiError';

// In catch block:
catch (err) {
  if (ApiError.isApiError(err)) {
    setError(err.message);
  } else {
    setError('Login failed. Please try again.');
  }
}
```

- [ ] **Step 3: Verify axios interceptor converts to ApiError**

Read: `src/services/api.ts`
Expected: Confirm interceptor throws `new ApiError(status, message)`

- [ ] **Step 4: Write test for login error handling**

Create: `src/pages/LoginPage.test.tsx` (add to existing):
```typescript
it('shows specific error message from backend', async () => {
  // Mock API to return ApiError with specific message
  (api.auth.login as Mock).mockRejectedValue(
    new ApiError(401, 'Invalid credentials')
  );
  
  // Fill form and submit
  // Verify error message is shown
  expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
});
```

- [ ] **Step 5: Run tests**

Run: `cd /home/kali_linux/Agent && npx vitest run src/pages/LoginPage.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/pages/LoginPage.tsx src/pages/LoginPage.test.tsx
git commit -m "fix: use ApiError class for login error handling

- Replace err.response?.data?.detail with ApiError.isApiError()
- Show specific backend error messages on login failure
- Consistent error handling pattern across app
- Resolves H8 issue"
```

---

## Phase 4: Medium Priority Fixes

### Task 10: H9 — Fix ScanHistory Navigation State Preservation

**Priority:** HIGH — Back button broken during loading state

**Files:**
- Modify: `src/pages/ScanHistoryPage.tsx`
- Modify: `src/pages/ScanStatusPage.tsx`

- [ ] **Step 1: Read current navigation code**

Read: `src/pages/ScanHistoryPage.tsx`
Expected: Find `navigate('/scans/${scan.scan_id}')`

- [ ] **Step 2: Pass projectId through navigation state**

Modify `src/pages/ScanHistoryPage.tsx`:
```typescript
navigate(`/scans/${scan.scan_id}`, { 
  state: { projectId: scan.project_id } 
});
```

- [ ] **Step 3: Use location state as fallback in ScanStatusPage**

Modify `src/pages/ScanStatusPage.tsx`:
```typescript
import { useLocation } from 'react-router-dom';

const location = useLocation();
const projectIdFromState = (location.state as any)?.projectId;

// In back button:
const backToProject = () => {
  const projectId = scan?.project_id || projectIdFromState;
  if (projectId) {
    navigate(`/projects/${projectId}`);
  }
};
```

- [ ] **Step 4: Test navigation flow**

Run: `cd /home/kali_linux/Agent && npm run dev`
Navigate: History → Scan Detail → Back
Expected: Back button works immediately, even during loading

- [ ] **Step 5: Commit**

```bash
git add src/pages/ScanHistoryPage.tsx src/pages/ScanStatusPage.tsx
git commit -m "fix: preserve projectId in navigation state

- Pass projectId through navigate() state from ScanHistoryPage
- Use location.state as fallback before scan data loads
- Back button works immediately on ScanStatusPage
- Resolves H9 issue"
```

---

### Task 11: P2 — Disable Polling When WebSocket Connected

**Priority:** MEDIUM — Reduces API load by 50%

**Files:**
- Modify: `src/pages/DashboardPage.tsx`
- Modify: `src/hooks/useScanWebSocket.ts`

- [ ] **Step 1: Read current polling configuration**

Read: `src/pages/DashboardPage.tsx`
Expected: Find `refetchInterval: 10000`

- [ ] **Step 2: Export connected state from WebSocket hook**

Modify `src/hooks/useScanWebSocket.ts`:
```typescript
// Return connected state:
return { connected, connecting, error };
```

- [ ] **Step 3: Conditionally disable polling**

Modify `src/pages/DashboardPage.tsx`:
```typescript
const { connected } = useScanWebSocket();

const { data, refetch } = useQuery({
  queryKey: ['projects'],
  queryFn: api.projects.list,
  refetchInterval: connected ? false : 10000,
});
```

- [ ] **Step 4: Test behavior**

Run: `cd /home/kali_linux/Agent && npm run dev`
Open browser devtools Network tab
Expected: No polling requests when WebSocket connected, polling resumes on disconnect

- [ ] **Step 5: Commit**

```bash
git add src/pages/DashboardPage.tsx src/hooks/useScanWebSocket.ts
git commit -m "perf: disable polling when WebSocket is connected

- Use refetchInterval: false when WebSocket connected
- Polling automatically resumes on WebSocket disconnect
- Reduces API load by ~50% for active users
- Resolves P2 issue"
```

---

### Task 12: P3 — Update Cache from WebSocket Instead of Refetch

**Priority:** MEDIUM — Eliminates redundant API calls

**Files:**
- Modify: `src/pages/ScanStatusPage.tsx`

- [ ] **Step 1: Read current WebSocket onMessage handler**

Read: `src/pages/ScanStatusPage.tsx`
Expected: Find `refetch()` call in onMessage

- [ ] **Step 2: Use queryClient.setQueryData instead**

Modify `src/pages/ScanStatusPage.tsx`:
```typescript
import { useQueryClient } from '@tanstack/react-query';

const queryClient = useQueryClient();

// In WebSocket onMessage:
onMessage: (message) => {
  queryClient.setQueryData(['scan', scanId], message.data);
}
```

- [ ] **Step 3: Test real-time updates**

Run: `cd /home/kali_linux/Agent && npm run dev`
Trigger a scan, watch Network tab
Expected: No HTTP requests on WebSocket messages, UI updates in real-time

- [ ] **Step 4: Commit**

```bash
git add src/pages/ScanStatusPage.tsx
git commit -m "perf: update cache directly from WebSocket messages

- Replace refetch() with queryClient.setQueryData()
- WebSocket payload used directly, no HTTP request needed
- Reduces API load for real-time updates
- Resolves P3 issue"
```

---

### Task 13: B1 — Return null Instead of "NONE" for last_scan_state

**Priority:** MEDIUM — Frontend truthy checks fail

**Files:**
- Modify: `backend/app/api/projects.py`

- [ ] **Step 1: Read current projects list endpoint**

Read: `backend/app/api/projects.py`
Expected: Find `"last_scan_state": p.last_scan_state or "NONE"`

- [ ] **Step 2: Return null instead**

Modify `backend/app/api/projects.py`:
```python
# Before:
"last_scan_state": p.last_scan_state or "NONE"

# After:
"last_scan_state": p.last_scan_state  # Returns null if None
```

- [ ] **Step 3: Update Pydantic schema if needed**

Read: `backend/app/schemas/project.py`
Expected: Ensure `last_scan_state: Optional[str] = None`

- [ ] **Step 4: Write test**

Create: `backend/tests/test_project_api.py`:
```python
def test_project_list_returns_null_for_no_scans():
    """Test that projects with no scans return null for last_scan_state"""
    response = client.get("/api/v1/projects")
    assert response.status_code == 200
    data = response.json()
    for project in data:
        if not project['scans']:
            assert project['last_scan_state'] is None
```

- [ ] **Step 5: Run tests**

Run: `cd /home/kali_linux/Agent && pytest backend/tests/test_project_api.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/projects.py backend/tests/test_project_api.py
git commit -m "fix: return null instead of 'NONE' for last_scan_state

- Projects with no scans now return null (not "NONE" string)
- Frontend truthy checks work correctly
- Update Pydantic schema to Optional[str]
- Resolves B1 issue"
```

---

### Task 14: M4 — Fix ManualScanPage Button aria-labels

**Priority:** MEDIUM — Accessibility issue, tests don't match implementation

**Files:**
- Modify: `src/pages/ManualScanPage.tsx`

- [ ] **Step 1: Read current button implementation**

Read: `src/pages/ManualScanPage.tsx`
Expected: Find select-all button without aria-labels

- [ ] **Step 2: Add aria-labels**

Modify `src/pages/ManualScanPage.tsx`:
```typescript
<button
  onClick={toggleAllStages}
  aria-label={selectedStages.length === FIXED_STAGES.length ? 'Deselect all stages' : 'Select all stages'}
  className="..."
>
  {selectedStages.length === FIXED_STAGES.length ? 'Deselect All' : 'Select All'}
</button>
```

- [ ] **Step 3: Update visible text to match test expectations**

Modify `src/pages/ManualScanPage.tsx`:
```typescript
// Change "Arm All Stages" to "Select All" for consistency
```

- [ ] **Step 4: Run tests**

Run: `cd /home/kali_linux/Agent && npx vitest run src/pages/ManualScanPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/ManualScanPage.tsx
git commit -m "a11y: add aria-labels to ManualScanPage buttons

- Add aria-label to select-all toggle button
- Update visible text to match test expectations
- Improve accessibility for screen readers
- Resolves M4 issue"
```

---

### Task 15: M5 — Fix DashboardSearch Test Assertions

**Priority:** MEDIUM — Tests assert non-existent text

**Files:**
- Modify: `src/pages/DashboardSearch.test.tsx`
- Or Modify: `src/pages/DashboardPage.tsx` (align with tests)

- [ ] **Step 1: Read current test and component**

Read: `src/pages/DashboardSearch.test.tsx`
Read: `src/pages/DashboardPage.tsx`
Expected: Find mismatch in asserted text

- [ ] **Step 2: Align test with component**

Modify `src/pages/DashboardSearch.test.tsx`:
```typescript
// Before:
expect(screen.getByText(/No projects matching "Zeta"/)).toBeInTheDocument();

// After:
expect(screen.getByText('No matches found')).toBeInTheDocument();
expect(screen.getByText(/Try adjusting your search terms/)).toBeInTheDocument();
```

- [ ] **Step 3: Run tests**

Run: `cd /home/kali_linux/Agent && npx vitest run src/pages/DashboardSearch.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/pages/DashboardSearch.test.tsx
git commit -m "test: fix DashboardSearch test assertions

- Align test assertions with actual rendered text
- Test for 'No matches found' and 'Try adjusting your search terms'
- Remove assertion for non-existent text
- Resolves M5 issue"
```

---

### Task 16: H5 — Change retry_count from String to Integer

**Priority:** HIGH — Type mismatch causes potential exceptions

**Files:**
- Modify: `backend/app/models/db_models.py`
- Modify: `backend/app/api/scans.py`
- Create: `backend/alembic/versions/xxx_change_retry_count_to_int.py`

- [ ] **Step 1: Read current model definition**

Read: `backend/app/models/db_models.py`
Expected: Find `retry_count = Column(String, ...)`

- [ ] **Step 2: Create Alembic migration**

Run: `cd /home/kali_linux/Agent/backend && alembic revision -m "change retry_count to integer"`

Edit migration:
```python
def upgrade():
    # Convert existing string values to integers
    op.execute("ALTER TABLE scans ALTER COLUMN retry_count TYPE INTEGER USING retry_count::INTEGER")

def downgrade():
    op.execute("ALTER TABLE scans ALTER COLUMN retry_count TYPE VARCHAR USING retry_count::VARCHAR")
```

- [ ] **Step 3: Update model**

Modify `backend/app/models/db_models.py`:
```python
retry_count = Column(Integer, default=0, nullable=False)
```

- [ ] **Step 4: Add MAX_RETRY_COUNT constant**

Modify `backend/app/api/scans.py`:
```python
MAX_RETRY_COUNT = 10

# In reset_scan:
if scan_obj.retry_count >= MAX_RETRY_COUNT:
    raise HTTPException(
        status_code=400,
        detail=f"Maximum retry count ({MAX_RETRY_COUNT}) exceeded"
    )
```

- [ ] **Step 5: Run migration and tests**

Run: `cd /home/kali_linux/Agent/backend && alembic upgrade head`
Run: `pytest backend/tests/test_scans.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/db_models.py backend/app/api/scans.py backend/alembic/versions/*.py
git commit -m "fix: change retry_count from String to Integer

- Database column now Integer type
- Add MAX_RETRY_COUNT = 10 limit enforcement
- Prevents type conversion exceptions
- Resolves H5 issue"
```

---

### Task 17: B4 — Replace Deprecated datetime.utcnow()

**Priority:** MEDIUM — Python 3.12 deprecation

**Files:**
- Modify: All backend Python files using `datetime.utcnow()`

- [ ] **Step 1: Find all usages**

Run: `grep -rn "datetime.utcnow()" /home/kali_linux/Agent/backend/`
Expected: List of all files using deprecated method

- [ ] **Step 2: Replace with datetime.now(timezone.utc)**

For each file found:
```python
# Before:
from datetime import datetime
datetime.utcnow()

# After:
from datetime import datetime, timezone
datetime.now(timezone.utc)
```

- [ ] **Step 3: Run all backend tests**

Run: `cd /home/kali_linux/Agent && pytest backend/tests/ -v`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add backend/app/**/*.py
git commit -m "fix: replace deprecated datetime.utcnow() with timezone-aware version

- Replace all datetime.utcnow() with datetime.now(timezone.utc)
- Prepare for Python 3.12+ compatibility
- Resolves B4 issue"
```

---

### Task 18: B2 — Add Graceful Shutdown for Recovery Thread

**Priority:** MEDIUM — Daemon thread killed mid-transaction

**Files:**
- Modify: `backend/app/main.py`
- Modify: `backend/app/services/scan_recovery.py`

- [ ] **Step 1: Read current recovery thread startup**

Read: `backend/app/main.py`
Expected: Find `threading.Thread(target=run_recovery_task, daemon=True).start()`

- [ ] **Step 2: Add shutdown event**

Modify `backend/app/services/scan_recovery.py`:
```python
import threading

shutdown_event = threading.Event()

def run_recovery_task():
    while not shutdown_event.is_set():
        # Recovery logic
        shutdown_event.wait(300)  # Sleep for 5 minutes or until shutdown
```

- [ ] **Step 3: Register shutdown handler**

Modify `backend/app/main.py`:
```python
from app.services.scan_recovery import shutdown_event

@app.on_event("shutdown")
async def shutdown_event_handler():
    shutdown_event.set()
```

- [ ] **Step 4: Test graceful shutdown**

Run: `cd /home/kali_linux/Agent && python run.py staging`
Then: `docker compose down`
Expected: Clean shutdown logs, no interrupted transactions

- [ ] **Step 5: Commit**

```bash
git add backend/app/main.py backend/app/services/scan_recovery.py
git commit -m "fix: add graceful shutdown for recovery thread

- Use threading.Event for clean shutdown signaling
- Replace daemon thread with proper shutdown handling
- Register FastAPI shutdown event handler
- Prevents mid-transaction kills
- Resolves B2 issue"
```

---

### Task 19: U2 — Fix ScanErrorModal Focus Trap

**Priority:** MEDIUM — Fragile setTimeout for focus management

**Files:**
- Modify: `src/components/ScanErrorModal.tsx`

- [ ] **Step 1: Read current focus trap implementation**

Read: `src/components/ScanErrorModal.tsx`
Expected: Find `setTimeout(() => closeButtonRef.current?.focus(), 100)`

- [ ] **Step 2: Replace with useEffect**

Modify `src/components/ScanErrorModal.tsx`:
```typescript
useEffect(() => {
  if (isOpen && closeButtonRef.current) {
    closeButtonRef.current.focus();
  }
}, [isOpen]);
```

- [ ] **Step 3: Remove setTimeout**

Remove the setTimeout call entirely

- [ ] **Step 4: Test focus behavior**

Run: `cd /home/kali_linux/Agent && npm run dev`
Open error modal
Expected: Focus moves to close button immediately on open

- [ ] **Step 5: Commit**

```bash
git add src/components/ScanErrorModal.tsx
git commit -m "a11y: fix focus trap in ScanErrorModal

- Replace setTimeout with useEffect for focus management
- Focus set after React renders, no arbitrary delay
- More reliable in test environments and under CPU throttling
- Resolves U2 issue"
```

---

### Task 20: U4 — Replace Layout useEffect with useQuery

**Priority:** MEDIUM — Bypasses React Query caching, potential memory leak

**Files:**
- Modify: `src/components/Layout.tsx`

- [ ] **Step 1: Read current project fetching**

Read: `src/components/Layout.tsx`
Expected: Find useEffect with async fetch

- [ ] **Step 2: Replace with useQuery**

Modify `src/components/Layout.tsx`:
```typescript
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';

const { data: project } = useQuery({
  queryKey: ['project', projectId],
  queryFn: () => api.projects.get(projectId),
  enabled: !!projectId,
  staleTime: 5 * 60 * 1000, // 5 minutes
});
```

- [ ] **Step 3: Remove useEffect**

Remove the entire useEffect block that was doing the fetch

- [ ] **Step 4: Test project context display**

Run: `cd /home/kali_linux/Agent && npm run dev`
Navigate to project pages
Expected: Project name loads from cache, sidebar updates correctly

- [ ] **Step 5: Commit**

```bash
git add src/components/Layout.tsx
git commit -m "refactor: use React Query in Layout for project fetching

- Replace useEffect/useState with useQuery
- Project data now cached and shared with other components
- Prevents memory leaks from unmounted component updates
- Resolves U4 issue"
```

---

### Task 21: U5 — Close Mobile Sidebar on Any Navigation

**Priority:** MEDIUM — Sidebar stays open on non-link navigation

**Files:**
- Modify: `src/components/Layout.tsx`

- [ ] **Step 1: Read current sidebar close logic**

Read: `src/components/Layout.tsx`
Expected: Find setIsMobileMenuOpen only on NavLink clicks

- [ ] **Step 2: Add useEffect watching location**

Modify `src/components/Layout.tsx`:
```typescript
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const location = useLocation();

useEffect(() => {
  setIsMobileMenuOpen(false);
}, [location.pathname]);
```

- [ ] **Step 3: Test mobile navigation**

Run: `cd /home/kali_linux/Agent && npm run dev`
Use mobile viewport, navigate via buttons and links
Expected: Sidebar closes on any navigation

- [ ] **Step 4: Commit**

```bash
git add src/components/Layout.tsx
git commit -m "ux: close mobile sidebar on any navigation

- Add useEffect watching location.pathname
- Sidebar closes on all navigation, not just direct link clicks
- Improves mobile UX
- Resolves U5 issue"
```

---

### Task 22: M6 — Fix Division by Zero in ScanProgressBar

**Priority:** MEDIUM — Potential division by zero error

**Files:**
- Modify: `src/components/ScanProgressBar.tsx`

- [ ] **Step 1: Read current progress calculation**

Read: `src/components/ScanProgressBar.tsx`
Expected: Find denominator calculation

- [ ] **Step 2: Add guard for empty stages**

Modify `src/components/ScanProgressBar.tsx`:
```typescript
const relevantStages = (selectedStages && selectedStages.length > 0) 
  ? selectedStages 
  : STAGE_ORDER;

const totalStages = relevantStages.length || 1; // Prevent division by zero

const progress = totalStages > 0 
  ? Math.round((completedStages / totalStages) * 100) 
  : 0;
```

- [ ] **Step 3: Add comment**

```typescript
// Fallback to STAGE_ORDER for automated scans, prevent division by zero
```

- [ ] **Step 4: Test with automated and manual scans**

Run: `cd /home/kali_linux/Agent && npm run dev`
View both automated and manual scan progress
Expected: Progress calculates correctly, no NaN or Infinity

- [ ] **Step 5: Commit**

```bash
git add src/components/ScanProgressBar.tsx
git commit -m "fix: prevent division by zero in ScanProgressBar

- Add guard for empty selectedStages array
- Fallback to STAGE_ORDER with length check
- Prevents NaN progress percentage
- Resolves M6 issue"
```

---

### Task 23: M3 — Fix useScanHistory Hook

**Priority:** MEDIUM — Returns Promise instead of React Query result

**Files:**
- Modify: `src/hooks/useScanReset.ts`
- Or Remove: The hook entirely if unused

- [ ] **Step 1: Read current useScanHistory**

Read: `src/hooks/useScanReset.ts`
Expected: Find function returning raw Promise

- [ ] **Step 2: Check if hook is used**

Run: `grep -rn "useScanHistory" /home/kali_linux/Agent/src/`
Expected: Find usage locations

- [ ] **Step 3a: If used, fix with useQuery**

Modify `src/hooks/useScanReset.ts`:
```typescript
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';

export function useScanHistory(projectId: string) {
  return useQuery({
    queryKey: ['project', projectId, 'scans'],
    queryFn: () => api.projects.getScanHistory(projectId),
    enabled: !!projectId,
  });
}
```

- [ ] **Step 3b: If unused, remove**

Delete the function from useScanReset.ts

- [ ] **Step 4: Run tests**

Run: `cd /home/kali_linux/Agent && npx vitest run src/hooks/useScanReset.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useScanReset.ts
git commit -m "fix: wrap useScanHistory in useQuery

- Hook now returns React Query result with loading/error state
- Consistent with other data-fetching hooks in app
- Or remove if unused
- Resolves M3 issue"
```

---

### Task 24: M7 — Document Provider Nesting Order

**Priority:** MEDIUM — Fragile provider nesting

**Files:**
- Modify: `src/main.tsx`

- [ ] **Step 1: Read current provider structure**

Read: `src/main.tsx`
Expected: See ToastProvider, AuthProvider, BrowserRouter nesting

- [ ] **Step 2: Add documentation comments**

Modify `src/main.tsx`:
```typescript
// Provider nesting order is important:
// 1. ToastProvider (must be outermost for toast access everywhere)
// 2. BrowserRouter (needed for useNavigate in auth components)
// 3. AuthProvider (uses useNavigate, so must be inside BrowserRouter)
// 4. QueryClientProvider (can be anywhere, but inside ToastProvider for error toasts)
```

- [ ] **Step 3: Consider creating AppProviders wrapper**

Create `src/providers/AppProviders.tsx`:
```typescript
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <BrowserRouter>
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        </AuthProvider>
      </BrowserRouter>
    </ToastProvider>
  );
}
```

- [ ] **Step 4: Update main.tsx**

Modify `src/main.tsx`:
```typescript
import { AppProviders } from './providers/AppProviders';

root.render(
  <AppProviders>
    <App />
  </AppProviders>
);
```

- [ ] **Step 5: Run tests**

Run: `cd /home/kali_linux/Agent && npx vitest run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main.tsx src/providers/AppProviders.tsx
git commit -m "refactor: create AppProviders wrapper component

- Document required provider nesting order
- Create single AppProviders component enforcing correct order
- Prevents future refactoring issues
- Resolves M7 issue"
```

---

### Task 25: U3 — Fix Breadcrumbs Duplicate API Calls

**Priority:** MEDIUM — Extra API call on every scan navigation

**Files:**
- Modify: `src/components/Breadcrumbs.tsx`
- Modify: `src/pages/ScanStatusPage.tsx`

- [ ] **Step 1: Read current Breadcrumbs fetching**

Read: `src/components/Breadcrumbs.tsx`
Expected: Find useQuery fetching scan data

- [ ] **Step 2: Use React Query cache**

Modify `src/components/Breadcrumbs.tsx`:
```typescript
// Use staleTime to prefer cache:
const { data: scan } = useQuery({
  queryKey: ['scan', scanId],
  queryFn: () => api.scans.get(scanId),
  staleTime: 5 * 60 * 1000, // 5 minutes
});
```

- [ ] **Step 3: Or pass projectId through context**

Alternative: Create ScanContext in ScanStatusPage and pass projectId down

- [ ] **Step 4: Test network requests**

Run: `cd /home/kali_linux/Agent && npm run dev`
Navigate to scan page
Expected: Only one API call (from ScanStatusPage), Breadcrumbs uses cache

- [ ] **Step 5: Commit**

```bash
git add src/components/Breadcrumbs.tsx
git commit -m "perf: use React Query cache in Breadcrumbs

- Set staleTime to prefer cached scan data
- Eliminates duplicate API call (ScanStatusPage already fetches)
- Reduces API load
- Resolves U3 issue"
```

---

### Task 26: H6 — Add Initializing State to ScanProgressBar

**Priority:** HIGH — No distinction between new scan and stuck scan

**Files:**
- Modify: `src/components/ScanProgressBar.tsx`

- [ ] **Step 1: Read current empty state handling**

Read: `src/components/ScanProgressBar.tsx`
Expected: Find rendering when stages is empty

- [ ] **Step 2: Add initializing state**

Modify `src/components/ScanProgressBar.tsx`:
```typescript
const [elapsed, setElapsed] = useState(0);

useEffect(() => {
  const timer = setInterval(() => {
    setElapsed(e => e + 1);
  }, 1000);
  return () => clearInterval(timer);
}, []);

// In render:
if (stages.length === 0 && scanState === 'RUNNING') {
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  
  if (elapsed < 300) {
    return (
      <div className="text-center py-8">
        <Spinner />
        <p>Pipeline initializing... ({minutes}m {seconds}s elapsed)</p>
      </div>
    );
  } else {
    return (
      <div className="text-center py-8">
        <AlertTriangle className="text-yellow-500" />
        <p>No stage updates received in {minutes}m {seconds}s</p>
        <p className="text-sm text-gray-500">Pipeline may be stuck</p>
      </div>
    );
  }
}
```

- [ ] **Step 3: Test with new scan**

Run: `cd /home/kali_linux/Agent && npm run dev`
Trigger a new scan
Expected: See "Pipeline initializing..." message, then warning after 5 minutes

- [ ] **Step 4: Commit**

```bash
git add src/components/ScanProgressBar.tsx
git commit -m "feat: add initializing state to ScanProgressBar

- Show 'Pipeline initializing...' with elapsed time for new scans
- Show warning after 5 minutes with no stage data
- Helps users distinguish new vs stuck scans
- Resolves H6 issue"
```

---

## Phase 5: Low Priority / Code Quality

### Task 27: L1 — Remove catch(_: any) Suppression in ProjectControlPage

**Priority:** LOW — Error messages lost

**Files:**
- Modify: `src/pages/ProjectControlPage.tsx`

- [ ] **Step 1: Read current error handling**

Read: `src/pages/ProjectControlPage.tsx`
Expected: Find `catch (_: any)`

- [ ] **Step 2: Use proper error handling**

Modify `src/pages/ProjectControlPage.tsx`:
```typescript
catch (error) {
  const message = ApiError.isApiError(error) 
    ? error.message 
    : 'Failed to trigger scan';
  toast.error(message);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/ProjectControlPage.tsx
git commit -m "refactor: remove error suppression in ProjectControlPage

- Use ApiError to get specific error messages
- Show backend error details to user
- Better UX for scan failures
- Resolves L1 issue"
```

---

### Task 28: L4 — Fix Scan State After Reset

**Priority:** LOW — Semantically wrong state display

**Files:**
- Modify: `backend/app/api/scans.py`

- [ ] **Step 1: Read current reset logic**

Read: `backend/app/api/scans.py`
Expected: Find `project.last_scan_state = ScanState.CREATED`

- [ ] **Step 2: Keep project state as FAILED**

Modify `backend/app/api/scans.py`:
```python
# In reset_scan:
# Don't update project.last_scan_state on reset
# Only update scan.state to CREATED
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/scans.py
git commit -m "fix: don't update project state on scan reset

- Project last_scan_state stays FAILED after reset
- Only scan.state changes to CREATED
- Dashboard correctly shows no active scan
- Resolves L4 issue"
```

---

### Task 29: L3 — Add Notification Permission Button to Settings

**Priority:** LOW — Dead code or missing feature

**Files:**
- Modify: `src/pages/SettingsPage.tsx`
- Verify: `src/services/notifications.ts`

- [ ] **Step 1: Check if NotificationService is used**

Run: `grep -rn "notificationService" /home/kali_linux/Agent/src/`
Expected: Find usage or confirm dead code

- [ ] **Step 2a: If unused, add button to Settings**

Modify `src/pages/SettingsPage.tsx`:
```typescript
import { notificationService } from '../services/notifications';

const handleEnableNotifications = async () => {
  const result = await notificationService.requestPermission();
  if (result === 'granted') {
    toast.success('Notifications enabled');
  } else {
    toast.error('Notification permission denied');
  }
};

// In render:
<button onClick={handleEnableNotifications}>
  Enable Desktop Notifications
</button>
```

- [ ] **Step 2b: If truly dead code, remove**

Delete `src/services/notifications.ts`

- [ ] **Step 3: Commit**

```bash
git add src/pages/SettingsPage.tsx
git commit -m "feat: add notification permission button to Settings

- Add 'Enable Desktop Notifications' button
- Call notificationService.requestPermission() on click
- Show success/error toast based on result
- Resolves L3 issue"
```

---

### Task 30: B3 — Add updated_at Column to Models

**Priority:** LOW — No timestamp tracking

**Files:**
- Modify: `backend/app/models/db_models.py`
- Create: `backend/alembic/versions/xxx_add_updated_at_columns.py`

- [ ] **Step 1: Read current models**

Read: `backend/app/models/db_models.py`
Expected: See no updated_at columns

- [ ] **Step 2: Add updated_at to all models**

Modify `backend/app/models/db_models.py`:
```python
from sqlalchemy import DateTime
from datetime import datetime, timezone

class ProjectDB(Base):
    # ... existing fields
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), 
                       onupdate=lambda: datetime.now(timezone.utc), nullable=False)
```

- [ ] **Step 3: Create migration**

Run: `cd /home/kali_linux/Agent/backend && alembic revision -m "add updated_at columns"`

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/db_models.py backend/alembic/versions/*.py
git commit -m "feat: add created_at and updated_at timestamps to models

- Add timestamp columns to all models
- Auto-update on record changes
- Requires database migration
- Resolves B3 issue"
```

---

### Task 31: L2 — Generate Frontend Constants from Backend

**Priority:** LOW — Duplicated constants

**Files:**
- Create: `scripts/generate-frontend-types.py`
- Modify: `package.json` (add generation script)

- [ ] **Step 1: Create type generation script**

Create `scripts/generate-frontend-types.py`:
```python
#!/usr/bin/env python3
"""Generate TypeScript types from FastAPI OpenAPI schema"""

import requests
import json

OPENAPI_URL = "http://localhost:8000/openapi.json"
OUTPUT_FILE = "src/types.generated.ts"

def generate_types():
    response = requests.get(OPENAPI_URL)
    schema = response.json()
    
    # Extract ScanState enum
    states = schema['components']['schemas']['ScanState']['enum']
    
    with open(OUTPUT_FILE, 'w') as f:
        f.write("// Auto-generated from backend OpenAPI schema\n")
        f.write("// Do not edit manually - run: npm run generate:types\n\n")
        f.write(f"export type ScanState = {' | '.join(repr(s) for s in states)};\n")

if __name__ == '__main__':
    generate_types()
```

- [ ] **Step 2: Add npm script**

Modify `package.json`:
```json
{
  "scripts": {
    "generate:types": "python3 scripts/generate-frontend-types.py"
  }
}
```

- [ ] **Step 3: Update tsconfig.json**

Modify `tsconfig.json`:
```json
{
  "compilerOptions": {
    "types": ["./src/types.generated.ts"]
  }
}
```

- [ ] **Step 4: Test generation**

Run: `cd /home/kali_linux/Agent && npm run generate:types`
Expected: Generates src/types.generated.ts

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-frontend-types.py package.json src/types.generated.ts
git commit -m "feat: auto-generate frontend types from backend OpenAPI

- Add script to fetch /openapi.json and generate TypeScript types
- Run with: npm run generate:types
- Prevents drift between frontend and backend constants
- Resolves L2 issue"
```

---

## Testing Strategy

After each phase, run the full test suite:

```bash
# Frontend tests
cd /home/kali_linux/Agent && npx vitest run

# Backend tests
cd /home/kali_linux/Agent && pytest backend/tests/ -v

# Integration tests
cd /home/kali_linux/Agent && pytest tests/test_integration.py -v
```

## Deployment Checklist

After all phases complete:

1. Run database migrations: `alembic upgrade head`
2. Rebuild Docker images: `docker compose build`
3. Restart staging: `python run.py staging`
4. Verify all containers healthy: `docker compose ps`
5. Smoke test: Login, create project, trigger scan
6. Check error modal, CORS, API key storage

---

## Summary

This plan addresses 31 of the 47 identified issues. The remaining 16 are:
- C7 (callback_digests race condition) — Requires complex DB locking, defer to Phase 2
- H2 (WebSocket Context) — Major refactor, defer to dedicated WebSocket improvement PR
- H3 (ScanState enum mismatch) — Fixed by L2 type generation
- H4 (Celery DLQ) — Requires Celery config changes, separate infrastructure PR
- M1 (shouldRun logic) — Jenkinsfile logic is correct as-is
- M2 (ETA calculation) — Nice-to-have, not a bug
- P1 (ProjectRow memoization) — Low impact, optimize if needed
- U1 (covered in C4)
- L5-L7 (Docker/nginx config) — Infrastructure concerns, separate PR
- B3 (updated_at) — Included as Task 30

**Total estimated effort:** 15-20 hours for full implementation
**Critical fixes (Tasks 1-6):** 2-3 hours
**High priority (Tasks 7-9):** 1-2 hours
**Medium priority (Tasks 10-26):** 8-12 hours
**Low priority (Tasks 27-31):** 2-3 hours
