# Spec 009: Integrate Specs 004, 005, and 007

**Status**: Ready for execution
**Depends on**: Spec 008 (Issue Resolution Platform — already on main)
**Author**: opencode
**Date**: 2026-06-15

## Context

Three specs (004 Unified Issue Tracker, 005 RBAC, 007 SonarQube Enrichment) are
all **implementation-complete** with 100% of tasks done (73 + 54 + tasks).
However, they were never formally committed to git. The changes exist as
uncommitted modifications and untracked files in the working tree.

**Spec 008** has been delivered and is on `main`. The remaining work for
004, 005, and 007 is purely about **commit hygiene** and **consolidation**
— the code is already in place.

## Audit of Working Tree

| Item | Type | Spec | Action |
|------|------|------|--------|
| `specs/004-unified-issue-tracker/` (8 files) | untracked | 004 | Add to commit |
| `specs/005-rbac/` (9 files) | untracked | 005 | Add to commit |
| `specs/007-sonarqube-enrichment/tasks.md` | untracked | 007 | Add to commit (spec superseded by 008 but kept for history) |
| `backend/app/api/auth.py` | modified | 005 | Add to commit (adds `/me` endpoint) |
| `backend/app/api/reports.py` | modified | 005 | Add to commit (RBAC ownership check) |
| `backend/app/core/auth.py` | modified | 005 | Add to commit (`require_role`, `require_admin`, `get_rbac`) |
| `backend/app/core/celery_app.py` | modified | 004 | Add to commit (imports `app.tasks.issue_tasks`) |
| `backend/app/websockets/manager.py` | modified | 004 | Add to commit (`broadcast_issue_event`) |
| `src/pages/LoginPage.redirect.test.tsx` | modified | 005 | Add to commit (test mocks new auth context shape) |
| `CONTEXT.md` | modified | 005 | Add to commit |
| `backend/CONTEXT.md` | modified | 005 | Add to commit |
| `docs/CONTEXT.md` | modified | 005 | Add to commit |
| `skills/` | untracked (dir) | n/a | Stash or add separately |
| `TODO_FRONTEND.md` | deleted | n/a | Stale doc — discard deletion |
| `generate-frontend-types.py` | deleted | n/a | Obsolete — discard |
| `implementation_plan.md` | deleted | n/a | Obsolete — discard |
| `patch_jenkinsfile.py` | deleted | n/a | One-time tool — discard |
| `reset_stuck_projects.py` | deleted | n/a | One-time tool — discard |
| `staging_setup.py` | deleted | n/a | Replaced by docker — discard |
| `verify-zap.sh`, `zap-*.sh`, `zap-*.py` | deleted | n/a | One-time debugging — discard |

## Plan

### Step 1: Commit spec 004 documentation
- Add `specs/004-unified-issue-tracker/` to git
- Mark as `docs(004): add Unified Issue Tracker spec/plan/research/data-model/contracts/quickstart/tasks` (all marked complete)
- Note: tasks.md says "Superseded by 008" — preserve the historical record

### Step 2: Commit spec 005 documentation
- Add `specs/005-rbac/` to git
- Note: tasks.md is already marked complete (54/54 tasks)

### Step 3: Commit spec 007 documentation
- Add `specs/007-sonarqube-enrichment/tasks.md` (the only remaining file; rest of spec was already consumed by 008)
- Mark as historical reference (spec is "Superseded by 008")

### Step 4: Commit spec 005 backend integration
- `backend/app/api/auth.py` — `/me` endpoint
- `backend/app/api/reports.py` — RBAC ownership check
- `backend/app/core/auth.py` — `require_role`, `require_admin`, `get_rbac` dependencies
- `CONTEXT.md`, `backend/CONTEXT.md`, `docs/CONTEXT.md` — updated
- `src/pages/LoginPage.redirect.test.tsx` — updated test mock

### Step 5: Commit spec 004 backend integration
- `backend/app/core/celery_app.py` — import `app.tasks.issue_tasks`
- `backend/app/websockets/manager.py` — `broadcast_issue_event` method

### Step 6: Discard obsolete files
- Stage the deletions of: `TODO_FRONTEND.md`, `generate-frontend-types.py`,
  `implementation_plan.md`, `patch_jenkinsfile.py`, `reset_stuck_projects.py`,
  `staging_setup.py`, `verify-zap.sh`, `zap-debug-single.sh`, `zap-debug.sh`,
  `zap-nowait.sh`, `zap-one.sh`, `zap-timing.py`, `zap-timing.sh`

### Step 7: Handle `skills/` directory
- Check if it's user-personal skills (should be ignored) or repo-level
- If personal: add to `.gitignore`
- If repo-level: commit as `chore: add agent skills directory`

### Step 8: Push to main

## Effort Estimate

| Step | Effort | Risk |
|------|--------|------|
| 1-3 (doc commits) | 5 min | None (new files) |
| 4-5 (code commits) | 10 min | Low (small, isolated diffs) |
| 6 (discard obsolete) | 5 min | None (deletions only) |
| 7 (skills/ decision) | 5 min | None |
| 8 (push) | 2 min | Low |
| **Total** | **~30 min** | **Low** |

## Verification Gate

After all commits:
- `git status` shows working tree clean
- `git log main --oneline -10` shows the 4 new commits
- `pytest tests/test_issue_state.py -v` still passes (no regression)
- `pytest tests/test_rbac_service.py -v` still passes
- TypeScript new code: zero new errors

## Out of Scope

- Re-implementing any of 004/005/007 (code is already in place)
- Renaming or restructuring the spec directories
- Updating AGENTS.md SPECKIT marker (already points to 008)

## Risk

**Low**: All file changes are isolated and small. The risk is purely about
git history hygiene, not about runtime correctness. If any commit fails,
the remaining commits can proceed independently.
