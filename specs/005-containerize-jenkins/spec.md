# Feature Specification: Containerize Jenkins

**Feature Branch**: `005-containerize-jenkins`

**Created**: 2026-05-27

**Status**: Draft

**Input**: Make Jenkins redeployable like a Docker container so if the server changes, it works the same as it does now.

## User Scenarios & Testing

### User Story 1 - Bootstrap Jenkins from Docker on a New Server (Priority: P1)

As a DevOps engineer, I want to start Jenkins with a single `docker compose up` command on any server so that the entire CI pipeline is operational without manual installation steps.

**Why this priority**: The current Jenkins setup requires manual systemd installation, Java configuration, plugin management, and JVM tuning. Containerizing eliminates all of this, making server migration trivial.

**Independent Test**: Can be tested by running Jenkins container on a fresh machine and verifying the web UI is accessible at the expected port with all expected plugins available.

**Acceptance Scenarios**:

1. **Given** a server with only Docker and Docker Compose installed, **When** I run `docker compose up jenkins`, **Then** Jenkins starts and is accessible on port 8080 within 2 minutes
2. **Given** a fresh Jenkins container start, **When** the container is ready, **Then** all required plugins (NodeJS, SonarScanner, DependencyCheck, Git) are pre-installed
3. **Given** a Jenkins container is running, **When** I access the web UI, **Then** the admin credentials are available via a predefined file or environment variable

---

### User Story 2 - Preserve Jenkins Configuration Across Container Restarts (Priority: P1)

As a DevOps engineer, I want Jenkins jobs, credentials, and plugin configurations to persist across container restarts so that no work is lost when the container is recreated.

**Why this priority**: Without persistence, every container restart loses all job configurations, build history, and credentials — defeating the purpose of containerization.

**Independent Test**: Can be tested by restarting the container and verifying previous jobs, credentials, and configurations are intact.

**Acceptance Scenarios**:

1. **Given** a Jenkins container with a configured pipeline job, **When** the container is stopped and restarted, **Then** the job is still present in the Jenkins UI
2. **Given** stored Jenkins credentials, **When** the container is recreated, **Then** credentials are still available for pipeline jobs
3. **Given** build history exists, **When** the container is restarted, **Then** previous build logs and artifacts are accessible

---

### User Story 3 - Jenkins Container Integrates with Existing Network Services (Priority: P2)

As a DevOps engineer, I want the Jenkins container to communicate with other pipeline services (SonarQube, ZAP, backend) through the existing Docker network so that scans work without reconfiguration.

**Why this priority**: Jenkins needs to trigger SonarQube scans and send callbacks to the backend. Network isolation would break the pipeline.

**Independent Test**: Can be tested by triggering a pipeline scan and verifying Jenkins reaches SonarQube, ZAP, and the backend API.

**Acceptance Scenarios**:

1. **Given** the Jenkins container is on the same Docker network as SonarQube, **When** a SonarQube scan stage runs, **Then** the scanner connects to SonarQube successfully
2. **Given** the Jenkins container can reach the backend API, **When** a scan completes, **Then** the callback payload is delivered successfully
3. **Given** the Jenkins container can reach a target application, **When** a ZAP scan runs, **Then** ZAP can access the target URL

---

### User Story 4 - Maintain JVM Heap Limits in Container (Priority: P2)

As a system administrator, I want the Jenkins container to respect the configured JVM heap limit (`-Xmx7g -Xms512m`) so that it does not consume excessive host memory regardless of the host's total RAM.

**Why this priority**: Without explicit JVM limits, the container's Java process defaults to 50% of host RAM, which may starve co-located services.

**Independent Test**: Can be tested by checking the Java process arguments inside the running container.

**Acceptance Scenarios**:

1. **Given** a running Jenkins container, **When** I check the Java process, **Then** `-Xmx7g -Xms512m` is present in the JVM arguments
2. **Given** a Jenkins container with `-Xmx7g`, **When** the container is under load, **Then** Java heap does not exceed 7GB

---

### User Story 5 - Migration Path from Systemd Jenkins (Priority: P3)

As a DevOps engineer, I want a documented procedure to export Jenkins configuration from the current systemd installation and import it into the new Docker container so that the transition is smooth and downtime is minimized.

**Why this priority**: The current Jenkins installation has production data (jobs, credentials, build history). A migration script or documented steps prevent data loss.

**Independent Test**: Can be tested by running the migration procedure on a staging server and comparing job lists and configurations before and after.

**Acceptance Scenarios**:

1. **Given** a systemd Jenkins installation at `/var/lib/jenkins`, **When** the migration script runs, **Then** all jobs are present in the new Docker container
2. **Given** migrated credentials, **When** a pipeline job runs in the new container, **Then** it can authenticate using the migrated credentials

---

### Edge Cases

- What happens if JENKINS_HOME volume is empty on first start? — Jenkins initializes with default config, plugins installed via Dockerfile or init script
- What happens if the container runs out of disk space for build artifacts? — Docker volume disk limits should be monitored; documented procedure for cleanup
- How does the system handle Jenkins version upgrades? — Image tag pinned to specific version, upgrade by changing tag and testing
- What happens to running builds when the container is stopped? — Builds are interrupted; graceful shutdown should be attempted

## Requirements

### Functional Requirements

- **FR-001**: Jenkins MUST run as a Docker container using `jenkins/jenkins:<current-version>` as base, pinned to the exact version currently installed on the system
- **FR-002**: JENKINS_HOME MUST be stored on a Docker volume for persistence across restarts
- **FR-003**: All currently installed plugins (NodeJS, SonarScanner, DependencyCheck, Git, Pipeline, Blue Ocean) MUST be pre-installed in the Docker image
- **FR-003b**: All scan tools (ZAP, Trivy, Nmap, OWASP Dependency-Check CLI, SonarScanner CLI) MUST be installed in the Docker image so no host dependencies are required
- **FR-004**: JVM heap MUST be set to `-Xmx7g -Xms512m` via environment variable or Dockerfile ENTRYPOINT
- **FR-005**: Jenkins port 8080 MUST be mapped to the same port on the host (configurable)
- **FR-006**: The Jenkins container MUST use host networking to reach other services (SonarQube, ZAP, backend)
- **FR-007**: A standalone `docker-compose.jenkins.yml` file MUST be created in the project's `docker/` directory, independent of the app's compose overlays
- **FR-008**: Admin credentials MUST be configurable via environment variables (e.g., `JENKINS_ADMIN_ID` and `JENKINS_ADMIN_PASSWORD`)
- **FR-009**: A migration script or documented procedure MUST exist to transfer the entire `/var/lib/jenkins` directory to the Docker volume (copy as-is including encrypted credentials)
- **FR-010**: The Jenkins container MUST support the `JENKINS_OPTS` environment variable for additional configuration
- **FR-011**: The Jenkins container MUST bind-mount `/var/run/docker.sock` from the host to allow Docker builds inside the pipeline

### Key Entities

- **Jenkins Container**: Docker container running the Jenkins WAR with pre-installed plugins and JVM configuration
- **Jenkins Home Volume**: Docker volume at a known path, persisting jobs, credentials, plugins, and build data
- **Jenkins Dockerfile**: Defines base image, plugin installation, and entrypoint customization
- **Standalone Compose File**: `docker-compose.jenkins.yml` — independent service definition for Jenkins, portable across environments
- **Migration Script**: Utility to export/import Jenkins data from systemd to Docker

## Success Criteria

### Measurable Outcomes

- **SC-001**: Jenkins container starts and is ready to serve HTTP on port 8080 within 2 minutes of `docker compose up`
- **SC-002**: Container restarts preserve all jobs, credentials, and build history (zero loss)
- **SC-003**: Pipeline scans (SonarQube, ZAP, Trivy) complete successfully through the containerized Jenkins
- **SC-004**: Java heap does not exceed 7GB under normal pipeline load
- **SC-005**: Server migration requires only Docker and Docker Compose — no system packages, no manual config

## Assumptions

- Jenkins will use the exact version currently installed on the system as the base image tag
- Plugins can be installed via `plugins.txt` or `jenkins-plugin-cli` during image build
- Full migration of build history is desirable but not critical — job configurations and credentials are the essential assets
- Jenkins will use its own `docker-compose.jenkins.yml` file, not the app's compose overlay system
- Docker socket bind-mount (`/var/run/docker.sock`) is acceptable security-wise for the Jenkins container

## Clarifications

### Session 2026-05-27

- Q: How should Jenkins credentials/secrets be handled during migration? → A: Copy entire `/var/lib/jenkins` directory to Docker volume; credentials remain encrypted with the same master key
- Q: Which Jenkins version should the Docker image pin? → A: Match the currently installed Jenkins version exactly (check config.xml or WAR manifest)
- Q: Should Jenkins be part of the existing compose stack or standalone? → A: Standalone `docker-compose.jenkins.yml` file, independent of app compose profiles
- Q: How should Jenkins access the Docker daemon inside the container? → A: Bind-mount `/var/run/docker.sock` (Docker-outside-of-Docker)
- Q: Should the Jenkins container include scan tools in its image? → A: Yes, all necessary tools (ZAP, Trivy, SonarScanner, Nmap, DependencyCheck) bundled in the Docker image for full portability
