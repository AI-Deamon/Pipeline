# TODO: Security Scanning Pipeline - Issues and Fixes

## Completed Fixes

### 1. Test Infrastructure Fixes ✅
- Fixed `test_integration.py` - Uses SQLAlchemy with database fixtures
- Fixed `test_scan_hardening.py` - Uses SQLAlchemy with proper fixtures  
- Fixed `test_callback_project_state_sync.py` - Uses SQLAlchemy with proper fixtures
- Added proper Celery task mocking to avoid Redis connection issues

### 2. Environment Configuration ✅
- Tests now work with `.env.test` environment variables
- Proper database setup/teardown for each test

### 3. Issues Fixed in Tests
- Removed references to non-existent in-memory stores (`projects_db`, `scans_db`)
- Added proper database fixtures with create/drop tables
- Mocked Celery tasks to avoid Redis dependency
- Fixed callback token header requirements

## Issues Identified in Production Code

### 1. Project State Sync on Jenkins Failure ❌
**File:** `backend/app/tasks/jenkins_tasks.py`

**Issue:** When Jenkins trigger fails, the scan is marked as FAILED but the project's `last_scan_state` is NOT updated.

**Fix needed:** In the `trigger_jenkins_scan_async` task, when `not accepted`, also update the project's `last_scan_state`:

```python
# Add this code when Jenkins fails:
project_obj = db.query(ProjectDB).filter(ProjectDB.project_id == scan_obj.project_id).first()
if project_obj:
    project_obj.last_scan_state = ScanState.FAILED.value
```

### 2. Race Conditions with Async Scan States ⚠️
**Files:** `backend/app/api/scans.py`, `backend/app/tasks/jenkins_tasks.py`

**Issue:** There's a timing issue between when scan is created (QUEUED) and when Celery task updates it to RUNNING.

**Current behavior:**
1. API creates scan with state=QUEUED
2. API returns response  
3. Celery task runs and updates to RUNNING
4. But client may query before step 3 completes

**Fix options:**
- Return RUNNING immediately from API (optimistic update)
- Or add WebSocket for real-time updates

### 3. Test Isolation Issues ⚠️
The tests sometimes fail when run together but pass individually. This is due to database state not being fully cleaned between tests.

## UX/Frontend Issues (Reports pages)

Found during the Reports tab redesign (2026-08-25) — via manual code review plus a
guideline pass against `ui-ux-pro-max` skill's UX checklist. Not yet fixed unless noted.

### 1. Report Type dropdown is non-functional ✅
**File:** `src/pages/UnifiedReportPage.tsx:207-216`

**Issue:** The "Technical / Executive Summary / Compliance / Comparison" dropdown looks
like a view switcher but `reportType` is only read inside `handleExport` — picking a
different option never changes the on-screen report.

**Fix needed:** Either make it switch the visible report content, or relabel/move it as
"Export format" so it stops implying a view change it doesn't perform.

**Fixed:** see Task 1 in docs/superpowers/plans/2026-09-15-reports-ux-remaining-fixes.md

### 2. Table of Contents never scrolls, and its highlight never syncs to scroll position ✅
**File:** `src/components/TableOfContents.tsx:7`, `src/pages/UnifiedReportPage.tsx:30, 261-262`

**Issue:** Two compounding problems, confirmed independently three times (manual review,
the `auditing-workflows` skill test, and a separate senior-dev-style audit): (1)
`onSectionClick` only calls `setCurrentSection`, which updates which link is highlighted —
it never calls `scrollIntoView`, so clicking a TOC entry doesn't move the viewport. (2)
`currentSection` is initialized to `'Summary'` and only ever changed by that same click
handler — there's no `IntersectionObserver`/scroll listener anywhere in the page, so even
if the user scrolls manually, the highlight stays stuck on "Summary" regardless of actual
position. The TOC is fully decorative in both directions.

**Fix needed:** Have `onSectionClick` scroll the matching section id into view
(`behavior: 'smooth'`), AND add an `IntersectionObserver` over the section elements to keep
`currentSection` in sync with true scroll position.

**Fixed:** see Task 2 in docs/superpowers/plans/2026-09-15-reports-ux-remaining-fixes.md

### 3. Executive Summary project rows look clickable but aren't ✅
**File:** `src/pages/ExecutiveSummaryPage.tsx:272`

**Issue:** Table rows have a hover background and show risk score/trend/findings per
project — every visual cue of a drill-down row — but there's no `onClick`/`Link`. From
the one page built for leadership, there's no way to click through to a project's actual
report.

**Fix needed:** Link each row to `/projects/{project_id}/reports` (or the unified report).

**Fixed:** see Task 3 in docs/superpowers/plans/2026-09-15-reports-ux-remaining-fixes.md

### 4. Inconsistent report naming/IA ✅
**Files:** `ProjectReportsPage.tsx`, `UnifiedReportPage.tsx`, `ExecutiveSummaryPage.tsx`,
`ProjectReportLayout.tsx`

**Issue:** Five different labels ("Scan Report", "Security Report", "Executive Summary",
"Developer View", "Unified Report") for report variants that all cover similar ground,
with no breadcrumb/tab showing which one you're in or how they relate.

**Fix needed:** Consolidate naming or add a small "you are here" indicator among the
report variants.

**Fixed:** see Task 17 in docs/superpowers/plans/2026-09-15-reports-ux-remaining-fixes.md

### 5. Selected finding not highlighted in the underlying list ✅
**Files:** `src/components/reports/FindingsTable.tsx`, `src/pages/UnifiedReportPage.tsx`

**Issue:** Since findings now open in a docked side panel instead of a modal (see below),
the list stays visible behind it — but the currently-open row isn't visually marked, so
users lose track of where they are in a long list.

**Fix needed:** Apply an active-row style keyed on `selectedFinding`.

**Fixed:** see Task 13 in docs/superpowers/plans/2026-09-15-reports-ux-remaining-fixes.md

### 6. Filter/search inputs have no accessible label ✅
**Files:** `src/components/reports/FindingsTable.tsx:200-206`,
`src/pages/UnifiedReportPage.tsx` (report-type/scan `<select>`s),
`src/pages/ProjectReportsPage.tsx` (scan `<select>`)

**Issue:** Confirmed via the ui-ux-pro-max "Form Labels" guideline (inputs need an
associated label, not just a placeholder): the findings search box and the tool/scan/
report-type `<select>` elements have no `<label>` or `aria-label`. Screen reader users get
no announced purpose for these controls.

**Fix needed:** Add `aria-label` to each (e.g. `aria-label="Search findings"`,
`aria-label="Filter by tool"`, `aria-label="Select scan"`).

**Fixed:** see Task 9 in docs/superpowers/plans/2026-09-15-reports-ux-remaining-fixes.md

### 7. No URL/deep-link state for filters or open finding ✅
**Files:** `src/components/reports/FindingsTable.tsx`, `src/pages/UnifiedReportPage.tsx`

**Issue:** Search text, severity/tool filters, and the currently-open finding all live in
local component state only — not reflected in the URL. Two consequences: (1) a link to a
specific finding/filter state can't be shared or bookmarked, and (2) the browser Back
button doesn't close the open side panel — it navigates away from the report entirely,
violating the "Back Button should work predictably" guideline.

**Fix needed:** Lower priority than 1-3. If pursued, mirror filters/selected finding into
`useSearchParams` so Back closes the panel first and state is shareable.

**Fixed:** see Task 12 (partial) and Task 14 in docs/superpowers/plans/2026-09-15-reports-ux-remaining-fixes.md

## Reports workflow suggestions (not bugs — process/flow gaps)

Found by tracing an actual triage session end-to-end rather than reading individual
components in isolation (2026-08-25).

### 8. No "what changed since last scan" comparison view ✅ (highest value)
**Files:** `src/pages/UnifiedReportPage.tsx` (dead "Comparison Report" option, see #1),
backend report/scan endpoints

**Insight:** The report-type dropdown already has a "Comparison Report" option — someone
already recognized this need, it was just never wired up. For a recurring scanner, "did
the fix work, and what's new" is the first question after every scan. Today only
aggregate trend counts exist (a line chart of totals); there is no structured diff of
*resolved since last scan / still open / newly introduced*.

**Suggestion:** Build the comparison view: diff `findings` between the selected scan and
the previous completed scan by a stable key (rule + host/package), bucket into
resolved/persisting/new, surface counts prominently.

**Fixed:** see Task 20 in docs/superpowers/plans/2026-09-15-reports-ux-remaining-fixes.md

### 9. Triage is one-finding-at-a-time; the underlying task is batch ✅
**File:** `src/components/reports/FindingsTable.tsx`

**Insight:** We fixed the close/reopen pain (side panel + prev/next), but creating an
issue is still fully manual per finding — open panel, click "Create issue," close, repeat
up to dozens of times. Same friction class as the modal problem: a repetitive single-item
action on what's fundamentally a batch task.

**Suggestion:** Add row checkboxes + "select all Critical" + a bulk "Create issues for
selected" action in the findings table header.

**Fixed:** see Task 22 in docs/superpowers/plans/2026-09-15-reports-ux-remaining-fixes.md

### 10. Findings don't signal "new vs. seen before" ✅
**File:** `src/components/reports/FindingsTable.tsx`, depends on #8's diffing

**Insight:** Nothing distinguishes a finding that's been present for months from one that
just appeared this scan. Without that signal, scrolling/reading the whole list is the
only way to find what's new, even with prev/next navigation.

**Suggestion:** Small "New" badge on findings not present in the prior scan's result set
(reuses the diff logic from #8).

**Fixed:** see Task 21 in docs/superpowers/plans/2026-09-15-reports-ux-remaining-fixes.md

### 11. Side panel has arrow-key nav but no action shortcuts ✅
**File:** `src/components/ui/SidePanel.tsx`, `src/components/FindingDetailModal.tsx`

**Insight:** Natural follow-on to the panel we just shipped — once someone is flying
through findings with ←/→, the next thing they reach for is acting without the mouse
(e.g. Gmail/Superhuman-style triage keys).

**Suggestion:** A key (e.g. `C`) to trigger "Create issue" on the currently-viewed
finding, ignored while a text field has focus (same guard already used for arrow keys).

**Fixed:** see Task 23 in docs/superpowers/plans/2026-09-15-reports-ux-remaining-fixes.md

### 12. Filter state silently carries across scan switches ✅
**File:** `src/pages/ProjectReportsPage.tsx`, `src/components/reports/FindingsTable.tsx`

**Insight:** Not a bug — but a flow trap. Switching the scan selector keeps existing
severity/search filters applied to the new scan's data with no visible indicator. Someone
filtered to "Critical" on scan #5 who jumps to scan #3 sees a short list and may read it
as "fewer findings" rather than "still filtered."

**Suggestion:** Show a "Filtered" chip near the findings count whenever any filter is
active, persisting across scan changes.

**Fixed:** see Task 15 in docs/superpowers/plans/2026-09-15-reports-ux-remaining-fixes.md

## Reports issues found via `auditing-workflows` skill test (2026-08-25)

Found by a fresh agent with no prior context, given only the `auditing-workflows`
skill and the file list — a blind validation of the skill itself. It independently
re-derived issues #2, #9, and #10 above without having seen them, and found these four
new ones:

### 13. Export ignores the currently-selected scan ✅ (data integrity)
**File:** `src/pages/UnifiedReportPage.tsx:64`

**Issue:** `handleExport` calls
`api.reports.exportUnified(projectId!, format, undefined, reportType)` — `scanId` is
hardcoded to `undefined` even though the page has a working scan selector
(`selectedScanId`, used everywhere else, e.g. line 48). `src/services/api.ts:248` confirms
the signature accepts `scanId?`. `ProjectReportsPage.tsx:117` does this correctly, passing
`selectedScanId` through — this page doesn't.

**Impact:** If the backend defaults an omitted `scan_id` to the latest scan, an analyst
reviewing an older scan and exporting a PDF for a stakeholder silently gets a report for a
*different* scan than what's on screen. The export is the artifact that leaves the tool
(ticket, email, compliance record) — a silent mismatch here is worse than an on-screen bug.

**Fix needed:** Pass `selectedScanId` instead of `undefined`.

**Fixed:** see Task 4 in docs/superpowers/plans/2026-09-15-reports-ux-remaining-fixes.md

### 14. `hasSearched` state leaks across findings during Prev/Next triage ✅
**File:** `src/components/FindingDetailModal.tsx:46`

**Issue:** `const [hasSearched, setHasSearched] = useState(false)` is never reset when the
`finding` prop changes, and neither caller (`UnifiedReportPage.tsx:440`,
`FindingsTable.tsx:337`) keys the component on the finding's id — so React reuses the same
instance across the ←/→ navigation `SidePanel` provides. Click "Open in Issue Tracker" on
finding A, then arrow to finding B: `hasSearched` is still `true`, so the footer renders
"Create issue" for B immediately without ever running B's existence check.

**Impact:** This is the exact failure mode that produces duplicate issues or silently skips
existing ones — during the fast keyboard-driven triage flow the side panel (item done ✅
below) was built to encourage. Undermines its own feature.

**Fix needed:** Reset `hasSearched` (and re-run/clear the lookup) whenever `finding.id`
changes — e.g. `useEffect` keyed on `finding?.id`, or key the component itself.

**Fixed:** see Task 8 in docs/superpowers/plans/2026-09-15-reports-ux-remaining-fixes.md

### 15. In-table tool filter goes dead once a sidebar tool is selected ✅
**File:** `src/components/reports/FindingsTable.tsx:57`

**Issue:** `if (toolFilter !== 'All' && !selectedTool) filtered = ...` — but
`FindingsTable` is only ever mounted while `selectedTool` is truthy
(`ProjectReportsPage.tsx:319-325`), so this branch's `!selectedTool` guard is always false
for the table's entire visible lifetime. The "All tools" dropdown inside the table has zero
effect. It also doesn't sync its displayed value if the sidebar selection changes later.

**Fix needed:** Hide/disable the in-table tool dropdown while a sidebar tool is active (or
drop the exclusivity and let both compose), and sync its displayed value to the active prop.

**Fixed:** see Task 6 in docs/superpowers/plans/2026-09-15-reports-ux-remaining-fixes.md

### 16. Severity filter-badge counts aren't scoped to the active tool filter ✅
**File:** `src/components/reports/FindingsTable.tsx:36-42`

**Issue:** `severityCounts` is computed from the raw `findings` prop (all tools), not
`filteredFindings`. Filtering to one tool via the sidebar still shows Critical/High/Medium/
Low badge counts for *every* tool combined.

**Impact:** An analyst filtered to "SonarQube → Critical" sees a count that includes Trivy/
ZAP criticals too, which can misdirect prioritization.

**Fix needed:** Compute `severityCounts` from the tool-scoped subset (post-`selectedTool`
filter, pre-severity filter).

**Fixed:** see Task 7 in docs/superpowers/plans/2026-09-15-reports-ux-remaining-fixes.md

## Reports issues from independent senior-dev workflow audit (2026-08-25)

A separately-produced audit against the same module. Verified every new claim against the
actual code before merging (checked `DeveloperReportPage.tsx` and `FilterBar.tsx`, not
previously reviewed) — all confirmed accurate. 4 of its findings were exact duplicates of
items #1/#2/#9/#13 above (independent triple-confirmation); the TOC scroll-sync half of
its finding was merged into item #2. The following 9 are new.

### 17. Developer report's "Export PDF" button is a hard no-op ✅
**File:** `src/pages/DeveloperReportPage.tsx:129`

**Issue:** `<ProjectReportLayout ... onExport={() => {}} .../>` — the sidebar's Export PDF
button (rendered by `ProjectReportLayout`) is wired to an empty function. No toast, no
disabled state, no visual difference from a working button. Confirmed by reading the file.

**Fix needed:** Either implement export for the developer report, or pass a real disabled
state (as `ExecutiveSummaryPage`'s export button already does, with a `title` explaining
why) instead of a silently-broken handler.

**Fixed:** see Task 5 in docs/superpowers/plans/2026-09-15-reports-ux-remaining-fixes.md

### 18. Scan selection isn't preserved across report-page navigation ✅
**Files:** `src/pages/ProjectReportsPage.tsx:27`, `src/pages/UnifiedReportPage.tsx:24`,
route definitions (`/reports`, `/reports/unified`, `/reports/:scanId/developer`)

**Issue:** `selectedScanId` is local `useState` on both pages, and only the developer route
carries a scan id in its URL. Navigating scan report → unified report → back drops the
selection each time, re-defaulting to the latest scan.

**Fix needed:** Move `selectedScanId` into a URL search param (`?scanId=`) shared across the
three report routes.

**Fixed:** see Task 12 in docs/superpowers/plans/2026-09-15-reports-ux-remaining-fixes.md

### 19. "Back to detailed view" drops scan context ✅
**File:** `src/pages/UnifiedReportPage.tsx:200-205` (`navigate('/projects/.../reports')`
with no `state`), read against `src/pages/ProjectReportsPage.tsx:24`
(`location.state?.scanId`)

**Issue:** Concrete manifestation of #18: `ProjectReportsPage` is built to accept an
incoming `scanId` via `location.state`, but the unified report's back button never supplies
it. A user viewing scan #3 on the unified report who clicks back lands on whatever scan
auto-selects (latest), not #3.

**Fix needed:** `navigate('/projects/${projectId}/reports', { state: { scanId:
selectedScanId } })`.

**Fixed:** see Task 12 in docs/superpowers/plans/2026-09-15-reports-ux-remaining-fixes.md

### 20. No cross-tool "all findings" view in the scan report sidebar ✅
**File:** `src/pages/ProjectReportsPage.tsx:319-325`, `src/components/reports/ProjectReportLayout.tsx`

**Issue:** The right panel only renders `FindingsTable` once a specific tool is selected in
the sidebar (see the placeholder block at `ProjectReportsPage.tsx:327`) — there's no "All
tools" or "All Critical" aggregate entry. To answer "what are all my critical findings",
a user must click through each tool one at a time and mentally combine results.

**Fix needed:** Add an "All" entry (or default state) that renders `FindingsTable` over the
full `allFindings` set instead of requiring a tool selection first.

**Fixed:** see Task 24 in docs/superpowers/plans/2026-09-15-reports-ux-remaining-fixes.md

### 21. FilterBar sits far from what it filters ✅
**File:** `src/pages/UnifiedReportPage.tsx` (`FilterBar` rendered between the Compliance
section and the Findings table, after summary cards/gauge/pie/bar/trend/compliance blocks)

**Issue:** On a typical viewport the filter controls are below the fold — six content
blocks below where the page starts. Applying a filter means scrolling down to it, then back
up to see the summary cards reflect the new selection (they don't, see related items).

**Fix needed:** Move `FilterBar` immediately above the findings table, or make it sticky.

**Fixed:** see Task 18 in docs/superpowers/plans/2026-09-15-reports-ux-remaining-fixes.md

### 22. Two incompatible filter UIs for the same concept across report pages ✅
**Files:** `src/components/FilterBar.tsx` (severity/tool as multi-select toggle pills) vs.
`src/components/reports/FindingsTable.tsx:165-209` (severity as single-select button group,
tool as a `<select>` dropdown)

**Issue:** `UnifiedReportPage` and `ProjectReportsPage`/`FindingsTable` implement filtering
as two unrelated components with different interaction models for the same concept
(multi-select toggle vs. single-select + dropdown) and no shared state. Muscle memory from
one page doesn't transfer to the other.

**Fix needed:** Extract one shared findings-filter component with a single interaction
model, used by both pages.

**Fixed:** see Task 19 in docs/superpowers/plans/2026-09-15-reports-ux-remaining-fixes.md

### 23. Scan selector shows no severity/count delta between scans ✅
**Files:** `src/pages/ProjectReportsPage.tsx:286-291`, `src/pages/UnifiedReportPage.tsx:250-254`

**Issue:** Scan `<option>`s show only `Scan #N — <short id> (date)`. Nothing indicates
finding count or severity mix, so choosing which scan to review (the entry point to every
report) is a blind guess until the page loads.

**Fix needed:** Include a compact summary in each option, e.g. `Scan #5 — 12C 8H 3M (25 Jun
2026)`, sourced from the existing per-scan report summary data.

**Fixed:** see Task 16 in docs/superpowers/plans/2026-09-15-reports-ux-remaining-fixes.md

### 24. Compliance OWASP/CWE rows are dead ends ✅
**File:** `src/pages/UnifiedReportPage.tsx:336-366`

**Issue:** Rows like "A01 — Broken Access Control · 12 findings" are plain `<div>`s with no
`onClick`. There's no path from "12 findings in this category" to actually seeing those 12
— the user must manually reconstruct the filter themselves.

**Fix needed:** Make each row clickable, applying the equivalent severity/rule filter to the
findings table below (or scrolling to + pre-filtering it).

**Fixed:** see Task 10 in docs/superpowers/plans/2026-09-15-reports-ux-remaining-fixes.md

### 25. Report breadcrumbs are plain text, not navigable ✅
**Files:** `src/pages/DeveloperReportPage.tsx:105-107`, `src/pages/ProjectReportsPage.tsx:273`

**Issue:** Both pages render `{project.name} / Reports / ...` as plain text, not clickable
segments. The only way up is the single back-chevron button, which (per #19) doesn't
reliably go where you'd expect either.

**Fix needed:** Make breadcrumb segments real links (`project.name` → project overview,
`Reports` → `/projects/{id}/reports`).

**Fixed:** see Task 11 in docs/superpowers/plans/2026-09-15-reports-ux-remaining-fixes.md

## Reports UX fixes — done ✅
- Side panel + prev/next navigation for finding detail (replaces modal that required
  close-scroll-reopen for every finding) — see `src/components/ui/SidePanel.tsx`.
- Unified severity color mapping across `risk.tsx` / `ProjectReportLayout` /
  `FindingsTable` (previously three different mappings; `FindingsTable` uniquely mapped
  Medium → blue).
- Fixed "invisible dot" bug (pale `bg-50` used as solid dot fill) in both
  `ProjectReportLayout` and `FindingsTable`.

## Summary

- **10+ tests now passing** with proper fixtures
- **1 critical bug identified** in jenkins_tasks.py (project state not synced on failure)
- **1 architectural issue** with async state updates (race condition)
- **7 UX issues tracked** on the Reports pages (3 broken/dead controls, 1 IA
  inconsistency, 1 accessibility gap, 2 lower-priority)
- **5 workflow suggestions tracked** on the Reports pages (comparison view, bulk triage,
  new-finding signaling, keyboard action shortcuts, filter-state visibility)
- **4 more bugs found** via a blind `auditing-workflows` skill test (export ignoring
  selected scan, issue-lookup state leaking across Prev/Next, dead in-table tool filter,
  unscoped severity counts) — see items #13-16
- **9 more issues found** via an independent senior-dev workflow audit, all verified
  against the code (developer-report export no-op, scan selection lost across navigation,
  no cross-tool findings view, disconnected/inconsistent filter UIs, scan selector with no
  delta info, dead compliance drill-downs, non-navigable breadcrumbs) — see items #17-25.
  4 of its other findings independently triple-confirmed items #1/#2/#9/#13.
- **25 Reports-page issues tracked in total** across three independent audit passes
  (manual review, a fresh agent testing the `auditing-workflows` skill blind, and this
  senior-dev-style audit) — high agreement between passes on the highest-priority items
  (#1 dead report-type dropdown, #2 dead TOC, #13 export-scan bug) is a good signal
  they're real, not false positives.

## Plan completion

All 25 Reports-page issues tracked above (items #1-25) are now fixed as of this session,
implemented per `docs/superpowers/plans/2026-09-15-reports-ux-remaining-fixes.md`. 22 were
addressed by that plan's 24 tasks; the remaining 3 (side panel navigation, unified severity
colors, invisible-dot fix) were already done before the plan started — see "Reports UX
fixes — done" above. A final whole-branch review was completed after all tasks landed,
including one fix wave that addressed 5 cross-task issues surfaced only at whole-branch
scope (not visible when reviewing individual tasks in isolation).

