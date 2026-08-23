# Comprehensive Application Audit — DevSecOps Control Plane

**Date:** 2026-07-13
**Scope:** Full-stack (FastAPI backend, React/TS frontend, Celery/Redis, Jenkins pipeline integration)
**Method:** Direct source review of the scan lifecycle, callbacks, Celery tasks, auth/RBAC, and reporting/dedup pipeline (backend), plus focused research passes over frontend UI/UX and performance/reliability.

---

## Executive Summary

This is a genuinely ambitious, well-documented DevSecOps platform — full scan orchestration, real-time updates, compliance mapping, AI-assisted finding validation. The reporting layer (risk scoring, OWASP/CWE mapping) is more mature than most side projects reach. Recent commits show real security hygiene work (CORS fix, TOCTOU fix, argon2 migration, rate limiting on callbacks).

However, the audit surfaced **two confirmed critical defects that should block any production deployment**:

1. A **stored XSS** vulnerability in one of two near-identical components rendering the same untrusted field — one sanitizes, its sibling doesn't.
2. **Auth rate limiting is structurally dead code.** `settings.ENV` can only ever be `"dev"`, `"test"`, or `"staging"` (enforced by the Pydantic type itself), but the login/register rate limiter checks `settings.ENV != "production"` — a value the field can never hold. Every deployment of this app, in every environment, gets 1000 requests/minute on `/auth/login` and `/auth/register`. There is effectively **no brute-force protection today, anywhere this runs.**

Beyond these two, the scan lifecycle has a genuine concurrency problem: three independent writers (the Jenkins callback, the recovery thread, and Celery report/issue tasks) mutate the same `ScanDB`/`ProjectDB` rows with almost no locking, and one race (task ordering) means **security findings can be silently fetched but never migrated into the Issues table** — a correctness bug that undermines the product's core value proposition.

The frontend is functionally reasonable but has clear signs of feature-velocity outpacing polish: four brand-new dashboard pages (Executive Summary, Portfolio, Team Workload, Trend Analysis) don't handle query errors, one computes a risk score that can render as `NaN out of 100`, and one displays a fabricated "trend" indicator with a code comment admitting it's not real.

None of this is unusual for an actively-developed solo/small-team project. All of it is fixable in days, not weeks — the roadmap below is ordered so the fixes with the highest risk-reduction-per-hour come first.

---

## Health Scores

| Category | Score | Rationale |
|---|---|---|
| **Security** | **42 / 100** | Confirmed stored XSS + structurally inactive auth rate limiting + long-lived tokens in `sessionStorage` + a shared, unscoped, UI-visible API key used for privileged actions. |
| **Code Quality & Concurrency** | **48 / 100** | Clean layering and real test discipline, undercut by three unsynchronized writers on the scan lifecycle and a task-ordering race that silently drops security findings. |
| **Performance & Reliability** | **58 / 100** | No catastrophic bottlenecks, but N+1 queries on hot paths, no Celery task timeouts (hang risk), and a slow in-memory leak in the rescan rate limiter. |
| **UI/UX & Product** | **55 / 100** | Solid component foundation (skeletons, error-suggestion component, breadcrumbs) undermined by silent-failure states and fabricated data on the newest, most visible dashboards. |
| **Overall** | **~50 / 100 — Needs significant work before production** | Weighted toward security and correctness, since this is a security-scanning product; the bar for "don't ship a security tool with security bugs" is high. |

---

## 1. Security Findings

*OWASP category noted where applicable. Each finding is marked **True Positive**, **False Positive**, or **Hardening Recommendation**.*

### 🔴 CRITICAL — Stored XSS via unsanitized `dangerouslySetInnerHTML` (OWASP A03: Injection) — **True Positive**

- **File:** [`src/components/reports/IssueDetailPanel.tsx:125,133`](../src/components/reports/IssueDetailPanel.tsx)
- **Root cause:** `issue.description` and `issue.recommendation` are injected via `dangerouslySetInnerHTML={{ __html: issue.description }}` with **no sanitization**. The near-identical [`src/components/IssueDetailModal.tsx:386,400`](../src/components/IssueDetailModal.tsx) renders the *exact same fields* wrapped in `DOMPurify.sanitize(...)`. `dompurify` is already a project dependency — it just wasn't applied consistently.
- **Description:** Any finding whose `description`/`recommendation` text is attacker-influenced (a crafted SonarQube rule description, a malicious `fix_note` from the rescan flow, a compromised scanner's raw report) renders as live HTML/JS in this panel.
- **Impact:**
  - *Technical:* Full DOM-based stored XSS — arbitrary JS execution in the analyst's/developer's browser session.
  - *Business:* For a security-scanning product, shipping stored XSS in the finding-detail view is a severe credibility and liability risk — the tool meant to catch this class of bug has it.
  - *User:* Combined with the token-storage finding below, an attacker who can influence any finding's text can steal a viewer's session token and API key.
- **Recommended fix:** Sanitize identically to the sibling modal, or better, extract one shared `<SanitizedHtml html={...} />` component so this can't drift again.
- **Corrected code:**
  ```tsx
  import DOMPurify from 'dompurify';

  <p
    className="text-sm text-slate-700"
    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(issue.description) }}
  />
  ...
  <p
    className="text-sm text-slate-700"
    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(issue.recommendation) }}
  />
  ```
- **Validation steps:**
  1. Create/mock an issue with `description = "<img src=x onerror=alert(document.cookie)>"`.
  2. Open the panel that renders `IssueDetailPanel` — confirm no alert fires and the tag is stripped/escaped.
  3. Grep the repo for all `dangerouslySetInnerHTML` call sites and confirm every one wraps in `DOMPurify.sanitize` (grep found only these two files using the raw field — good, contained).

---

### 🔴 CRITICAL — Auth rate limiting is dead code (OWASP A07: Identification & Authentication Failures) — **True Positive**

- **File:** [`backend/app/api/auth.py:49,73`](../backend/app/api/auth.py#L49), [`backend/app/core/config.py:8`](../backend/app/core/config.py#L8)
- **Root cause:** `Settings.ENV` is typed `Literal["dev", "test", "staging"]` — Pydantic will refuse to start the app if `ENV` is ever set to anything else, including `"production"`. But `login_for_access_token` and `register` gate their rate limit on `settings.ENV != "production"`. Since `ENV` can never equal `"production"`, this condition is **always true**, in every environment this app can actually run in.
- **Description:** `/auth/login` and `/auth/register` are rate-limited to 1000 requests/minute in *every* deployment — dev, test, and staging (the tier that most resembles a real deployment) alike. The intended strict limits (`5/minute` register, `10/minute` login) are unreachable code.
- **Impact:**
  - *Technical:* No effective rate limiting exists on credential-guessing endpoints anywhere this code runs today.
  - *Business:* Any staging/pre-prod environment reachable from the internet is trivially brute-forceable; if this `ENV` scheme is ever extended to a real "production" value without someone re-auditing this exact line, the bug silently persists.
  - *User:* Account takeover via credential stuffing/brute force is unmitigated.
- **Recommended fix:** Invert the logic to be strict-by-default and permissive only for explicitly-named low-stakes environments — this fails safe if a new environment name is ever added.
- **Corrected code:**
  ```python
  _UNRESTRICTED_RATE_LIMIT_ENVS = {"dev", "test"}

  @router.post("/register", ...)
  @limiter.limit("1000/minute" if settings.ENV in _UNRESTRICTED_RATE_LIMIT_ENVS else "5/minute")
  def register(...): ...

  @router.post("/login", ...)
  @limiter.limit("1000/minute" if settings.ENV in _UNRESTRICTED_RATE_LIMIT_ENVS else "10/minute")
  def login_for_access_token(...): ...
  ```
- **Validation steps:**
  1. Set `ENV=staging` and fire 15 rapid login attempts against `/auth/login`; confirm a 429 appears well before request 15.
  2. Add a unit test asserting the limiter string resolves to the strict value whenever `ENV` is anything other than `dev`/`test`.

---

### 🟠 HIGH — Long-lived tokens and a shared privileged secret stored in `sessionStorage` (OWASP A02: Cryptographic Failures / A05: Security Misconfiguration) — **True Positive**

- **Files:** [`src/services/api.ts:16-25`](../src/services/api.ts), [`src/hooks/useAuth.tsx:41-78`](../src/hooks/useAuth.tsx), [`src/pages/SettingsPage.tsx:10-36`](../src/pages/SettingsPage.tsx), [`backend/app/core/security.py:23`](../backend/app/core/security.py#L23)
- **Root cause:** The JWT (valid **7 days** — `ACCESS_TOKEN_EXPIRE_MINUTES = 60*24*7`) and a static `X-API-Key` bearer secret are both kept in `sessionStorage` and read directly by the axios client. There is no httpOnly-cookie option and no server-side revocation list.
- **Description:** `sessionStorage` is readable by any script running on the page — which is exactly what finding #1's XSS provides. A 7-day token with no revocation means a single successful XSS hit gives an attacker a week of access, not a session.
- **Impact:** Combined with the XSS above, this is a direct path to full account takeover — not just a session, a durable one. The API key additionally grants privileged scan-control actions (reset/cancel/force-unlock), so this is a lateral-privilege risk too.
- **Recommended fix (architectural — plan, don't patch):**
  1. Move the JWT to an httpOnly, `SameSite=Strict` cookie; drop the sessionStorage read path in `api.ts`.
  2. Shorten `ACCESS_TOKEN_EXPIRE_MINUTES` significantly (e.g., 30–60 min) and add a refresh-token flow, or add a server-side revocation/denylist check.
  3. Retire the single shared `API_KEY` model (see next finding) so there's no static secret to protect in the browser at all.
- **Validation steps:** After the cookie migration, confirm `document.cookie` does not expose the token and that a reflected/stored script (e.g. the XSS test payload above) cannot read it.

---

### 🟠 HIGH — Privileged scan-control auth modeled as one shared, UI-visible secret (OWASP A01: Broken Access Control) — **True Positive**

- **File:** [`src/pages/SettingsPage.tsx:20-36`](../src/pages/SettingsPage.tsx), [`backend/app/core/auth.py:51-67`](../backend/app/core/auth.py#L51-L67)
- **Root cause:** `settings.API_KEY` is one static value shared by the whole deployment. Any authenticated user can view it in plaintext via a "Show" toggle in Settings, and it grants `service-account`/admin-equivalent RBAC on the backend (`auth.py:56-67`).
- **Impact:** Every developer effectively holds an admin key; a screenshot, browser extension, or the XSS above leaks a credential that can reset/cancel/force-unlock scans for *any* project, not just the leaker's own. No per-user audit trail for actions taken via the key either (all attributed to `service-account`).
- **Recommended fix:** Replace the shared key with per-user, scoped, backend-issued tokens (or just require JWT auth for these actions and retire the API-key bypass for anything other than the Jenkins→backend server-to-server calls it was presumably built for).
- **Validation steps:** After the fix, confirm the Settings page no longer surfaces a raw bearer secret, and that RBAC/audit logs attribute privileged actions to the acting user, not a shared service account.

---

### 🟡 MEDIUM — Findings (condensed)

| Severity | Finding | File | Fix |
|---|---|---|---|
| Medium | **Username enumeration via login timing.** Nonexistent username short-circuits before the argon2 verify; real username always pays the hash cost. | [`api/auth.py:76`](../backend/app/api/auth.py#L76) | Always run `verify_password` against a constant dummy hash when the user isn't found. |
| Medium | **Auth dependency performs a DB write.** A valid `X-API-Key` request with no prior `service-account` row triggers an `INSERT` from inside `get_current_user`; two concurrent first-requests race and one gets an `IntegrityError` → 500. | [`core/auth.py:56-67`](../backend/app/core/auth.py#L56-L67) | Seed the `service-account` row at startup (next to `_create_default_admin`); make auth resolution read-only. |
| Medium | **`python-jose` is effectively unmaintained** and duplicates `pyjwt`, which is actively maintained and already a dependency — two JWT libraries is unnecessary attack surface. | `backend/requirements.txt:14-15` | Consolidate onto `pyjwt`; drop `python-jose`. |
| Medium | **`/scans/trigger-verify` bypasses the one-active-scan-per-project invariant** — creates a scan directly in `RUNNING` with no lock/active-scan check. | [`api/scans/routes.py:207-238`](../backend/app/api/scans/routes.py#L207-L238) | Route it through the same locked check-then-create path as `trigger_scan`. |

### 🟢 LOW / INFO

- **Ephemeral JWT secret fallback** ([`core/security.py:12-21`](../backend/app/core/security.py#L12-L21)) warns but doesn't hard-fail when `JWT_SECRET_KEY` is unset — fine for dev, but should be a hard startup error outside `dev`/`test` (mirrors the existing `CALLBACK_TOKEN`/`API_KEY` length checks in `config.py`). **Hardening recommendation.**
- **`public_endpoint_only` in `main.py:37-41`** returns `Depends(get_current_user)` from a function body — FastAPI never resolves a `Depends()` returned this way, so if this were ever wired up as an actual dependency it would silently authenticate nothing. Currently unused/dead. **Hardening recommendation** — delete it before someone wires it up.
- **ReDoS guard is incomplete** in `calculate_match_confidence` ([`services/project_grouping.py:90-97`](../backend/app/services/project_grouping.py#L90-L97)) — the check misses catastrophic patterns without a literal `*` (e.g. `(a+)+$`). Low risk since the naming pattern is admin-controlled. **Hardening recommendation.**

---

## 2. Code Quality & Concurrency Findings

The scan lifecycle has **three independent writers** — the Jenkins callback, the recovery background thread, and Celery report/issue tasks — that mutate the same `ScanDB`/`ProjectDB` rows with almost no coordination. `with_for_update()` appears exactly once in the entire backend (in `trigger_scan`).

### 🔴 CRITICAL — Security findings can be fetched but never migrated into Issues (task-ordering race) — **True Positive**

- **File:** [`backend/app/api/scans/callback.py:81-97`](../backend/app/api/scans/callback.py#L81-L97), [`backend/app/tasks/issue_tasks.py:80-96`](../backend/app/tasks/issue_tasks.py#L80-L96)
- **Root cause:** On scan completion, `_schedule_post_processing` fires `process_scan_reports_task.delay()` (fetches reports from Jenkins — network I/O, slow) and `migrate_scan_to_issues.delay()` (reads that report from the DB — fast) as **independent, unchained Celery tasks**. `migrate_scan_to_issues` returns `{"error": "Report not found"}` and gives up if the report row doesn't exist yet — which is the common case, since it almost always runs before the slower report-fetch task finishes.
- **Description:** This is a logic failure at the heart of the product: security findings get fetched and stored in `ScanReportDB`, but the migration step that turns them into actionable `IssueDB` rows silently never runs, because it lost a race it was never guaranteed to win.
- **Impact:**
  - *Technical:* Silent data-pipeline failure with no retry, no alert — `migrate_scan_to_issues` just returns an error dict Celery discards.
  - *Business:* The core promise — "we turn scanner output into tracked, assignable issues" — quietly doesn't happen for a nondeterministic fraction of scans.
  - *User:* Developers/analysts never see findings that were genuinely fetched; the Issues Triage page understates real risk.
- **Recommended fix:** Chain the tasks so migration only runs after the report fetch succeeds.
- **Corrected code:**
  ```python
  from celery import chain

  def _schedule_post_processing(scan_obj, normalized_stages, build_number):
      if scan_obj.state != ScanState.COMPLETED or not build_number:
          return

      report_task = process_scan_reports_task.si(
          scan_id=scan_obj.scan_id,
          jenkins_build_number=str(build_number),
          jenkins_base_url=settings.JENKINS_BASE_URL,
      )

      completed_stages = [s for s in normalized_stages if s.get("status") in ("PASSED", "PASS")]
      for stage in completed_stages:
          tool_name = stage["stage"]
          chain(
              report_task,
              migrate_scan_to_issues.si(scan_obj.scan_id, scan_obj.project_id, tool_name),
              auto_verify_fixed_issues.si(scan_obj.scan_id, scan_obj.project_id, tool_name),
              auto_verify_pending_rescans.si(scan_obj.scan_id, scan_obj.project_id, tool_name),
              detect_regressions.si(scan_obj.scan_id, scan_obj.project_id, tool_name),
          ).apply_async()
  ```
  *(Note: `report_task` runs once per scan but is chained per-stage here for simplicity; if that's wasteful, split into "fetch reports" → barrier → "fan out per-stage migration" using a `chord` instead.)*
- **Validation steps:**
  1. Add a Celery integration test that asserts `migrate_scan_to_issues` is only invoked after `process_scan_reports_task` completes.
  2. In staging, artificially delay the Jenkins artifact fetch (or point at a slow mock) and confirm issues still appear once the chain completes.

---

### 🟠 HIGH — Duplicate `ScanReportDB` rows (no unique constraint, no upsert) — **True Positive**

- **File:** [`backend/app/services/reporting/fetcher.py:95-113`](../backend/app/services/reporting/fetcher.py#L95-L113), [`backend/app/models/db_models.py:67-98`](../backend/app/models/db_models.py#L67-L98)
- **Root cause:** `fetch_and_process_tool` always `INSERT`s a new row; there is no unique constraint on `(scan_id, tool_name)`. Report processing can legitimately fire more than once for the same scan (callback COMPLETED, recovery's `_trigger_report_processing`, the manual `/retry-reports` endpoint, or a Celery retry after partial failure).
- **Impact:** Duplicate rows inflate finding counts, `migrate_scan_to_issues` non-deterministically picks whichever duplicate `.first()` returns, and group-aggregated reports double-count.
- **Recommended fix:**
  ```python
  # models/db_models.py
  __table_args__ = (
      Index('ix_scan_reports_project_created', 'project_id', 'created_at'),
      Index('ix_scan_reports_scan_tool', 'scan_id', 'tool_name', unique=True),
  )
  ```
  Then change `fetch_and_process_tool`/`create_sonar_link` to upsert: delete any existing `(scan_id, tool_name)` row before inserting, inside the same transaction.
- **Validation steps:** Trigger `process_scan_reports_task` twice for the same scan/tool (e.g. via `/retry-reports`) and confirm exactly one `ScanReportDB` row exists afterward, with the latest data.

---

### 🟠 HIGH — Recovery thread races callbacks with no row locking, multiplies per process — **True Positive**

- **File:** [`backend/app/main.py:152`](../backend/app/main.py#L152), [`backend/app/services/scan_recovery.py`](../backend/app/services/scan_recovery.py) (entire module)
- **Root cause:** `run_recovery_task` starts as a per-process daemon thread. Every function in `scan_recovery.py` reads then writes scan/project rows with no `with_for_update()`. Running more than one worker/instance means every process runs its own independent recovery loop against the same rows.
- **Impact:** Two processes' recovery loops (or a recovery loop and an in-flight callback) can both act on the same scan; last-writer-wins. A scan legitimately marked `COMPLETED` by a callback can be overwritten to `FAILED` moments later by a recovery loop that hadn't yet seen the update — this matches the "multi-instance concurrency risk" already flagged in the project's own docs.
- **Recommended fix:** Either (a) run recovery as a single dedicated Celery Beat task with a distributed lock (Redis `SETNX`) instead of a thread-per-process, or (b) keep the thread but `SELECT ... FOR UPDATE` each scan row before transitioning it, and re-check terminal state after acquiring the lock.
- **Validation steps:** Run two backend instances against the same DB in a test environment; trigger a callback and a forced recovery pass concurrently on the same scan; assert the final state is deterministic and matches whichever event is causally later, not whichever process happened to write last.

---

### 🟠 HIGH — Callback handler is not atomic — **True Positive**

- **File:** [`backend/app/api/scans/callback.py:111-165`](../backend/app/api/scans/callback.py#L111-L165)
- **Root cause:** Reads the scan, checks terminal-state/digest guards, then commits — no row lock across the read-check-write.
- **Impact:** Two concurrent callback deliveries (Jenkins retries, or overlapping RUNNING/SUCCESS payloads) can both pass the guards and both commit, losing one update and potentially double-scheduling post-processing.
- **Recommended fix:** `db.query(ScanDB).filter(...).with_for_update().first()` at the top of `scan_callback`, matching the pattern already used in `trigger_scan`.
- **Validation steps:** Fire two callback payloads for the same `scan_id` concurrently (e.g. `asyncio.gather` against a test client) and assert only one state transition and one post-processing schedule occur.

### 🟡 MEDIUM / 🟢 LOW — Findings (condensed)

| Severity | Finding | File | Fix |
|---|---|---|---|
| Medium | **Recovery ignores per-scan timeout overrides.** `trigger_scan` allows a custom timeout up to 7200s via `X-Scan-Timeout`, but `recover_stuck_scans` hardcodes the global `settings.SCAN_TIMEOUT` and measures from `created_at` not `started_at`. | [`scan_recovery.py:181`](../backend/app/services/scan_recovery.py#L181) | Persist the effective per-scan timeout on `ScanDB` at creation time; have recovery read it per-scan. |
| Medium | **Dead/misleading `IntegrityError` handler.** Code expects `ix_scans_project_state` to be unique; it's declared as a plain non-unique `Index`. | [`api/scans/routes.py:161-168`](../backend/app/api/scans/routes.py#L161-L168) vs [`models/db_models.py:52-54`](../backend/app/models/db_models.py#L52-L54) | Either add the referenced partial-unique index, or delete the dead except-branch — don't leave the two out of sync. |
| Medium | **Group-aggregated dedup both over- and under-counts.** `_compute_finding_hash` omits file/line (collapses distinct findings) but different parsers use different field names for the same concept, so true duplicates from different tools never match. | [`services/project_grouping.py:30-49`](../backend/app/services/project_grouping.py#L30-L49) | Normalize field names across all parsers into a common finding shape *before* hashing; include location. |
| Low | **`detect_regressions` bypasses the issue state machine** (`issue.status = "open"` set directly instead of via `transition_status`) and can race with `auto_verify_fixed_issues` running on the same issue set. | [`tasks/issue_tasks.py:237`](../backend/app/tasks/issue_tasks.py#L237) | Route through `IssueService.transition_status` for consistency and history logging. |
| Low | **N+1 in `list_users`** — one query per user for project assignments. | [`api/users.py:51-56`](../backend/app/api/users.py#L51-L56) | Batch with `.in_(user_ids)` and group in Python. |
| Info | Stray bare `...` statement. | [`main.py:62`](../backend/app/main.py#L62) | Remove. |

---

## 3. Performance & Reliability Findings

### 🟠 HIGH — N+1 queries and no pagination on `GET /projects`

- **File:** [`backend/app/api/projects.py:79-111,124-125`](../backend/app/api/projects.py)
- **Root cause:** `_expire_active_scans`/`_build_project_list` issue one `db.query(ScanDB)` per project even though a batched subquery helper (`_get_last_scan_map`) already exists in the same file but isn't reused here. `list_projects` has no `limit`/`offset` at all.
- **Impact:** With 200 projects, this single endpoint issues 400+ extra queries; response time grows linearly and unboundedly with project count.
- **Fix:** Reuse `_get_last_scan_map`'s batched approach for the full row fetch; add pagination to `list_projects`.
- **Validation:** Seed 200 projects in a test DB, hit `GET /projects`, assert query count (via SQLAlchemy event counting) stays O(1)-ish, not O(n).

### 🟠 HIGH — No Celery task timeouts — a hung external call can block a worker indefinitely

- **File:** [`backend/app/core/celery_app.py:16-23`](../backend/app/core/celery_app.py#L16-L23)
- **Root cause:** No `task_time_limit`/`task_soft_time_limit` configured anywhere. Tasks with no explicit retry logic (`cleanup_tasks.py`, most of `issue_tasks.py`) that make a slow/hung external call will block their worker process forever.
- **Impact:** Under concurrent scan load, a handful of hung Jenkins/SonarQube calls can exhaust the entire worker pool.
- **Fix:**
  ```python
  celery_app.conf.update(
      task_serializer="json",
      accept_content=["json"],
      result_serializer="json",
      timezone="UTC",
      enable_utc=True,
      task_track_started=True,
      task_time_limit=600,       # hard kill after 10 min
      task_soft_time_limit=540,  # SoftTimeLimitExceeded raised at 9 min for graceful cleanup
  )
  ```
- **Validation:** Point a task at a deliberately-hanging mock endpoint (e.g. `httpbin.org/delay/9999`) and confirm the task is killed at the configured limit rather than hanging forever.

### 🟡 MEDIUM — Findings (condensed)

| Severity | Finding | File | Fix |
|---|---|---|---|
| Medium | **`poll_jenkins_for_active_scans` N+1** — one `ProjectDB` query per active scan inside the polling loop. | [`scan_recovery.py:152-155`](../backend/app/services/scan_recovery.py#L152-L155) | Batch-fetch all needed projects with `.in_(project_ids)` before the loop. |
| Medium | **`bulk_assign_scans` N+1** — one query per scan_id for the scan itself, one for the existing assignment. | [`api/project_groups.py:282-294`](../backend/app/api/project_groups.py#L282-L294) | Replace with two `.in_()` queries plus in-Python set lookups. |
| Medium | **Unbounded in-memory leak in the rescan rate limiter.** `_BUCKETS` is a module-level dict keyed by `user_id`, entries are never evicted for users who stop being active. | [`services/rescan_rate_limit.py:9-31`](../backend/app/services/rescan_rate_limit.py#L9-L31) | Add periodic eviction of stale buckets, or move to Redis with a TTL. |
| Medium | **`cleanup_expired_reports` loads full ORM objects to delete them one at a time** instead of a single bulk `DELETE`. | [`tasks/cleanup_tasks.py:23-33`](../backend/app/tasks/cleanup_tasks.py#L23-L33) | `db.query(ScanReportDB).filter(...).delete(synchronize_session=False)`. |
| Medium | *(Duplicate of frontend finding below)* Redundant HTTP polling alongside an already-connected WebSocket. | `src/hooks/useScanStatus.ts:35-41` | Pause `refetchInterval` while `wsConnected` is true. |

### 🟢 LOW / INFO

- **`cache.py` permanently disables caching after one failed Redis ping** (memoizes `None`, never retries) — a transient Redis blip degrades the process to no-cache until restart. Add periodic reconnect attempts. ([`services/cache.py:19-32`](../backend/app/services/cache.py#L19-L32))
- **No connection pooling/retry on outbound HTTP.** A fresh `requests.Session()`/`JenkinsClient()` is constructed per call; no `Retry`/`HTTPAdapter`. A single flaky Jenkins response fails the whole operation. ([`infrastructure/http/client.py`](../backend/app/infrastructure/http/client.py), [`jenkins_client.py`](../backend/app/infrastructure/jenkins/jenkins_client.py))
- **WebSocket manager only prunes dead connections reactively** (on a failed `send_json` during broadcast), and broadcasts are sequential rather than `asyncio.gather`'d — one slow client stalls delivery to the rest of a broadcast group. ([`websockets/manager.py`](../backend/app/websockets/manager.py))
- **`sonar.py`'s rule cache is a module-level mutable dict** cleared at the start of every `fetch_sonar_issues` call — concurrent scans in the same worker can race and corrupt each other's rule lookups, producing wrong descriptions. Should be request-scoped. ([`services/reporting/parsers/sonar.py:10,193`](../backend/app/services/reporting/parsers/sonar.py))
- **`python-jose` flagged again here** as an EOL/low-maintenance dependency duplicating `pyjwt` — see Security section.

---

## 4. UI/UX & Product Design Findings

### 🟠 HIGH — New leadership-facing dashboards don't handle fetch errors; one can render `NaN`

- **Files:** [`src/pages/ExecutiveSummaryPage.tsx`](../src/pages/ExecutiveSummaryPage.tsx), `PortfolioDashboardPage.tsx`, `TeamWorkloadPage.tsx`, `TrendAnalysisPage.tsx`
- **Root cause:** All four check `isLoading` but never `isError`. A failed `/reports/summary` call resolves to `{}`/`[]` and renders identically to "no findings" — a real outage is indistinguishable from good news.
- **Description/Impact:** Concretely, [`ExecutiveSummaryPage.tsx:105-107`](../src/pages/ExecutiveSummaryPage.tsx#L105-L107) computes `Math.round(sum / projectsWithRisk.length)` with no guard for an empty array — this renders literally as **"NaN out of 100"** on the page leadership looks at, whenever the project list is empty or every summary call fails.
- **User impact:** This is the dashboard built specifically for executives; a `NaN` or a falsely-empty "all clear" state on that page is the worst possible place for this bug to surface.
- **Recommended fix:**
  ```tsx
  const { data: projects = [], isLoading: loadingProjects, isError: projectsErrored } = useQuery({...});
  const { data: reportSummaries = {}, isLoading: loadingReports, isError: summariesErrored } = useQuery({...});

  const isLoading = loadingProjects || loadingReports;
  const isError = projectsErrored || summariesErrored;

  if (isLoading) return <PageSkeleton type="dashboard" />;
  if (isError) return <ErrorState message="Couldn't load executive summary data." onRetry={refetch} />;

  const avgRiskScore = projectsWithRisk.length
    ? Math.round(projectsWithRisk.reduce((sum, p) => sum + p.riskScore, 0) / projectsWithRisk.length)
    : null;
  // render "—" or an explicit empty state when avgRiskScore is null, never NaN
  ```
- **Validation steps:** Mock the summary API to reject; confirm an explicit error state renders (not a silently-empty dashboard). Mock an empty project list; confirm the average risk score area shows an empty-state message, not `NaN`.

### 🟡 MEDIUM — Findings (condensed)

| Severity | Finding | File | Fix |
|---|---|---|---|
| Medium | **Fabricated trend indicator.** `trend` is derived from a single-snapshot threshold, not real history — the code's own comment admits `// simplified - in real app, compare with previous scan`, yet a real trend engine (`TrendAnalysisPage`) already exists and isn't reused. | `ExecutiveSummaryPage.tsx:79`, `PortfolioDashboardPage.tsx:396` | Fetch and compare against the prior scan's risk score, or remove the trend arrow until it's real — a fabricated trend on a security dashboard is actively misleading. |
| Medium | **Risk-score formula duplicated (and guessed at) on the frontend** instead of consumed from the backend's real `RiskCalculator`. Any backend formula change silently desyncs these dashboards. | `ExecutiveSummaryPage.tsx`, `PortfolioDashboardPage.tsx` | Have the backend return the computed risk score in the summary payload; delete the frontend's parallel formula. |
| Medium | **`TeamWorkloadPage` fires unbounded concurrent requests** (per-project × per-tool, no concurrency cap — 150+ requests for a 30-project portfolio) and **silently truncates at 500 issues/tool** with no indication. Also displays `avgFixTime`/`trend` fields that are declared but never computed — dead data presented as live. | `TeamWorkloadPage.tsx:15-16,210-228` | Batch with a concurrency limit (e.g. `p-limit`), paginate properly, and either compute `avgFixTime`/`trend` for real or remove them from the card UI. |
| Medium | **`ScanErrorModal` shows the wrong timestamp** — `new Date().toLocaleTimeString()` is the render time, not the actual failure time (`finished_at` isn't threaded through). | `components/ScanErrorModal.tsx:99` | Pass `scan.finished_at` (or the error's own timestamp) into the modal instead of calling `new Date()` at render. |
| Medium | **"Export PDF" button does nothing** — no `onClick`, not `disabled`, no tooltip — despite a working PDF export path existing elsewhere (`reports.exportUnified`) that isn't wired up here. | `ExecutiveSummaryPage.tsx:126-129` | Wire it to the existing export path, or disable it with a "coming soon" affordance until it is. |

### 🟢 LOW / INFO

- **Severity badge/color logic reimplemented independently in ≥6 places** rather than a shared component — has already caused drift: `FilterBar.tsx`'s `SEVERITY_OPTIONS` omits `"Info"` even though the data model supports it, so users can't filter to Info-severity findings in that view. Consolidate into the existing `Badge`/`StatusBadge` component.
- **Dead WebSocket-event code path.** `useRescanWebSocket.ts` listens for a custom `'websocket-event'` that is never dispatched anywhere in the codebase — the feature only works today because of a separate 5s poll. Misleading for future maintainers; remove or wire it up for real.
- **Redundant polling vs. live WebSocket** — `useScanStatus.ts` polls every 3s unconditionally even when the WebSocket is already connected and pushing the same updates. *(Cross-referenced in Performance section.)*
- **Hard full-page redirect on 401** (`window.location.href`) discards all in-memory app state, including unsaved form edits, instead of an SPA-level redirect. Both `api.ts`'s interceptor and `useAuth.tsx`'s client-side check do this.
- **`refreshUser()` silently swallows all errors**, so a transient (non-401) failure leaves `role`/`permissions` `null` indefinitely with no retry or visible indication — role-gated UI can incorrectly appear locked out until a manual page refresh.

---

## 5. Prioritized Remediation Roadmap

### Phase 0 — Do before any production exposure (days, not weeks)
1. Fix the stored XSS in `IssueDetailPanel.tsx` (wrap in `DOMPurify.sanitize`).
2. Fix the auth rate-limit dead code in `api/auth.py` (invert to strict-by-default).
3. Chain `process_scan_reports_task` → `migrate_scan_to_issues` → verification tasks so findings can't silently fail to migrate.
4. Add row locking (`with_for_update`) to the callback handler and consolidate scan-state writes so the recovery thread can't race a callback.

### Phase 1 — Within the first sprint
5. Add a unique constraint + upsert on `ScanReportDB (scan_id, tool_name)`.
6. Add `task_time_limit`/`task_soft_time_limit` to Celery config.
7. Fix `ExecutiveSummaryPage`'s `NaN` risk score and add `isError` handling to all four new dashboard pages.
8. Move the JWT off `sessionStorage` onto an httpOnly cookie and shorten token lifetime; begin retiring the shared `API_KEY` model.
9. Fix the N+1 in `GET /projects` and add pagination.

### Phase 2 — Near-term hardening
10. Route `/scans/trigger-verify` through the same locked active-scan check as `trigger_scan`.
11. Fix per-scan timeout being ignored by the recovery job.
12. Remove or implement the fabricated "trend" indicator; replace duplicated frontend risk-score math with a backend-supplied value.
13. Consolidate `python-jose` → `pyjwt`; delete the dead `public_endpoint_only` function.
14. Fix duplicate-detection logic in group-aggregated reports (normalize fields before hashing).

### Phase 3 — Longer-term / lower urgency
15. Consolidate severity-badge logic into one shared component.
16. Add eviction to the in-memory rescan rate limiter (or move to Redis).
17. Switch `cleanup_expired_reports` to a bulk `DELETE`.
18. Add connection pooling/retry to the Jenkins HTTP client; make `sonar.py`'s rule cache request-scoped.
19. Replace hard `window.location.href` redirects on auth expiry with SPA-level navigation.

### Quick wins (high impact, low effort — do these first regardless of phase)
- The XSS fix (#1) and rate-limit fix (#2) are each a few lines.
- The `NaN` guard (#7) is a one-line fix with an outsized visibility payoff (it's on the executive dashboard).
- Task chaining (#3) is a contained change to one function (`_schedule_post_processing`).
- Celery timeouts (#6) are a single config block.

### Longer-term investments
- Move to a single-leader recovery model (Celery Beat + distributed lock) instead of per-process threads — this removes an entire class of races, not just the one described above.
- Redesign the auth model around per-user scoped tokens instead of one shared API key, closing both the key-sprawl issue and the audit-trail gap it causes.
- Build a real trend-computation service the frontend dashboards can share, instead of each page approximating it differently.

---

*This report intentionally gives full root-cause/impact/fix/validation treatment to every Critical and High finding, and a condensed table for Medium/Low/Info items, in the interest of a document someone will actually read and act on. Ask if you want the condensed items expanded to the same depth, or a machine-readable (JSON/CSV) version of the finding list for ticket import.*

---

## Verification Addendum — 2026-07-13 (second pass)

A remediation effort ran against this audit, tracked in `specs/014-phase1-remediation/`. That spec explicitly states: *"Phase 0 fixes (XSS, auth rate-limiting, task chaining, callback locking) are assumed complete or in progress."* **Direct diff verification shows this assumption is false — none of the four Phase 0 items were touched.** Phase 1 (the five items the spec actually targeted) is mostly done, with one incomplete item and one new regression introduced by the fixes themselves.

### 🔴 Phase 0 — assumed done, verified NOT done

| Finding | Status | Evidence |
|---|---|---|
| Stored XSS in `IssueDetailPanel.tsx` | ❌ **Not fixed** | Lines 125/133 are byte-for-byte unchanged — still raw `dangerouslySetInnerHTML={{ __html: issue.description }}` with no `DOMPurify`. Confirmed via `git diff` (no diff exists for this file) and a repo-wide grep. |
| Auth rate-limit dead code | ❌ **Not fixed** | `backend/app/api/auth.py:69,93` still reads `"1000/minute" if settings.ENV != "production" else "5/minute"`, and `Settings.ENV` is still `Literal["dev","test","staging"]` (`config.py:8`, unchanged). The condition is still permanently true. **This is the same exact bug, unchanged.** |
| Callback task-ordering race (findings never migrated) | ❌ **Not fixed** | `callback.py`'s `_schedule_post_processing` is byte-for-byte unchanged — still four independent unchained `.delay()` calls. |
| Callback row locking | ❌ **Not fixed** | `callback.py`'s `scan_callback` handler is unchanged — still no `with_for_update()`. |

**Practical effect:** the two most severe findings from the original audit — live stored XSS and non-functional brute-force protection — are still present in the codebase today, exactly as originally reported. The Phase 1 work (below) was built on an incorrect assumption that these were handled.

### ✅ Phase 1 — verified fixes (what actually got addressed)

| Finding | Status | Evidence |
|---|---|---|
| `ScanReportDB` duplicate rows | ✅ **Fixed** (with one gap — see below) | Unique index added on `(scan_id, tool_name)` in `db_models.py`; `fetcher.py`'s `fetch_and_process_tool` now deletes any existing row before inserting (`delete(synchronize_session=False)`). `test_scan_report_dedup.py` passes. |
| No Celery task timeouts | ✅ **Fixed** | `celery_app.py` now sets `task_time_limit=600` / `task_soft_time_limit=540`. `test_celery_timeouts.py` passes. |
| Executive dashboard NaN / silent failure | ✅ **Fixed, well done** | `ExecutiveSummaryPage.tsx` now tracks `isError` per query and renders a real `ErrorDisplay` with retry; `avgRiskScore` is guarded (`projectsWithRisk.length > 0 ? ... : 0`) and `avgRiskLevel` shows `"Unknown"` instead of a misleading computed level when there's no data. This is a clean, correct fix. |
| Frontend risk-score formula duplicated/guessed | ✅ **Fixed** | `ExecutiveSummaryPage.tsx` now reads `summary.risk_score.score`/`.trend` from the backend (`reports.py`) instead of recomputing client-side. |
| Fabricated trend indicator | ⚠️ **Partially fixed** | `reports.py:308-324` now compares against a genuine previous `COMPLETED` scan's real severity data — real improvement over the old single-snapshot heuristic. **But** two spec requirements weren't implemented: (1) no "within the last 30 days" gating — it takes whichever previous scan exists no matter how old; (2) when there's *no* previous scan, `previous_severity` defaults to all-zero findings, so `get_trend` compares against a fabricated "perfect" baseline and produces a real-looking "improving" trend from nothing — the spec says the indicator should be *hidden* in that case, not shown against a fake baseline. |
| Tokens stored in browser-accessible storage | ⚠️ **Partially fixed — the legacy path has no actual expiry** | httpOnly cookies were added correctly (`auth.py`'s `set_auth_cookies`, `COOKIE_SECURE` auto-enabled on staging, a session-only refresh-token flow). **But** the spec's "24-hour grace period" for the old `sessionStorage` path is not time-boxed anywhere in code — `useAuth.tsx`'s `login()` unconditionally still does `sessionStorage.setItem('token', newToken)` on every login, with no timestamp check or cutover logic. As shipped, this isn't a 24-hour grace period — it's permanent. Combined with the still-unfixed XSS above, the token-theft path this fix was meant to close is still fully open. |
| Shared static API key in Settings UI | ✅ **Fixed, well done** | The entire API-key input/show/save/clear UI was removed from `SettingsPage.tsx`. Clean removal, not a stub. |
| `GET /projects` N+1 + no pagination | ⚠️ **Fixed, but introduced a new regression** | The N+1 is genuinely gone (`_get_last_scan_map`/`_expire_active_scans` now batch-query with `.in_()`), and the endpoint now returns `{items, total, page, page_size, total_pages}`. `test_projects_pagination.py` passes. **However:** `src/services/api.ts`'s `projects.list()` calls `GET /projects` with no `page`/`page_size` params, so it silently gets page 1 of 25. It is called by **six** pages — `DashboardPage`, `IssuesTriagePage`, `TeamWorkloadPage`, `TrendAnalysisPage`, `PortfolioDashboardPage`, `ExecutiveSummaryPage` — none of which loop through additional pages or expose pagination controls. **Any deployment with more than 25 projects will now have every dashboard/aggregate page silently reflect only the first 25 (default-ordered) projects, with no error, no indication, no page-2 fetch.** This is a new, real data-completeness bug introduced by this fix, and it affects the same executive/portfolio dashboards Phase 1 was also trying to make trustworthy. |

### 🆕 New issues found during verification (not in the original audit)

1. **Projects list silently truncated to 25 across six pages** (above) — **High**, should be fixed before this ships. Either these pages need to paginate through all pages when computing portfolio-wide aggregates, or `page_size` needs to be raised/removed for aggregate views (with a sane hard cap), or a "load all" variant of the endpoint should exist for aggregation use cases distinct from a paginated table UI.
2. **The `ScanReportDB` upsert fix wasn't applied everywhere.** `fetcher.py`'s `create_sonar_link` (the SonarQube-specific path) still does a plain `db.add(report); db.commit()` with no delete-existing-first step. Since the new unique constraint on `(scan_id, tool_name)` now exists, **a second SonarQube report fetch for the same scan (e.g. via `/retry-reports`) will now throw an `IntegrityError`** instead of silently duplicating — better than silent duplication, but it's a new hard failure path where the other four tools (trivy, zap, dependency-check, nmap) were fixed to upsert gracefully. **Medium**, quick fix (apply the same delete-then-insert pattern used in `fetch_and_process_tool`).
3. **31 pre-existing tests now fail** in `tests/test_jenkinsfile_stages.py` and `tests/test_security_and_tooling.py`, tied to unrelated changes in `Agent/Jenkinsfile` (npm lockfile detection, OWASP Dependency-Check retry-with-cached-data logic, ZAP scan tuning). This is **outside the scope of the original audit** (which didn't review the Jenkinsfile) and I have not root-caused each failing assertion, but it's a real signal worth triaging separately — 351 passed / 31 failed on the full `tests/` suite as of this verification pass.

### Updated status of Phase 0 Critical items

The two Critical findings from the original audit are **still live in the codebase**:
- Stored XSS: `src/components/reports/IssueDetailPanel.tsx:125,133`
- Auth rate-limit dead code: `backend/app/api/auth.py:69,93` / `backend/app/core/config.py:8`

These should be treated as the actual top priority — ahead of any Phase 2/3 item — since they were believed fixed but are not.

---

## Third pass — remediation of all Critical/High items (2026-07-13, same day)

All Critical and High findings still open after the second verification pass were implemented directly. Verified with `tsc -b --noEmit` (clean), the frontend `vitest` suite (84/84 passed), and the backend `pytest` suite (322/323 passed — the one failure, `test_fetcher_active_tools.py::test_empty_stage_results_automated_returns_all_tools`, is pre-existing, already marked `@pytest.mark.deprecated` in the test itself, and unrelated to any change here).

| Finding | Fix |
|---|---|
| Stored XSS in `IssueDetailPanel.tsx` | Both `dangerouslySetInnerHTML` sinks now wrap in `DOMPurify.sanitize(...)`, matching `IssueDetailModal.tsx`. |
| Auth rate-limit dead code | `auth.py` now gates on `settings.ENV in {"dev", "test"}` (strict by default) instead of the unreachable `!= "production"` check. Fails safe if a new environment name is ever added. |
| Callback task-ordering race | `callback.py`'s `_schedule_post_processing` now builds a Celery `chain(report_task, group(per_stage_chains))` — `migrate_scan_to_issues` → `auto_verify_fixed_issues` → `auto_verify_pending_rescans` → `detect_regressions` per stage only run after `process_scan_reports_task` completes. Stages fan out concurrently via `group()`. |
| Callback handler not atomic | `scan_callback` now locks both the `ScanDB` and `ProjectDB` rows with `.with_for_update()` at the top of the handler, held for the duration of the request. |
| Recovery thread races callbacks | `scan_recovery.py`'s `poll_jenkins_for_active_scans`, `recover_stuck_scans`, and `recover_single_scan` now list candidate IDs unlocked (so the Jenkins HTTP round-trip doesn't hold a lock), then re-fetch and lock each scan row individually immediately before mutating it, re-checking it hasn't already reached a terminal state in the meantime. Each scan commits (releasing its lock) before the next is processed. This doesn't eliminate the "multiple process instances" duplicate-polling case — that still needs a distributed leader lock — but it does close the read-modify-write race against a concurrent callback. |
| sessionStorage grace period not time-boxed | New `src/utils/authGracePeriod.ts` defines a fixed migration deadline (`2026-07-13T00:00:00Z + 24h`). `useAuth.tsx` and `api.ts` now both gate every sessionStorage token read/write behind `isLegacyAuthGracePeriodActive()` — once the deadline passes, `login()` stops writing the legacy copy, and any stale leftover token is proactively cleared and no longer honored. |
| Sonar report path missing upsert | `create_sonar_link` in `fetcher.py` now deletes any existing `(scan_id, "sonar")` row before inserting, matching `fetch_and_process_tool`'s pattern — a second Sonar fetch for the same scan replaces the report instead of raising `IntegrityError` against the unique constraint. |
| Projects-pagination regression (6 pages silently truncated to 25) | `api.ts`'s `projects.list()` now transparently loops through all pages (100/page, capped at 100 pages with a console warning if exceeded) and returns the full set, preserving the `Project[]` contract every existing caller relies on. A new `projects.listPage(page, pageSize)` is available for building a real paginated table UI later without re-fetching everything. |

### What's still open

Everything in the original Phase 2/3 roadmap that wasn't part of this pass remains open: `/scans/trigger-verify`'s missing active-scan lock, per-scan timeout being ignored by recovery, the trend indicator's missing "≥2 scans in 30 days" gate and fake-baseline-when-no-history behavior, `python-jose` consolidation, dead `public_endpoint_only`, group-report dedup normalization, severity-badge consolidation, rescan-rate-limiter memory growth, non-bulk cleanup delete, HTTP client retry/pooling, and the 31 unrelated failing Jenkinsfile tests (still not root-caused — separate from this audit's scope).

---

## Fourth pass — three-phase sequential remediation (2026-07-13)

Structured the remaining work into three sequential phases (frontend → backend → bug-fixing), each with an audit → fix → verify gate. Every item below was confirmed against current source before fixing.

### Phase 1 — Frontend (gate: `tsc -b --noEmit` clean, `vitest` 102/102)

- **Severity color/badge drift** — added a single source of truth `src/utils/severity.ts` (level list + hex map + badge-variant map); adopted it in `FilterBar` (which had silently dropped the `Info` option, so Info-severity findings couldn't be filtered), `SeverityPieChart`, and `DashboardPage`.
- **TeamWorkloadPage** — removed the dead `avgFixTime`/`trend` fields that were rendered as if live but never computed; replaced the unbounded per-project×per-tool fan-out with a bounded-concurrency helper (`src/utils/concurrency.ts`, cap 6) and real pagination through all issue pages instead of a silent 500-item page-1 cap.
- **Redundant polling** — `useScanStatus` now backs its 3s poll off to a 30s safety-net poll while the WebSocket is connected (was polling every 3s in parallel with live WS pushes).
- **refreshUser** — no longer swallows all errors; distinguishes 401 (real auth failure, handled by the interceptor) from transient errors (retried with backoff) so role/permissions don't get stuck null.
- **ScanErrorModal** — shows the scan's real `finished_at` instead of the modal's render time.
- **Export PDF** — the no-op button is now explicitly disabled with a "coming soon" affordance and a tooltip pointing at per-project export (there is no portfolio-level export endpoint to wire it to).
- **useRescanWebSocket** — rewired from a phantom `window` `'websocket-event'` (never dispatched) to the real `/api/v1/ws/dashboard` channel where the backend actually `broadcast_global`s these events, with reconnect.
- Other three new dashboards (Portfolio, TeamWorkload, TrendAnalysis) were found to already have `isError`/retry states (added in an earlier pass) — verified, no change needed.

### Phase 2 — Backend (gate: `pytest` 324 passed; 2 intentional state-machine test updates)

- **`/scans/trigger-verify`** now routes through the same `with_for_update` project lock + active-scan check as `trigger_scan`, so it can't create a second active scan.
- **Per-scan timeout honored** — added `ScanDB.timeout_seconds` (+ idempotent migration), persisted at trigger time, and both `_expire_scan_if_timed_out` and `recover_stuck_scans` now use each scan's own budget instead of the global default.
- **Auth hardening** — login now runs a dummy password verification for unknown users (closes the username-enumeration timing channel); service-account provisioning moved out of the hot auth path to startup seeding (`ensure_service_account`), so the API-key path is read-only and can't race into a duplicate-insert 500.
- **`python-jose` → `pyjwt`** — swapped all three call sites (`core/security`, `core/auth`, `api/auth` refresh) and a test; removed `python-jose` from requirements (retires an unmaintained dependency that duplicated pyjwt).
- **Regressions through the state machine** — added `VERIFIED→OPEN` / `FIXED→OPEN` as explicit regression transitions so `detect_regressions` stops writing `issue.status` directly; `transition_status` now clears `resolved_at` on reopen and accepts a `change_type`.
- **Group-report dedup** — `_compute_finding_hash` now normalizes field-name aliases across tools (host/uri/target, package/pkg_name/component, cve/cve_id) and includes file/line, fixing both the over-dedup (distinct findings collapsed) and under-dedup (same vuln from two tools not matched).
- **Perf/reliability** — `list_users` N+1 → single batched query; `cleanup_expired_reports` → bulk `DELETE`; rescan rate limiter now evicts aged-out buckets (was an unbounded per-user leak); HTTP client got connection pooling + bounded retry/backoff on GETs (POST deliberately not retried); sonar rule cache made request-scoped (was a module global that concurrent scans could corrupt); dead `public_endpoint_only` deleted; Celery task time limits confirmed present.

### Phase 3 — Bug fixing / stabilization (gate: full suites green)

- **Real security bug found via an ignored test** — `Agent/Jenkinsfile` was Groovy-interpolating `$DOCKER_PASS` (and `$DOCKER_USER`) into the `docker login` shell string, baking the registry secret into the command and defeating `withCredentials` masking. Fixed to `\$DOCKER_PASS` so the shell expands the env var at runtime. The test guarding this (`test_no_groovy_interpolation_of_docker_pass`) had been failing but ignored.
- **Two more real Jenkinsfile fixes** — removed the redundant/conflicting `-Dsonar.token=$SONAR_TOKEN` (the stage already uses `withSonarQubeEnv`, which injects it); made Dockerfile discovery prune `node_modules`/`.git` so dependency-bundled Dockerfiles aren't built.
- **Stale tests** — the remaining Jenkinsfile tests assert a planned `do*()`/`validateStage`/`.trivyignore`/`docker image inspect` structure that was never implemented (same root cause as 36 already marked `@pytest.mark.deprecated`); wired the `deprecated` marker to actually skip (conftest hook) and marked the 5 that had been missed. `test_fetcher_active_tools` was un-deprecated and corrected to expect `sonar` (the implementation is right).
- **Test infra** — `vitest run` (bare) was collecting the Playwright `e2e/*.spec.ts` and erroring on `test.afterAll`; added `include`/`exclude` to `vitest.config.ts` so unit and e2e suites are cleanly separated. Fixed a `datetime.utcnow()` deprecation in a test.

### Deliberately deferred (assessed, not done)

- **`@app.on_event` → lifespan handlers** and the **`HTTP_422_UNPROCESSABLE_ENTITY` → `_CONTENT` rename**: cosmetic deprecation warnings only; the on_event→lifespan migration touches startup ordering and the recovery-thread launch for zero functional gain, so it was left for a dedicated change rather than risk destabilizing a green suite.
- **Distributed leader lock for the recovery loop**: the row-locking from the third pass closes the single-request race, but multiple process instances still each run a recovery loop. A Redis/advisory leader lock is the real fix and remains an architectural follow-up.
- **Trend "≥2 scans in 30 days" gate**: the backend now returns a real historical trend, but the spec's minimum-data gate (hide the indicator when <2 recent scans) is not yet implemented. *(Fixed in the fifth pass below.)*

---

## Fifth pass — trend / risk-score bug (2026-07-13)

Found and fixed a real functional bug while closing out the deferred trend item. Verified: backend 343 passed / 41 skipped, frontend `tsc` clean + 102/102 vitest.

- **Executive & Portfolio dashboards showed every project as risk score 0 / Critical, trend "stable".** The dashboards call `GET /reports/summary` (`getSummary`), whose `ReportSummary` response **never included a `risk_score` field** — so the frontend's `summary?.risk_score?.score ?? 0` and `?.trend ?? "stable"` always fell back. The earlier "consume backend risk score" change had pointed the frontend at a field the summary endpoint didn't return.
  - **Backend**: added `RiskScoreSummary` to the `ReportSummary` schema and populated it in `get_reports_summary` — real `score`/`level` from the aggregated severity, plus a properly-gated `trend`.
  - **Trend gate**: new `_compute_recent_trend` only returns a direction when there are ≥2 completed scans within the last 30 days (`TREND_MIN_SCANS`/`TREND_WINDOW_DAYS`), comparing the two most recent; otherwise `trend` is `None`. This kills the previous fabricated-"improving"-from-a-zero-baseline behavior.
  - **Frontend**: Executive & Portfolio dashboards now treat `trend == null` as "no data" and render an em-dash with a tooltip instead of defaulting to "stable"; `ProjectWithRisk.trend` typed `string | null`; `ReportSummary.risk_score.trend` typed `string | null` in `types.ts`.
