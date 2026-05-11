# Error Handling and Recovery Policy

- Error Categories:
  - **Validation Errors**: Issues with project setup or scan triggers (e.g., malformed Git URL, missing target IP for Nmap).
  - **Execution Errors**: Tool-level failures during a scan (e.g., Sonar Scanner non-zero exit code, ZAP process crash).
  - **Infrastructure Errors**: Failures in the orchestration or execution layer (e.g., Jenkins master unreachable, Kali agent disconnected, network timeout).
  - **User-Initiated Errors**: Explicit cancellation or abort actions performed by the user.

- Error-to-State Mapping:
  - **Validation Errors**: Scan status is set to `FAILED` immediately without triggering the pipeline.
  - **Execution Errors**: The current stage is marked as `FAILED`. In Automated mode, this usually sets the overall scan to `FAILED`. In Manual mode, the scan may continue to the next selected stage.
  - **Infrastructure Errors**: If unrecoverable, the scan status is set to `FAILED`. If a heartbeat is lost for >10 minutes, the Backend marks the scan as `STALE_FAILED`.
  - **User-Initiated Errors**: Scan status is set to `CANCELLED`. All active processes are terminated.

- Partial Failure Representation:
  - **Passed Stages**: Retain their `PASSED` status and findings.
  - **Active Stage**: Marked as `FAILED` with a summary indicating the nature of the interruption.
  - **Remaining Stages**: Marked as `SKIPPED` (not `FAILED`) to indicate they were never attempted due to the prior error.
  - **UI Display**: The status page shows the sequence of events leading to the failure, preserving visibility of completed work.

- Retry & Re-run Rules:
  - **Infrastructure Retry**: The system may automatically retry an Infrastructure-level stage failure exactly once if it detects a transient network blip.
  - **No Auto-Retry**: Validation and Execution errors are never auto-retried, as they typically require human intervention or configuration changes.
  - **Deterministic Re-runs**: "Retry" in the UI always creates a **new Scan ID**. The system never resumes an existing failed scan ID to ensure audit trail integrity.

- Recovery Scenarios:
  - **Jenkins Restart**: Upon recovery, Jenkins checks for orphaned "Running" jobs. The Backend periodically polls for scan status; if Jenkins reports the job as "Aborted" or missing after a restart, the Backend updates the scan state to `FAILED`.
  - **Agent Crash**: The Backend detects a loss of heartbeat from the specific execution agent. If the agent does not reconnect within a 5-minute window, active scans on that agent are transitioned to `FAILED`.
  - **Network Interruption**: Tool-to-Backend status updates use a "retry-with-backoff" strategy. If the network is down for longer than the stage timeout, the stage fails.

- User-Facing Error Communication:
  - **Functional Abstraction**: Technical stack traces (e.g., `java.lang.NullPointerException`) are never shown to the user.
  - **Human-Readable Messages**: Errors are mapped to functional categories (e.g., "Dependency analysis failed to connect to database" instead of "SQL connection timeout").
  - **Actionable Guidance**: Where possible, error messages suggest a fix (e.g., "Please check your Git credentials and try again").

- Reliability Pitfalls & Preventive Measures:
  - **The "Zombie Scan"**: A scan marked as "Running" in the UI while the backend process has crashed. **Prevention**: Mandatory bidirectional heartbeats between the Backend and Execution Agent.
  - **Silent Tool Failures**: A tool crashes but exits with code 0. **Prevention**: Explicit verification of expected tool artifacts (e.g., report files) after every stage.
  - **Resource Exhaustion**: A tool consumes all agent memory, killing the heartbeat process. **Prevention**: Strict per-stage memory limits (cgroups) enforced on the Kali agent.
  - **Disk Full**: Scans fail because the agent workspace is full. **Prevention**: Pre-scan disk space checks and aggressive post-scan workspace cleanup.
