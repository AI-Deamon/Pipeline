# Quickstart: Unified Issue Tracker

## Prerequisites

- Backend and frontend running (see AGENTS.md for run commands)
- At least one project with completed scans (to have findings data)

## Running the Migration

Issues from existing scans must be migrated from `ScanReportDB.findings` JSON:

```bash
# Trigger migration via API
curl -X POST http://localhost:8000/api/v1/issues/migrate \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json"
```

Or via Celery task directly:

```bash
docker compose exec backend celery -A app.core.celery_app call app.tasks.issue_tasks.migrate_findings_to_issues
```

Migration is idempotent — safe to re-run.

## Using the Feature

### 1. Project Overview (Tool Cards)

Navigate to any project → see the project overview page with tool cards:

| Tool | Critical | High | Medium | Low |
|------|----------|------|--------|-----|
| SonarQube | 13 | 1 | 64 | 1 |
| Trivy FS | 0 | 1 | 0 | 0 |
| Dependency Check | 0 | 3 | 4 | 1 |

### 2. Tool Detail View

Click any tool card → see individual issues for that tool only.

**SonarQube-specific**: Toggle issue types to fetch:
- [x] Bugs  [x] Vulnerabilities  [x] Security Hotspots  [ ] Code Smells

Toggling off "Code Smells" re-fetches from SonarQube API with `types=BUG,VULNERABILITY,SECURITY_HOTSPOT`.

### 3. Assigning Issues

Team Lead: click any issue → "Assign" → select developer + priority → saves.

### 4. Working on Issues

Developer: open "My Issues" → see all assigned issues across projects → "Start Working" → "Mark as Fixed" (add comment).

### 5. Verifying Fixes

Team Lead: view fixed issue → "Verify" (status → Verified) or "Reject" (add feedback → Rejected).

Re-scanning: if issue no longer appears in new scan → auto-verified.

### 6. My Issues Dashboard

Developer dashboard showing all assigned issues across all projects, grouped by project, sorted by priority. Click any issue → navigates to that tool's detail view.

## Key API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/issues/projects/{id}/overview` | Tool summary counts |
| `GET` | `/api/v1/issues/projects/{id}/tools/{tool}` | Tool detail issue list |
| `GET` | `/api/v1/issues/my` | Current user's assigned issues |
| `PUT` | `/api/v1/issues/{id}/assign` | Assign issue |
| `PUT` | `/api/v1/issues/{id}/status` | Update status |
| `POST` | `/api/v1/issues/{id}/comments` | Add comment |
| `POST` | `/api/v1/issues/migrate` | Trigger data migration |

## Verification

```bash
# Backend tests
pytest tests/ -k "issue" -v

# Frontend tests
npx vitest run src/tests/ -t "Issue"

# Full verification gate
npm run lint && npm run build && npx vitest run && pytest tests/
```
