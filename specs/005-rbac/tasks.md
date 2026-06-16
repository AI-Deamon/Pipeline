# Tasks: Role-Based Access Control

**Input**: Design documents from `/specs/005-rbac/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Not explicitly requested in spec. Test tasks included for backend service/API and frontend hook coverage to satisfy constitution Principle 4.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story label (US1, US2, US3)
- Exact file paths in every task

---

## Phase 1: Setup

**Purpose**: Initialize RBAC feature structure and shared types.

- [X] T001 Add `role` column and `project_assignments` / `access_changes` tables to `backend/app/models/db_models.py`
- [X] T002 Create `backend/app/schemas/rbac.py` with Pydantic schemas for role, project access assignment, and access change records
- [X] T003 [P] Add RBAC TypeScript types (`Role`, `UserAccess`, `ProjectAccessAssignment`, `AccessChange`, `Permissions`) to `src/types.ts`
- [X] T004 [P] Create `backend/app/services/rbac_service.py` with `RbacService` class skeleton (effective scope resolution, authorization decisions, audit logging)
- [X] T005 [P] Create `backend/app/api/users.py` router skeleton with route stubs for user list, role update, project access CRUD, and access audit

---

## Phase 2: Foundational

**Purpose**: Core RBAC infrastructure that all user stories depend on.

- [X] T006 Extend `backend/app/core/auth.py` to load `current_user.role` from DB and expose `require_role()` / `require_scope()` authorization dependencies
- [X] T007 Implement `RbacService` methods in `backend/app/services/rbac_service.py`: `get_effective_project_ids()`, `can_manage_project()`, `can_assign_issue()`, `can_verify_issue()`, `log_access_change()`
- [X] T008 Add `GET /api/v1/auth/me` endpoint in `backend/app/api/auth.py` returning current user role and permission flags
- [X] T009 Extend `src/hooks/useAuth.tsx` to load and expose `role` and `permissions` from `/auth/me`
- [X] T010 Create `src/hooks/useRbac.ts` with role-aware permission helper functions (`canManageUsers`, `canManageProjectAccess`, `canViewProject`, `canAssignIssues`, `canVerifyIssues`, `canUpdateAssignedIssues`)
- [X] T011 Extend `src/components/ProtectedRoute.tsx` to accept optional `requiredRole` prop and deny access with redirect when role does not match
- [X] T012 Create `src/components/AccessDenied.tsx` reusable denial/empty-state component
- [X] T013 Write backend unit tests for `RbacService` in `tests/test_rbac_service.py`
- [X] T014 Write backend authorization dependency tests in `tests/test_auth_security.py` (extend existing)

**Checkpoint**: Foundation ready — user story implementation can begin.

---

## Phase 3: User Story 1 — Admin Access Management (Priority: P1) MVP

**Goal**: Admins can manage users, roles, project access, and access-change history across the entire platform. Admins have full control over all projects, tool detail views, and issue remediation actions.

**Independent Test**: An admin changes a user's role, grants project access, and verifies the change is enforced on the next authenticated action. Admin can list all users and access-change records.

### Implementation

- [X] T015 [P] [US1] Implement `GET /api/v1/users` in `backend/app/api/users.py` — list users with roles and project assignments (admin-only)
- [X] T016 [P] [US1] Implement `PATCH /api/v1/users/{user_id}/role` in `backend/app/api/users.py` — change user role with audit record creation
- [X] T017 [P] [US1] Implement `GET /api/v1/users/{user_id}/project-access` in `backend/app/api/users.py` — list project assignments for a user
- [X] T018 [P] [US1] Implement `POST /api/v1/users/{user_id}/project-access` in `backend/app/api/users.py` — grant project/project-group access
- [X] T019 [P] [US1] Implement `DELETE /api/v1/users/{user_id}/project-access/{assignment_id}` in `backend/app/api/users.py` — revoke access
- [X] T020 [P] [US1] Implement `GET /api/v1/access-changes` in `backend/app/api/users.py` — list access-change audit history (admin-only)
- [X] T021 [US1] Add RBAC admin API methods to `src/services/api.ts` (getUsers, updateUserRole, getProjectAccess, grantProjectAccess, revokeProjectAccess, getAccessChanges)
- [X] T022 [US1] Extend `src/pages/UserManagementPage.tsx` with role selector, project access assignment UI, and access-change history view
- [X] T023 [US1] Apply admin role checks in `src/pages/DashboardPage.tsx` — admin sees all projects without scope filtering
- [X] T024 [US1] Write backend API tests for user management endpoints in `tests/test_users_rbac_api.py`
- [X] T025 [US1] Write frontend test for `UserManagementPage` role/scope UI in `src/tests/pages/UserManagementPage.test.tsx`

**Checkpoint**: Admin can fully manage users, roles, scopes, and audit history. Independently testable.

---

## Phase 4: User Story 2 — Team Lead Drill-Down (Priority: P2)

**Goal**: Team leads can view scoped projects, open tool detail views, assign issues to developers, and verify or reject fixes — all within their assigned scope.

**Independent Test**: A team lead with project-group scope can open scoped project overviews and tool detail views, assign an issue to a developer, and verify/reject fixes. Access to out-of-scope projects is denied.

### Implementation

- [X] T026 [P] [US2] Apply `RbacService.get_effective_project_ids()` filter to `GET /api/v1/projects` in `backend/app/api/projects.py` for team-lead role
- [X] T027 [P] [US2] Apply RBAC scope filter to `GET /api/v1/projects/{project_id}` in `backend/app/api/projects.py` — deny if project not in team lead's effective scope
- [X] T028 [P] [US2] Apply RBAC scope filter to `GET /api/v1/reports/{project_id}` in `backend/app/api/reports.py` — deny if out of scope
- [X] T029 [US2] Add `can_assign` / `can_verify` scope checks to spec 004 issue assignment and verification endpoints in `backend/app/api/issues.py`
- [X] T030 [US2] Add team-lead scoped project access methods to `src/services/api.ts` (getScopedProjects, getScopedProjectAccess)
- [X] T031 [US2] Apply role-aware filtering in `src/pages/DashboardPage.tsx` — team lead sees only scoped projects
- [X] T032 [US2] Apply scope guards in `src/pages/ProjectOverviewPage.tsx` — deny navigation to out-of-scope projects
- [X] T033 [US2] Apply scope guards in `src/pages/ToolDetailViewPage.tsx` — team lead can assign/verify/reject only within scope
- [X] T034 [US2] Write backend scope-filtering tests in `tests/test_projects_rbac.py`
- [X] T035 [US2] Write backend issue authorization tests for team-lead scope in `tests/test_issues_rbac.py`

**Checkpoint**: Team lead can manage remediation within scope and is blocked outside scope. Independently testable.

---

## Phase 5: User Story 3 — Developer Scoped Access (Priority: P3)

**Goal**: Developers see only assigned projects and assigned issues, use My Issues as their daily task list, and can update status/comments only on assigned issues.

**Independent Test**: A developer with one assigned issue sees it in My Issues, can update status and add comments, but cannot access unrelated projects, assign issues, verify, or reject fixes.

### Implementation

- [X] T036 [P] [US3] Apply `RbacService` developer scope filter to `GET /api/v1/projects` in `backend/app/api/projects.py` — developer sees only assigned projects
- [X] T037 [P] [US3] Apply developer scope filter to `GET /api/v1/reports/{project_id}` in `backend/app/api/reports.py`
- [X] T038 [US3] Add developer role checks to spec 004 issue endpoints in `backend/app/api/issues.py` — allow status/comment updates only for assigned issues; block assign/verify/reject/priority
- [X] T039 [US3] Ensure spec 004 `GET /api/v1/issues/my` in `backend/app/api/issues/my.py` returns assigned issues even when developer lacks broader project scope
- [X] T040 [US3] Apply developer role filtering in `src/pages/DashboardPage.tsx` — show only assigned projects
- [X] T041 [US3] Apply developer role guards in `src/pages/ProjectOverviewPage.tsx` — read-only project overview for assigned projects
- [X] T042 [US3] Apply developer role guards in `src/pages/ToolDetailViewPage.tsx` — hide assign/verify/reject/priority controls
- [X] T043 [US3] Apply developer role guards in `src/pages/MyIssuesPage.tsx` — show only assigned issues; allow status/comment updates only
- [X] T044 [US3] Write backend developer scope tests in `tests/test_issues_rbac.py`
- [X] T045 [US3] Write frontend `ProtectedRoute` role test in `src/tests/components/ProtectedRoute.test.tsx`
- [X] T046 [US3] Write frontend `useRbac` hook test in `src/tests/hooks/useRbac.test.tsx`

**Checkpoint**: Developer can access only assigned work and perform only allowed actions. Independently testable.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, cleanup, and hardening.

- [X] T047 [P] Run full verification gate per `specs/005-rbac/quickstart.md`: `npm run lint && npm run build && npx vitest run && pytest tests/`
- [X] T048 [P] Run `specs/005-rbac/quickstart.md` validation scenarios manually or via automated tests
- [X] T049 Add empty-state handling for scoped users with no projects in `src/pages/DashboardPage.tsx`
- [X] T050 Add empty-state handling for developers with no assigned issues in `src/pages/MyIssuesPage.tsx`
- [X] T051 Add denial-state handling (403) with `AccessDenied.tsx` in all protected pages
- [X] T052 [P] Add `role` field to admin user seed in `backend/app/main.py` startup (default `admin` role for existing admin account)
- [X] T053 [P] Backfill existing users with `developer` role in `backend/app/main.py` startup migration
- [X] T054 Update `AGENTS.md` speckit pointer to `specs/005-rbac/plan.md` (verify already set)

## Phase 7: Fixes Found During Verification

**Purpose**: Address test infrastructure bugs and lint issues discovered during the verification pass.

- [X] T055 Fix `test_issues_rbac.py` fixture — `IssueDB` not registered with `Base` before `create_all`, causing `no such table: issues`. Move `IssueDB` import before `Base.metadata.create_all()` call in `tests/test_issues_rbac.py`
- [X] T056 Fix SQLite "database is locked" errors when running `pytest tests/` in parallel — conftest.py uses shared `test.db` for all test files, causing concurrent write contention. Use unique database URL per test file or `:memory:` with shared cache
- [X] T057 Fix lint error `@typescript-eslint/no-explicit-any` in `src/services/api.ts:234` — replace `any` with proper type
- [X] T058 Fix Pydantic V2 deprecation warnings — replace `class Config` with `model_config = ConfigDict(...)` in `backend/app/schemas/user.py` and `backend/app/schemas/rbac.py`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational completion
  - US1, US2, US3 can proceed in parallel after Phase 2
  - Sequential order recommended if single-staffed: P1 → P2 → P3
- **Polish (Phase 6)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 (P1)**: Starts after Phase 2. No dependency on US2/US3.
- **US2 (P2)**: Starts after Phase 2. Integrates with existing project/report routes and spec 004 issue routes.
- **US3 (P3)**: Starts after Phase 2. Integrates with spec 004 My Issues and issue status endpoints.

### Within Each User Story

- Backend models/schemas before services
- Services before API routes
- API routes before frontend hooks/services
- Frontend hooks before pages/components
- Core implementation before integration
- Tests after implementation (or TDD if preferred)

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel
- After Foundational: US1, US2, US3 can run in parallel (different route files, different frontend pages)
- Models within a story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members

---

## Parallel Example: User Story 1

These tasks can run simultaneously:

```
T015 [US1] GET /api/v1/users          → backend/app/api/users.py
T016 [US1] PATCH /users/{id}/role     → backend/app/api/users.py (sequential after T015)
T017 [US1] GET project-access         → backend/app/api/users.py
T018 [US1] POST project-access        → backend/app/api/users.py
T019 [US1] DELETE project-access      → backend/app/api/users.py
T020 [US1] GET access-changes         → backend/app/api/users.py
T021 [US1] Frontend API methods       → src/services/api.ts
T022 [US1] UserManagementPage UI      → src/pages/UserManagementPage.tsx
T023 [US1] Dashboard admin view       → src/pages/DashboardPage.tsx
```

---

## Implementation Strategy

**MVP Scope**: Phase 1 + Phase 2 + Phase 3 (US1 only)

Delivers: Admin user/role/project-access management with audit trail. This is the minimum viable RBAC increment — admins can control who has access to what.

**Incremental Delivery**:
1. MVP (US1): Admin management — immediately useful for platform operators
2. +US2: Team lead scoped access — enables delegation of remediation work
3. +US3: Developer scoped access — completes the role model for all personas
4. Polish: Empty states, denial states, backfill, full verification gate
