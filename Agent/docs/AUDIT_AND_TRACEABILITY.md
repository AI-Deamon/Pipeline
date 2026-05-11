# Audit and Traceability Policy

- Scan-Level Audit Data:
  For every scan execution, the system must capture:
  - `scan_id`: Unique UUID v4.
  - `project_id`: Reference to the project being scanned.
  - `triggered_by`: User ID of the initiator.
  - `trigger_timestamp`: ISO-8601 UTC timestamp.
  - `scan_mode`: AUTOMATED or MANUAL.
  - `manual_stage_selection`: List of stages selected (if MANUAL).
  - `execution_agent_id`: Identifier of the Kali Linux agent used.
  - `jenkins_build_number`: Reference to the execution job.
  - `git_ref`: The specific commit SHA or branch scanned.
  - `config_hash`: A SHA-256 hash of the project configuration at trigger time.
  - `completion_timestamp`: ISO-8601 UTC timestamp.
  - `overall_status`: Final result (PASSED/FAILED/ABORTED).

- User-Action Audit Data:
  Every modification to the system must be logged with:
  - `action_id`: Unique audit record identifier.
  - `user_id`: Identity of the actor.
  - `action_type`: CREATE_PROJECT, UPDATE_CONFIG, DELETE_PROJECT, TRIGGER_SCAN, ABORT_SCAN.
  - `resource_id`: ID of the affected project or scan.
  - `previous_state`: JSON snapshot of changed fields before the action.
  - `new_state`: JSON snapshot of changed fields after the action.
  - `ip_address`: Source IP of the request.
  - `user_agent`: Browser/Client string.
  - `timestamp`: ISO-8601 UTC timestamp.

- Traceability Model:
  Traceability is enforced by linking the Backend Record -> Jenkins Job -> Tool Artifacts:
  - **Project History**: All changes to project metadata (Git URL, Sonar Key, etc.) are versioned.
  - **Scan Lineage**: Every scan result is explicitly linked to the `config_hash` and `git_ref` captured at the moment of initiation.
  - **Artifact Mapping**: Reports and findings are stored with the `scan_id` embedded in their metadata, ensuring they can be traced back to the specific execution context even if moved to cold storage.

- Incident & Compliance Support:
  - **Forensic Reconstruction**: The combination of `config_hash`, `git_ref`, and `manual_stage_selection` allows auditors to precisely reconstruct the state of the system for any historical scan.
  - **Impact Analysis**: The system can query all scans triggered by a compromised user ID or all scans run against a specific repository within a given timeframe.
  - **Compliance Reporting**: Standardized audit logs enable automated generation of "Evidence of Security Review" for SOC2/ISO 27001 audits.

- Retention Principles:
  - **Audit Logs**: Retained for a minimum of 7 years in an immutable, searchable store.
  - **Scan Metadata**: Retained indefinitely (or for the life of the project) in the Backend system of record.
  - **Scan Artifacts**: (Raw logs, detailed tool reports) Retained for 1 year in hot/warm storage, then moved to cold storage for an additional 2 years before purging.
  - **Retention Tiers**: Tiered storage is used to balance forensic availability with storage costs.

- Immutable Audit Data:
  Once recorded, the following data must be technically impossible to edit or delete (WORM - Write Once, Read Many):
  - `trigger_timestamp` and `completion_timestamp`.
  - `triggered_by` identity.
  - `overall_status` and stage-level results.
  - `config_hash` and `git_ref`.
  - Any record of a User-Action that resulted in a state change.

- Audit & Traceability Pitfalls:
  - **The "Over-Retention" Trap**: Storing raw secrets or PII in audit logs, making the audit trail itself a security risk.
  - **Time Drift**: Failing to synchronize clocks across the Backend, Jenkins, and Kali agents, leading to misaligned execution sequences.
  - **Missing Failed Actions**: Only logging successful project creations or scan triggers, missing "Denied" or "Failed" attempts which are critical for detecting brute-force or unauthorized access.
  - **Jenkins Log Reliance**: Relying on Jenkins' internal build history for audit data, which is often ephemeral and easily cleared by system maintenance.
