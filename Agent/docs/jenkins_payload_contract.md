# Jenkins Job Payload Contract

The backend triggers Jenkins by sending the following parameters:

| Parameter | Type | Description |
|-----------|------|-------------|
| `SCAN_ID` | String (UUID) | Unique identifier for the scan. Authoritative. |
| `PROJECT_ID` | String (UUID) | Link back to the project. |
| `GIT_URL` | String | Repository to clone. |
| `GIT_BRANCH` | String | Branch to scan. |
| `SCAN_MODE` | String | `AUTOMATED` or `MANUAL`. |
| `SELECTED_STAGES` | String (CSV) | Comma-separated list of stages to run (only for `MANUAL`). |

## Orchestration Flow

1. **Backend** validates the request.
2. **Backend** generates `scan_id` and sets state to `QUEUED`.
3. **Backend** calls Jenkins REST API with the payload above.
4. **Backend** sets state to `RUNNING` if Jenkins accepts the job (HTTP 201/202).
5. **Jenkins** executes the pipeline on the Kali agent.
6. **Jenkins** reports completion back to the Backend (via separate results endpoint - to be implemented).
