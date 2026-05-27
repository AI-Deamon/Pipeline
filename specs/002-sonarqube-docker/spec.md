# Feature Specification: SonarQube Docker Container

**Feature Branch**: `002-sonarqube-docker`

**Created**: 2026-05-26

**Status**: Draft

**Input**: User description: "SonarQube was installed directly on the machine. User wants it removed from the host and added as a Docker container that works with the Jenkins Sonar scan pipeline. SonarQube must be accessible over the network for checking scan results. Old SonarQube authentication tokens no longer work and need to be reset."

## User Scenarios & Testing

### User Story 1 - Run SonarQube as Container (Priority: P1)

As an operator, I want SonarQube to run as a managed container alongside the other services so that I don't need to install, configure, or maintain it directly on the host machine.

**Why this priority**: This is the core request — removing host dependency and centralizing service management in Docker Compose.

**Independent Test**: Start the application stack. Verify SonarQube becomes available on the network without any manual host-level setup.

**Acceptance Scenarios**:

1. **Given** the application stack is started, **When** all services are healthy, **Then** SonarQube is reachable over the network
2. **Given** the host machine has no SonarQube installation, **When** the stack starts, **Then** SonarQube still functions fully
3. **Given** the stack is stopped and restarted, **When** the containers come back up, **Then** previously stored SonarQube data is preserved

---

### User Story 2 - Jenkins Integration Compatibility (Priority: P1)

As a developer, I want the existing Jenkins pipeline's SonarQube analysis stage to work with the containerized SonarQube without pipeline code changes.

**Why this priority**: The Jenkins pipeline already has a working Sonar Scanner stage that must continue to function after migration.

**Independent Test**: Trigger a scan from the application. Verify the Jenkins pipeline's `doSonarScanner()` stage connects to SonarQube and completes successfully.

**Acceptance Scenarios**:

1. **Given** the Jenkins pipeline runs a scan with `sonar_scanner` stage, **When** the stage executes, **Then** it connects to the containerized SonarQube successfully
2. **Given** the scan completes, **When** SonarQube analysis finishes, **Then** results are available via the SonarQube web interface
3. **Given** the backend fetches scan results, **When** `fetch_sonar_issues()` runs, **Then** it retrieves findings from the containerized SonarQube

---

### User Story 3 - Authentication Token Renewal (Priority: P2)

As an administrator, I want the SonarQube authentication tokens updated across all system components so that the backend and Jenkins can continue to communicate with SonarQube.

**Why this priority**: Broken tokens block all SonarQube integrations until resolved.

**Independent Test**: Generate a new SonarQube token via the web interface. Update all configuration locations. Verify the backend can fetch issues and Jenkins can authenticate.

**Acceptance Scenarios**:

1. **Given** a new SonarQube token is generated, **When** the backend attempts to fetch issues, **Then** authentication succeeds
2. **Given** the token is updated in all configuration files, **When** services restart, **Then** no authentication errors appear in logs
3. **Given** the old token is known to be invalid, **When** any component attempts to use it, **Then** the request is rejected

---

### Out of Scope

- SonarQube Quality Gate stage — not implemented in the Jenkins pipeline or backend
- Migration of existing SonarQube project data from the host installation — operator starts fresh in the container
- TLS/HTTPS configuration for the SonarQube web interface — uses HTTP as configured
- Horizontal scaling of SonarQube — single-instance only
- Automated token provisioning — tokens are generated manually via the SonarQube web UI

### Edge Cases

- What happens if the host already has SonarQube running on port 9000? → Container startup fails with port conflict; operator must stop the host service first.
- What happens if PostgreSQL is not ready when SonarQube starts? → SonarQube retries the database connection; if it fails, the container health check should surface the issue.
- What happens to existing SonarQube data on container restart? → Data volumes persist configuration, projects, and analysis results across restarts.
- What happens if the SonarQube token is updated in only some configuration locations? → Some integrations (backend or Jenkins) will fail authentication until all locations are updated.
- What happens during first-time SonarQube setup? → The default admin account must have its password changed on first login, and a token must be generated.

## Requirements

### Functional Requirements

- **FR-001**: The application stack MUST include a containerized SonarQube service that starts with the other services
- **FR-002**: SonarQube MUST be accessible over the network at its default port so operators can view scan results in a browser
- **FR-003**: SonarQube MUST use the project's existing database service for persistent storage, using a dedicated database
- **FR-004**: SonarQube data MUST survive container restarts via persistent volume storage
- **FR-005**: The existing Jenkins Sonar Scanner pipeline stage MUST work with the containerized SonarQube without changes to the pipeline definition
- **FR-006**: The backend's SonarQube issue fetching MUST connect to the containerized SonarQube
- **FR-007**: Operators MUST be able to generate a new authentication token via the SonarQube web interface
- **FR-008**: All configuration files MUST be updated to use the new authentication token
- **FR-009**: The Jenkins credential store SONAR_TOKEN MUST be updated with the new token (action performed by operator)
- **FR-010**: The SonarQube service MUST be removable without affecting other services (no hard dependencies beyond database readiness)

### Key Entities

- **SonarQube Server**: The static analysis server that receives analysis reports from Jenkins and serves the web dashboard. Stores project configurations, analysis results, and user accounts.
- **SonarQube Database**: A dedicated database within the shared PostgreSQL instance, storing SonarQube's configuration, projects, and analysis history.
- **SonarQube Token**: An authentication token used by the backend and Jenkins to authenticate API requests to SonarQube. Managed via the SonarQube web interface.
- **SonarQube Data Volume**: Persistent storage for SonarQube's configuration, installed plugins, and analysis cache data.

## Success Criteria

### Measurable Outcomes

- **SC-001**: After starting the stack with `python run.py staging`, SonarQube is reachable at `http://<host>:9000` within 3 minutes
- **SC-002**: A Jenkins pipeline scan with `sonar_scanner` stage completes successfully, connecting to the containerized SonarQube
- **SC-003**: Backend `fetch_sonar_issues()` retrieves findings from the containerized SonarQube with no authentication errors
- **SC-004**: All configuration references to SonarQube token use the new valid token; zero references to the old token remain in config files
- **SC-005**: Stopping and restarting the stack preserves all SonarQube projects, analysis results, and user configuration

## Assumptions

- The application uses Docker Compose with host networking for all services
- SonarQube's Community Edition is sufficient (no commercial license needed)
- The default SonarQube admin credentials (`admin`/`admin`) are used for initial setup; the operator changes the password on first login
- SonarQube's embedded Elasticsearch instance can run inside the container (Elasticsearch bootstrap checks may need to be disabled)
- The host machine has sufficient resources (minimum 2GB RAM for SonarQube) in addition to existing service requirements
- Jenkins global tool configuration (`sonar-scanner` binary and `sonar-server` connection) remains unchanged
- The old SonarQube token is known and has been confirmed as invalid (deactivated in the SonarQube server)
