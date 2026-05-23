# Refined Implementation Plan: Professional Security Reports Dashboard

## Plan Accuracy Assessment

### What the original plan got WRONG

| Claim in Plan | Reality |
|---|---|
| `ScanReportDB` is **not defined** | **Already exists** in `backend/app/models/db_models.py` with all needed fields |
| Frontend is "partially functional" with only `ProjectReportsPage` | **`UnifiedReportPage.tsx` already exists** (320 lines) with risk score, pie chart, bar chart, trend chart, compliance, filter bar, finding modal |
| Need to add `recharts` dependency | **Already installed** (`recharts ^3.8.1` in `package.json`) |
| Need to build trend charts from scratch | **Already built** — `TrendLineChart.tsx`, `SeverityPieChart.tsx`, `ToolBarChart.tsx` exist |
| Need to build compliance dashboard | **Already built** in `UnifiedReportPage.tsx` |
| Need to build filterable findings table | **Already built** — `FilterBar.tsx` + findings table exist |

### What the original plan got RIGHT

- Export buttons exist but are broken (blob not converted to download)
- AI Validator exists but isn't wired into any endpoint
- Comparison mode selector is cosmetic (no actual diff logic)
- No navigation links to `UnifiedReportPage` from anywhere in the UI

---

## Actual Current State

### Backend — Working
- `ScanReportDB` model exists with correct schema
- All 9 report API endpoints functional
- `UnifiedReportGenerator` (HTML + PDF) works
- `ReportFetcher` with 6 tool parsers works
- `RiskCalculator`, `ComplianceMapper`, `AIValidator` all exist
- Celery task `process_scan_reports_task` triggers on scan completion

### Backend — Minor Issues
1. **Duplicate import** of `RiskCalculator` in `reporter.py` (lines 20, 23)
2. **`npm_audit` parser** exists but no Jenkins stage maps to it in `STAGE_TO_TOOL`
3. **`cleanup_tasks` module** not in `celery_app.py` `include` list — scheduled tasks may not be discovered
4. **Direct DB access** in `UnifiedReportGenerator.generate_risk_summary()` — opens its own `SessionLocal()` instead of receiving data as parameter
5. **Previous scan trend query** may return wrong "previous" if multiple tools reported for different scans

### Frontend — Working
- `ProjectReportsPage.tsx` (324 lines) — scan selector, severity cards, tool accordion, expandable findings
- `UnifiedReportPage.tsx` (320 lines) — risk score, charts (pie/bar/line), compliance, filter bar, finding modal, export buttons
- Chart components: `SeverityPieChart`, `ToolBarChart`, `TrendLineChart` — all working with recharts
- `FilterBar`, `FindingDetailModal`, `TableOfContents` components exist
- All 8 report API functions in `api.ts` wired correctly
- **Toast system** — `useToast` from `components/Toast` (used in 5 pages already)
- **Info severity color** — already defined: `Info: 'bg-slate-500 text-white'` (line 60 of ProjectReportsPage)

### Frontend — Real Issues
1. **No navigation to `UnifiedReportPage`** — not linked from anywhere. Only accessible by typing URL manually
2. **Export buttons broken** — `exportUnified()` returns a blob but `UnifiedReportPage` never creates a download link from it
3. **`TableOfContents` doesn't scroll** — clicking sections only updates state, no `scrollIntoView`
4. **Report type selector is cosmetic** — "technical/executive/compliance/comparison" doesn't filter or change data
5. **Duplicated types** — `ProjectReportsPage` redefines `SeveritySummary`, `ToolSummary`, `ReportSummary`, `Finding` instead of importing from `types.ts`
6. **No scan selector on `UnifiedReportPage`** — always fetches latest, can't pick a specific scan
7. **`afterEach` not imported** in `UnifiedReportPage.test.tsx`
8. **`info` severity card not rendered** in `ProjectReportsPage` summary cards (color exists, card doesn't)
9. **No empty states** — blank page when project has no scans
10. **No loading skeletons** — white flash while data loads

---

## Implementation Phases

### Phase 1: Fix broken export download (15 min)

**Problem:** Export buttons fire the API call but the user sees nothing happen.

**Files to modify:**
- `src/pages/UnifiedReportPage.tsx`

**Changes:**
```typescript
const handleExport = async (format: 'pdf' | 'html', reportType: string) => {
  setExporting(true);
  try {
    const blob = await api.reports.exportUnified(projectId, format, scanId, reportType);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `security-report-${projectName}-${scanId}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    addToast({ type: 'error', title: 'Export failed', message: 'Please try again.' });
  } finally {
    setExporting(false);
  }
};
```

**Verification:** Click "Export PDF" → browser downloads `security-report-{project}-{scan}.pdf`.

---

### Phase 2: Add navigation links (30 min)

**Problem:** Users can't discover the unified report page.

**Files to modify:**
- `src/pages/ProjectReportsPage.tsx` — add prominent "View Full Security Report →" button in header
- `src/pages/UnifiedReportPage.tsx` — add "Back to Detailed View" link in header
- `src/Layout.tsx` — verify sidebar NavLink routes are correct (no dual-module issue like scans.py/scans/)

**Verification:** From ProjectReportsPage → click button → lands on UnifiedReportPage. From UnifiedReportPage → click link → lands on ProjectReportsPage.

---

### Phase 3: Add scan selector to UnifiedReportPage (2 hrs)

**Problem:** Without a scan selector, admins can't compare scans — trends are useless.

**Files to modify:**
- `src/hooks/useScanHistory.ts` — **new file**, extract scan history logic
- `src/pages/ProjectReportsPage.tsx` — use shared hook
- `src/pages/UnifiedReportPage.tsx` — use shared hook + add dropdown

**Hook implementation:**
```typescript
export function useScanHistory(projectId: string) {
  const { data: scans } = useQuery({
    queryKey: ['scans', projectId],
    queryFn: () => api.scans.getHistory(projectId),
    select: (data) => data.filter((s: ScanInfo) => s.state === 'COMPLETED'),
  });
  return { scans, /* ... */ };
}
```

**Verification:** Select different scan from dropdown → unified report data updates. Trends chart reflects selected scan.

---

### Phase 4: Add info severity card (10 min)

**Problem:** Summary cards show Critical/High/Medium/Low but skip Info, making the breakdown look incomplete.

**Files to modify:**
- `src/pages/ProjectReportsPage.tsx` — add 5th summary card for `info` count

**Verification:** Info card displays with `bg-slate-500 text-white` styling (color already defined at line 60).

---

### Phase 5: Add empty states + loading skeletons (2 hrs)

**Problem:** Blank pages or crashed components when no data exists.

**Files to modify:**
- `src/pages/ProjectReportsPage.tsx`
- `src/pages/UnifiedReportPage.tsx`

**Changes:**
- **Empty state:** When `scans.length === 0`, show "No scans yet — trigger your first scan to see results" with a link to trigger a scan
- **Loading skeletons:** Show skeleton cards while `useQuery` is in `isLoading` state (before first data arrives)

**Verification:** New project → see friendly empty state. Slow network → see skeleton loaders, not white flash.

---

### Phase 6: Fix TOC scroll (30 min)

**Problem:** Clicking TableOfContents items does nothing visible.

**Files to modify:**
- `src/components/TableOfContents.tsx`
- `src/pages/UnifiedReportPage.tsx`

**Changes:**
- Add `ref` to each section in UnifiedReportPage
- Pass refs to TableOfContents
- On click → `ref.current?.scrollIntoView({ behavior: 'smooth' })`

**Verification:** Click TOC item → page smoothly scrolls to section.

---

### Phase 7: Clean up duplicated types (1 hr)

**Problem:** `ProjectReportsPage.tsx` defines types locally that already exist in `types.ts`.

**Files to modify:**
- `src/pages/ProjectReportsPage.tsx`
- `src/types.ts` (if any fields are missing)

**Changes:**
- Remove local type definitions from `ProjectReportsPage.tsx`
- Import from `../types` instead
- Verify all fields match (add missing fields to `types.ts` if needed)

**Verification:** `npm run build` passes with no type errors.

---

### Phase 8: Wire up AI Validator summary (3 hrs)

**Problem:** `AIValidator` exists but no endpoint exposes its output.

**Files to modify:**
- `backend/app/api/reports.py` — add new endpoint
- `src/pages/UnifiedReportPage.tsx` — display AI summary

**New endpoint:**
```
GET /projects/{project_id}/reports/ai-summary?scan_id=xxx
```
- Fetches top Critical/High findings for the scan
- Calls `AIValidator.generate_recommendation()` for each
- Returns a 2-3 sentence plain-English summary + per-finding fix suggestions
- Falls back gracefully if Ollama is unavailable (returns `{"available": false, "message": "..."}`)

**Frontend:**
- Show AI summary card below the risk score gauge
- Show inline "Suggested Fix" text in `FindingDetailModal`

**Verification:** With Ollama running → summary displays. Without Ollama → graceful fallback message.

---

### Phase 9: Backend code quality fixes (1 hr)

**Files to modify:**
- `backend/app/services/reporting/reporter.py` — remove duplicate `RiskCalculator` import
- `backend/app/services/reporting/fetcher.py` — verify `STAGE_TO_TOOL` mapping completeness
- `backend/app/core/celery_app.py` — add `"app.tasks.cleanup_tasks"` to `include` list
- `backend/app/api/reports.py` — use `ScanState.COMPLETED` instead of string `"COMPLETED"`

**Verification:** `pytest tests/` passes. Celery worker logs show cleanup tasks registered.

---

### Phase 10: Fix test issues (30 min)

**Files to modify:**
- `src/tests/pages/UnifiedReportPage.test.tsx` — add missing `afterEach` import
- Add tests for export download behavior, empty states, scan selector

**Verification:** `npx vitest run` passes.

---

## Priority Order

| # | Task | Effort | Why Now |
|---|------|--------|---------|
| 1 | **Fix export download** | 15 min | Broken feature, trivial fix |
| 2 | **Add navigation links** | 30 min | Nothing else matters if page is unreachable |
| 3 | **Add scan selector to UnifiedReportPage** | 2 hrs | Makes trends actually usable |
| 4 | **Add info severity card** | 10 min | Trivial, makes severity breakdown complete |
| 5 | **Add empty states + loading skeletons** | 2 hrs | Makes the whole app feel polished |
| 6 | **TOC scroll fix** | 30 min | UX polish |
| 7 | **Clean up duplicated types** | 1 hr | `npm run build` will thank you |
| 8 | **Wire AI summary** | 3 hrs | Nice feature, needs Ollama |
| 9 | **Backend code quality fixes** | 1 hr | Prevents future bugs |
| 10 | **Fix test issues** | 30 min | CI hygiene |

**Items 1–5 can realistically be done in a single afternoon.** That takes reports from "broken and hidden" to "polished and professional."

---

## What was REMOVED from original plan

- ~~Phase 1: Create ScanReportDB model~~ — **Already exists**
- ~~Phase 2: Security Score gauge~~ — **Already exists** in UnifiedReportPage
- ~~Phase 3: Filterable findings table~~ — **Already exists** with FilterBar component
- ~~Phase 4: Install recharts + build trend charts~~ — **Already exists**, recharts installed
- ~~Phase 5: Compliance dashboard~~ — **Already exists** in UnifiedReportPage
- ~~Phase 8: Comparison mode~~ — Backend supports it via export. Frontend comparison tab would be a new feature, not a fix. Defer to future iteration.

---

## Key Architectural Notes

1. **Two report pages serve different purposes:**
   - `ProjectReportsPage` = per-tool breakdown, scan-by-scan detail (the "raw data" view)
   - `UnifiedReportPage` = aggregated view, charts, compliance, export (the "executive" view)
   - Both should be accessible and cross-linked

2. **No new backend endpoints needed for Phases 1-7** — all data is already served. The gap is frontend UX.

3. **PDF generation stays server-side** — `reportlab` works. Don't move PDF to client.

4. **Keep existing components** — `SeverityPieChart`, `ToolBarChart`, `TrendLineChart`, `FilterBar`, `FindingDetailModal`, `Toast` all work. Reuse, don't rewrite.

5. **Toast system already exists** — `useToast` from `components/Toast` is used in 5 pages. Use it for export errors and other user feedback.

---

## Post-Implementation: E2E Walkthrough

After items 1-5 are complete, do a real end-to-end walkthrough as an admin:

1. Trigger a scan → wait for completion
2. Open ProjectReportsPage → verify data loads, no white flash
3. Click "View Full Security Report" → verify navigation works
4. Select different scans → verify data updates
5. Click Export PDF → verify file downloads with meaningful name
6. Check empty state on a project with no scans

This will catch awkward loading states, confusing labels, missing data in edge cases — things no plan document will surface.

---

## Implementation Log

### Completed: Phases 1-5

| Phase | Status | Files Changed | Verification |
|-------|--------|--------------|--------------|
| 1. Fix export download | ✅ | `UnifiedReportPage.tsx` | TypeScript passes, blob download + toast error + loading state |
| 2. Add navigation links | ✅ | `ProjectReportsPage.tsx`, `UnifiedReportPage.tsx` | TypeScript passes, bidirectional nav buttons |
| 3. Scan selector + hook | ✅ | `useScanHistory.ts` (new), `UnifiedReportPage.tsx` | TypeScript passes, scan dropdown filters COMPLETED scans |
| 4. Info severity card | ✅ | `ProjectReportsPage.tsx`, `UnifiedReportPage.tsx` | TypeScript passes, 5-card grid on both pages |
| 5. Empty states + skeletons | ✅ | `ProjectReportsPage.tsx`, `UnifiedReportPage.tsx` | TypeScript passes, skeleton loaders + "No scans yet" state |
| Test fix | ✅ | `UnifiedReportPage.test.tsx` | Added ToastProvider + QueryClientProvider + mock scan history |

### Build & Test Results
- `npm run build` — ✅ passes (8.76s)
- `npx tsc -b --noEmit` — ✅ passes (0 errors)
- `npx vitest run` — 8/11 test files pass (all report-related tests pass; 3 pre-existing failures in DashboardSearch, LoginPage, ManualScanPage)

### Remaining Phases
| Phase | Status | Notes |
|-------|--------|-------|
| 6. TOC scroll fix | ⏳ Pending | Medium priority UX polish |
| 7. Clean up duplicated types | ⏳ Pending | Remove local types from ProjectReportsPage |
| 8. Wire AI summary | ⏳ Pending | Needs Ollama, new backend endpoint |
| 9. Backend code quality | ⏳ Pending | Duplicate imports, celery config |
| 10. Fix test issues | ⏳ Partial | UnifiedReportPage test fixed; others pre-existing |
