# Feature Specification: Scan Stage Configuration

**Feature Branch**: `004-scan-stage-config`

**Created**: 2026-05-27

**Status**: Draft

**Input**: Configure scan stage settings for ZAP and other pipeline scan stages — threads, strength, timeout, polling frequency, and memory limits.

## User Scenarios & Testing

### User Story 1 - Configure ZAP Active Scan Parameters (Priority: P1)

As a security engineer, I want to adjust ZAP active scan settings (thread count, attack strength, timeout, polling frequency) so that scans complete within acceptable timeframes without exhausting system resources.

**Why this priority**: ZAP active scan is the most resource-intensive pipeline stage. Without configurable parameters, full-site scans either time out (1800s default) or consume excessive resources.

**Independent Test**: Can be tested by triggering a ZAP scan with different parameter combinations and verifying the pipeline respects the configured values.

**Acceptance Scenarios**:

1. **Given** a ZAP active scan is configured with `ascan.threadPerHost=5`, **When** the scan runs, **Then** no more than 5 threads are used per host
2. **Given** a ZAP active scan is configured with `ascan.strength=Medium`, **When** the scan runs, **Then** attack strength is Medium (not HIGH)
3. **Given** a ZAP active scan with `ascan.maxScanTimeInMs=7200000`, **When** the scan exceeds 2 hours, **Then** ZAP self-aborts
4. **Given** a ZAP active scan with ASCAN_TIMEOUT=7200, **When** the Jenkins polling loop exceeds 7200s, **Then** the pipeline fails with a timeout message

---

### User Story 2 - Reduce Console Noise from ZAP Polling (Priority: P2)

As a pipeline operator, I want ZAP progress polling to print to the console at reasonable intervals so that logs are readable and not flooded with near-identical progress lines.

**Why this priority**: Polling every 10s for a 1-2 hour scan produces 360-720 log lines. Reducing to 60s produces 60-120 lines while still providing visibility.

**Independent Test**: Can be tested by running a ZAP scan and verifying polling output appears at approximately 60s intervals.

**Acceptance Scenarios**:

1. **Given** a ZAP active scan is running, **When** the polling loop checks status, **Then** progress is printed at 60s intervals
2. **Given** a ZAP active scan completes, **When** the status reaches 100%, **Then** the loop exits immediately regardless of polling interval

---

### User Story 3 - Configure Jenkins JVM Memory (Priority: P2)

As a system administrator, I want to limit Jenkins JVM heap to 6GB so that it does not consume excessive host memory (default 50% of system RAM).

**Why this priority**: Jenkins defaults to 50% of system RAM for its heap. On a machine with limited memory running multiple services (Postgres, SonarQube, ZAP), this can starve other processes.

**Independent Test**: Can be verified by checking Jenkins process JVM flags after service restart.

**Acceptance Scenarios**:

1. **Given** Jenkins is configured with `-Xmx6g -Xms512m`, **When** Jenkins starts, **Then** its JVM heap is capped at 6GB

---

### User Story 4 - Dashboard-Controlled Scan Parameters (Priority: P3)

As a security engineer, I want to configure ZAP scan parameters (strength, timeout) from the scan dashboard so that I can adjust scans per project without editing pipeline code.

**Why this priority**: Pipeline-level configuration is a manual process requiring Jenkinsfile edits. Dashboard controls make it self-service.

**Independent Test**: Can be tested by setting parameters in the dashboard UI and verifying the pipeline picks them up.

**Acceptance Scenarios**:

1. **Given** a project has ZAP strength set to "Medium" in the dashboard, **When** a scan is triggered, **Then** the pipeline uses Medium strength
2. **Given** a project has ZAP timeout set to 7200s in the dashboard, **When** a scan is triggered, **Then** the pipeline uses 7200s timeout

---

### Edge Cases

- What happens when ZAP heap is capped at 2GB but the target site is large? — ZAP OOMs quickly (fast failure) rather than hanging
- What happens when timeout is reached mid-scan? — Pipeline reports ZAP stage as FAIL with timeout message
- What happens when ZAP process dies during active scan? — Polling loop detects missing PID and exits with error
- How does the system handle a downlevel Jenkins that doesn't support the new config flags? — Backward compatible: defaults remain safe

## Requirements

### Functional Requirements

- **FR-001**: ZAP daemon MUST start with `ascan.threadPerHost=5` to limit active scan threads
- **FR-002**: ZAP daemon MUST start with `ascan.strength=Medium` to reduce attack payload density
- **FR-003**: ZAP daemon MUST start with `ascan.maxScanTimeInMs=7200000` to self-abort after 2 hours
- **FR-004**: Jenkins polling loop MUST use ASCAN_TIMEOUT=7200s to match the ZAP internal timeout
- **FR-005**: Active scan progress MUST print at 60s intervals instead of 10s
- **FR-006**: Progress MUST still print when status changes or scan completes (immediate exit on 100%)
- **FR-007**: Jenkins JVM MUST be limited to `-Xmx6g -Xms512m` to prevent memory exhaustion
- **FR-008**: All ZAP parameter changes MUST be backward compatible with existing pipeline behavior for projects that don't specify overrides
- **FR-009**: The system MUST allow per-project ZAP scan strength and timeout settings passed as Jenkins pipeline build parameters

### Key Entities

- **ZAP Scan Configuration**: Thread count, attack strength, max scan time, timeout, polling interval — set at pipeline level
- **Jenkins Configuration**: JVM heap limits — set at service level
- **Project Scan Settings** (future): Per-project ZAP parameters storable in the database and passed to the pipeline

## Success Criteria

### Measurable Outcomes

- **SC-001**: ZAP active scan completes within configured timeout without exhausting 2GB heap
- **SC-002**: Pipeline console output shows ZAP progress at 60s intervals (not 10s), reducing log volume by ~83%
- **SC-003**: ZAP scan with Medium strength covers the same URL surface as HIGH but uses fewer resources
- **SC-004**: Jenkins JVM does not exceed 6GB heap under normal pipeline load
- **SC-005**: All pipeline stages (SonarQube, Trivy, ODC, Docker Build, Nmap) continue to function correctly alongside ZAP changes

## Assumptions

- ZAP active scanning is CPU-bound, not memory-bound past 2GB heap — the 2GB cap is sufficient
- Medium strength provides adequate vulnerability coverage for most web applications
- The Jenkins service file or systemd unit is accessible for JVM flag changes
- Pipeline parameters flow via Jenkins environment variables, not a separate config service
- ZAP's internal `maxScanTimeInMs` and Jenkins' `ASCAN_TIMEOUT` should be set to the same value to avoid inconsistent states
