Looking at your entire codebase carefully — every file you've shared — let me give you an honest compatibility analysis before you touch anything.

---

## Compatibility Analysis

### What I Need to Cross-Reference

Your existing system has these integration points that the new Jenkinsfile must be compatible with:

**Backend sends these parameters to Jenkins:**
```python
# backend/app/services/jenkins_service.py
payload = {
    "SCAN_ID": scan.scan_id,
    "SCAN_MODE": scan.scan_mode.upper(),
    "PROJECT_DATA": json.dumps({
        "project_id": project_data.get("project_id"),
        "project_name": project_data.get("name"),
        "git_url": project_data.get("git_url"),
        "branch": project_data.get("branch"),
        "credentials_id": project_data.get("credentials_id"),
        "sonar_key": project_data.get("sonar_key"),
        "target_ip": project_data.get("target_ip"),
        "target_url": project_data.get("target_url")
    }),
    "SELECTED_STAGES": json.dumps(scan.selected_stages),
    "SCAN_TIMEOUT": str(project_data.get("scan_timeout", 7200)),
}
```

**Backend expects these fields back from Jenkins callback:**
```python
# backend/app/api/scans.py - scan_callback endpoint
jenkins_status = str(report.get("status", "")).upper()
stages = report.get("stages", [])
build_number = report.get("build_number")
queue_id = report.get("queue_id")
error_message = report.get("error_message")
error_type = report.get("error_type")
jenkins_console_url = report.get("jenkins_console_url")
```

**Backend stage normalization expects these exact stage IDs:**
```python
# backend/app/api/scans.py - _normalize_stage
JENKINS_STAGE_NAME_TO_ID = {
    "Git Checkout": "git_checkout",
    "Sonar Scanner": "sonar_scanner",
    "Sonar Quality Gate": "sonar_quality_gate",
    "NPM / PIP Install": "npm_pip_install",
    "Dependency Check": "dependency_check",
    "Trivy FS Scan": "trivy_fs_scan",
    "Docker Build": "docker_build",
    "Docker Push": "docker_push",
    "Trivy Image Scan": "trivy_image_scan",
    "Nmap Scan": "nmap_scan",
    "ZAP Scan": "zap_scan",
}
```

**Frontend expects these exact state values:**
```typescript
// src/types.ts
state: 'INITIAL' | 'WAITING' | 'IN PROGRESS' | 'FINISHED' | 'FAILED' | 
       'CANCELLED' | 'CREATED' | 'QUEUED' | 'RUNNING' | 'COMPLETED'
```

**Frontend valid stages list:**
```typescript
// src/types.ts
export const FIXED_STAGES = [
  'git_checkout', 'sonar_scanner', 'sonar_quality_gate',
  'npm_pip_install', 'dependency_check', 'trivy_fs_scan',
  'docker_build', 'docker_push', 'trivy_image_scan',
  'nmap_scan', 'zap_scan'
] as const
```

**Backend valid stages validation:**
```python
# backend/app/services/validation.py
VALID_STAGES = {
    "git_checkout", "sonar_scanner", "sonar_quality_gate",
    "npm_pip_install", "dependency_check", "trivy_fs_scan",
    "docker_build", "docker_push", "trivy_image_scan",
    "nmap_scan", "zap_scan"
}
```

---

## The Compatibility Problems Found

### Problem 1 — CRITICAL: New Stage IDs Break the Entire Callback System

The new Jenkinsfile introduces these `recordStage` calls:

```groovy
// Stage 4a
// No recordStage call at all — discovery produces no result for the backend

// Stage 4b  
recordStage('npm_pip_install', stageStatus, summary)  // ✓ OK

// Stage 7a
// No recordStage call — discovery produces no result for the backend

// Stage 7b
recordStage('docker_build', stageStatus, summary)     // ✓ OK
```

The discovery stages (4a and 7a) produce **no `recordStage` call**. This means the backend never knows discovery ran. That part is actually fine because discovery is internal pipeline logic.

But here is the real problem: the backend's `_normalize_stage` function validates every stage ID against `VALID_STAGES`. If the new Jenkinsfile ever calls `recordStage` with any ID not in that set, the callback returns HTTP 400 and the entire scan result is rejected. The new pipeline as written does not introduce new stage IDs, so this specific issue does not trigger — but it means you cannot add `recordStage('dependency_discovery', ...)` without first updating the backend.

### Problem 2 — HIGH: `PROJECT_DATA` Does Not Contain `frontend_path`, `backend_path`, or `docker_file_path`

The new Jenkinsfile reads:
```groovy
def operatorFrontendPath = PROJECT.frontend_path ?: ''
def operatorBackendPath  = PROJECT.backend_path  ?: ''
// and
if (PROJECT.docker_file_path) { ... }
```

But `jenkins_service.py` only sends:
```python
"PROJECT_DATA": json.dumps({
    "project_id": ..., "project_name": ..., "git_url": ...,
    "branch": ..., "credentials_id": ..., "sonar_key": ...,
    "target_ip": ..., "target_url": ...
})
```

`frontend_path`, `backend_path`, and `docker_file_path` are **never sent**. The Groovy `PROJECT.frontend_path ?: ''` will always evaluate to `''`, meaning the operator override feature silently never works even if someone adds those fields to the database.

### Problem 3 — HIGH: `ProjectDB` and `ProjectCreate` Don't Have These Fields

Even if you fix `jenkins_service.py`, the fields don't exist in the database:

```python
# backend/app/models/db_models.py
class ProjectDB(Base):
    __tablename__ = "projects"
    project_id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    status = Column(String, default="CREATED")
    last_scan_state = Column(String, nullable=True)
    git_url = Column(String, nullable=True)
    branch = Column(String, nullable=True)
    credentials_id = Column(String, nullable=True)
    sonar_key = Column(String, nullable=True)
    target_ip = Column(String, nullable=True)
    target_url = Column(String, nullable=True)
    # frontend_path   → MISSING
    # backend_path    → MISSING
    # docker_file_path → MISSING
```

```python
# backend/app/schemas/project.py
class ProjectCreate(BaseModel):
    name: str
    git_url: str
    branch: str = "main"
    credentials_id: str
    sonar_key: str
    target_ip: Optional[str] = None
    target_url: Optional[str] = None
    # frontend_path   → MISSING
    # backend_path    → MISSING
```

### Problem 4 — HIGH: Frontend `ProjectForm` and `types.ts` Don't Have These Fields Either

```typescript
// src/types.ts
export type Project = {
  project_id: string;
  name: string;
  git_url: string;
  branch: string;
  credentials_id: string;
  sonar_key: string;
  target_ip?: string;
  target_url?: string;
  last_scan_state?: string;
  last_scan_id?: string;
  // frontend_path   → MISSING
  // backend_path    → MISSING
}
```

The `ProjectForm` component renders fields from a fixed list. There is no `frontend_path` or `backend_path` input. Users have no way to set these values.

### Problem 5 — MEDIUM: Stage Split (4a/7a Discovery + 4b/7b Build) Creates Naming Mismatch

Your `JENKINS_STAGE_NAME_TO_ID` in the backend maps **display names** to stage IDs:

```python
"NPM / PIP Install": "npm_pip_install",
"Docker Build": "docker_build",
```

The new pipeline has four stages where there were two:
- `4a. Discover Dependencies` — no backend mapping exists
- `4b. NPM / PIP Install` — matches existing mapping ✓
- `7a. Discover Dockerfiles` — no backend mapping exists  
- `7b. Docker Build` — matches existing mapping ✓

The discovery stages don't call `recordStage` so they don't reach the backend. This is fine for now but means if Jenkins fails *during* discovery (before `recordStage` is called), the backend receives no stage result for `npm_pip_install` or `docker_build` at all — the scan callback will have those stages missing from the results array, and your frontend's `ScanProgressBar` will show them as perpetually pending.

### Problem 6 — MEDIUM: `Closure` Syntax in `LANGUAGE_DEFINITIONS` May Fail Jenkins Sandbox

The `LANGUAGE_DEFINITIONS` map uses Groovy closures as values:

```groovy
validators: { String content ->
    content.contains('"dependencies"') || ...
},
install: { String dir ->
    """
    cd '${dir}'
    npm ci 2>/dev/null || npm install
    ...
    """
},
```

Jenkins' Groovy sandbox restricts which methods and syntax patterns are allowed. Closures stored in `@Field` maps and called later with `langDef.validators(content)` and `langDef.install(dir)` are **not standard sandbox-approved patterns**. This will likely throw `org.jenkinsci.plugins.scriptsecurity.sandbox.RejectedAccessException` on the first run unless your Jenkins has "In-process Script Approval" configured to allow it, or your pipeline runs with `@NonCPS` annotations, or the Jenkinsfile is in a trusted shared library.

### Problem 7 — LOW: `readFile` Inside a Loop Inside a `script` Block

The discovery stage does:
```groovy
def content = readFile(filePath)
isValid = langDef.validators(content)
```

`readFile` is a Pipeline step, not a regular Groovy method. Calling Pipeline steps inside closures that are themselves inside loops that are inside `script` blocks works in Jenkins but has known serialization issues with `@Field` variables. If the `DISCOVERED_DEPS` map gets serialized mid-execution (which Jenkins does for pause/resume), closures stored in it cannot be serialized and the build crashes with a `NotSerializableException`.

The `DISCOVERED_DEPS` and `DISCOVERED_DOCKER` fields store plain maps and lists (serializable), so this is not directly affected — but the pattern is fragile.

---

## What Actually Works Without Changes

Going through the new Jenkinsfile line by line against your codebase, these parts are fully compatible right now:

| Component | Status | Reason |
|-----------|--------|--------|
| `SCAN_ID` parameter parsing | ✓ Compatible | Identical to existing |
| `SCAN_MODE` parameter parsing | ✓ Compatible | Identical to existing |
| `PROJECT_DATA` JSON parsing | ✓ Compatible | Same fields used |
| `SELECTED_STAGES` parsing | ✓ Compatible | Same logic |
| `SCAN_TIMEOUT` parameter | ✓ Compatible | Same logic |
| `recordStage('git_checkout', ...)` | ✓ Compatible | Valid stage ID |
| `recordStage('sonar_scanner', ...)` | ✓ Compatible | Valid stage ID |
| `recordStage('sonar_quality_gate', ...)` | ✓ Compatible | Valid stage ID |
| `recordStage('npm_pip_install', ...)` | ✓ Compatible | Valid stage ID |
| `recordStage('dependency_check', ...)` | ✓ Compatible | Valid stage ID |
| `recordStage('trivy_fs_scan', ...)` | ✓ Compatible | Valid stage ID |
| `recordStage('docker_build', ...)` | ✓ Compatible | Valid stage ID |
| `recordStage('docker_push', ...)` | ✓ Compatible | Valid stage ID |
| `recordStage('trivy_image_scan', ...)` | ✓ Compatible | Valid stage ID |
| `recordStage('nmap_scan', ...)` | ✓ Compatible | Valid stage ID |
| `recordStage('zap_scan', ...)` | ✓ Compatible | Valid stage ID |
| Callback payload structure | ✓ Compatible | Same fields |
| `BUILT_IMAGES` tracking | ✓ Compatible | Internal only |
| Post-build cleanup | ✓ Compatible | No backend dependency |
| Auto-detection logic (4a/4b) | ✓ Compatible | Falls back gracefully |
| Docker discovery (7a/7b) | ✓ Compatible | Falls back gracefully |

---

## The Minimum Changes Required to Make This Fully Work

There are two tiers. Tier 1 makes the Jenkinsfile work right now with zero features missing. Tier 2 unlocks the operator override feature.

### Tier 1 — Drop-In Compatible (Jenkinsfile Only, No Backend Changes)

Remove the operator override blocks entirely from the new Jenkinsfile since the fields will never be populated. The auto-detection runs unconditionally. This is actually the correct behavior for a first deployment — get auto-detection working reliably before adding override UI.

The closure sandbox issue must also be resolved. The fix is to extract the validators and install commands out of the map and into named `def` methods, which the Jenkins sandbox handles correctly.

### Tier 2 — Full Feature Set (Requires Backend + Frontend Changes)

**Backend changes needed (in order):**

**1. Database migration** — add three nullable string columns to `projects` table:
```
frontend_path    VARCHAR nullable
backend_path     VARCHAR nullable  
docker_file_path VARCHAR nullable
```

**2. Schema updates** — add to `ProjectCreate`, `ProjectUpdate`, and `ProjectResponse` in `backend/app/schemas/project.py`:
```python
frontend_path:    Optional[str] = None
backend_path:     Optional[str] = None
docker_file_path: Optional[str] = None
```

**3. Model update** — add to `ProjectDB` in `backend/app/models/db_models.py`:
```python
frontend_path    = Column(String, nullable=True)
backend_path     = Column(String, nullable=True)
docker_file_path = Column(String, nullable=True)
```

**4. Jenkins service update** — add to the `PROJECT_DATA` dict in `backend/app/services/jenkins_service.py`:
```python
"frontend_path":    project_data.get("frontend_path"),
"backend_path":     project_data.get("backend_path"),
"docker_file_path": project_data.get("docker_file_path"),
```

**Frontend changes needed:**

**5. Type update** — add to `Project` type in `src/types.ts`:
```typescript
frontend_path?:    string;
backend_path?:     string;
docker_file_path?: string;
```

**6. Form update** — add three optional fields to `ProjectForm.tsx` in the "Intelligence Mapping" section, with help text explaining when to use them.

**7. `ProjectFormValues` type** — add the three fields to the values type in `src/components/ProjectForm.tsx`.

---

## Recommended Deployment Path

**Week 1 — Deploy Tier 1:**
Take the new Jenkinsfile, remove the operator override blocks, fix the closure sandbox issue by converting closures to named methods, and deploy. Auto-detection works immediately for all languages. Zero backend changes needed. Zero risk of breaking the callback system. Every scan that runs gets smart dependency detection.

**Week 2-3 — Deploy Tier 2:**
Write the database migration, update the schemas and model, update `jenkins_service.py`, update the frontend type and form. Now the operator override fields exist end-to-end. Deploy the updated Jenkinsfile with the override blocks re-enabled. Projects that need explicit paths can set them; everything else continues using auto-detection.

This sequencing means you never have a state where the Jenkinsfile reads `PROJECT.frontend_path` but the field doesn't exist — which would silently fall back to auto-detection anyway, but would create confusion when debugging.