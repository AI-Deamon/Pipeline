# SonarQube Fix Tasks

## Phase 1: `python:S8410` — Annotated type hints (106 BLOCKER)
- [ ] backend/app/api/issues.py — all Depends() params
- [ ] backend/app/api/users.py — all Depends() params
- [ ] backend/app/api/reports.py — all Depends() params
- [ ] backend/app/api/scans/routes.py — all Depends() params
- [ ] backend/app/api/scans/callback.py — all Depends() params
- [ ] backend/app/api/scans/state.py — all Depends() params
- [ ] backend/app/api/scans/utils.py — all Depends() params
- [ ] backend/app/api/auth.py — all Depends() params
- [ ] backend/app/api/projects.py — all Depends() params
- [ ] backend/app/api/project_groups.py — all Depends() params

## Phase 2: `python:S8415` — Document HTTPException (85 MAJOR)
- [ ] All API route files with `responses={404: ...}`

## Phase 3: `typescript:S3358` — Nested ternaries (63 MAJOR)
- [ ] src/components/ScanProgressBar.tsx
- [ ] src/components/Layout.tsx
- [ ] src/pages/ScanStatusPage.tsx
- [ ] src/components/IssueDetailModal.tsx
- [ ] src/pages/ProjectControlPage.tsx
- [ ] src/pages/ProjectReportsPage.tsx
- [ ] src/components/Breadcrumbs.tsx
- [ ] src/pages/UnifiedReportPage.tsx
- [ ] src/pages/IssuesTriagePage.tsx
- [ ] src/components/IssueCard.tsx
- [ ] src/pages/MyIssuesPage.tsx
- [ ] src/components/FindingDetailModal.tsx
- [ ] src/pages/ProjectOverviewPage.tsx

## Phase 4: `python:S3776` — Cognitive complexity (18 CRITICAL)
- [ ] backend/app/api/projects.py
- [ ] backend/app/services/reporting/reporter.py
- [ ] backend/app/tasks/issue_tasks.py
- [ ] backend/app/services/project_grouping.py
- [ ] backend/app/api/reports.py
- [ ] backend/app/services/scan_orchestrator.py
- [ ] backend/app/services/scan_recovery.py
- [ ] backend/app/services/rbac_service.py
