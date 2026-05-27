# Feature Specification: Upgrade SonarQube to Current Stable Version

**Feature Branch**: `003-upgrade-sonarqube-image`

**Created**: 2026-05-26

**Status**: Draft

**Input**: User description: "i logged in i updated the password to admin123 for soner soner server is old and does not havelatest checks look for more stable version"

## Clarifications

### Session 2026-05-26

- Q: Target SonarQube version? → A: Latest LTA/LTS stable version
- Q: Database backup & rollback strategy? → A: Full DB backup before upgrade, full rollback path required
- Q: PostgreSQL compatibility approach? → A: Pin to SonarQube version compatible with PostgreSQL 15 (no PG upgrade)
- Q: Scope boundaries — what's included? → A: Full scope - scanner compatibility, plugins, monitoring, and pipeline verification all included

## User Scenarios & Testing

### User Story 1 - Security Analyst Runs a Scan with Latest Checks (Priority: P1)

A security analyst initiates a scan against a project and expects the SonarQube analysis stage to detect vulnerabilities, bugs, and code smells using the most up-to-date rule set available. The upgraded SonarQube applies current analysis rules that cover recent vulnerability patterns not present in the old version.

**Why this priority**: This is the primary value of the upgrade — getting current security analysis capabilities. Without this, the upgrade has no purpose.

**Independent Test**: Can be fully tested by running a scan against any project and verifying that the SonarQube stage completes with findings that include rules and checks specific to the new version's capabilities.

**Acceptance Scenarios**:

1. **Given** the SonarQube instance has been upgraded to a current stable version, **When** a user triggers a scan on a project with `sonar_scanner` stage selected, **Then** the scan completes successfully and the SonarQube stage shows PASS status.
2. **Given** a SonarQube project has been analyzed by the upgraded instance, **When** a user views the SonarQube dashboard for that project, **Then** they see analysis results with the latest rule set applied.

---

### User Story 2 - Administrator Confirms Existing Data Is Preserved (Priority: P1)

After upgrading, the system administrator verifies that all historical analysis data, project configurations, and user settings from the old SonarQube instance remain intact and accessible.

**Why this priority**: Losing existing analysis history and project configurations would defeat the purpose of upgrading — the team needs continuity of their quality metrics.

**Independent Test**: Can be tested by comparing project lists, user accounts, and recent analysis results before and after the upgrade without any manual reconfiguration.

**Acceptance Scenarios**:

1. **Given** the SonarQube instance had multiple projects analyzed prior to upgrade, **When** the administrator logs into the upgraded instance, **Then** all existing projects are visible with their historical analysis data.
2. **Given** the administrator had configured user accounts and permissions in the old instance, **When** they check the upgraded instance, **Then** all user accounts and their permissions are preserved.

---

### User Story 3 - Pipeline Runs Without Manual Intervention (Priority: P2)

After the SonarQube upgrade, the CI/CD pipeline should trigger scans against the upgraded SonarQube instance without any configuration changes to the pipeline itself.

**Why this priority**: Manual pipeline reconfiguration would negate the benefit of an in-place upgrade. The upgrade should be transparent to downstream consumers.

**Independent Test**: Can be tested by verifying that a scan triggered from the Jenkins pipeline succeeds against the upgraded SonarQube using the existing `sonar-token` credential and project key configuration.

**Acceptance Scenarios**:

1. **Given** a project is configured with a `sonar_key`, **When** the Jenkins pipeline runs the `sonar_scanner` stage, **Then** it successfully connects to the upgraded SonarQube, runs analysis, and reports results back to the backend.

---

### Edge Cases

- What happens if the database schema migration fails midway through the upgrade?
- How does the system handle the case where the upgraded SonarQube version requires a newer PostgreSQL version than currently used?
- What happens to in-progress or queued scans during the upgrade downtime?
- How are long-standing custom quality profiles or plugins handled if they are incompatible with the new version?

### Out of Scope

- PostgreSQL version upgrade (must stay on version 15)
- Changes to the backend API or report processing logic
- Changes to the Jenkins pipeline configuration beyond sonar-scanner version updates
- User interface customization or theme changes on the SonarQube instance
- Migration away from Docker/host networking to a different deployment model

## Requirements

### Functional Requirements

- **FR-001**: System MUST upgrade the SonarQube instance from its current version (9.9.8) to the latest LTA/LTS stable release that includes up-to-date security analysis rules.
- **FR-002**: The upgraded SonarQube MUST preserve all existing project analysis data stored in the shared PostgreSQL database.
- **FR-003**: The upgraded SonarQube MUST maintain the same network accessibility (same host and port) so existing integrations continue to work.
- **FR-004**: The upgraded SonarQube MUST support the same authentication method (token-based API access) as the current instance.
- **FR-005**: The upgraded SonarQube MUST be able to analyze projects using the existing `sonar-scanner` configuration from the CI/CD pipeline.
- **FR-006**: The upgrade MUST complete within a reasonable maintenance window (under 2 hours of total downtime).
- **FR-007**: All existing user accounts and their permissions MUST be preserved after the upgrade.
- **FR-008**: The sonarqube PostgreSQL database MUST be fully backed up before the upgrade begins, and a documented rollback procedure MUST exist to restore from backup if the upgrade fails.
- **FR-009**: The sonar-scanner version used in the Jenkins pipeline MUST be compatible with the upgraded SonarQube (upgraded if needed).
- **FR-010**: Any existing plugins from the old SonarQube instance MUST either have compatible versions available for the new instance or be explicitly removed.
- **FR-011**: The upgrade MUST include end-to-end verification: trigger a scan, confirm the pipeline completes, and verify reports are stored in the backend.
- **FR-012**: Upgrade progress and errors MUST be observable via container logs (stdout/stderr).

### Key Entities

- **SonarQube Instance**: The server application that performs static code analysis, stores results, and provides dashboards. Upgraded from an old LTS release to a current stable release.
- **PostgreSQL Database (sonarqube)**: Shared database storing all SonarQube analysis data, project configurations, user accounts, and settings. The data must survive the upgrade and be compatible with the new SonarQube version.
- **SonarQube Project**: A project configuration within SonarQube identified by a `sonar_key` (e.g., `Soner_key`, `IT_tools_soner`). Projects and their analysis history must be preserved.
- **API Token**: The authentication token (`squ_...`) used by Jenkins and the backend to communicate with SonarQube. Must continue to work after the upgrade.

## Success Criteria

### Measurable Outcomes

- **SC-001**: All projects configured in the old SonarQube instance are visible and accessible in the upgraded instance with their full analysis history intact.
- **SC-002**: A full scan cycle (trigger → analysis → callback → report storage) completes successfully against the upgraded SonarQube instance without any pipeline code changes.
- **SC-003**: The upgraded SonarQube reports a version that is a current stable release, not an end-of-life or deprecated version.
- **SC-004**: Total service downtime during the upgrade is under 2 hours, measured from when the old instance is stopped to when the new instance reports healthy status.
- **SC-005**: All existing user accounts can log in to the upgraded SonarQube with their existing credentials.

## Assumptions

- The current SonarQube version is 9.9.8 (lts-community), which is significantly outdated and lacks recent security analysis rules.
- The SonarQube data directory (`sonarqube_data`, `sonarqube_extensions`, `sonarqube_logs` volumes) can be carried forward to the new version.
- The target SonarQube version MUST be compatible with the existing PostgreSQL 15 database. No PostgreSQL upgrade is in scope.
- The user has administrative access to both the SonarQube web interface and the Docker host system.
- The SonarQube service can be taken offline briefly during the upgrade process.
- Existing Jenkins pipeline and backend integration points (URL, port, auth token) should remain unchanged after the upgrade.
- The upgrade path from version 9.9 to the current version requires at least one intermediate version step to ensure database schema compatibility.
