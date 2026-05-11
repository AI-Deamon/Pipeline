# Pipeline Reliability Policy: Execution Safety Controls

- Per-Stage Timeout Policy:
  1. Git Checkout: 5 Minutes
  2. Sonar Scanner: 20 Minutes
  3. Sonar Quality Gate: 5 Minutes (Polling)
  4. NPM / PIP Install: 15 Minutes
  5. Dependency Check: 30 Minutes (Includes NVD database synchronization)
  6. Trivy FS Scan: 10 Minutes
  7. Docker Build: 30 Minutes
  8. Docker Push: 15 Minutes
  9. Trivy Image Scan: 10 Minutes
  10. Nmap Scan: 20 Minutes (Standard Discovery)
  11. ZAP Scan: 60 Minutes (Baseline/Active Scan)

- Per-Scan Timeout Policy:
  Total scan duration is capped at 240 minutes (4 hours). If the cumulative execution time exceeds this limit, the pipeline will trigger a global termination signal to prevent agent resource exhaustion.

- Timeout Classification Rules:
  - **Stage Timeout (FAILURE):** If a specific tool exceeds its allocated time, the stage is marked as FAILED. In Automated mode, this stops the pipeline. In Manual mode, the system proceeds to the next selected stage if possible.
  - **Scan Timeout (ABORTED):** If the global timeout is hit, the entire scan is marked as FAILED/TIMEOUT.
  - **Partial Completion:** Any reports generated before the timeout must be persisted and made available in the UI.

- Resource Limit Principles:
  - **CPU:** Maximum 2 vCPUs per scan process.
  - **Memory:** 4GB RAM hard limit. Processes exceeding this will be terminated by the OOM killer or container orchestrator.
  - **Disk:** 10GB workspace limit. Scans requiring more space will fail with a 'DISK_FULL' status.

- Over-Limit Handling:
  When a tool breaches a limit (time or resource):
  1. Send SIGTERM to the process group.
  2. Wait 30 seconds for graceful exit and log capture.
  3. Send SIGKILL to ensure complete termination.
  4. Record the specific breach reason (e.g., OOM, TIMEOUT) in the scan results.

- Cleanup Rules:
  - **Successful Scans:** Delete build artifacts, temporary container images, and local workspace. Preserve logs and final reports.
  - **Failed Scans:** Same as successful, but preserve the last 500 lines of raw tool logs for debugging (hidden from default UI but available to admins).
  - **Cancelled Scans:** Immediate SIGKILL of all subprocesses followed by a full workspace wipe.

- Orphaned Resource Handling:
  - **Process Reaper:** A background task on the Kali agent scans for zombie processes from security tools (e.g., orphaned ZAP daemons) every 60 minutes.
  - **Docker Prune:** Execute `docker system prune` periodically to remove dangling images and volumes from failed/interrupted builds.
  - **Workspace Locking:** Each scan runs in a unique, isolated directory to ensure that one scan's failure cannot lock files for another.

- Timeout & Cleanup Pitfalls:
  - **NVD Mirroring:** Dependency Check can hang indefinitely if the NVD mirror is slow; requires a strict tool-level timeout.
  - **Dangling ZAP:** ZAP often starts a proxy server that remains alive if not explicitly shut down; cleanup must verify port release.
  - **Disk Starvation:** Failed cleanups from previous runs can lead to subsequent scan failures; requires pre-scan disk health checks.
