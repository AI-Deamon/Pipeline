# Stage-Filtered Report Fetching Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Only fetch/parse reports for stages that actually ran (PASS/FAIL), skipping reports for stages that were SKIPPED or not selected in manual mode.

**Architecture:** Pass stage context (stage_results, selected_stages, scan_mode) from the Celery task through to the fetcher. Add a stage-to-tool mapping and filter the tool list before fetching artifacts.

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy

---

### Task 1: Update fetcher.py — add stage-to-tool mapping and filtering

**Files:**
- Modify: `backend/app/services/reporting/fetcher.py`

**Changes:**

1. Add `STAGE_TO_TOOL` mapping after `TOOL_PARSERS`:

```python
STAGE_TO_TOOL = {
    "nmap_scan": "nmap",
    "zap_scan": "zap",
    "trivy_fs_scan": "trivy_fs",
    "trivy_image_scan": "trivy_image",
    "dependency_check": "dependency_check",
    "sonar_scanner": "sonar",
}
```

2. Update `fetch_all_reports` signature to accept `stage_results`, `selected_stages`, `scan_mode`:

```python
async def fetch_all_reports(
    self,
    scan_id: str,
    project_id: str,
    sonar_key: Optional[str] = None,
    stage_results: Optional[list] = None,
    selected_stages: Optional[list] = None,
    scan_mode: Optional[str] = None,
) -> List[ScanReportDB]:
```

3. Add filtering logic at start of `fetch_all_reports`:

   - If `stage_results` provided, build a set of stage IDs whose status is PASS or FAIL
   - If `selected_stages` provided (manual mode), intersect with that set (only selected stages that also passed/failed)
   - If no `stage_results` provided, fetch all (backward compatible)
   - Filter `tool_files` list to only include entries whose stage is in the active set

4. Also filter sonar processing (line 177-180) using same logic

5. Update `process_scan_reports()` function signature to pass new params through

**Step: Write code**

After changes, `fetch_all_reports` will:
1. Compute `active_stages` set from stage_results (status in {PASS, FAIL})
2. If manual + selected_stages: intersect to get only selected stages that ran
3. Filter tool_files to only entries whose stage maps to an active stage
4. Skip sonar if sonar_scanner stage not in active set
5. Fall back to all tools if stage_results not provided (backward compat)

---

### Task 2: Update report_tasks.py — pass stage context to fetcher

**Files:**
- Modify: `backend/app/tasks/report_tasks.py`

**Changes:**

1. After loading `scan_obj`, extract `stage_results`, `selected_stages`, `scan_mode`:

```python
stage_results = scan_obj.stage_results or []
selected_stages = scan_obj.selected_stages or []
scan_mode = scan_obj.scan_mode or "automated"
```

2. Pass them to `process_scan_reports()`:

```python
reports = asyncio.run(
    process_scan_reports(
        scan_id=scan_id,
        project_id=scan_obj.project_id,
        jenkins_base_url=jenkins_base_url,
        jenkins_build_number=jenkins_build_number,
        sonar_key=sonar_key,
        stage_results=stage_results,
        selected_stages=selected_stages,
        scan_mode=scan_mode,
    )
)
```

---

### Verification

1. Run backend tests: `pytest tests/`
2. Manual scenario trace:
   - Automated scan: all stages run → stage_results has all 10 stages → fetcher fetches all 7 tools with PASS/FAIL → all reports shown
   - Manual scan (nmap + zap only): stage_results has 2 stages + 8 SKIPPED → fetcher only tries nmap and zap → only those reports shown
   - All stages SKIPPED: stage_results all SKIPPED → fetcher fetches nothing → 0 reports shown
