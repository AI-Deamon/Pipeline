# API Contracts: Role-Based Access Control

Base path: `/api/v1`

All endpoints require existing authentication unless explicitly public. API-key service requests retain existing service-account behavior and are outside human RBAC.

## Current User

### GET `/auth/me`

Returns the authenticated user's identity, role, and effective display permissions for frontend routing.

Response 200:
```json
{
  "id": "user-id",
  "username": "admin",
  "role": "admin",
  "permissions": {
    "canManageUsers": true,
    "canManageProjectAccess": true,
    "canViewAllProjects": true,
    "canAssignIssues": true,
    "canVerifyIssues": true,
    "canUpdateAssignedIssues": true
  }
}
```

## User Access Management

### GET `/users`

Admin-only. Lists users and their roles/scopes.

Query parameters:
- `role` optional: `admin`, `team_lead`, `developer`.

Response 200:
```json
[
  {
    "id": "user-id",
    "username": "developer1",
    "role": "developer",
    "projectAssignments": [
      { "scopeType": "project", "scopeId": "project-id", "scopeName": "Meraki" }
    ]
  }
]
```

Errors:
- 403 if non-admin requests global user list.

### PATCH `/users/{user_id}/role`

Admin-only. Changes exactly one user's role.

Request:
```json
{ "role": "team_lead" }
```

Response 200:
```json
{
  "id": "user-id",
  "username": "lead1",
  "role": "team_lead",
  "updatedAt": "2026-06-09T00:00:00Z"
}
```

Side effects:
- Creates an access change record.
- New role applies on the next authenticated action.

Errors:
- 400 for invalid role.
- 403 if actor is not admin.
- 404 if user does not exist.

## Project Scope Management

### GET `/users/{user_id}/project-access`

Admin sees any user. Team lead can inspect users within their own scope only.

Response 200:
```json
{
  "userId": "user-id",
  "assignments": [
    {
      "id": "assignment-id",
      "scopeType": "project_group",
      "scopeId": "group-id",
      "scopeName": "Payments Team"
    },
    {
      "id": "assignment-id-2",
      "scopeType": "project",
      "scopeId": "project-id",
      "scopeName": "Meraki"
    }
  ]
}
```

### POST `/users/{user_id}/project-access`

Admin can grant any scope. Team lead can grant scope only inside their own effective scope.

Request:
```json
{
  "scopeType": "project",
  "scopeId": "project-id"
}
```

Response 201:
```json
{
  "id": "assignment-id",
  "userId": "user-id",
  "scopeType": "project",
  "scopeId": "project-id",
  "assignedBy": "actor-id"
}
```

Errors:
- 400 for invalid scope type.
- 403 if actor lacks permission for the requested scope.
- 404 if target user or scope does not exist.
- 409 if duplicate assignment already exists.

### DELETE `/users/{user_id}/project-access/{assignment_id}`

Revokes a project or project-group assignment.

Response 204: No body.

Side effects:
- Creates an access change record.
- Revocation applies on the next authenticated action.

## Access Audit

### GET `/access-changes`

Admin-only. Returns role and access-scope change history.

Query parameters:
- `targetUserId` optional.
- `actorId` optional.
- `changeType` optional.
- `from` optional timestamp.
- `to` optional timestamp.

Response 200:
```json
[
  {
    "id": "record-id",
    "actorId": "admin-id",
    "targetUserId": "developer-id",
    "changeType": "scope_granted",
    "beforeValue": null,
    "afterValue": { "scopeType": "project", "scopeId": "project-id" },
    "changedAt": "2026-06-09T00:00:00Z"
  }
]
```

## Protected Issue Tracker Behavior

Existing spec 004 issue endpoints must apply these role checks:

- Admin: all issue tracker endpoints and actions allowed.
- Team lead: project overview, tool detail, assignment, verify, and reject allowed only inside effective scope.
- Developer: My Issues and assigned issue status/comment updates allowed only for assigned issues.
- Denied requests return 403 without hidden project or issue details.
