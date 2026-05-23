------------------------------------------------------------
SECTION 1 — CURRENT HARDENING STATUS (POST-REMEDIATION)
------------------------------------------------------------

This document is now a remediation-tracking reference for the single-user, single-scan hardening plan.

Implemented controls:
1) Single-process safety guard:
   - `WEB_CONCURRENCY` startup guard rejects values > 1.
   - Compose pins `WEB_CONCURRENCY: 1`.
2) Trigger serialization refinement:
   - Check+insert remains atomic under lock.
   - Jenkins HTTP call moved outside lock.
   - Final transition update happens under lock.
3) Restart survival:
   - State persisted atomically to `STORAGE_PATH/control_plane_state.json`.
   - Startup restore reconstructs scan/project state.
   - Orphaned active scans are conservatively moved to `FAILED`.
4) Callback protection:
   - Callback token required in non-test env (minimum length validation in settings).
   - Callback endpoint enforces token in non-test.
5) Access control:
   - Global API key enforcement for non-callback routes in non-test.
   - Frontend sends `X-API-Key` from `VITE_API_KEY` when configured.
6) Liveness protection:
   - Background expiry worker marks timed-out scans without polling dependence.
   - Timeout based on `SCAN_TIMEOUT` (config) instead of hardcoded constant.
7) Global single-scan guard:
   - Trigger guard blocks any new scan when any active scan exists (`CREATED/QUEUED/RUNNING`).
8) Dashboard and control-plane UX guardrails:
   - Dashboard surfaces active scan banner when any project reports active scan state.
   - Project control page disables automated run while active scan exists and surfaces 409 errors.
9) Jenkins-side guardrails:
   - `disableConcurrentBuilds()` enabled.
   - Pipeline timeout increased to 4 hours.
   - Backend-origin validation stage added.

Code references:
- `backend/app/main.py`
- `backend/app/api/scans.py`
- `backend/app/state/persistence.py`
- `backend/app/core/auth.py`
- `backend/app/core/config.py`
- `Jenkinsfile`
- `docker/docker-compose.yml`
- `src/services/api.ts`

------------------------------------------------------------
SECTION 2 — RESOLVED FAILURE MODES
------------------------------------------------------------

R-01 Duplicate trigger race in single-process mode
- Status: RESOLVED
- Why:
  - `QUEUED` scan object is inserted under lock before external trigger call.
  - Second trigger sees active state and returns 409.

R-02 Lock starvation due to Jenkins network call inside critical section
- Status: RESOLVED
- Why:
  - Jenkins trigger moved outside lock; lock is only held around state mutation windows.

R-03 Restart wipes active scan memory and allows overlap
- Status: PARTIALLY RESOLVED (single-instance scope)
- Why:
  - Disk-backed state survives process restart.
  - Orphaned non-terminal scans become `FAILED` on restore, preventing silent overlap in control-plane state.
- Residual risk:
  - Does not perform active reconciliation against Jenkins runtime (conservative failover model).

R-04 Callback auth disabled by empty default
- Status: RESOLVED for non-test env
- Why:
  - `CALLBACK_TOKEN` required/validated in non-test configuration.
  - Callback route validates `X-Callback-Token` in non-test.

R-05 Timed-out scans stuck forever without user polling
- Status: RESOLVED
- Why:
  - Background expiry worker runs continuously and persists timeout transitions.

R-06 Public unauthenticated API surface
- Status: RESOLVED for non-test env
- Why:
  - Global API key dependency enforces `X-API-Key` on non-callback API routes.

R-07 Jenkins parallel execution of same pipeline
- Status: MITIGATED
- Why:
  - `disableConcurrentBuilds()` enabled in Jenkinsfile.
- Residual risk:
  - This is still queue serialization, not backend-transactional uniqueness across distributed callers.

------------------------------------------------------------
SECTION 3 — REMAINING KNOWN GAPS (NOT YET FULLY CLOSED)
------------------------------------------------------------

G-01 Multi-replica backend still not supported
- Current state:
  - Locking and state remain process-local.
  - Startup guard explicitly forbids multi-worker operation.
- Required to fully close:
  - Transactional DB-backed scan state and uniqueness constraints.

G-02 Callback payload trust model is token-based only
- Current state:
  - Token protects endpoint in non-test.
  - Payload semantics still accepted as authoritative once token is valid.
- Required to fully close:
  - Stronger callback correlation contract (`scan_id + queue_id + build_number`) and stale-update rejection policy.

G-03 Jenkins command injection vectors in stage shell commands
- Current state:
  - Backend-origin check added, but shell interpolation remains in multiple stages.
- Required to fully close:
  - Strict input validation + safe argument passing/wrapper scripts.

G-04 Disk persistence is pragmatic single-node durability, not HA durability
- Current state:
  - Atomic local file replace works on single node.
- Required to fully close:
  - PostgreSQL event/state persistence with migration and reconciliation workers.

G-05 Callback/report provenance is not cryptographically signed
- Current state:
  - Shared secret header only.
- Required to fully close:
  - Optionally sign callback payloads or enforce service-to-service mTLS.

------------------------------------------------------------
SECTION 4 — SINGLE-USER / SINGLE-SCAN OPERATING CONTRACT
------------------------------------------------------------

1) Backend must run with exactly one worker.
2) API access requires `X-API-Key` (non-test) for all routes except callback.
3) Callback requires `X-Callback-Token` (non-test).
4) Only one active scan per project is permitted (`CREATED/QUEUED/RUNNING`).
5) `GET /api/v1/scans` provides full scan visibility for orchestration/UI checks.
6) On crash/restart, orphaned active scans are marked `FAILED` at restore.
7) Timeout is governed by `SCAN_TIMEOUT` and enforced by background worker.
8) Jenkins pipeline is non-concurrent at job-level via `disableConcurrentBuilds()`.

------------------------------------------------------------
SECTION 5 — DEPLOYMENT CHECKLIST (MANDATORY)
------------------------------------------------------------

Environment:
- `ENV=staging` (or `dev`)
- `DATABASE_URL=...` (still required by config validation)
- `JENKINS_BASE_URL=...`
- `JENKINS_TOKEN=...`
- `STORAGE_PATH=/var/devsecops/storage`
- `SCAN_TIMEOUT=14400` (recommended 4h)
- `LOG_LEVEL=INFO`
- `DEBUG=false`
- `MOCK_EXECUTION=false`
- `API_KEY=<>=16 chars>`
- `CALLBACK_TOKEN=<>=32 chars>`
- `WEB_CONCURRENCY=1`

Jenkins:
- Configure `BACKEND_API_KEY` securely (credential binding).
- Configure `CALLBACK_TOKEN` securely.
- Confirm pipeline uses `disableConcurrentBuilds()` and 4-hour timeout.

Frontend:
- Set `VITE_API_KEY` to same API key used by backend.

------------------------------------------------------------
SECTION 6 — VALIDATION EVIDENCE EXPECTED IN CI
------------------------------------------------------------

Backend tests:
- `PYTHONPATH=backend python -m pytest -q` with required env vars.

Frontend tests:
- `npx vitest run`

Static checks:
- `python -m py_compile ...` for modified backend modules.

Operational smoke checks:
1) Trigger first scan: expect 201 and state RUNNING.
2) Trigger second scan for same project immediately: expect 409.
3) Restart backend during RUNNING scan:
   - restored scan becomes FAILED,
   - new scan can be triggered,
   - callback for old scan does not corrupt new scan state.
4) Call protected API without `X-API-Key`: expect 401.
5) Call callback without valid token in non-test: expect 401.

------------------------------------------------------------
SECTION 7 — ROADMAP (NEXT HARDENING ITERATION)
------------------------------------------------------------

Phase A (high priority):
- Replace local JSON persistence with PostgreSQL.
- Add startup reconciliation worker querying Jenkins for non-terminal scans.
- Enforce callback monotonicity/correlation keys.

Phase B:
- Eliminate shell interpolation risks in Jenkins stages.
- Add structured security/audit logs for all state transitions.
- Add health/readiness endpoints with dependency checks.

Phase C:
- Introduce distributed-safe architecture (multi-replica backend support).
- Add metrics and alerting for stuck scans, callback failures, and timeout transitions.

------------------------------------------------------------
SECTION 8 — DECISION LOG
------------------------------------------------------------

Decision: Conservative orphan handling on restart (`CREATED/QUEUED/RUNNING` -> `FAILED`).
Rationale: Prevents silent active-scan overlap and preserves backend source-of-truth behavior in single-node mode.
Tradeoff: If Jenkins eventually succeeds after backend restart, callback may be ignored because backend already marked scan terminal.

Decision: Callback route exempt from API key, protected by callback token.
Rationale: Keeps Jenkins callback contract simple and explicit.
Tradeoff: Requires strict callback-token handling and network segmentation.
