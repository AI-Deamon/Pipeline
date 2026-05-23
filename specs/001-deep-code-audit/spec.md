# Feature Specification: Deep Code Audit and Bug Analysis

**Feature Branch**: `001-deep-code-audit`

**Created**: 2026-05-22

**Status**: Draft

**Input**: User description: "Deep code audit and bug analysis of the entire project - authentication, login, session handling, API calls, form submission, redirects, error handling, state updates, and async behavior"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Authentication Flow Integrity (Priority: P1)

As a security engineer, I need every path through the authentication system audited so that no bypass, token leakage, or session fixation vulnerability exists in production.

**Why this priority**: Authentication is the most security-sensitive flow. Any flaw here compromises the entire system.

**Independent Test**: Trace login → token storage → API calls → token expiry → logout. Verify each transition is correct and no state leaks between sessions.

**Acceptance Scenarios**:

1. **Given** a user with valid credentials, **When** they submit the login form, **Then** a JWT is issued, stored in sessionStorage, and attached to subsequent API calls
2. **Given** an expired JWT, **When** an API call is made, **Then** the user is redirected to login with a clear error, not shown a generic failure
3. **Given** a user logs out, **When** they press the back button, **Then** they cannot access protected routes
4. **Given** a test environment misconfiguration, **When** `ENV=test` leaks to production, **Then** authentication is NOT silently bypassed

---

### User Story 2 - Client-Server State Synchronization (Priority: P1)

As a QA analyst, I need to verify that frontend state (React Query cache, auth context, component state) stays consistent with backend reality across all async operations.

**Why this priority**: Stale or mismatched state causes the most user-visible bugs: wrong data displayed, actions applied to wrong entities, silent failures.

**Independent Test**: Trigger concurrent operations (e.g., two scans on same project, rapid page navigation during API calls) and verify state consistency.

**Acceptance Scenarios**:

1. **Given** a scan is in progress, **When** the user navigates away and back, **Then** the scan status reflects the actual backend state
2. **Given** a mutation succeeds on the server, **When** the response returns, **Then** all related query caches are invalidated and UI updates
3. **Given** two rapid form submissions, **When** both reach the server, **Then** only one entity is created (idempotency)

---

### User Story 3 - Error Handling and Edge Cases (Priority: P2)

As a developer, I need every error path audited so that network failures, validation errors, and unexpected responses are handled gracefully without silent data loss.

**Why this priority**: Unhandled errors crash the UI or silently swallow failures, eroding user trust.

**Independent Test**: Simulate network failures, 400/401/403/500 responses, malformed data, and verify each produces a user-visible, actionable error.

**Acceptance Scenarios**:

1. **Given** the backend returns 500, **When** the user is on any page, **Then** a clear error message is shown and the app does not crash
2. **Given** a form with invalid data, **When** submitted, **Then** field-level validation errors are displayed
3. **Given** a WebSocket disconnection, **When** the scan is still running, **Then** the UI falls back to polling

---

### User Story 4 - Routing and Navigation Correctness (Priority: P2)

As a user, I need all navigation flows (login redirect, protected routes, breadcrumbs, back button) to work correctly so I never land on a broken or unauthorized page.

**Why this priority**: Routing bugs directly block user tasks and create security holes.

**Independent Test**: Exercise every route transition: login → dashboard, direct URL access while logged out, logout → back button, deep link to scan status.

**Acceptance Scenarios**:

1. **Given** an unauthenticated user, **When** they navigate to `/dashboard`, **Then** they are redirected to `/login` with the original URL preserved
2. **Given** an authenticated user, **When** they navigate to `/login`, **Then** they are redirected to `/dashboard` (no login page for already-authenticated users)
3. **Given** a deep link to `/projects/abc/reports`, **When** the user logs in, **Then** they are redirected to the original URL, not `/dashboard`

---

### User Story 5 - Security-Sensitive Logic (Priority: P1)

As a security auditor, I need all permission checks, token handling, callback validation, and secret management audited so that no privilege escalation or data exposure is possible.

**Why this priority**: Security flaws have direct, measurable business impact.

**Independent Test**: Attempt API calls with expired tokens, wrong API keys, callback without token, and verify each is rejected.

**Acceptance Scenarios**:

1. **Given** an API call with an expired JWT, **When** the backend receives it, **Then** a 401 is returned (not a bypass)
2. **Given** a Jenkins callback without the correct token, **When** the endpoint receives it, **Then** it is rejected with 403
3. **Given** a user-only API key, **When** it is used to access admin endpoints, **Then** access is denied if the key doesn't match

---

### Edge Cases

- What happens when the JWT expires mid-session (during a long scan)?
- What happens when two browser tabs share the same sessionStorage?
- What happens when the backend is unreachable during a WebSocket reconnect?
- What happens when a scan completes but the callback payload is malformed?
- What happens when the user's token is valid but the user no longer exists in the database?
- What happens when `useMemo` triggers a state update during render?
- What happens when the API key is embedded in the frontend bundle and extracted by an attacker?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST validate JWT tokens on every protected endpoint, including expiry and signature
- **FR-002**: System MUST redirect unauthenticated users to login and return them to the original URL after authentication
- **FR-003**: System MUST handle 401 responses globally on the frontend by clearing session state and redirecting to login
- **FR-004**: System MUST NOT bypass authentication in any environment unless explicitly configured with a separate, isolated bypass mechanism
- **FR-005**: System MUST clear all session data (token + API key) on logout
- **FR-006**: System MUST prevent duplicate scan creation for the same project via database-level constraints
- **FR-007**: System MUST validate callback tokens independently of JWT auth
- **FR-008**: System MUST NOT embed secrets (API keys, tokens) in client-side JavaScript bundles
- **FR-009**: System MUST use separate secrets for JWT signing and API key authentication
- **FR-010**: System MUST enforce password strength requirements on registration
- **FR-011**: System MUST rate-limit authentication endpoints
- **FR-012**: System MUST use `useEffect` (not `useMemo`) for side effects in React components
- **FR-013**: System MUST handle React Query errors globally with an error boundary
- **FR-014**: Tests MUST match actual component implementations (selectors, labels, placeholders)

### Key Entities

- **User**: Represents an authenticated identity. Has username, hashed password, unique ID. Created on registration.
- **JWT Token**: Signed credential containing username claim and expiry. Stored in sessionStorage. Valid for 7 days.
- **API Key**: Static secret used for service-to-service auth. Compared against `settings.API_KEY`.
- **Scan**: Represents a security scan job. Tied to a project. Has state machine (QUEUED → RUNNING → COMPLETED/FAILED/CANCELLED).
- **Callback Token**: Shared secret for Jenkins-to-backend callback authentication.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero authentication bypass paths exist in the codebase (verified by attempting unauthenticated access to every protected endpoint)
- **SC-002**: All frontend tests pass against the actual component implementations (no selector/label mismatches)
- **SC-003**: 401 responses from the backend result in automatic redirect to login within 1 second
- **SC-004**: Logout clears 100% of session data (token, API key, cached queries)
- **SC-005**: No `useMemo` hooks contain side effects
- **SC-006**: All async operations have explicit error handling (no unhandled promise rejections)
- **SC-007**: Database-level constraint prevents duplicate active scans per project
- **SC-008**: Secrets are not embedded in client-side bundles

## Assumptions

- The application is a DevSecOps security scanning platform with a React frontend and Python FastAPI backend
- Jenkins is the CI/CD orchestrator for security scans
- The system is deployed via Docker Compose with host networking
- JWT tokens are the primary authentication mechanism with API key as a fallback
- The codebase has existing test suites (Vitest for frontend, pytest for backend) that may have drifted from implementation
- WebSocket connections are used for real-time scan status updates
- The project uses session storage (not local storage) for token persistence
