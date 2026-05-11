# Result Normalization and Reporting Policy

- Standard Result Schema:
  Every scan stage must report a JSON object with the following mandatory fields:
  - `stage_name`: String (one of the 11 fixed stages).
  - `status`: String (standardized status).
  - `start_time`: ISO-8601 Timestamp.
  - `end_time`: ISO-8601 Timestamp.
  - `summary`: Short human-readable outcome message (max 200 chars).
  - `findings`: Object containing `critical`, `high`, `medium`, `low` counts.
  - `report_id`: UUID reference to the sanitized HTML/PDF report.
  - `metadata`: Key-value pair for stage-specific data (e.g., `git_commit`, `image_digest`).

- Result Status Definitions:
  - **PASS**: The tool executed successfully and found no issues exceeding the defined quality gate (e.g., zero critical/high findings).
  - **FAIL**: The tool executed successfully but found security issues that violate the quality gate, OR the tool itself failed to execute (technical error).
  - **WARN**: The tool found security issues that are noteworthy but do not violate the hard quality gate, OR the tool completed with non-critical warnings.
  - **SKIPPED**: The stage was not executed because it was not selected (Manual mode) or was deemed unnecessary by the system (Automated mode).

- Severity Representation & Aggregation:
  - **Critical (Level 4)**: Immediate threat, highly exploitable (e.g., RCE, unauthenticated data leak).
  - **High (Level 3)**: Serious vulnerability, difficult but possible to exploit (e.g., SQLi, broken auth).
  - **Medium (Level 2)**: Moderate risk, requires specific conditions (e.g., sensitive info in logs).
  - **Low (Level 1)**: Minor issue, information gathering, or low impact (e.g., missing security headers).
  - **Aggregation**: The overall scan severity is the maximum severity level found across all passed/failed stages. The total count is the sum of findings across all stages.

- Raw Output Referencing Rules:
  - UI and Backend must never store or display raw console logs by default.
  - Raw outputs must be compressed and archived in a secure internal object store.
  - The `report_id` in the schema provides a controlled link to a sanitized, formatted version of the tool's findings.
  - Access to raw logs is restricted to "Platform Admin" roles for debugging purposes only via a dedicated secure endpoint.

- Partial Result Handling:
  - If a scan is interrupted or fails mid-pipeline, the current stage must report its status as `FAIL`.
  - All preceding completed stages must retain their `PASS`/`FAIL`/`WARN` results and findings.
  - All subsequent stages must be marked as `SKIPPED` (not `FAIL`) to avoid false negatives in security metrics.
  - The overall scan status becomes `FAILED`, but the partial findings remain auditable.

- Automated vs Manual Result Consistency:
  - The result schema and status definitions are identical regardless of scan mode.
  - **Automated Scans**: The system ensures all 11 stages report a result (even if `SKIPPED` due to logic).
  - **Manual Scans**: Only the user-selected stages report findings; non-selected stages are explicitly marked `SKIPPED`.
  - Reporting and severity aggregation logic remains consistent to ensure security posture can be compared across different execution modes.

- Result Normalization Pitfalls:
  - **Exit Code Reliance**: Relying solely on tool exit codes (some tools exit 0 even with vulnerabilities; others exit 1 on non-critical warnings).
  - **Schema Drift**: Allowing tools to add arbitrary top-level fields that break UI parsers.
  - **Timezone Inconsistency**: Reporting timestamps in local agent time instead of UTC.
  - **Silent Failures**: Treating a tool crash as a `PASS` because no vulnerabilities were "found".
