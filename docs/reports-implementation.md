> **⚠️ SUPERSEDED — see `docs/reports-implementation-refined.md`.**
> This plan's "Current State" section is factually stale (e.g. claims `ScanReportDB`
> doesn't exist, claims the frontend only has `ProjectReportsPage.tsx`) — the refined
> doc is an explicit correction pass with a "What the original plan got WRONG" table.
> Kept for history; don't build against the claims in this file (finding #29).

# Implementation Plan: Professional Security Reports Dashboard

## Current State

### What already exists

**Backend (fully functional pipeline):**
- `SecurityFinding` dataclass — severity (Critical/High/Medium/Low/Info), CVE, host, port, package, recommendation, raw_evidence
- `RiskCalculator` — 0-100 score with trend (`improving`/`stable`/`worsening`) and risk level
- `ComplianceMapper` — maps findings → OWASP Top 10 2021 + CWE Top 25
- `UnifiedReportGenerator` — HTML + PDF generation (4 types: technical, executive, compliance, comparison)
- `ReportFetcher` — fetches reports from Jenkins artifacts, parses with 7 tool-specific parsers
- `AIValidator` — Ollama-based false-positive validation + fix recommendations
- `/api/v1/reports` — full API: summary, detail, trends, compliance, unified, export
- `severityColors` and tool icons already defined in frontend

**Frontend (partially functional):**
- `ProjectReportsPage.tsx` — severity cards, tool accordions, expandable findings, scan selector
- `api.ts` — all report endpoints wired (summary, getAll, getOne, download, getUnified, getTrends, getCompliance, exportUnified)

**API endpoints (all exist):**
- `GET /projects/{id}/reports/summary` — aggregated severity counts
- `GET /projects/{id}/reports` — per-tool detail list
- `GET /projects/{id}/reports/unified` — combined findings + risk score
- `GET /projects/{id}/reports/trends` — severity trends over time
- `GET /projects/{id}/reports/compliance` — OWASP/CWE mapping
- `GET /projects/{id}/reports/unified/export` — HTML/PDF download
- `GET /reports/{id}` — single report detail
- `GET /reports/{id}/download` — raw JSON download
- `DELETE /reports/{id}` — delete report

### Critical blocker

`ScanReportDB` is imported and used in `reports.py`, `fetcher.py`, and `reporter.py` but **is not defined** in `backend/app/models/db_models.py`. The table doesn't exist in the DB. All report endpoints will fail.

### What's missing (the blueprint)

1. **Security Score display** — backend computes it, frontend doesn't show it
2. **Severity system** — backend has it, but frontend doesn't use the color scheme consistently
3. **Trend charts** — backend `/trends` endpoint exists, frontend never calls it
4. **Compliance dashboard** — backend `/compliance` endpoint exists, frontend never calls it
5. **Export button** — backend `/export` endpoint exists, frontend has no trigger
6. **AI summary** — `AIValidator` exists but isn't wired into any endpoint
7. **ScanReportDB model** — must be created for any of this to work

---

## Implementation Phases

### Phase 1: Fix the blocker — ScanReportDB model + DB migration

**Files to modify:**
- `backend/app/models/db_models.py` — add ScanReportDB model

**Model definition:**

```python
class ScanReportDB(Base):
    __tablename__ = "scan_reports"

    id = Column(Integer, primary_key=True, index=True)
    scan_id = Column(String, index=True, nullable=False)
    project_id = Column(String, index=True, nullable=False)
    tool_name = Column(String, nullable=False)
    severity_summary = Column(JSON, default=dict)
    findings = Column(JSON, default=list)
    raw_report = Column(String, nullable=True)
    report_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    expires_at = Column(DateTime, nullable=True)
```

**Verification:** Start backend, confirm table creates at startup, hit `/api/v1/reports/projects/test/reports/summary` returns `404` (not `500`).

---

### Phase 2: Headline Zone — Security Score + severity breakdown on existing Reports page

**Goal:** Transform the existing `ProjectReportsPage` top section into the "Headline Zone" from the blueprint.

**Files to modify:**
- `src/pages/ProjectReportsPage.tsx` — add Security Score gauge, risk badge, severity delta
- `src/services/api.ts` — no changes (unified endpoint already returns risk_score)

**What to add:**

1. **Security Score gauge** — call `api.reports.getUnified(projectId, scanId)`, display `risk_score.score` as a circular gauge (0-100). Color zones:
   - 80-100: green ("Low Risk")
   - 60-79: yellow ("Medium Risk")
   - 40-59: orange ("High Risk")
   - 0-39: red ("Critical Risk")

2. **Risk badge** — show `risk_score.level` + `risk_score.trend` (↑ improving / → stable / ↓ worsening)

3. **Severity delta cards** — show current counts with +/- vs previous scan (data already in `risk_score.previous_score`)

4. **Scan metadata** — project name, scan date, scan mode, target

**Design pattern:** All existing Tailwind classes. One key number per card. No new dependencies.

---

### Phase 3: Detail Table — Filterable findings with severity sort

**Goal:** Replace the tool accordion pattern with a filterable, sortable detail table.

**Files to modify:**
- `src/pages/ProjectReportsPage.tsx` — add filter bar + findings table

**What to add:**

1. **Filter bar** — severity filter (Critical/High/Medium/Low/Info), tool filter, search
2. **Findings table** — columns: severity badge, title, tool, host/package, recommendation (expandable row)
3. **Sorting** — default by severity (Critical first)

**Implementation note:** All data is already loaded from `api.reports.getAll()`. Just needs UI transformation. Use `useMemo` for filtering/sorting.

---

### Phase 4: Trends — Chart.js line + bar charts

**Goal:** Show historical security trends at the bottom of the Reports page.

**New dependency:**
- `recharts` (lightweight, React-compatible, already popular)

**Files to modify:**
- `package.json` — add `recharts` dependency
- `src/pages/ProjectReportsPage.tsx` — add trends section

**What to add:**

1. **Line chart** — Security Score over time (data from `/trends`)
2. **Bar chart** — vulnerability count per scan by severity
3. **"Fixed since last scan"** counter — `(previous total) - (current total)` when positive

---

### Phase 5: Compliance Dashboard

**Goal:** OWASP Top 10 + CWE Top 25 mapping as a separate tab or section.

**Files to modify:**
- `src/pages/ProjectReportsPage.tsx` — add compliance tab/section
- `src/services/api.ts` — no changes (`getCompliance` already exists)

**What to add:**

1. **OWASP Top 10 table** — category, name, finding count, color-coded pass/fail
2. **CWE Top 25 table** — CWE ID, count of matches
3. **Compliance score** — percentage of OWASP categories with zero findings

---

### Phase 6: Export button + PDF improvements

**Goal:** Make PDF export accessible from the UI, polish the generated PDF.

**Files to modify:**
- `src/pages/ProjectReportsPage.tsx` — add "Export PDF" / "Export HTML" buttons
- `backend/app/services/reporting/reporter.py` — improve PDF layout (cover page, TOC, page numbers, footer)
- `backend/app/api/reports.py` — add `scan_type` and `project_name` to export

**Frontend changes:**
- Add a dropdown button: "Export → PDF | HTML"
- Call `api.reports.exportUnified(projectId, format, scanId, reportType)` — response is a blob download
- Supported report types: `technical`, `executive`, `compliance`, `comparison`

**Backend PDF improvements (reporter.py):**
- Add cover page with project name, scan date, score badge
- Add executive summary section
- Add page numbers + footer (Scan ID, date)
- Sort findings by severity (Critical → Info)

---

### Phase 7: AI Summary + Fix Suggestions (Optional — depends on Ollama)

**Goal:** Show an AI-generated 2-3 sentence summary and per-finding fix suggestions.

**Files to modify:**
- `backend/app/api/reports.py` — add `/projects/{id}/reports/ai-summary` endpoint
- `src/pages/ProjectReportsPage.tsx` — display AI summary at top of report

**New endpoint:**
```
GET /projects/{id}/reports/ai-summary?scan_id=xxx
```
Calls `AIValidator.generate_recommendation()` for top Critical/High findings, then generates a 2-3 sentence plain-English summary.

**Frontend:**
- Show AI summary card below the score gauge
- Show inline "Suggested Fix" badge on each finding row

**Caveat:** Requires Ollama running locally. Falls back gracefully if unavailable.

---

### Phase 8: Comparison Mode

**Goal:** Let admins compare two scans side by side.

**Files to modify:**
- `src/pages/ProjectReportsPage.tsx` — add comparison tab
- `src/services/api.ts` — no changes (`exportUnified` with `report_type=comparison` already exists)

**What to add:**
1. **Two-scan picker** — dropdown to select Scan A and Scan B
2. **Diff table** — new findings, resolved findings, unchanged findings
3. **Export comparison report** — call `exportUnified` with `report_type=comparison`

---

## Implementation Order

| Step | Phase | Effort | Dependencies |
|------|-------|--------|-------------|
| 1 | ScanReportDB model | S | None (blocker) |
| 2 | Security Score + headline | M | Step 1 |
| 3 | Filterable findings table | M | Step 1 |
| 4 | Trend charts | M | Step 1 + recharts |
| 5 | Compliance dashboard | S | Step 1 |
| 6 | Export button + PDF polish | M | Steps 2-3 |
| 7 | AI summary | S | Ollama setup |
| 8 | Comparison mode | M | Steps 2-3 |

**Recommended first 3 steps:** 1 → 2 → 3 (fix blocker, then highest-visual-impact changes)

---

## Key Architectural Decisions

1. **No new backend endpoints needed for Phases 2-5** — all data is already served by existing endpoints. The frontend just needs to call them.

2. **Frontend-only for Phases 2-5** — the backend already has risk_score, trends, compliance, and export. The gap is the frontend not consuming them.

3. **Phase 1 (ScanReportDB) is a hard blocker** — nothing works without the DB table.

4. **Severity is already normalized** — `base.py` has `normalize_severity()` and `SEVERITY_LEVELS`. The 5-tier system (Critical/High/Medium/Low/Info) with colors is defined in both backend and frontend. No new severity system needed.

5. **recharts over chart.js** — lighter bundle, React-native API, already supports line/bar/pie. No D3 complexity.

6. **Keep existing `ProjectReportsPage.tsx`** — it's 324 lines of working code. Add sections to it rather than rewriting. Use tabs or sections to organize Headline → Detail → Trends → Compliance.

7. **PDF generation stays server-side** — `reportlab` is already a dependency. Don't move PDF to the client.