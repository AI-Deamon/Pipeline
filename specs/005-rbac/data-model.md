# Data Model: Role-Based Access Control

## Entities

### User Account

Existing person account extended with role metadata.

Fields:
- `id`: Unique account identifier.
- `username`: Unique login name.
- `hashed_password`: Existing password hash.
- `role`: One of `admin`, `team_lead`, `developer`.
- `created_at`: Account creation timestamp.
- `updated_at`: Last account update timestamp.

Validation rules:
- Every human account has exactly one role.
- Existing administrator account remains `admin`.
- Legacy accounts without a role default to `developer` until changed by an administrator.
- Role changes take effect on the next authenticated action.

### Access Role

Canonical role names and capabilities.

Roles:
- `admin`: Full control across all users, projects, tool detail views, issue assignments, status updates, verification, and access management.
- `team_lead`: Can access project overviews and tool detail views within assigned scope; can assign issues, verify fixes, and reject fixes within assigned scope.
- `developer`: Can access assigned projects and assigned issues; can update status and comments only for assigned issues.

Validation rules:
- Unknown role names are invalid.
- Developer cannot assign, verify, reject, or change priority.
- Team lead cannot act outside assigned scope.
- Admin is not limited by project/team scope.

### Project Assignment

Grants a user access to a project or team/project group.

Fields:
- `id`: Unique assignment identifier.
- `user_id`: Account receiving access.
- `scope_type`: `project` or `project_group`.
- `scope_id`: Identifier of the project or project group.
- `assigned_by`: Account that granted the access.
- `created_at`: Assignment timestamp.
- `updated_at`: Last assignment update timestamp.

Validation rules:
- Assignment scope must reference an existing project or project group.
- Additive access applies when a user has both project-group and individual project scopes.
- Team leads can manage assignments only inside their own effective scope.
- Admins can create, update, or revoke any project assignment.

Relationships:
- User Account 1:N Project Assignment.
- Project/Project Group 1:N Project Assignment.

### Issue Assignment

Existing issue tracker assignment that grants issue-level access to a developer.

Fields:
- `issue_id`: Issue receiving assignment.
- `assignee_id`: Developer assigned to work on the issue.
- `assigned_by`: Admin or scoped team lead that assigned the issue.
- `priority`: Existing issue priority.
- `status`: Existing issue workflow status.
- `created_at`: Assignment timestamp.
- `updated_at`: Last update timestamp.

Validation rules:
- A developer assigned to an issue can see that issue in My Issues even without broader project access.
- A developer cannot see unrelated issues in the same project unless project scope grants access.
- Team lead can assign or verify only issues within scope.
- Admin can perform all issue assignment and remediation actions.

Relationships:
- Issue Assignment references User Account for assignee and actor.
- Issue Assignment references Issue records from spec 004.

### Access Change Record

Audit history for role and access-scope changes.

Fields:
- `id`: Unique audit record identifier.
- `actor_id`: User who made the change.
- `target_user_id`: User whose access changed.
- `change_type`: `role_changed`, `scope_granted`, `scope_revoked`, `scope_changed`.
- `before_value`: Previous role/scope state.
- `after_value`: New role/scope state.
- `changed_at`: Change timestamp.

Validation rules:
- Every role or project-scope change creates one access change record.
- Records are append-only from the application perspective.
- Records must identify actor, target account, changed scope, and time.

## Effective Access Rules

1. If request is authenticated by service API key, keep existing service-account behavior outside human RBAC.
2. If user role is `admin`, allow all human-platform actions.
3. If user role is `team_lead`, allow project overview, tool detail, assignment, verification, and rejection only within effective project scope.
4. If user role is `developer`, allow assigned project visibility and assigned issue status/comment updates only.
5. Effective project scope is additive: project-group scope plus individual project scope.
6. Direct issue assignment grants access to that issue through My Issues but does not reveal unrelated project details.
7. Any denied access returns a clear denial state without leaking hidden project or issue details.
