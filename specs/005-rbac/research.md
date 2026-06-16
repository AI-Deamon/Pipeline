# Research: Role-Based Access Control

## Decision: Extend the existing user model with a single role per human account

**Rationale**: The specification requires exactly one role per person account: administrator, team lead, or developer. A single role keeps authorization predictable, supports simple UI branching, and matches the current small account model.

**Alternatives considered**:
- Multi-role accounts: more flexible but unnecessary for the stated scope and harder to test.
- Permission-only model without roles: too abstract for the requested business personas.

## Decision: Model access scope separately from role

**Rationale**: Role answers what a user can do; scope answers where they can do it. The spec requires project-group/team scope, individual project scope, and additive effective access. Separate scope records avoid overloading the user record and support immediate changes without reissuing credentials.

**Alternatives considered**:
- Store project IDs directly on the user record: simple but does not scale for many projects or team/project-group access.
- Encode scopes in tokens: faster reads but violates immediate revocation because old tokens could keep stale scope.

## Decision: Evaluate authorization from current database state on each protected action

**Rationale**: Role and scope changes must take effect on the next authenticated action. Checking current persisted role/scope during request handling ensures demotion, reassignment, and revocation are enforced immediately.

**Alternatives considered**:
- Token-embedded roles/scopes: lower lookup cost but stale until token refresh.
- Session cache: faster but needs invalidation and increases stale-access risk.

## Decision: Keep API-key/service-account behavior outside the human RBAC model

**Rationale**: The existing system uses API-key-authenticated service calls for automation. The spec explicitly excludes service integrations from the human role model. This preserves pipeline compatibility while human users get RBAC controls.

**Alternatives considered**:
- Force service integrations into roles: would require broader pipeline changes and does not serve the human access-control goal.

## Decision: Add an access-change audit trail for role and scope changes

**Rationale**: The constitution requires security-first architecture, and the spec requires reviewable access history. A dedicated audit record supports accountability and testable compliance without mixing access changes into general logs only.

**Alternatives considered**:
- Logs only: easier but harder to query reliably from the application.
- Full event-sourcing: powerful but excessive for this feature.

## Decision: Provide a backend authorization helper/service used by all protected feature routes

**Rationale**: RBAC must apply consistently to projects, scans, reports, issue tracker views, assignment actions, and status updates. Centralizing role/scope decisions avoids duplicated checks and prevents drift between routes.

**Alternatives considered**:
- Inline checks in each route: quick but error-prone.
- Frontend-only checks: unacceptable because backend must enforce authorization.
