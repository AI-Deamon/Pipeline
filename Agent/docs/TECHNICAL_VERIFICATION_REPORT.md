# DevSecOps Security Scanning Platform — End-to-End Technical Verification

## 1) Architecture Compliance Review

### Locked architecture target
`Web UI → Backend API → Jenkins → Kali Linux Agent`

### Observed implementation status

- **UI → Backend API**: Present. Frontend only calls `/api/v1` endpoints exposed by FastAPI (`api.scans.get`, `getResults`, `trigger`).
- **Backend API → Jenkins**: **Not enforced in runtime scan path**. `POST /scans` creates an in-memory scan object but does not trigger Jenkins, does not set `QUEUED`, and does not set `RUNNING`.
- **Jenkins → Kali agent**: Present in `Jenkinsfile` via `agent { label 'kali' }`.
- **Jenkins → Backend callback**: Present via `curl ... /api/v1/scans/{scan_id}/callback`.

### Fixed 11-stage governance check

- Jenkins pipeline currently defines **exactly 11 stages** and no extras:
  1. Git Checkout
  2. Sonar Scanner
  3. Sonar Quality Gate
  4. NPM / PIP Install
  5. Dependency Check
  6. Trivy FS Scan
  7. Docker Build
  8. Docker Push
  9. Trivy Image Scan
  10. Nmap Scan
  11. ZAP Scan

✅ Count is correct.

### Manual/automated separation check

- Backend validates strict mode separation:
  - `automated` rejects `selected_stages`.
  - `manual` requires non-empty `selected_stages` and validates stage IDs + dependencies.
- Jenkins `shouldRun` enforces mode-specific behavior with discovery logic for automated mode and explicit allowlist for manual mode.

✅ Separation logic exists.

⚠️ However, status schema and callback field mismatches degrade practical lifecycle correctness (details below).

---

## 2) Critical Deficiencies (Ranked by Severity)

## Critical-1: Lifecycle ownership drift — scan start path does not execute Backend → Jenkins transition

- **Description**: `POST /scans` creates scans in `CREATED` and returns immediately. No Jenkins trigger call, no `QUEUED`, no `RUNNING` transition.
- **Root cause**: Orchestration path is stubbed (`orchestrate_scan` is `pass`) and unused; route only stores object in memory.
- **Real-world failure scenario**: UI shows active scan that never runs; dashboards drift from real pipeline activity; operational SLAs and timeout semantics become misleading.
- **Severity**: **Critical**

## Critical-2: Backend/Jenkins callback schema mismatch breaks stage/result integrity

- **Description**: Jenkins posts stage entries with keys `{name, status, details, reportUrl}` while backend expects `{stage, status, summary, artifact_url}`. Backend stores raw list without normalization.
- **Root cause**: No contract adapter/normalizer between Jenkins post payload and API schema.
- **Real-world failure scenario**: UI cannot reliably render stage names/reports; artifact links disappear; normalization policy (`PASS/WARN/FAIL/SKIPPED`) is bypassed.
- **Severity**: **Critical**

## High-1: Callback endpoint lacks authentication/integrity checks

- **Description**: `/scans/{scan_id}/callback` accepts unauthenticated JSON and mutates final scan state.
- **Root cause**: No token signature, no HMAC, no source verification.
- **Real-world failure scenario**: Any internal actor can mark scans `SUCCESS/FAILURE`, inject fabricated stage evidence, and alter project-level state.
- **Severity**: **High**

## High-2: Jenkins callback command injection risk via shell-embedded JSON

- **Description**: Jenkins emits callback using shell with `-d '${jsonReport}'`; stage details containing quotes can break command context.
- **Root cause**: String interpolation into shell command without robust escaping.
- **Real-world failure scenario**: Malicious tool output containing crafted quote sequences can corrupt callback payload or execute unintended shell fragments.
- **Severity**: **High**

## High-3: Multi-instance data integrity risk due to in-memory lock/storage model

- **Description**: `scans_db` + `RLock` are process-local; no distributed locking or durable state.
- **Root cause**: in-memory dictionaries used as source of truth.
- **Real-world failure scenario**: In scaled deployments, one instance accepts scan trigger while another receives callback; scan not found/state divergence occurs.
- **Severity**: **High**

## Medium-1: Build metadata contract partially captured and inconsistent

- **Description**: Backend can store `queue_id`/`build_number`, but Jenkins final report currently does not send them.
- **Root cause**: Jenkins `finalReport` omits metadata keys expected by backend.
- **Real-world failure scenario**: Loss of audit traceability from scan to Jenkins execution record; difficult RCA for failures.
- **Severity**: **Medium**

## Medium-2: Status semantics drift (`PASSED/FAILED` vs `PASS/FAIL`) and WARN enforcement gap

- **Description**: Jenkins emits `PASSED/FAILED/SKIPPED`; UI status components are keyed for `PASS/FAIL/WARN/SKIPPED`; backend does not normalize.
- **Root cause**: Missing canonical status translator in callback processing.
- **Real-world failure scenario**: Inconsistent UI coloring/logic, inaccurate governance reporting, and potential policy misinterpretation where WARN handling should not fail scans.
- **Severity**: **Medium**

## Medium-3: Timeout enforcement is opportunistic, not scheduler-driven

- **Description**: Timeout transitions to `FAILED` only when status/results endpoints or callbacks are called.
- **Root cause**: No periodic expiry worker.
- **Real-world failure scenario**: Abandoned scans remain active indefinitely if not polled, blocking future scans via active-scan guard.
- **Severity**: **Medium**

## Medium-4: Test suite reliability drift hides regressions

- **Description**: `test_callback_project_state_sync.py` uses invalid automated payload (`selected_stages` supplied), currently failing under valid env.
- **Root cause**: Tests not aligned with enforced request validation.
- **Real-world failure scenario**: CI signal quality drops; real regressions masked by stale failing tests.
- **Severity**: **Medium**

## Low-1: Combined status+results endpoint missing (polling overhead)

- **Description**: UI polls two endpoints every 3s (`/scans/{id}` and `/scans/{id}/results`).
- **Root cause**: Contract split without a consolidated read model.
- **Real-world failure scenario**: Extra network round-trips and duplicated backend load at scale.
- **Severity**: **Low**

---

## 3) Concrete Remediation Plan (Architecture-Compliant)

> Constraints respected: no new pipeline stages, no backend execution of scanners, no UI→Jenkins direct path, no lifecycle ownership transfer away from backend.

### Remediation A — Restore authoritative lifecycle orchestration in Backend

**Implementation strategy**
1. In `POST /scans`, after create:
   - set `state=QUEUED`
   - call Jenkins trigger service
   - on 201/202 acceptance: set `state=RUNNING`, set `started_at`
   - on failure: set `state=FAILED`, set `finished_at`
2. Persist `queue_id` from trigger response (if available).

**Code-level guidance (illustrative)**

```python
# backend/app/api/scans.py (inside trigger_scan)
scan_obj.state = ScanState.QUEUED
project["last_scan_state"] = scan_obj.state

accepted, queue_id = jenkins_service.trigger_scan_job(scan_obj, project)
if accepted:
    scan_obj.state = ScanState.RUNNING
    scan_obj.started_at = datetime.utcnow()
    scan_obj.jenkins_queue_id = str(queue_id) if queue_id else None
else:
    scan_obj.state = ScanState.FAILED
    scan_obj.finished_at = datetime.utcnow()
project["last_scan_state"] = scan_obj.state
```

**Migration safety notes**
- Backward compatible for existing scan IDs.
- Add feature flag to keep mock mode behavior deterministic in test env.

### Remediation B — Add strict callback schema adapter + allowlist

**Implementation strategy**
- Accept Jenkins-native fields but normalize into canonical backend schema.
- Enforce exact 11-stage ID allowlist and status mapping table.
- Reject unknown top-level keys if operating in strict mode.

**Code-level guidance (illustrative)**

```python
STAGE_NAME_TO_ID = {
    "Git Checkout": "git_checkout",
    "Sonar Scanner": "sonar_scanner",
    # ... all 11
}
STATUS_MAP = {
    "PASSED": "PASS",
    "FAILED": "FAIL",
    "SKIPPED": "SKIPPED",
    "WARN": "WARN",
}

def normalize_stage(raw: dict) -> dict:
    stage_id = raw.get("stage") or STAGE_NAME_TO_ID.get(raw.get("name"))
    status = STATUS_MAP.get(raw.get("status"), raw.get("status"))
    if stage_id not in VALID_STAGES:
        raise HTTPException(400, f"Invalid stage identifier: {stage_id}")
    if status not in {"PASS", "FAIL", "WARN", "SKIPPED"}:
        raise HTTPException(400, f"Invalid stage status: {status}")
    return {
        "stage": stage_id,
        "status": status,
        "summary": raw.get("summary") or raw.get("details"),
        "artifact_url": raw.get("artifact_url") or raw.get("reportUrl"),
        "artifact_size_bytes": raw.get("artifact_size_bytes"),
        "artifact_sha256": raw.get("artifact_sha256"),
    }
```

**Migration safety notes**
- Keep dual parsing (legacy + canonical) for one release cycle.
- Emit deprecation logs for non-canonical fields.

### Remediation C — Harden callback authenticity

**Implementation strategy**
- Require shared secret token or HMAC signature header from Jenkins.
- Optionally enforce source-network ACL at ingress.
- Record callback auth principal in audit log.

**Code-level guidance (illustrative)**

```python
sig = request.headers.get("X-Callback-Signature")
expected = hmac_sha256(secret, raw_body)
if not hmac.compare_digest(sig or "", expected):
    raise HTTPException(401, "Invalid callback signature")
```

**Migration safety notes**
- Roll out in permissive mode first (log-only), then enforce.

### Remediation D — Safe callback transport from Jenkins

**Implementation strategy**
- Avoid shell interpolation of JSON payload.
- Write JSON to file and send with `--data-binary @file`.

**Code-level guidance (illustrative)**

```groovy
writeFile file: 'final_report.json', text: jsonReport
sh '''
  curl -sS -X POST \
    -H "Content-Type: application/json" \
    -H "X-Callback-Signature: ${CALLBACK_SIG}" \
    --data-binary @final_report.json \
    "http://backend:8000/api/v1/scans/${SCAN_ID}/callback"
'''
```

**Migration safety notes**
- No stage changes required; only post-block transport hardening.

### Remediation E — Improve concurrency safety without breaking architecture

**Implementation strategy**
- Move `scans_db`/`projects_db` to durable datastore.
- Use DB transaction with unique partial index for active scan per project.
- Keep backend as lifecycle owner; Jenkins remains executor.

**Code-level guidance (illustrative)**

```sql
CREATE UNIQUE INDEX uq_active_scan_per_project
ON scans(project_id)
WHERE state IN ('CREATED','QUEUED','RUNNING');
```

**Migration safety notes**
- Introduce repository layer first; keep API surface unchanged.

### Remediation F — Polling optimization (non-breaking)

**Implementation strategy**
- Add optional combined read endpoint (`/scans/{id}/overview`) returning status + normalized stages.
- Keep existing endpoints for compatibility.

**Code-level guidance (illustrative)**

```json
{
  "scan_id": "...",
  "state": "RUNNING",
  "started_at": "...",
  "results": [ ... ]
}
```

**Migration safety notes**
- UI can progressively adopt endpoint; no backend contract break.

---

## 4) Simplified Data Flow Diagram (with mutation/race windows)

```text
[Web UI]
   |  POST /scans (manual|automated)
   v
[Backend API]  --(M1: create scan, active-scan guard, state mutation)-->  state store
   |  trigger job (params)
   v
[Jenkins]
   |  executes fixed 11 stages
   v
[Kali Agent]
   |  stage outputs + artifacts
   v
[Jenkins post {status, stages,...}]
   |  POST /scans/{scan_id}/callback
   v
[Backend API]  --(M2: idempotency digest check, normalize + terminal transition)--> state store
   |
   |  GET /scans/{id}, GET /scans/{id}/results (poll)
   v
[Web UI]
```

### Mutation points and race windows

- **M1 (trigger path)**: duplicate start race across instances if lock/storage not distributed.
- **M2 (callback path)**: terminal-state race/replay race if callbacks arrive out of order without strict monotonic rules.
- **Polling window**: split status/results fetch can display transiently inconsistent UI snapshots.

---

## 5) Operational Maturity Assessment

| Dimension | Score (/10) | Rationale |
|---|---:|---|
| Architecture discipline | **6.0** | Correct high-level components exist, but backend→jenkins lifecycle transition is not fully wired. |
| Lifecycle stability | **5.5** | Validation and idempotency exist, yet start-state correctness and timeout enforcement are incomplete operationally. |
| Security hardening | **4.5** | Good artifact field validation and stage allowlists, but callback authentication and shell-safe transport are missing. |
| Concurrency safety | **4.0** | In-process lock helps single instance only; multi-instance drift remains high risk. |
| Enterprise readiness | **5.0** | Strong intent/docs, but contract drift and reliability gaps need closure before production confidence. |

### Overall verdict

The platform has a promising control-plane foundation and a correct fixed-stage pipeline skeleton, but it is **not yet enterprise-safe for deterministic end-to-end operation** until lifecycle wiring, schema normalization, callback trust, and distributed integrity controls are completed.
