# Quickstart: Role-Based Access Control Validation

## Prerequisites

- Backend dependencies installed: `pip install -r backend/requirements.txt`
- Frontend dependencies installed: `npm install`
- Test database/environment available, or Docker test profile running.
- Spec 004 issue tracker routes available or mocked in RBAC tests.

## Validate Backend Unit and API Behavior

Run backend tests:

```bash
pytest tests/
```

Recommended focused test coverage:

1. Admin role management
   - Admin changes a user's role.
   - Response shows the new role.
   - Access change record is created.
   - New role is enforced on the next authenticated action.

2. Team lead scoped access
   - Team lead with project-group scope opens project overview and tool detail for scoped project.
   - Team lead assigns an issue within scope.
   - Team lead cannot open or assign issues outside scope.

3. Developer assigned work
   - Developer sees assigned project or assigned issue in My Issues.
   - Developer can update status/comment on assigned issue.
   - Developer cannot assign, verify, reject, change priority, or access unrelated issue details.

4. Admin full control
   - Admin can list all users, all projects, all project scopes, all issue detail views, and all issue actions.

5. Denial behavior
   - Out-of-scope project and issue requests return 403 or safe not-found behavior without leaking hidden names or findings.

## Validate Frontend Behavior

Run frontend checks:

```bash
npm run lint
npm run build
npx vitest run
```

Expected UI behavior:

- Admin can access user management and all project/issue controls.
- Team lead sees only scoped projects and can assign/verify/reject scoped issues.
- Developer sees My Issues and only actions allowed for assigned issues.
- Empty states are explicit when a scoped user has no projects or issues.
- Error states show actionable denial messages.

## End-to-End Manual Scenario

1. Start staging or test environment:

```bash
python run.py test
```

2. Sign in as admin.
3. Create or identify three users: one admin, one team lead, one developer.
4. Assign the team lead to a project group and one individual project.
5. Assign the developer to one project and one issue from spec 004.
6. Verify:
   - Admin can access everything.
   - Team lead can open only scoped project/tool detail views and can assign/verify/reject only scoped issues.
   - Developer can open My Issues and update only assigned issues.
   - Role/scope changes apply on the next authenticated action.
   - Access change history records every role or scope change.

## Full Verification Gate

Before implementation is considered complete:

```bash
npm run lint && npm run build && npx vitest run && pytest tests/
```

Expected result: all commands pass.
