# Project Creation Flow

Complete flow for creating and managing security scanning projects.

---

## 1. Project Creation Flow

### UI Flow

```
User on /dashboard
       │
       ▼
┌─────────────────────────────────────────┐
│ DashboardPage.tsx                       │
│                                         │
│ ┌───────────────────────────────────┐  │
│ │ My Projects                       │  │
│ │                                   │  │
│ │ [Create Project]                  │  │
│ │                                   │  │
│ │ ┌─────────┬──────────┬─────────┐ │  │
│ │ │ Name    │ Status   │ Actions │ │  │
│ │ ├─────────┼──────────┼─────────┤ │  │
│ │ │ MyApp   │ IDLE     │ [→]     │ │  │
│ │ │ WebApp  │ RUNNING  │ [→]     │ │  │
│ │ └─────────┴──────────┴─────────┘ │  │
│ └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
       │
       │ User clicks "Create Project"
       ▼
Navigate to /projects/create
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ CreateProjectPage.tsx                                        │
│                                                              │
│ Create New Project                                           │
│ ┌────────────────────────────────────────────────────────┐  │
│ │ Project Name *                                         │  │
│ │ [My Application________________________________]       │  │
│ │                                                        │  │
│ │ Git URL *                                              │  │
│ │ [https://github.com/user/myapp.git_____________]       │  │
│ │                                                        │  │
│ │ Branch                                                 │  │
│ │ [main__________________________________________]       │  │
│ │                                                        │  │
│ │ Credentials ID                                         │  │
│ │ [github-credentials____________________________]       │  │
│ │                                                        │  │
│ │ SonarQube Project Key                                  │  │
│ │ [myapp-key_____________________________________]       │  │
│ │                                                        │  │
│ │ Target IP (for Nmap scan)                              │  │
│ │ [192.168.1.100_________________________________]       │  │
│ │                                                        │  │
│ │ Target URL (for ZAP scan)                              │  │
│ │ [http://myapp.com______________________________]       │  │
│ │                                                        │  │
│ │ [Create Project] [Cancel]                              │  │
│ └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
       │
       │ User fills required fields, clicks "Create Project"
       ▼
POST /api/v1/projects
Authorization: Bearer eyJ...
X-API-Key: z9y8...

{
  "name": "My Application",
  "git_url": "https://github.com/user/myapp.git",
  "branch": "main",
  "credentials_id": "github-credentials",
  "sonar_key": "myapp-key",
  "target_ip": "192.168.1.100",
  "target_url": "http://myapp.com"
}
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│ Backend: projects.py::create_project()                          │
│                                                                 │
│ 1. Generate UUID for project_id                                 │
│    project_id = str(uuid.uuid4())                               │
│    → "abc-123-def-456"                                          │
│                                                                 │
│ 2. Create ProjectDB instance                                    │
│    ProjectDB(                                                   │
│      project_id="abc-123-def-456",                              │
│      name="My Application",                                     │
│      git_url="https://github.com/user/myapp.git",               │
│      branch="main",                                             │
│      credentials_id="github-credentials",                       │
│      sonar_key="myapp-key",                                     │
│      target_ip="192.168.1.100",                                 │
│      target_url="http://myapp.com",                             │
│      status="CREATED",                                          │
│      last_scan_state=None,                                      │
│      created_at=datetime.now(utc),                              │
│      updated_at=datetime.now(utc)                               │
│    )                                                            │
│                                                                 │
│ 3. Commit to PostgreSQL                                         │
│    db.add(db_project)                                           │
│    db.commit()                                                  │
│    db.refresh(db_project)                                       │
│                                                                 │
│ 4. Return ProjectResponse                                       │
│    {                                                            │
│      "project_id": "abc-123-def-456",                           │
│      "name": "My Application",                                  │
│      "git_url": "https://github.com/user/myapp.git",            │
│      "branch": "main",                                          │
│      "credentials_id": "github-credentials",                    │
│      "sonar_key": "myapp-key",                                  │
│      "target_ip": "192.168.1.100",                              │
│      "target_url": "http://myapp.com",                          │
│      "status": "CREATED",                                       │
│      "last_scan_state": null,                                   │
│      "last_scan_id": null,                                      │
│      "created_at": "2026-04-13T10:00:00Z",                      │
│      "updated_at": "2026-04-13T10:00:00Z"                       │
│    }                                                            │
└─────────────────────────────────────────────────────────────────┘
       │
       ▼
Frontend receives project object
       │
       ▼
Redirect to /projects/abc-123-def-456
       │
       ▼
Dashboard auto-refreshes (TanStack Query invalidates cache)
       │
       ▼
┌─────────────────────────────────────────┐
│ DashboardPage.tsx (refreshed)           │
│                                         │
│ ┌───────────────────────────────────┐  │
│ │ My Projects                       │  │
│ │                                   │  │
│ │ [Create Project]                  │  │
│ │                                   │  │
│ │ ┌────────────┬──────────┬──────┐ │  │
│ │ │ Name       │ Status   │ ...  │ │  │
│ │ ├────────────┼──────────┼──────┤ │  │
│ │ │ My App     │ IDLE     │ [→]  │ │  │
│ │ │ WebApp     │ RUNNING  │ [→]  │ │  │
│ │ │ My Applic  │ IDLE     │ [→]  │ │  │  ← NEW!
│ │ └────────────┴──────────┴──────┘ │  │
│ └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### Database State

```sql
INSERT INTO projects (
  project_id, name, git_url, branch, credentials_id,
  sonar_key, target_ip, target_url, status,
  last_scan_state, created_at, updated_at
)
VALUES (
  'abc-123-def-456',
  'My Application',
  'https://github.com/user/myapp.git',
  'main',
  'github-credentials',
  'myapp-key',
  '192.168.1.100',
  'http://myapp.com',
  'CREATED',
  NULL,
  '2026-04-13T10:00:00Z',
  '2026-04-13T10:00:00Z'
);
```

---

## 2. Project Details View

### UI Flow

```
User clicks project row on Dashboard
       │
       ▼
Navigate to /projects/abc-123-def-456
       │
       ▼
Frontend: GET /api/v1/projects/abc-123-def-456
       │
       ▼
Backend: projects.py::get_project()
  ├─ Query ProjectDB by project_id
  ├─ Query latest ScanDB for this project
  │   db.query(ScanDB)
  │     .filter(ScanDB.project_id == "abc-123-def-456")
  │     .order_by(ScanDB.created_at.desc())
  │     .first()
  └─ Return ProjectResponse with last_scan_state, last_scan_id
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│ ProjectControlPage.tsx                                          │
│                                                                 │
│ My Application                                      [Edit]      │
│ ─────────────────────────────────────────────────────────────── │
│                                                                 │
│ Project Details                                                 │
│ ┌───────────────────────────────────────────────────────────┐  │
│ │ Git URL:       https://github.com/user/myapp.git          │  │
│ │ Branch:        main                                       │  │
│ │ Target IP:     192.168.1.100                              │  │
│ │ Target URL:    http://myapp.com                           │  │
│ │ Last Scan:     None                                       │  │
│ └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│ Actions                                                         │
│ ┌───────────────────────────────────────────────────────────┐  │
│ │ [Run Automated Scan]  [Run Manual Scan]                   │  │
│ │ [View Scan History]                                       │  │
│ │ [Delete Project]                                          │  │
│ └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Project Edit Flow

### UI Flow

```
User clicks [Edit] on ProjectControlPage
       │
       ▼
Navigate to /projects/abc-123-def-456/edit
       │
       ▼
Frontend: GET /api/v1/projects/abc-123-def-456
       │
       ▼
Backend checks: Is scan active?
  if project.last_scan_state in {CREATED, QUEUED, RUNNING}:
    → HTTP 409 "Project cannot be edited while a scan is active"
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ ProjectEditPage.tsx (pre-filled form)                        │
│                                                              │
│ Edit Project                                                 │
│ ┌────────────────────────────────────────────────────────┐  │
│ │ Project Name *                                         │  │
│ │ [My Application________________________________]       │  │
│ │                                                        │  │
│ │ Git URL *                                              │  │
│ │ [https://github.com/user/myapp.git_____________]       │  │
│ │ ... (all fields pre-filled)                            │  │
│ │                                                        │  │
│ │ [Save Changes] [Cancel]                                │  │
│ └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
       │
       │ User modifies fields, clicks "Save Changes"
       ▼
PATCH /api/v1/projects/abc-123-def-456
Content-Type: application/json

{
  "name": "My Updated Application",
  "target_ip": "192.168.1.105"
}
       │
       ▼
Backend: projects.py::update_project()
  ├─ Query ProjectDB
  ├─ Check no active scan (same as above)
  ├─ Apply updates (only provided fields)
  │   for field, value in update_data.items():
  │     setattr(db_project, field, value)
  ├─ db.commit()
  ├─ db.refresh(db_project)
  └─ Return updated ProjectResponse
       │
       ▼
Frontend receives updated project
       │
       ▼
Redirect to /projects/abc-123-def-456
       │
       ▼
Success message displayed
```

---

## 4. Project Deletion Flow

### UI Flow

```
User clicks [Delete Project] on ProjectControlPage
       │
       ▼
Confirmation dialog:
┌─────────────────────────────────────────────────────┐
│ Delete Project?                                     │
│                                                     │
│ This will permanently delete "My Application"       │
│ and all associated scans. This action cannot        │
│ be undone.                                          │
│                                                     │
│ [Yes, Delete] [Cancel]                              │
└─────────────────────────────────────────────────────┘
       │
       │ User confirms
       ▼
DELETE /api/v1/projects/abc-123-def-456
       │
       ▼
Backend: projects.py::delete_project()
  ├─ Query ProjectDB
  ├─ Query all ScanDB for this project
  │   scans = db.query(ScanDB).filter(
  │     ScanDB.project_id == "abc-123-def-456"
  │   ).all()
  ├─ Delete all scans
  │   for scan in scans:
  │     db.delete(scan)
  ├─ Delete project
  │   db.delete(db_project)
  ├─ db.commit()
  └─ Clean up storage artifacts
      storage_root = Path(settings.STORAGE_PATH)
      for scan_id in scan_ids:
        scan_path = storage_root / scan_id
        if scan_path.exists():
          shutil.rmtree(scan_path, ignore_errors=True)
          deleted_artifacts += 1

  Return:
  {
    "detail": "Project deleted successfully",
    "deleted_scans": 5,
    "deleted_artifact_paths": 3
  }
       │
       ▼
Frontend receives response
       │
       ▼
Redirect to /dashboard
       │
       ▼
Dashboard refreshes (project removed from list)
```

### Database Changes

```sql
-- Delete scan records
DELETE FROM scans WHERE project_id = 'abc-123-def-456';

-- Delete project
DELETE FROM projects WHERE project_id = 'abc-123-def-456';
```

### File System Changes

```
storage/
└── dev/
    ├── scan-uuid-1/     ← Deleted
    ├── scan-uuid-2/     ← Deleted
    └── scan-uuid-3/     ← Deleted
```

---

## 5. Project List Flow (Dashboard)

### UI Flow

```
DashboardPage.tsx mounts
       │
       ▼
Frontend: GET /api/v1/projects
       │
       ▼
Backend: projects.py::list_projects()
  ├─ Query all projects
  │   db_projects = db.query(ProjectDB).all()
  ├─ Build last scan map (subquery for latest scan per project)
  │   SELECT project_id, scan_id
  │   FROM scans
  │   WHERE created_at = (
  │     SELECT MAX(created_at) FROM scans s2
  │     WHERE s2.project_id = scans.project_id
  │   )
  ├─ Return array of project summaries
  │   [
  │     {
  │       "project_id": "abc-123-def",
  │       "name": "MyApp",
  │       "last_scan_state": "COMPLETED",
  │       "last_scan_id": "scan-456-ghi"
  │     },
  │     ...
  │   ]
       │
       ▼
Frontend renders project cards with status badges:
┌─────────────────────────────────────────┐
│ 🟢 MyApp       Last scan: COMPLETED    │
│ 🔵 WebApp      Last scan: RUNNING      │
│ ⚪ NewApp      No scans yet            │
│ 🔴 LegacyApp   Last scan: FAILED       │
└─────────────────────────────────────────┘
```

---

## 6. Validation Rules

### Required Fields
| Field | Required | Validation |
|-------|----------|------------|
| name | ✅ Yes | Non-empty string |
| git_url | ✅ Yes | Valid URL format |
| branch | ❌ No | Default: "main" |
| credentials_id | ❌ No | Default: "github-credentials" |
| sonar_key | ❌ No | String |
| target_ip | ❌ No | Valid IP address (for Nmap) |
| target_url | ❌ No | Valid URL (for ZAP) |

### Edit Constraints
- ❌ Cannot edit while scan is in {CREATED, QUEUED, RUNNING}
- ✅ Can edit when scan is in {COMPLETED, FAILED, CANCELLED}

### Delete Constraints
- ⚠️ Deletes all associated scans and artifacts
- ⚠️ Action cannot be undone (no soft delete)

---

## 7. Key Files

| File | Purpose |
|------|---------|
| `src/pages/CreateProjectPage.tsx` | Project creation form |
| `src/pages/ProjectControlPage.tsx` | Project details view |
| `src/pages/ProjectEditPage.tsx` | Project edit form |
| `src/pages/DashboardPage.tsx` | Project list |
| `backend/app/api/projects.py` | Project CRUD endpoints |
| `backend/app/models/db_models.py::ProjectDB` | Project database model |
| `backend/app/schemas/project.py` | Pydantic schemas |

---

*Generated: 2026-04-13 | Files: projects.py, CreateProjectPage.tsx, ProjectControlPage.tsx*
