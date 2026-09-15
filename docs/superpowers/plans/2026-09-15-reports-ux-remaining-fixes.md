# Reports Pages — Remaining UX Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 22 remaining Reports-page issues catalogued in `TODO.md` (items #1–7, #13–25 as bug fixes; #8–12 as new workflow features), on top of the 3 already-shipped fixes (side panel nav, unified severity colors, invisible-dot fix).

**Architecture:** All changes are frontend-only except item #8 (scan comparison), which is implemented as a pure frontend diff over two existing `api.reports.getUnified()` calls — no backend endpoint needed, because `Finding.id` is already deterministic per rule/location (confirmed in `backend/app/services/reporting/parsers/*.py`, e.g. ZAP builds `finding_id = f"{base_id}:{uri}"`), so `${tool}:${id}` is a stable cross-scan diff key. Work proceeds in 4 phases, each independently shippable: (1) dead/broken controls, (2) state & navigation bugs, (3) IA/filter consistency, (4) new workflow features.

**Tech Stack:** React 18 + TypeScript, React Router v6 (`useSearchParams`), TanStack Query, Vitest + React Testing Library, Tailwind CSS.

**Spec:** `TODO.md` (section "UX/Frontend Issues (Reports pages)" onward, items #1–25) — the plan argues from this spec; executors should read both.

## Global Constraints

- Follow existing severity color/label conventions: use `getSeverityColor`/`getSeverityDotColor` from `src/utils/risk.tsx` and `SEVERITY_LEVELS` from `src/utils/severity.ts` — never re-declare a severity→color mapping locally (this exact drift was fixed once already, see TODO.md "done" section).
- Match existing date formatting: `toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })` is used project-wide for scan dates — stay consistent.
- All new interactive elements need keyboard support (`tabIndex`, `onKeyDown` for Enter/Space) matching the pattern already used in `UnifiedReportPage.tsx:410-421`.
- Every task ends with `npx vitest run <test file>` passing before commit.
- Commit after every task — small, reviewable diffs, not one giant commit.

---

## Phase 1: Dead/broken controls

### Task 1: Relabel non-functional Report Type dropdown as Export format (#1)

**Files:**
- Modify: `src/pages/UnifiedReportPage.tsx:209-219`
- Test: `src/tests/pages/UnifiedReportPage.test.tsx`

**Issue:** The dropdown looks like a view switcher but `reportType` is only read in `handleExport`. Building 3 real alternate views (executive/compliance/comparison-as-a-view) is out of scope for this pass (comparison view is built separately as Task 21). Minimal correct fix: stop implying it changes the page — relabel it as what it actually does.

**Interfaces:**
- Consumes: existing `reportType` state, `handleExport(format)` (unchanged)
- Produces: no new exports

- [ ] **Step 1: Write the failing test**

```tsx
// add to src/tests/pages/UnifiedReportPage.test.tsx inside describe block
test('report type select is labeled as export format, not a view switcher', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/projects/test-project/reports/unified"]}>
          <Routes>
            <Route path="/projects/:projectId/reports/unified" element={<UnifiedReportPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
  expect(await screen.findByLabelText('Export format')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/pages/UnifiedReportPage.test.tsx -t "export format"`
Expected: FAIL — no element with accessible name "Export format"

- [ ] **Step 3: Implement**

In `src/pages/UnifiedReportPage.tsx`, replace the `<select>` block at lines 209-219:

```tsx
<select
  value={reportType}
  onChange={(e) => setReportType(e.target.value as typeof reportType)}
  aria-label="Export format"
  title="Controls the export format, not the on-screen report"
  className="px-3 py-2 border border-slate-300 rounded-lg text-sm transition-colors hover:border-slate-400 focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
>
  <option value="technical">Technical export</option>
  <option value="executive">Executive summary export</option>
  <option value="compliance">Compliance export</option>
  <option value="comparison">Comparison export</option>
</select>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/pages/UnifiedReportPage.test.tsx -t "export format"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/UnifiedReportPage.tsx src/tests/pages/UnifiedReportPage.test.tsx
git commit -m "fix(reports): relabel export-type dropdown so it stops implying a view switch"
```

---

### Task 2: Table of Contents scrolls and highlight syncs to scroll position (#2)

**Files:**
- Modify: `src/components/TableOfContents.tsx`, `src/pages/UnifiedReportPage.tsx`
- Test: `src/tests/pages/UnifiedReportPage.test.tsx`

**Issue:** `onSectionClick` never scrolls; `currentSection` never updates from actual scroll position.

**Interfaces:**
- Produces: `TableOfContents` keeps its existing prop shape (`sections: string[]`, `currentSection: string`, `onSectionClick: (section: string) => void`) — behavior change only, no signature change.

- [ ] **Step 1: Write the failing test**

```tsx
// add to src/tests/pages/UnifiedReportPage.test.tsx
test('clicking a TOC entry scrolls its section into view', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const scrollIntoViewMock = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoViewMock;
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/projects/test-project/reports/unified"]}>
          <Routes>
            <Route path="/projects/:projectId/reports/unified" element={<UnifiedReportPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
  const link = await screen.findByRole('button', { name: 'Findings' });
  link.click();
  expect(scrollIntoViewMock).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/pages/UnifiedReportPage.test.tsx -t "scrolls its section"`
Expected: FAIL — `scrollIntoViewMock` not called

- [ ] **Step 3: Implement scroll-on-click**

In `src/pages/UnifiedReportPage.tsx`, replace the `TableOfContents` render (line 259-263):

```tsx
<TableOfContents
  sections={sections}
  currentSection={currentSection}
  onSectionClick={(section) => {
    setCurrentSection(section);
    document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }}
/>
```

Note: `sections[0]` is `'Summary'`, which has no matching `id="Summary"` element on the page (the summary cards `<div>` at line 266 isn't tagged). Add the id so the first TOC entry also works:

```tsx
{/* Summary Cards */}
<div id="Summary" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/pages/UnifiedReportPage.test.tsx -t "scrolls its section"`
Expected: PASS

- [ ] **Step 5: Add scroll-spy sync (IntersectionObserver)**

In `src/pages/UnifiedReportPage.tsx`, add after the existing `useEffect`s (after line 59):

```tsx
useEffect(() => {
  if (!report) return;
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      if (visible[0]?.target.id) setCurrentSection(visible[0].target.id);
    },
    { rootMargin: '-96px 0px -60% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] }
  );
  sections.forEach((s) => {
    const el = document.getElementById(s);
    if (el) observer.observe(el);
  });
  return () => observer.disconnect();
}, [report, sections]);
```

This is a manual/visual step to verify — jsdom (used by Vitest) does not implement `IntersectionObserver` real geometry, so scroll-spy sync is verified by running the app (`npm run dev`) and scrolling the page, not by an automated test. Note this in the PR description.

- [ ] **Step 6: Commit**

```bash
git add src/pages/UnifiedReportPage.tsx src/tests/pages/UnifiedReportPage.test.tsx
git commit -m "fix(reports): make Table of Contents scroll to and sync with sections"
```

---

### Task 3: Executive Summary project rows link to their report (#3)

**Files:**
- Modify: `src/pages/ExecutiveSummaryPage.tsx:271-325`
- Test: `src/tests/pages/ExecutiveSummaryPage.test.tsx`

**Issue:** Rows look clickable (hover bg) but have no `onClick`/`Link`.

- [ ] **Step 1: Write the failing test**

```tsx
// add to src/tests/pages/ExecutiveSummaryPage.test.tsx
test('project row links to its reports page', async () => {
  renderPage(); // use this file's existing render helper — see file for exact setup
  const row = await screen.findByText('Test Project');
  const link = row.closest('a');
  expect(link).toHaveAttribute('href', expect.stringContaining('/reports'));
});
```

(Adjust the mocked project name/id and render helper to match whatever `ExecutiveSummaryPage.test.tsx` already uses — read the file first; do not invent a `renderPage()` helper if one doesn't exist, inline the render call like the other tests in that file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/pages/ExecutiveSummaryPage.test.tsx -t "links to its reports"`
Expected: FAIL — no `<a>` ancestor

- [ ] **Step 3: Implement**

In `src/pages/ExecutiveSummaryPage.tsx`, add the import:

```tsx
import { Link } from "react-router-dom";
```

Replace the `<tr>` at line 271-325 body — wrap each `<td>`'s content, or simplest: make the row a `Link`-based row via `<tr>` → keep as `<tr>` but wrap cell content isn't valid HTML for `<a>` spanning a `<tr>`. Use the same `role="button"` + `onClick` + `onKeyDown` pattern already used in `UnifiedReportPage.tsx:410-421` (that pattern is real, does not need a literal `<a>`, and is already proven accessible in this codebase):

```tsx
<tr
  key={project.project_id}
  className="transition-colors hover:bg-slate-50/70 cursor-pointer"
  tabIndex={0}
  role="button"
  onClick={() => navigate(`/projects/${project.project_id}/reports`)}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      navigate(`/projects/${project.project_id}/reports`);
    }
  }}
>
```

Add `useNavigate` import and call at the top of the component:

```tsx
import { useNavigate } from "react-router-dom";
// inside ExecutiveSummaryPage():
const navigate = useNavigate();
```

Update the test above to assert `role="button"` and a click navigates, matching this implementation instead of an `<a>` — rewrite Step 1's test to:

```tsx
test('project row navigates to its reports page on click', async () => {
  render(/* existing setup from this test file, wrapped in MemoryRouter */);
  const row = await screen.findByRole('button', { name: /Test Project/ });
  expect(row).toBeInTheDocument();
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/pages/ExecutiveSummaryPage.test.tsx -t "navigates to its reports"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/ExecutiveSummaryPage.tsx src/tests/pages/ExecutiveSummaryPage.test.tsx
git commit -m "fix(reports): make executive summary project rows navigate to their report"
```

---

### Task 4: Export uses the currently-selected scan (#13, data integrity)

**Files:**
- Modify: `src/pages/UnifiedReportPage.tsx:64`
- Test: `src/tests/pages/UnifiedReportPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// add to src/tests/pages/UnifiedReportPage.test.tsx
test('export passes the currently selected scan id, not undefined', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const exportSpy = vi.fn().mockResolvedValue(new Blob());
  api.reports.exportUnified = exportSpy;
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/projects/test-project/reports/unified"]}>
          <Routes>
            <Route path="/projects/:projectId/reports/unified" element={<UnifiedReportPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
  const exportBtn = await screen.findByRole('button', { name: /Export HTML/ });
  exportBtn.click();
  await vi.waitFor(() => expect(exportSpy).toHaveBeenCalledWith('test-project', 'html', 'test-scan', 'technical'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/pages/UnifiedReportPage.test.tsx -t "not undefined"`
Expected: FAIL — called with `undefined` as 3rd arg

- [ ] **Step 3: Implement**

In `src/pages/UnifiedReportPage.tsx:64`, change:

```tsx
const blob = await api.reports.exportUnified(projectId!, format, selectedScanId, reportType);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/pages/UnifiedReportPage.test.tsx -t "not undefined"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/UnifiedReportPage.tsx src/tests/pages/UnifiedReportPage.test.tsx
git commit -m "fix(reports): export the scan actually on screen instead of defaulting silently"
```

---

### Task 5: Developer report Export PDF actually exports (#17)

**Files:**
- Modify: `src/pages/DeveloperReportPage.tsx`
- Test: `src/tests/pages/DeveloperReportPage.test.tsx` (create if it doesn't already exist — check first with `ls src/tests/pages/DeveloperReportPage.test.tsx`)

**Issue:** `onExport={() => {}}` is a silent no-op.

- [ ] **Step 1: Write the failing test**

```tsx
// src/tests/pages/DeveloperReportPage.test.tsx — mirror the mock/setup pattern
// from src/tests/pages/UnifiedReportPage.test.tsx (same api mocking style), adjusted
// for the queries DeveloperReportPage actually calls:
// api.projects.get, api.reports.getDeveloperReport, api.scans.get, api.reports.exportUnified
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi, beforeEach, afterEach, test, expect, describe } from 'vitest';
import DeveloperReportPage from '../../pages/DeveloperReportPage';
import { api } from '../../services/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

describe('DeveloperReportPage', () => {
  const originalGetProject = api.projects.get;
  const originalGetDevReport = api.reports.getDeveloperReport;
  const originalGetScan = api.scans.get;
  const originalExport = api.reports.exportUnified;

  beforeEach(() => {
    api.projects.get = vi.fn().mockResolvedValue({ project_id: 'p1', name: 'Test Project' });
    api.reports.getDeveloperReport = vi.fn().mockResolvedValue({
      files: [], summary: { total_files: 0, total_issues: 0 }, quality_gate: { status: 'OK', conditions: [] },
    });
    api.scans.get = vi.fn().mockResolvedValue({ scan_id: 's1', created_at: new Date().toISOString() });
    api.reports.exportUnified = vi.fn().mockResolvedValue(new Blob());
  });

  afterEach(() => {
    api.projects.get = originalGetProject;
    api.reports.getDeveloperReport = originalGetDevReport;
    api.scans.get = originalGetScan;
    api.reports.exportUnified = originalExport;
  });

  test('Export PDF button triggers a real export, not a no-op', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/projects/p1/reports/s1/developer"]}>
          <Routes>
            <Route path="/projects/:projectId/reports/:scanId/developer" element={<DeveloperReportPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    const exportBtn = await screen.findByRole('button', { name: /Export PDF/ });
    exportBtn.click();
    await vi.waitFor(() => expect(api.reports.exportUnified).toHaveBeenCalledWith('p1', 'pdf', 's1', 'technical'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/pages/DeveloperReportPage.test.tsx`
Expected: FAIL — `exportUnified` never called

- [ ] **Step 3: Implement**

In `src/pages/DeveloperReportPage.tsx`, add state and a real handler (mirrors `ProjectReportsPage.tsx:113-129`):

```tsx
const [exportLoading, setExportLoading] = useState(false);

const handleExport = async () => {
  if (!projectId || !scanId) return;
  setExportLoading(true);
  try {
    const blob = await api.reports.exportUnified(projectId, 'pdf', scanId, 'technical');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `developer-report-${project?.name || 'project'}-${scanId}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Export failed:', error);
  } finally {
    setExportLoading(false);
  }
};
```

Replace `onExport={() => {}}` / `exportLoading={false}` (line 129-130) with:

```tsx
onExport={handleExport}
exportLoading={exportLoading}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/pages/DeveloperReportPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/DeveloperReportPage.tsx src/tests/pages/DeveloperReportPage.test.tsx
git commit -m "fix(reports): wire up Developer report Export PDF instead of no-op handler"
```

---

### Task 6: Fix in-table tool filter dead branch and sync (#15)

**Files:**
- Modify: `src/components/reports/FindingsTable.tsx:57, 187-196`
- Test: `src/tests/components/FindingsTable.test.tsx` (create if none exists)

**Issue:** `if (toolFilter !== 'All' && !selectedTool)` is always false because `FindingsTable` only mounts with `selectedTool` truthy.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { test, expect } from 'vitest';
import { FindingsTable } from '../../components/reports/FindingsTable';

const findings = [
  { id: '1', severity: 'Critical', title: 'A', tool: 'sonar' },
  { id: '2', severity: 'High', title: 'B', tool: 'trivy' },
];

test('in-table tool dropdown is disabled while a sidebar tool is active', () => {
  render(<FindingsTable findings={findings} selectedTool="sonar" />);
  const select = screen.getByRole('combobox');
  expect(select).toBeDisabled();
  expect(select).toHaveValue('sonar');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/components/FindingsTable.test.tsx`
Expected: FAIL — select not disabled, value is `'All'` not `'sonar'`

- [ ] **Step 3: Implement**

In `src/components/reports/FindingsTable.tsx`, remove the dead `toolFilter` branch and sync the dropdown. Replace line 57:

```tsx
// removed — toolFilter is now disabled/inert whenever selectedTool is set (see below),
// so this branch is unreachable when selectedTool is falsy anyway
if (toolFilter !== 'All') filtered = filtered.filter((f) => f.tool === toolFilter);
```

Replace the `<select>` at lines 187-196:

```tsx
<select
  value={selectedTool || toolFilter}
  onChange={(e) => setToolFilter(e.target.value)}
  disabled={!!selectedTool}
  aria-label="Filter by tool"
  title={selectedTool ? 'Tool is set by the sidebar selection' : undefined}
  className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 disabled:bg-slate-50 disabled:text-slate-400"
>
  <option value="All">All tools</option>
  {uniqueTools.map((tool) => (
    <option key={tool} value={tool}>{tool.replace(/_/g, ' ')}</option>
  ))}
</select>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/components/FindingsTable.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/reports/FindingsTable.tsx src/tests/components/FindingsTable.test.tsx
git commit -m "fix(reports): disable in-table tool filter while sidebar tool is active instead of silently ignoring it"
```

---

### Task 7: Scope severity badge counts to the active tool filter (#16)

**Files:**
- Modify: `src/components/reports/FindingsTable.tsx:36-42`
- Test: `src/tests/components/FindingsTable.test.tsx`

**Interfaces:**
- Consumes: same `findings`/`selectedTool` props as Task 6 — implement in the same PR/commit sequence, since both touch this file's filter logic; keep as a separate commit for a clean bisect trail.

- [ ] **Step 1: Write the failing test**

```tsx
// add to src/tests/components/FindingsTable.test.tsx
test('severity badge counts are scoped to the active tool filter', () => {
  render(<FindingsTable findings={findings} selectedTool="sonar" />);
  // findings fixture: 1 Critical/sonar, 1 High/trivy — with sonar selected, only the
  // Critical count (1) should reflect sonar's findings, not both tools combined
  expect(screen.getByRole('button', { name: 'Critical 1' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'High 1' })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/components/FindingsTable.test.tsx -t "scoped to the active tool"`
Expected: FAIL — both Critical 1 and High 1 render (unscoped counts)

- [ ] **Step 3: Implement**

In `src/components/reports/FindingsTable.tsx`, the `severityCounts` memo (lines 36-42) must be computed after the `selectedTool` filter but before the severity filter. Reorder: move the `severityCounts` memo to depend on a tool-scoped subset:

```tsx
const toolScopedFindings = useMemo(
  () => (selectedTool ? findings.filter((f) => f.tool === selectedTool) : findings),
  [findings, selectedTool],
);

const severityCounts = useMemo(() => {
  const counts: Record<string, number> = { All: toolScopedFindings.length };
  toolScopedFindings.forEach((f) => {
    counts[f.severity] = (counts[f.severity] || 0) + 1;
  });
  return counts;
}, [toolScopedFindings]);
```

Also update the `filteredFindings` memo's `selectedTool` branch (line 51) to reuse `toolScopedFindings` instead of re-filtering:

```tsx
let filtered = toolScopedFindings;
// (remove the separate `if (selectedTool) filtered = filtered.filter(...)` line — now redundant)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/components/FindingsTable.test.tsx -t "scoped to the active tool"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/reports/FindingsTable.tsx src/tests/components/FindingsTable.test.tsx
git commit -m "fix(reports): scope severity badge counts to the active tool filter"
```

---

### Task 8: Reset finding-lookup state on Prev/Next during triage (#14)

**Files:**
- Modify: `src/components/FindingDetailModal.tsx:46`
- Test: `src/tests/components/FindingDetailModal.test.tsx` (create if none exists)

**Issue:** `hasSearched` (and the stale `matchedIssue` query cache) persist across findings during ←/→ navigation, causing "Create issue" to render immediately for a finding that was never actually checked.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { test, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FindingDetailModal from '../../components/FindingDetailModal';
import { ToastProvider } from '../../components/Toast';
import { api } from '../../services/api';

vi.mock('../../hooks/useRbac', () => ({ useRbac: () => ({ canAssignIssues: true }) }));

const findingA = { id: 'a', severity: 'Critical', title: 'Finding A', tool: 'sonar' };
const findingB = { id: 'b', severity: 'High', title: 'Finding B', tool: 'sonar' };

test('hasSearched resets when navigating to a different finding via Next', async () => {
  api.issues.findByFindingKey = vi.fn().mockResolvedValue(undefined);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { rerender } = render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter>
          <FindingDetailModal finding={findingA} projectId="p1" scanId="s1" onClose={() => {}} hasNext onNext={() => {}} />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
  fireEvent.click(await screen.findByRole('button', { name: /Open in Issue Tracker/ }));
  await screen.findByRole('button', { name: /Create issue/ });

  rerender(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter>
          <FindingDetailModal finding={findingB} projectId="p1" scanId="s1" onClose={() => {}} hasNext onNext={() => {}} />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
  expect(screen.queryByRole('button', { name: /Create issue/ })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/components/FindingDetailModal.test.tsx`
Expected: FAIL — "Create issue" still shown for Finding B

- [ ] **Step 3: Implement**

In `src/components/FindingDetailModal.tsx`, add an effect that resets `hasSearched` whenever the finding identity changes. Add after line 46 (`const [hasSearched, setHasSearched] = useState(false);`):

```tsx
useEffect(() => {
  setHasSearched(false);
}, [finding?.id, finding?.tool]);
```

Add `useEffect` to the existing `import React, { useState } from 'react';` on line 1:

```tsx
import React, { useState, useEffect } from 'react';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/components/FindingDetailModal.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/FindingDetailModal.tsx src/tests/components/FindingDetailModal.test.tsx
git commit -m "fix(reports): reset issue-lookup state when Prev/Next changes the viewed finding"
```

---

### Task 9: Accessible labels on filter/search inputs (#6)

**Files:**
- Modify: `src/components/reports/FindingsTable.tsx:200-206`, `src/pages/UnifiedReportPage.tsx` (scan `<select>` at line 245-248), `src/pages/ProjectReportsPage.tsx` (scan `<select>` at line 281-284)
- Test: `src/tests/components/FindingsTable.test.tsx`

**Note:** the report-type `<select>` was already labeled in Task 1 (`aria-label="Export format"`), so it's not repeated here.

- [ ] **Step 1: Write the failing test**

```tsx
// add to src/tests/components/FindingsTable.test.tsx
test('search input has an accessible label', () => {
  render(<FindingsTable findings={findings} selectedTool="sonar" />);
  expect(screen.getByLabelText('Search findings')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/components/FindingsTable.test.tsx -t "accessible label"`
Expected: FAIL — no labeled element

- [ ] **Step 3: Implement**

In `src/components/reports/FindingsTable.tsx:200-206`, add `aria-label`:

```tsx
<input
  type="text"
  placeholder="Search by title, rule, type, package, or host…"
  aria-label="Search findings"
  value={searchText}
  onChange={(e) => setSearchText(e.target.value)}
  className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
/>
```

In `src/pages/UnifiedReportPage.tsx:245-248`, add to the scan `<select>`:

```tsx
<select
  value={selectedScanId}
  onChange={(e) => setSelectedScanId(e.target.value)}
  aria-label="Select scan"
  className="flex-1 text-sm border-slate-200 rounded-lg px-3 py-2 transition-colors focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
>
```

In `src/pages/ProjectReportsPage.tsx:281-284`, same treatment:

```tsx
<select
  value={selectedScanId}
  onChange={(e) => setSelectedScanId(e.target.value)}
  aria-label="Select scan"
  className="flex-1 text-sm border-slate-200 rounded-lg px-3 py-2 transition-colors focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/components/FindingsTable.test.tsx -t "accessible label"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/reports/FindingsTable.tsx src/pages/UnifiedReportPage.tsx src/pages/ProjectReportsPage.tsx src/tests/components/FindingsTable.test.tsx
git commit -m "fix(reports): add aria-labels to filter/search/scan-select inputs"
```

---

### Task 10: Compliance OWASP/CWE rows drill into filtered findings (#24)

**Files:**
- Modify: `src/pages/UnifiedReportPage.tsx:332-364`
- Test: `src/tests/pages/UnifiedReportPage.test.tsx`

**Issue:** Rows are plain `<div>`s with no way to see the underlying findings.

**Interfaces:**
- Consumes: `Finding.rule` / `Finding.cwe_ids` fields (both already on the `Finding` type, `src/types.ts:280,292`)
- Produces: sets `search` state to the compliance item's id, which `filteredFindings` (line 163-178) already filters on via title/description substring match — reuse that instead of adding a new filter dimension. Since `search` doesn't match rule ids well, extend the existing search predicate to also match `f.rule` and `f.cwe_ids`.

- [ ] **Step 1: Write the failing test**

```tsx
// add to src/tests/pages/UnifiedReportPage.test.tsx — extend the getUnified/getCompliance mocks
// for this one test to include an OWASP item and a matching finding
test('clicking an OWASP compliance row filters and scrolls to matching findings', async () => {
  api.reports.getCompliance = vi.fn().mockResolvedValue({
    project_id: 'test-project',
    compliance: { owasp_top_10: [{ id: 'A01', name: 'Broken Access Control', count: 1 }], cwe_top_25: [] },
    generated_at: new Date().toISOString(),
  });
  api.reports.getUnified = vi.fn().mockResolvedValue({
    project_id: 'test-project', scan_id: 'test-scan', total_findings: 1,
    severity: { critical: 1, high: 0, medium: 0, low: 0, info: 0 },
    findings: [{ id: 'f1', severity: 'Critical', title: 'Broken Access', tool: 'zap', rule: 'A01' }],
    generated_at: new Date().toISOString(),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/projects/test-project/reports/unified"]}>
          <Routes>
            <Route path="/projects/:projectId/reports/unified" element={<UnifiedReportPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
  const row = await screen.findByRole('button', { name: /A01.*Broken Access Control/ });
  row.click();
  expect(await screen.findByText('Broken Access')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/pages/UnifiedReportPage.test.tsx -t "OWASP compliance row"`
Expected: FAIL — row is not a `role="button"`, click does nothing

- [ ] **Step 3: Implement**

In `src/pages/UnifiedReportPage.tsx`, extend the `filteredFindings` search predicate (lines 163-178) to also match rule/CWE:

```tsx
const filteredFindings = report.findings.filter(f => {
  if (search) {
    const q = search.toLowerCase();
    const matches =
      f.title.toLowerCase().includes(q) ||
      f.description?.toLowerCase().includes(q) ||
      f.rule?.toLowerCase().includes(q) ||
      f.cwe_ids?.some((c) => c.toLowerCase().includes(q));
    if (!matches) return false;
  }
  if (selectedSeverities.length > 0 && !selectedSeverities.includes(f.severity)) return false;
  if (selectedTools.length > 0 && f.tool && !selectedTools.includes(f.tool)) return false;
  return true;
});
```

Make the OWASP/CWE rows clickable (lines 336-346 and 356-363):

```tsx
{compliance.compliance.owasp_top_10.map((item) => (
  <div
    key={item.id}
    role="button"
    tabIndex={0}
    onClick={() => {
      setSearch(item.id);
      document.getElementById('Findings')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }}
    onKeyDown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setSearch(item.id);
        document.getElementById('Findings')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }}
    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg transition-colors hover:bg-slate-100 cursor-pointer"
  >
    <div className="min-w-0">
      <span className="font-medium text-slate-900">{item.id}</span>
      <span className="ml-2 text-slate-600">{item.name}</span>
    </div>
    <span className="tabular-nums shrink-0 ml-3 px-2 py-1 bg-red-100 text-red-700 rounded text-sm font-medium">
      {item.count}
    </span>
  </div>
))}
```

Apply the identical `role="button"`/`onClick`/`onKeyDown` treatment to the `cwe_top_25.map` block (lines 356-363), using `item.id` the same way.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/pages/UnifiedReportPage.test.tsx -t "OWASP compliance row"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/UnifiedReportPage.tsx src/tests/pages/UnifiedReportPage.test.tsx
git commit -m "fix(reports): make compliance OWASP/CWE rows drill into matching findings"
```

---

### Task 11: Navigable breadcrumbs (#25)

**Files:**
- Modify: `src/pages/DeveloperReportPage.tsx:103-108`, `src/pages/ProjectReportsPage.tsx:271-274`
- Test: `src/tests/pages/DeveloperReportPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// add to src/tests/pages/DeveloperReportPage.test.tsx
test('breadcrumb project-name segment links to the project overview', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/projects/p1/reports/s1/developer"]}>
        <Routes>
          <Route path="/projects/:projectId/reports/:scanId/developer" element={<DeveloperReportPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  const link = await screen.findByRole('link', { name: 'Test Project' });
  expect(link).toHaveAttribute('href', '/projects/p1');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/pages/DeveloperReportPage.test.tsx -t "breadcrumb"`
Expected: FAIL — breadcrumb is plain text, no `role="link"` element

- [ ] **Step 3: Implement**

In `src/pages/DeveloperReportPage.tsx`, add `Link` to the router import (line 2):

```tsx
import { useParams, useNavigate, Link } from 'react-router-dom';
```

Replace lines 103-108:

```tsx
<div>
  <h1 className="text-xl font-semibold text-slate-900">Developer View</h1>
  <p className="text-sm text-slate-500">
    <Link to={`/projects/${projectId}`} className="hover:text-slate-900 hover:underline">{project.name}</Link>
    {' / '}
    <Link to={`/projects/${projectId}/reports`} className="hover:text-slate-900 hover:underline">Reports</Link>
    {' / Developer Dashboard'}
  </p>
</div>
```

In `src/pages/ProjectReportsPage.tsx`, add `Link` to the import (line 2):

```tsx
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
```

Replace line 273:

```tsx
<p className="text-sm text-slate-500">
  Dashboard / <Link to={`/projects/${projectId}`} className="hover:text-slate-900 hover:underline">{project.name}</Link> / Reports / Scan #{scanNumber}
</p>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/pages/DeveloperReportPage.test.tsx -t "breadcrumb"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/DeveloperReportPage.tsx src/pages/ProjectReportsPage.tsx src/tests/pages/DeveloperReportPage.test.tsx
git commit -m "fix(reports): make breadcrumb segments navigable links"
```

---

## Phase 2: State & navigation bugs

### Task 12: Preserve scan selection across report-page navigation via URL (#18, #19, #7 partial)

**Files:**
- Modify: `src/pages/ProjectReportsPage.tsx`, `src/pages/UnifiedReportPage.tsx`
- Test: `src/tests/pages/ProjectReportsPage.test.tsx` (check if it exists first), `src/tests/pages/UnifiedReportPage.test.tsx`

**Issue:** `selectedScanId` is local `useState`, lost on navigation between report routes; `UnifiedReportPage`'s back button drops scan context.

**Interfaces:**
- Produces: both pages now read/write `?scanId=` via `useSearchParams` instead of/in addition to local state — this is the shared mechanism Task 15 (filter-chip) and general deep-linking (#7) build on.

- [ ] **Step 1: Write the failing test**

```tsx
// add to src/tests/pages/UnifiedReportPage.test.tsx
test('back to detailed view preserves the selected scan id', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  api.scans.getHistory = vi.fn().mockResolvedValue([
    { scan_id: 'scan-1', state: 'COMPLETED', created_at: new Date().toISOString() },
    { scan_id: 'scan-2', state: 'COMPLETED', created_at: new Date().toISOString() },
  ]);
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/projects/test-project/reports/unified?scanId=scan-2"]}>
          <Routes>
            <Route path="/projects/:projectId/reports/unified" element={<UnifiedReportPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
  const select = await screen.findByLabelText('Select scan');
  expect(select).toHaveValue('scan-2');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/pages/UnifiedReportPage.test.tsx -t "preserves the selected scan id"`
Expected: FAIL — `selectedScanId` initializes from `scans[0]`, ignoring the URL

- [ ] **Step 3: Implement in `UnifiedReportPage.tsx`**

Add `useSearchParams` to the import (line 2):

```tsx
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
```

Replace the `selectedScanId` state (line 24) and its initializing effect (lines 38-42):

```tsx
const [searchParams, setSearchParams] = useSearchParams();
const selectedScanId = searchParams.get('scanId') || '';
const setSelectedScanId = (scanId: string) => {
  setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    next.set('scanId', scanId);
    return next;
  }, { replace: true });
};

useEffect(() => {
  if (scans.length > 0 && !selectedScanId) {
    setSelectedScanId(scans[0].scan_id);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [scans, selectedScanId]);
```

Update the "Back to detailed view" button (line 199-206) to carry scan context:

```tsx
<button
  onClick={() => navigate(`/projects/${projectId}/reports`, { state: { scanId: selectedScanId } })}
  className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg transition-all hover:bg-slate-50 active:scale-[0.98] text-sm font-medium"
>
```

- [ ] **Step 4: Implement in `ProjectReportsPage.tsx`**

Add `useSearchParams` import (line 2):

```tsx
import { useParams, useNavigate, useLocation, useSearchParams, Link } from 'react-router-dom';
```

Replace `selectedScanId` state (line 27) and the initializing effect (lines 80-87):

```tsx
const [searchParams, setSearchParams] = useSearchParams();
const urlScanId = searchParams.get('scanId');
const [selectedScanId, setSelectedScanIdState] = useState<string>(urlScanId || initialScanId || '');
const setSelectedScanId = (scanId: string) => {
  setSelectedScanIdState(scanId);
  setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    next.set('scanId', scanId);
    return next;
  }, { replace: true });
};

useEffect(() => {
  if (!selectedScanId && completedScans.length > 0) {
    const target = initialScanId && completedScans.some((s: Scan) => s.scan_id === initialScanId)
      ? initialScanId
      : completedScans[0]?.scan_id;
    setSelectedScanId(target);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [completedScans, initialScanId, selectedScanId]);
```

And update the "View unified report" link in `ProjectReportLayout.tsx:211-217` (used by this page) to carry `scanId` — change:

```tsx
<a
  href={`/projects/${projectId}/reports/unified${scanId ? `?scanId=${scanId}` : ''}`}
  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg transition-all hover:bg-slate-50 active:scale-[0.98] text-sm font-medium"
>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/tests/pages/UnifiedReportPage.test.tsx -t "preserves the selected scan id"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/pages/UnifiedReportPage.tsx src/pages/ProjectReportsPage.tsx src/components/reports/ProjectReportLayout.tsx src/tests/pages/UnifiedReportPage.test.tsx
git commit -m "fix(reports): carry selected scan id through URL across report page navigation"
```

---

### Task 13: Highlight the open finding's row in the underlying list (#5)

**Files:**
- Modify: `src/components/reports/FindingsTable.tsx`, `src/pages/UnifiedReportPage.tsx`
- Test: `src/tests/components/FindingsTable.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// add to src/tests/components/FindingsTable.test.tsx
test('the currently open finding row is visually marked', () => {
  render(<FindingsTable findings={findings} selectedTool="sonar" />);
  const row = screen.getByText('A').closest('tr');
  row?.click();
  expect(screen.getByText('A').closest('tr')).toHaveClass('bg-teal-50');
});
```

(Requires `viewMode` default to `'list'` for this test, or switch the fixture to check the grouped-view row instead — read the current default (`'grouped'`, line 23) and pick whichever view the test renders; if grouped, target the row inside `group.findings.slice(0,3).map` instead of the `<table>` row.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/components/FindingsTable.test.tsx -t "visually marked"`
Expected: FAIL — no `bg-teal-50` class applied

- [ ] **Step 3: Implement**

In `src/components/reports/FindingsTable.tsx`, list view `<tr>` (lines 310-315):

```tsx
filteredFindings.map((finding, idx) => (
  <tr
    key={finding.id || idx}
    className={`cursor-pointer ${selectedFinding?.id === finding.id ? 'bg-teal-50' : 'hover:bg-slate-50'}`}
    onClick={() => setSelectedFinding(finding)}
  >
```

Grouped view row (lines 263-273):

```tsx
{group.findings.slice(0, 3).map((finding) => (
  <div
    key={finding.id || finding.title}
    className={`flex items-center gap-2 text-sm text-slate-600 cursor-pointer rounded px-2 py-1 ${
      selectedFinding?.id === finding.id ? 'bg-teal-50' : 'hover:bg-slate-50'
    }`}
    onClick={() => setSelectedFinding(finding)}
  >
```

In `src/pages/UnifiedReportPage.tsx`, the findings `<tr>` (lines 410-421), same pattern:

```tsx
<tr
  key={idx}
  className={`border-b border-slate-100 cursor-pointer transition-colors ${
    selectedFinding === finding ? 'bg-teal-50' : 'hover:bg-slate-50'
  }`}
  tabIndex={0}
  role="button"
  onClick={() => setSelectedFinding(finding)}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/components/FindingsTable.test.tsx -t "visually marked"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/reports/FindingsTable.tsx src/pages/UnifiedReportPage.tsx src/tests/components/FindingsTable.test.tsx
git commit -m "fix(reports): highlight the row of the currently open finding"
```

---

### Task 14: Mirror filters and open finding into URL (#7)

**Files:**
- Modify: `src/pages/UnifiedReportPage.tsx`
- Test: `src/tests/pages/UnifiedReportPage.test.tsx`

**Interfaces:**
- Consumes: `searchParams`/`setSearchParams` from Task 12 (already wired for `scanId`) — extend the same `URLSearchParams` object with `search`, `severities`, `tools`, `finding` keys rather than introducing a second state mechanism.

- [ ] **Step 1: Write the failing test**

```tsx
// add to src/tests/pages/UnifiedReportPage.test.tsx
test('browser back closes the open finding panel before leaving the page', async () => {
  api.reports.getUnified = vi.fn().mockResolvedValue({
    project_id: 'test-project', scan_id: 'test-scan', total_findings: 1,
    severity: { critical: 1, high: 0, medium: 0, low: 0, info: 0 },
    findings: [{ id: 'f1', severity: 'Critical', title: 'Finding One', tool: 'zap' }],
    generated_at: new Date().toISOString(),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/projects/test-project/reports/unified"]}>
          <Routes>
            <Route path="/projects/:projectId/reports/unified" element={<UnifiedReportPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
  (await screen.findByText('Finding One')).click();
  expect(await screen.findByText('Finding details')).toBeInTheDocument();
  expect(window.location.search).toContain('finding=f1');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/pages/UnifiedReportPage.test.tsx -t "closes the open finding panel"`
Expected: FAIL — `selectedFinding` is local state, URL never changes

- [ ] **Step 3: Implement**

In `src/pages/UnifiedReportPage.tsx`, replace `selectedFinding` local state (line 34) with a derived value from `searchParams`, alongside setters that push into the URL. Add after the `selectedScanId` URL wiring from Task 12:

```tsx
const openFindingId = searchParams.get('finding');
const selectedFinding = openFindingId
  ? filteredFindings.find((f) => f.id === openFindingId) ?? null
  : null;
const setSelectedFinding = (finding: Finding | null) => {
  setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    if (finding) next.set('finding', finding.id);
    else next.delete('finding');
    return next;
  });
};
```

Note: `filteredFindings` is computed after the early returns (loading/no-scans/no-report checks), so this derivation must be placed after that computation (after line 178), not with the other hooks at the top — since it depends on `filteredFindings`, which itself depends on `report`. Remove the old `useState<Finding | null>(null)` declaration at line 34 entirely; everywhere `setSelectedFinding` was previously called (`onClick` handlers, `FindingDetailModal`'s `onClose`/`onPrev`/`onNext`) keeps working unchanged since the function signature is identical.

Because `setSearchParams` pushes a new browser history entry by default (no `{ replace: true }` on this one, unlike the scan-id setter), pressing Back removes `finding` from the URL first — closing the panel — before a second Back leaves the page. This is the actual fix for the "Back button navigates away" complaint in #7.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/pages/UnifiedReportPage.test.tsx -t "closes the open finding panel"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/UnifiedReportPage.tsx src/tests/pages/UnifiedReportPage.test.tsx
git commit -m "fix(reports): mirror open finding into URL so Back closes the panel instead of navigating away"
```

---

### Task 15: "Filtered" indicator persists across scan switches (#12)

**Files:**
- Modify: `src/pages/ProjectReportsPage.tsx`, `src/components/reports/FindingsTable.tsx`
- Test: `src/tests/components/FindingsTable.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// add to src/tests/components/FindingsTable.test.tsx
test('shows a Filtered chip when severity filter is active', () => {
  render(<FindingsTable findings={findings} selectedTool="sonar" />);
  screen.getByRole('button', { name: /^Critical/ }).click();
  expect(screen.getByText('Filtered')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/components/FindingsTable.test.tsx -t "Filtered chip"`
Expected: FAIL — no "Filtered" text

- [ ] **Step 3: Implement**

In `src/components/reports/FindingsTable.tsx`, add a chip next to the findings count in the header (lines 137-143):

```tsx
<h3 className="font-semibold text-slate-900 flex items-center gap-2">
  Findings — <span className="tabular-nums">{filteredFindings.length}</span>
  {filteredFindings.length !== findings.length && (
    <span className="text-sm font-normal text-slate-500 tabular-nums"> of {findings.length}</span>
  )}
  {(severityFilter !== 'All' || toolFilter !== 'All' || searchText) && (
    <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 rounded-full">Filtered</span>
  )}
</h3>
```

Since this component is remounted fresh per `selectedTool` (tool switch happens via sidebar, not scan switch, and this component's internal state — `severityFilter`, `toolFilter`, `searchText` — is not reset on `scanId` change because `scanId` isn't in its props at all, so React keeps the instance and its state across scan switches by default), the chip already covers the "persists across scan switches" case with no extra plumbing needed — the bug was purely that no visible indicator existed, not that state didn't persist.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/components/FindingsTable.test.tsx -t "Filtered chip"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/reports/FindingsTable.tsx src/tests/components/FindingsTable.test.tsx
git commit -m "fix(reports): show a Filtered indicator so filter state doesn't silently carry across scan switches"
```

---

### Task 16: Scan selector shows severity/count delta (#23)

**Files:**
- Modify: `src/pages/ProjectReportsPage.tsx`, `src/pages/UnifiedReportPage.tsx`
- Test: `src/tests/pages/ProjectReportsPage.test.tsx`

**Issue:** Scan `<option>`s show only id/date, no finding counts.

**Interfaces:**
- Consumes: `api.reports.getSummary(projectId, scanId)` — already exists (`src/services/api.ts:206-212`). Fetching a summary per scan in the dropdown is N+1; scope this to only the visible scan list (typically ≤20 entries) using `useQueries` from TanStack Query, not a new backend batch endpoint.

- [ ] **Step 1: Write the failing test**

```tsx
// add to src/tests/pages/ProjectReportsPage.test.tsx
test('scan selector options show severity counts', async () => {
  api.reports.getSummary = vi.fn().mockImplementation((_pid, scanId) =>
    Promise.resolve({ severity: { critical: scanId === 'scan-1' ? 3 : 0, high: 1, medium: 0, low: 0, info: 0 } })
  );
  // ...render with 2 completed scans (scan-1, scan-2), same pattern as existing setup...
  const option = await screen.findByRole('option', { name: /3C 1H/ });
  expect(option).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/pages/ProjectReportsPage.test.tsx -t "severity counts"`
Expected: FAIL — option text has no severity counts

- [ ] **Step 3: Implement**

In `src/pages/ProjectReportsPage.tsx`, add `useQueries` to the import (line 4):

```tsx
import { useQuery, useQueries } from '@tanstack/react-query';
```

After the `completedScans` memo (line 45-49), fetch a summary per scan:

```tsx
const scanSummaryQueries = useQueries({
  queries: completedScans.map((s: Scan) => ({
    queryKey: ['reportSummary', projectId, s.scan_id],
    queryFn: () => api.reports.getSummary(projectId!, s.scan_id),
    enabled: !!projectId,
  })),
});
```

Update the `<option>` rendering (lines 286-290):

```tsx
{completedScans.map((s: Scan, idx: number) => {
  const sev = scanSummaryQueries[idx]?.data?.severity;
  const countsLabel = sev ? ` — ${sev.critical}C ${sev.high}H ${sev.medium}M` : '';
  return (
    <option key={s.scan_id} value={s.scan_id}>
      Scan #{completedScans.length - idx} — {s.scan_id.slice(0, 8)}…{countsLabel} ({new Date(s.created_at || '').toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })})
    </option>
  );
})}
```

Note this reuses the `['reportSummary', projectId, scanId]` query key already used elsewhere on this page (line 60), so React Query dedupes the currently-selected scan's fetch automatically — only the *other* scans in the dropdown cost an extra request each, and TanStack Query's default caching means switching scans doesn't refetch.

Apply the same treatment to `src/pages/UnifiedReportPage.tsx`'s scan `<select>` (lines 250-254) if time allows in this task; if deferred, file it as a follow-up rather than silently skipping — this plan treats it as in-scope, so implement it there too using the same `useQueries` pattern against `api.reports.getSummary(projectId, s.scan_id)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/pages/ProjectReportsPage.test.tsx -t "severity counts"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/ProjectReportsPage.tsx src/pages/UnifiedReportPage.tsx src/tests/pages/ProjectReportsPage.test.tsx
git commit -m "fix(reports): show severity counts in scan selector options"
```

---

## Phase 3: IA & filter consistency

### Task 17: "You are here" indicator across report variants (#4)

**Files:**
- Create: `src/components/reports/ReportVariantNav.tsx`
- Modify: `src/pages/ProjectReportsPage.tsx`, `src/pages/UnifiedReportPage.tsx`, `src/pages/DeveloperReportPage.tsx`, `src/pages/ExecutiveSummaryPage.tsx`
- Test: `src/tests/components/ReportVariantNav.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { test, expect } from 'vitest';
import { ReportVariantNav } from '../../components/reports/ReportVariantNav';

test('marks the current report variant as active', () => {
  render(
    <MemoryRouter>
      <ReportVariantNav projectId="p1" active="scan" />
    </MemoryRouter>
  );
  expect(screen.getByRole('link', { name: 'Scan report' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'Unified report' })).not.toHaveAttribute('aria-current');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/components/ReportVariantNav.test.tsx`
Expected: FAIL — module doesn't exist

- [ ] **Step 3: Implement**

Create `src/components/reports/ReportVariantNav.tsx`:

```tsx
import { Link } from 'react-router-dom';

type Variant = 'scan' | 'unified' | 'executive' | 'developer';

interface ReportVariantNavProps {
  projectId: string;
  active: Variant;
  scanId?: string;
}

const VARIANTS: { key: Variant; label: string; href: (projectId: string, scanId?: string) => string }[] = [
  { key: 'scan', label: 'Scan report', href: (p) => `/projects/${p}/reports` },
  { key: 'unified', label: 'Unified report', href: (p) => `/projects/${p}/reports/unified` },
  { key: 'executive', label: 'Executive summary', href: () => `/dashboard/executive` },
  { key: 'developer', label: 'Developer view', href: (p, s) => `/projects/${p}/reports/${s}/developer` },
];

export const ReportVariantNav = ({ projectId, active, scanId }: ReportVariantNavProps) => (
  <nav className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit mb-4" aria-label="Report variant">
    {VARIANTS.map((v) => (
      <Link
        key={v.key}
        to={v.href(projectId, scanId)}
        aria-current={active === v.key ? 'page' : undefined}
        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
          active === v.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        {v.label}
      </Link>
    ))}
  </nav>
);
```

Mount it in each page's header. `ProjectReportsPage.tsx`, after the breadcrumb `<div>` (after line 275):

```tsx
<ReportVariantNav projectId={projectId || ''} active="scan" scanId={selectedScanId} />
```

`UnifiedReportPage.tsx`, after the header row (after line 207):

```tsx
<ReportVariantNav projectId={projectId} active="unified" scanId={selectedScanId} />
```

`DeveloperReportPage.tsx`, after the breadcrumb (after line 109):

```tsx
<ReportVariantNav projectId={projectId || ''} active="developer" scanId={scanId} />
```

Add the matching import (`import { ReportVariantNav } from '../components/reports/ReportVariantNav';`) to each of the three files.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/components/ReportVariantNav.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/reports/ReportVariantNav.tsx src/pages/ProjectReportsPage.tsx src/pages/UnifiedReportPage.tsx src/pages/DeveloperReportPage.tsx src/tests/components/ReportVariantNav.test.tsx
git commit -m "feat(reports): add a you-are-here nav across the four report variants"
```

---

### Task 18: Move FilterBar above the findings table / make it sticky (#21)

**Files:**
- Modify: `src/pages/UnifiedReportPage.tsx`
- Test: manual (layout-only change; no meaningful RTL assertion for scroll position — jsdom has no real layout engine)

- [ ] **Step 1: Implement**

In `src/pages/UnifiedReportPage.tsx`, move the `<FilterBar ... />` block (lines 376-384) to immediately precede the `<div id="Findings" ...>` block. Since jsdom doesn't lay out `position: sticky` meaningfully, there's no reliable automated test for this — verify visually instead. Move `<FilterBar>` so it directly precedes the `{/* Findings Table */}` div (immediately above line 387 in the current file), and add sticky positioning:

```tsx
{/* Filter Bar */}
<div className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-sm pt-2 pb-2 -mx-8 px-8">
  <FilterBar
    search={search}
    onSearchChange={setSearch}
    selectedSeverities={selectedSeverities}
    onSeverityChange={setSelectedSeverities}
    selectedTools={selectedTools}
    onToolChange={setSelectedTools}
    availableTools={availableTools}
  />
</div>
```

- [ ] **Step 2: Verify manually**

Run: `npm run dev`, navigate to a project's unified report, scroll down — confirm the filter bar sticks near the top instead of requiring a scroll-up round trip, and confirm it now sits directly above the findings table rather than 6 sections below the page start.

- [ ] **Step 3: Commit**

```bash
git add src/pages/UnifiedReportPage.tsx
git commit -m "fix(reports): move filter bar next to the findings table it filters, make it sticky"
```

---

### Task 19: Unify the two filter UIs (#22)

**Files:**
- Create: `src/components/reports/FindingsFilterBar.tsx`
- Modify: `src/pages/UnifiedReportPage.tsx`, `src/components/reports/FindingsTable.tsx`
- Delete: `src/components/FilterBar.tsx` (after confirming no other importers — check with `grep -rn "from '.*FilterBar'" src`)
- Test: `src/tests/components/FindingsFilterBar.test.tsx`

**Issue:** `FilterBar` (multi-select toggle pills) and `FindingsTable`'s inline filter bar (single-select buttons + `<select>`) implement the same concept two incompatible ways.

**Interfaces:**
- Produces: `FindingsFilterBar` — single-select severity buttons matching `FindingsTable`'s existing visual style (already proven, already has the "Filtered" chip and accessible labels from Tasks 9/15), used by both `UnifiedReportPage` and `FindingsTable`. This picks `FindingsTable`'s interaction model as the winner since it's the more recently built, more complete one (has counts per severity, already accessible).

```ts
interface FindingsFilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  severityFilter: string; // 'All' | SeverityLevel
  onSeverityChange: (v: string) => void;
  toolFilter: string; // 'All' | tool name
  onToolChange: (v: string) => void;
  availableTools: string[];
  severityCounts: Record<string, number>;
  toolLocked?: boolean; // true when a sidebar tool selection makes the tool dropdown inert (Task 6)
}
```

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { test, expect, vi } from 'vitest';
import { FindingsFilterBar } from '../../components/reports/FindingsFilterBar';

test('clicking a severity button calls onSeverityChange with that severity', () => {
  const onSeverityChange = vi.fn();
  render(
    <FindingsFilterBar
      search="" onSearchChange={() => {}}
      severityFilter="All" onSeverityChange={onSeverityChange}
      toolFilter="All" onToolChange={() => {}}
      availableTools={['sonar']}
      severityCounts={{ All: 2, Critical: 1 }}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: /Critical/ }));
  expect(onSeverityChange).toHaveBeenCalledWith('Critical');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/components/FindingsFilterBar.test.tsx`
Expected: FAIL — module doesn't exist

- [ ] **Step 3: Implement — extract the shared component**

Create `src/components/reports/FindingsFilterBar.tsx` by extracting the exact filter-bar JSX currently in `FindingsTable.tsx` (lines 164-209, the severity buttons + tool select + search input), parameterized via the props above instead of local state:

```tsx
import { Search } from 'lucide-react';
import { SEVERITY_LEVELS } from '../../utils/severity';

interface FindingsFilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  severityFilter: string;
  onSeverityChange: (v: string) => void;
  toolFilter: string;
  onToolChange: (v: string) => void;
  availableTools: string[];
  severityCounts: Record<string, number>;
  toolLocked?: boolean;
}

const SEVERITIES = ['All', ...SEVERITY_LEVELS] as const;

export const FindingsFilterBar = ({
  search, onSearchChange,
  severityFilter, onSeverityChange,
  toolFilter, onToolChange,
  availableTools, severityCounts, toolLocked,
}: FindingsFilterBarProps) => (
  <div className="p-4 border-b border-slate-200 space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      {SEVERITIES.map((sev) => {
        const count = severityCounts[sev] ?? 0;
        const active = severityFilter === sev;
        return (
          <button
            key={sev}
            onClick={() => onSeverityChange(sev)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-200 ${
              active ? 'bg-slate-900 text-white shadow-md ring-2 ring-slate-400' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900'
            }`}
          >
            {sev}{count > 0 ? ` ${count}` : ''}
          </button>
        );
      })}
    </div>
    <div className="flex items-center gap-3">
      <select
        value={toolFilter}
        onChange={(e) => onToolChange(e.target.value)}
        disabled={toolLocked}
        aria-label="Filter by tool"
        className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 disabled:bg-slate-50 disabled:text-slate-400"
      >
        <option value="All">All tools</option>
        {availableTools.map((tool) => (
          <option key={tool} value={tool}>{tool.replace(/_/g, ' ')}</option>
        ))}
      </select>
      <div className="flex-1 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search by title, rule, type, package, or host…"
          aria-label="Search findings"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
        />
      </div>
    </div>
  </div>
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/components/FindingsFilterBar.test.tsx`
Expected: PASS

- [ ] **Step 5: Wire `FindingsTable.tsx` to use it**

Replace the inline filter JSX (lines 164-209) with:

```tsx
<FindingsFilterBar
  search={searchText}
  onSearchChange={setSearchText}
  severityFilter={severityFilter}
  onSeverityChange={setSeverityFilter}
  toolFilter={selectedTool || toolFilter}
  onToolChange={setToolFilter}
  availableTools={uniqueTools}
  severityCounts={severityCounts}
  toolLocked={!!selectedTool}
/>
```

Add the import: `import { FindingsFilterBar } from './FindingsFilterBar';`

- [ ] **Step 6: Wire `UnifiedReportPage.tsx` to use it, replacing `FilterBar`**

`UnifiedReportPage`'s current filter state is multi-select (`selectedSeverities: string[]`, `selectedTools: string[]`) — `FindingsFilterBar` is single-select to match the winning model. Change the state shape:

```tsx
const [selectedSeverity, setSelectedSeverity] = useState<string>('All');
const [selectedToolFilter, setSelectedToolFilter] = useState<string>('All');
```

Update `filteredFindings` (lines 163-178) severity/tool checks:

```tsx
if (selectedSeverity !== 'All' && f.severity !== selectedSeverity) return false;
if (selectedToolFilter !== 'All' && f.tool !== selectedToolFilter) return false;
```

Compute `severityCounts` the same way as `FindingsTable` (add before the `filteredFindings` block):

```tsx
const severityCounts = report.findings.reduce<Record<string, number>>((counts, f) => {
  counts.All = (counts.All || 0) + 1;
  counts[f.severity] = (counts[f.severity] || 0) + 1;
  return counts;
}, {});
```

Replace the `<FilterBar ... />` usage (from Task 18's relocated block) with:

```tsx
<FindingsFilterBar
  search={search}
  onSearchChange={setSearch}
  severityFilter={selectedSeverity}
  onSeverityChange={setSelectedSeverity}
  toolFilter={selectedToolFilter}
  onToolChange={setSelectedToolFilter}
  availableTools={availableTools}
  severityCounts={severityCounts}
/>
```

Replace the import `import FilterBar from '../components/FilterBar';` with `import { FindingsFilterBar } from '../components/reports/FindingsFilterBar';`.

Update the affected test file: `src/tests/pages/UnifiedReportPage.test.tsx`'s existing assertions that reference multi-select filter behavior (search the file for `selectedSeverities`/`selectedTools` usage — there should be none directly, since tests interact via rendered controls, but re-run the full suite to catch any breakage):

Run: `npx vitest run src/tests/pages/UnifiedReportPage.test.tsx`
Expected: PASS (all existing tests, since the rendered search input and severity buttons keep the same accessible names)

- [ ] **Step 7: Remove the now-unused `FilterBar.tsx`**

```bash
grep -rn "from '.*FilterBar'" src --include="*.tsx" --include="*.ts"
```

Expected: no remaining importers other than the ones just changed. Then:

```bash
git rm src/components/FilterBar.tsx
```

- [ ] **Step 8: Commit**

```bash
git add src/components/reports/FindingsFilterBar.tsx src/components/reports/FindingsTable.tsx src/pages/UnifiedReportPage.tsx src/tests/components/FindingsFilterBar.test.tsx
git commit -m "refactor(reports): unify the two findings-filter UIs into one shared component"
```

---

## Phase 4: Workflow features

### Task 20: Scan comparison view (#8, highest value)

**Files:**
- Create: `src/utils/scanDiff.ts`, `src/components/reports/ScanComparisonView.tsx`
- Modify: `src/pages/UnifiedReportPage.tsx`
- Test: `src/tests/utils/scanDiff.test.ts`, `src/tests/components/ScanComparisonView.test.tsx`

**Issue:** No structured diff between the selected scan and the previous one — only aggregate trend counts exist.

**Interfaces:**
- Produces:
```ts
// src/utils/scanDiff.ts
export interface ScanDiffResult {
  resolved: Finding[];  // in previous, not in current
  persisting: Finding[]; // in both
  introduced: Finding[]; // in current, not in previous
}
export function diffFindings(previous: Finding[], current: Finding[]): ScanDiffResult;
export function findingKey(f: Finding): string; // `${f.tool ?? 'unknown'}:${f.id}`
```
- Consumes (Task 21, 22 depend on this): `findingKey` is the shared stable-identity function other tasks reuse — don't reimplement diff-key logic elsewhere.

- [ ] **Step 1: Write the failing test for the diff util**

```ts
// src/tests/utils/scanDiff.test.ts
import { test, expect } from 'vitest';
import { diffFindings, findingKey } from '../../utils/scanDiff';
import type { Finding } from '../../types';

const f = (id: string, tool: string, title = id): Finding & { tool: string } => ({ id, tool, title, severity: 'High' });

test('findingKey combines tool and id', () => {
  expect(findingKey(f('A1', 'zap'))).toBe('zap:A1');
});

test('diffFindings buckets resolved/persisting/introduced correctly', () => {
  const previous = [f('A1', 'zap'), f('B1', 'sonar')];
  const current = [f('B1', 'sonar'), f('C1', 'trivy')];
  const result = diffFindings(previous, current);
  expect(result.resolved.map((x) => x.id)).toEqual(['A1']);
  expect(result.persisting.map((x) => x.id)).toEqual(['B1']);
  expect(result.introduced.map((x) => x.id)).toEqual(['C1']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/utils/scanDiff.test.ts`
Expected: FAIL — module doesn't exist

- [ ] **Step 3: Implement `scanDiff.ts`**

```ts
import type { Finding } from '../types';

export interface ScanDiffResult {
  resolved: Finding[];
  persisting: Finding[];
  introduced: Finding[];
}

export function findingKey(f: Finding): string {
  return `${f.tool ?? 'unknown'}:${f.id}`;
}

export function diffFindings(previous: Finding[], current: Finding[]): ScanDiffResult {
  const previousKeys = new Set(previous.map(findingKey));
  const currentKeys = new Set(current.map(findingKey));

  return {
    resolved: previous.filter((f) => !currentKeys.has(findingKey(f))),
    persisting: current.filter((f) => previousKeys.has(findingKey(f))),
    introduced: current.filter((f) => !previousKeys.has(findingKey(f))),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/utils/scanDiff.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing test for the comparison view component**

```tsx
// src/tests/components/ScanComparisonView.test.tsx
import { render, screen } from '@testing-library/react';
import { test, expect } from 'vitest';
import { ScanComparisonView } from '../../components/reports/ScanComparisonView';

const f = (id: string, title: string): any => ({ id, tool: 'zap', title, severity: 'High' });

test('shows resolved, persisting, and new counts prominently', () => {
  render(
    <ScanComparisonView
      previous={[f('a', 'Old finding'), f('b', 'Still here')]}
      current={[f('b', 'Still here'), f('c', 'Brand new')]}
    />
  );
  expect(screen.getByText('1')).toBeInTheDocument(); // resolved count appears at least once
  expect(screen.getByText('Old finding')).toBeInTheDocument();
  expect(screen.getByText('Brand new')).toBeInTheDocument();
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/tests/components/ScanComparisonView.test.tsx`
Expected: FAIL — module doesn't exist

- [ ] **Step 7: Implement `ScanComparisonView.tsx`**

```tsx
import { diffFindings } from '../../utils/scanDiff';
import { getSeverityColor } from '../../utils/risk';
import type { Finding } from '../../types';
import { CheckCircle2, AlertTriangle, Plus } from 'lucide-react';

interface ScanComparisonViewProps {
  previous: Finding[];
  current: Finding[];
}

const Section = ({ title, icon, items, tone }: { title: string; icon: React.ReactNode; items: Finding[]; tone: string }) => (
  <div className="bg-white rounded-2xl border border-slate-200 p-6">
    <h3 className={`text-sm font-semibold mb-4 flex items-center gap-2 ${tone}`}>
      {icon} {title} <span className="tabular-nums">({items.length})</span>
    </h3>
    {items.length === 0 ? (
      <p className="text-sm text-slate-500">None.</p>
    ) : (
      <ul className="space-y-2">
        {items.map((f) => (
          <li key={f.id} className="flex items-center gap-2 text-sm">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${getSeverityColor(f.severity)}`}>{f.severity}</span>
            <span className="text-slate-900 truncate">{f.title}</span>
          </li>
        ))}
      </ul>
    )}
  </div>
);

export const ScanComparisonView = ({ previous, current }: ScanComparisonViewProps) => {
  const { resolved, persisting, introduced } = diffFindings(previous, current);
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Section title="Resolved since last scan" icon={<CheckCircle2 className="w-4 h-4" />} items={resolved} tone="text-emerald-700" />
      <Section title="Still open" icon={<AlertTriangle className="w-4 h-4" />} items={persisting} tone="text-amber-700" />
      <Section title="New this scan" icon={<Plus className="w-4 h-4" />} items={introduced} tone="text-red-700" />
    </div>
  );
};
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/tests/components/ScanComparisonView.test.tsx`
Expected: PASS

- [ ] **Step 9: Wire into `UnifiedReportPage.tsx`**

The page needs the previous scan's findings. Fetch it when `reportType === 'comparison'`. Add near the other `useEffect`s (after Task 1's export handler, before the render):

```tsx
const previousScanId = scans[scans.findIndex((s) => s.scan_id === selectedScanId) + 1]?.scan_id;
const { data: previousReport } = useQuery({
  queryKey: ['unified-report', projectId, previousScanId],
  queryFn: () => api.reports.getUnified(projectId!, previousScanId),
  enabled: reportType === 'comparison' && !!projectId && !!previousScanId,
});
```

This requires `useQuery` from `@tanstack/react-query` — add the import: `import { useQuery } from '@tanstack/react-query';`. (`scans` here comes from `useScanHistory`, already sorted newest-first per `src/hooks/useScanHistory.ts:19-21`, so `+1` index is the previous scan.)

Render the comparison view conditionally, right after the Compliance section (after line 373), before the Filter Bar:

```tsx
{reportType === 'comparison' && (
  <div className="mb-8">
    <h3 className="text-sm font-semibold text-slate-900 mb-4">
      Comparison with previous scan
    </h3>
    {!previousScanId ? (
      <p className="text-sm text-slate-500">This is the first scan — nothing to compare against yet.</p>
    ) : previousReport ? (
      <ScanComparisonView previous={previousReport.findings} current={report.findings} />
    ) : (
      <p className="text-sm text-slate-500">Loading comparison…</p>
    )}
  </div>
)}
```

Add the import: `import { ScanComparisonView } from '../components/reports/ScanComparisonView';`.

Note the "Comparison Report" `<option>` from Task 1's dropdown (currently labeled "Comparison export" since Task 1 relabeled it for export) now doubles as an on-screen view toggle too — since it changes real page content now, revert its label back to something that fits both jobs:

```tsx
<option value="comparison">Comparison (on-screen + export)</option>
```

- [ ] **Step 10: Commit**

```bash
git add src/utils/scanDiff.ts src/components/reports/ScanComparisonView.tsx src/pages/UnifiedReportPage.tsx src/tests/utils/scanDiff.test.ts src/tests/components/ScanComparisonView.test.tsx
git commit -m "feat(reports): add scan-to-scan comparison view (resolved/persisting/new findings)"
```

---

### Task 21: New-finding badge using the diff logic (#10)

**Files:**
- Modify: `src/components/reports/FindingsTable.tsx`, `src/pages/ProjectReportsPage.tsx`
- Test: `src/tests/components/FindingsTable.test.tsx`

**Interfaces:**
- Consumes: `diffFindings`/`findingKey` from Task 20's `src/utils/scanDiff.ts`.

- [ ] **Step 1: Write the failing test**

```tsx
// add to src/tests/components/FindingsTable.test.tsx
test('shows a New badge on findings absent from the previous scan set', () => {
  const previousKeys = new Set(['sonar:1']); // finding id "2" is new
  render(<FindingsTable findings={findings} selectedTool="sonar" previousScanFindingKeys={previousKeys} />);
  expect(screen.queryByText('New')).not.toBeInTheDocument(); // id "1" (sonar) was present before — no badge
});
```

(This fixture only has id `'1'`/sonar and id `'2'`/trivy per the file's existing `findings` const — adjust the assertion to check the sonar-scoped row specifically has no "New" badge, and add a second test with an empty `previousScanFindingKeys` set asserting "New" does appear.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/components/FindingsTable.test.tsx -t "New badge"`
Expected: FAIL — no `previousScanFindingKeys` prop exists yet

- [ ] **Step 3: Implement**

In `src/components/reports/FindingsTable.tsx`, add the prop and badge. Extend `FindingsTableProps` (lines 15-20):

```tsx
interface FindingsTableProps {
  findings: (Finding & { tool: string })[];
  projectId?: string;
  scanId?: string;
  selectedTool?: string | null;
  previousScanFindingKeys?: Set<string>; // from findingKey() over the previous scan's findings
}
```

Add `previousScanFindingKeys` to the destructured props and import `findingKey`:

```tsx
import { findingKey } from '../../utils/scanDiff';
// ...
export const FindingsTable = ({ findings, projectId, scanId, selectedTool, previousScanFindingKeys }: FindingsTableProps) => {
```

Add a badge next to the title in both list view (after line 321) and grouped view (after line 270). List view `<td>`:

```tsx
<td className="px-4 py-3 text-sm text-slate-900 max-w-xs truncate">
  {finding.title}
  {previousScanFindingKeys && !previousScanFindingKeys.has(findingKey(finding)) && (
    <span className="ml-2 px-1.5 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-700 rounded">New</span>
  )}
</td>
```

Grouped view, inside the row div (after the `<span className="truncate">` for host/package, around line 270):

```tsx
{previousScanFindingKeys && !previousScanFindingKeys.has(findingKey(finding)) && (
  <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-700 rounded">New</span>
)}
```

In `src/pages/ProjectReportsPage.tsx`, compute and pass the previous scan's finding-key set. After `allFindings` (line 133-141), add:

```tsx
const previousCompletedScan = completedScans[currentScanIndex + 1];
const { data: previousReports = [] } = useQuery({
  queryKey: ['reports', projectId, previousCompletedScan?.scan_id],
  queryFn: () => api.reports.getAll(projectId!, previousCompletedScan!.scan_id),
  enabled: !!projectId && !!previousCompletedScan,
});
const previousScanFindingKeys = useMemo(() => {
  const keys = new Set<string>();
  (previousReports as ReportDetail[]).forEach((report) => {
    report.findings?.forEach((finding) => keys.add(findingKey({ ...finding, tool: report.tool })));
  });
  return keys;
}, [previousReports]);
```

Add the `findingKey` import: `import { findingKey } from '../utils/scanDiff';`.

Pass it down to `FindingsTable` (line 320-325):

```tsx
<FindingsTable
  findings={allFindings}
  projectId={projectId}
  scanId={selectedScanId}
  selectedTool={selectedTool}
  previousScanFindingKeys={previousScanFindingKeys}
/>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/components/FindingsTable.test.tsx -t "New badge"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/reports/FindingsTable.tsx src/pages/ProjectReportsPage.tsx src/tests/components/FindingsTable.test.tsx
git commit -m "feat(reports): badge findings that are new since the previous scan"
```

---

### Task 22: Bulk triage — select findings and create issues in batch (#9)

**Files:**
- Modify: `src/components/reports/FindingsTable.tsx`
- Test: `src/tests/components/FindingsTable.test.tsx`

**Interfaces:**
- Consumes: `useCreateIssue` from `src/hooks/useIssues.ts` (already used singly in `FindingDetailModal.tsx:6,51`) — reuse the same mutation hook in a loop rather than building a new bulk-specific API call, since no backend batch-create endpoint exists and adding one is out of scope for this plan.

- [ ] **Step 1: Write the failing test**

```tsx
// add to src/tests/components/FindingsTable.test.tsx
import { vi } from 'vitest';
vi.mock('../../hooks/useRbac', () => ({ useRbac: () => ({ canAssignIssues: true }) }));
vi.mock('../../hooks/useIssues', () => ({ useCreateIssue: () => ({ mutateAsync: vi.fn().mockResolvedValue({ id: 1 }), isPending: false }) }));

test('selecting Critical findings and bulk-creating issues calls create per selected finding', async () => {
  render(<FindingsTable findings={findings} projectId="p1" scanId="s1" selectedTool="sonar" />, { wrapper: /* existing QueryClientProvider + MemoryRouter + ToastProvider wrapper used elsewhere in this file — reuse it, do not inline a bespoke one */ });
  screen.getByRole('button', { name: 'Select all Critical' }).click();
  screen.getByRole('button', { name: /Create issues for selected/ }).click();
  await screen.findByText(/1 issue created/);
});
```

(Match this test's wrapper to whatever provider setup the rest of `FindingsTable.test.tsx` already uses for tests that render `FindingDetailModal` internals — if no such wrapper exists yet in this file because earlier tasks' tests didn't need RBAC/toast context, add one now following the exact pattern from `src/tests/pages/UnifiedReportPage.test.tsx:10-30,65-81`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/components/FindingsTable.test.tsx -t "bulk-creating"`
Expected: FAIL — no "Select all Critical" button exists

- [ ] **Step 3: Implement**

In `src/components/reports/FindingsTable.tsx`, add selection state and imports:

```tsx
import { useRbac } from '../../hooks/useRbac';
import { useCreateIssue } from '../../hooks/useIssues';
import { useToast } from '../Toast';
```

Inside the component, after `expandedTypes` state (line 28):

```tsx
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
const { canAssignIssues } = useRbac();
const createMutation = useCreateIssue();
const { addToast } = useToast();

const toggleSelected = (id: string) => {
  setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
};

const selectAllCritical = () => {
  setSelectedIds(new Set(filteredFindings.filter((f) => f.severity === 'Critical').map((f) => f.id)));
};

const handleBulkCreate = async () => {
  if (!projectId || !scanId) return;
  const targets = filteredFindings.filter((f) => selectedIds.has(f.id) && f.tool);
  let created = 0;
  for (const finding of targets) {
    try {
      await createMutation.mutateAsync({
        issue_id: `${finding.id}:${scanId}`,
        project_id: projectId,
        tool_name: finding.tool,
        severity: finding.severity,
        title: finding.title,
        scan_id: scanId,
      });
      created++;
    } catch {
      // continue with remaining selections; a single failure shouldn't abort the batch
    }
  }
  addToast({ type: created === targets.length ? 'success' : 'error', title: `${created} issue${created === 1 ? '' : 's'} created` });
  setSelectedIds(new Set());
};
```

Add the bulk-action bar in the header, only visible when `canAssignIssues` (after the view-mode toggle, inside the header div at lines 137-162):

```tsx
{canAssignIssues && (
  <div className="flex items-center gap-2">
    <button onClick={selectAllCritical} className="px-3 py-1 text-xs font-medium text-slate-600 hover:text-slate-900">
      Select all Critical
    </button>
    {selectedIds.size > 0 && (
      <button
        onClick={handleBulkCreate}
        disabled={createMutation.isPending}
        className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
      >
        Create issues for selected ({selectedIds.size})
      </button>
    )}
  </div>
)}
```

Add checkboxes to list-view rows (before the Severity `<td>`, inside the `<tr>` at line 310-315):

```tsx
{canAssignIssues && (
  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
    <input
      type="checkbox"
      aria-label={`Select ${finding.title}`}
      checked={selectedIds.has(finding.id)}
      onChange={() => toggleSelected(finding.id)}
    />
  </td>
)}
```

Add a matching empty/header `<th>` when `canAssignIssues` in the `<thead>` (line 296).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/components/FindingsTable.test.tsx -t "bulk-creating"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/reports/FindingsTable.tsx src/tests/components/FindingsTable.test.tsx
git commit -m "feat(reports): bulk-select findings and create issues for all selected at once"
```

---

### Task 23: Keyboard shortcut to create an issue from the side panel (#11)

**Files:**
- Modify: `src/components/ui/SidePanel.tsx`, `src/components/FindingDetailModal.tsx`
- Test: `src/tests/components/FindingDetailModal.test.tsx`

**Interfaces:**
- Produces: `SidePanel` gains an optional `onAction?: () => void` + `actionKey?: string` prop pair so it stays a generic panel (not finding-specific); `FindingDetailModal` passes its "create issue" handler through it.

- [ ] **Step 1: Write the failing test**

```tsx
// add to src/tests/components/FindingDetailModal.test.tsx
test('pressing C triggers Create issue when a match search has already run and found nothing', async () => {
  api.issues.findByFindingKey = vi.fn().mockResolvedValue(undefined);
  const createSpy = vi.fn().mockResolvedValue({ id: 1 });
  vi.mocked(api).issues = { ...api.issues, createIssue: createSpy } as any; // adjust to match actual useCreateIssue wiring in this codebase
  // ... render with findingA, click "Open in Issue Tracker" to set hasSearched=true (mirrors Task 8's test) ...
  fireEvent.keyDown(document, { key: 'c' });
  await vi.waitFor(() => expect(createSpy).toHaveBeenCalled());
});
```

(This test depends on `useCreateIssue`'s actual underlying API call — read `src/hooks/useIssues.ts` before writing the assertion to mock the right function; do not guess the API surface, verify it against the real file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/components/FindingDetailModal.test.tsx -t "pressing C"`
Expected: FAIL — no keydown handler for 'c' exists

- [ ] **Step 3: Implement**

In `src/components/ui/SidePanel.tsx`, extend the existing arrow-key effect (lines 34-44) to also support a generic action key, guarded by the same input-focus check already in place:

```tsx
interface SidePanelProps {
  // ...existing props...
  onAction?: () => void;
  actionKey?: string; // e.g. 'c' — case-insensitive
}

export function SidePanel({
  // ...existing destructured props...
  onAction,
  actionKey,
}: SidePanelProps) {
  // ...
  useEffect(() => {
    if (!isOpen) return;
    const handleKeys = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (e.key === 'ArrowLeft' && hasPrev) onPrev?.();
      if (e.key === 'ArrowRight' && hasNext) onNext?.();
      if (actionKey && e.key.toLowerCase() === actionKey.toLowerCase()) onAction?.();
    };
    document.addEventListener('keydown', handleKeys);
    return () => document.removeEventListener('keydown', handleKeys);
  }, [isOpen, hasPrev, hasNext, onPrev, onNext, onAction, actionKey]);
```

(Rename the existing `handleArrows` to `handleKeys` as shown — same function, extended.)

In `src/components/FindingDetailModal.tsx`, pass the action through. The "Create issue" button only makes sense once `hasSearched && !matchedIssue` (line 114 condition) — gate the shortcut identically:

```tsx
<SidePanel
  isOpen={isOpen}
  onClose={onClose}
  title="Finding details"
  onPrev={onPrev}
  onNext={onNext}
  hasPrev={hasPrev}
  hasNext={hasNext}
  position={position}
  footerContent={footerContent}
  actionKey="c"
  onAction={hasSearched && !matchedIssue ? handleCreateIssue : undefined}
>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/components/FindingDetailModal.test.tsx -t "pressing C"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/SidePanel.tsx src/components/FindingDetailModal.tsx src/tests/components/FindingDetailModal.test.tsx
git commit -m "feat(reports): add C keyboard shortcut to create an issue from the finding side panel"
```

---

### Task 24: "All tools" aggregate view in the scan report sidebar (#20)

**Files:**
- Modify: `src/pages/ProjectReportsPage.tsx`, `src/components/reports/ProjectReportLayout.tsx`
- Test: `src/tests/pages/ProjectReportsPage.test.tsx`

**Issue:** `FindingsTable` only renders once a specific tool is selected; no "All" aggregate entry.

- [ ] **Step 1: Write the failing test**

```tsx
// add to src/tests/pages/ProjectReportsPage.test.tsx
test('an All tools entry renders findings across every tool without requiring a tool click', async () => {
  // ...render with the existing mocked scan/report setup...
  expect(await screen.findByText(/Findings —/)).toBeInTheDocument(); // FindingsTable header, visible by default
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/pages/ProjectReportsPage.test.tsx -t "All tools entry"`
Expected: FAIL — the placeholder "Select a tool" block renders instead

- [ ] **Step 3: Implement**

In `src/pages/ProjectReportsPage.tsx`, change the default `selectedTool` state (line 28) from `null` to `'all'`, and treat `'all'` as "no tool filter" when passed to `FindingsTable`:

```tsx
const [selectedTool, setSelectedTool] = useState<string | null>('all');
```

Update the render branch (lines 319-338):

```tsx
{selectedTool ? (
  <FindingsTable
    findings={allFindings}
    projectId={projectId}
    scanId={selectedScanId}
    selectedTool={selectedTool === 'all' ? null : selectedTool}
    previousScanFindingKeys={previousScanFindingKeys}
  />
) : (
  /* unreachable now that default is 'all', kept only as a defensive fallback */
  <div className="bg-white rounded-2xl border border-slate-200 p-10 flex flex-col items-center justify-center h-full">
    ...
  </div>
)}
```

In `src/components/reports/ProjectReportLayout.tsx`, add an "All tools" entry above the per-tool list in the Tools card (before line 143's `{tools.map(...)}`):

```tsx
<button
  onClick={() => onToolSelect?.('all')}
  className={`w-full flex items-center justify-between p-2 rounded-lg transition-colors mb-1 ${
    selectedTool === 'all' ? 'bg-teal-50 border border-teal-200' : 'hover:bg-slate-50 border border-transparent'
  }`}
>
  <span className={`text-sm font-medium ${selectedTool === 'all' ? 'text-teal-900' : 'text-slate-900'}`}>All tools</span>
  <span className={`tabular-nums text-sm ${selectedTool === 'all' ? 'text-teal-700' : 'text-slate-600'}`}>
    {tools.reduce((sum, t) => sum + t.findings, 0)}
  </span>
</button>
```

Also update the per-tool button's `isSelected` check (line 145) to explicitly exclude `'all'` — it already does, since `selectedTool === tool.key` is false when `selectedTool === 'all'`, so no change needed there.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/pages/ProjectReportsPage.test.tsx -t "All tools entry"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/ProjectReportsPage.tsx src/components/reports/ProjectReportLayout.tsx src/tests/pages/ProjectReportsPage.test.tsx
git commit -m "feat(reports): add an All tools aggregate entry to the scan report sidebar"
```

---

## Final verification

- [ ] Run the full frontend test suite: `npx vitest run`
- [ ] Run typecheck: `npx tsc --noEmit`
- [ ] Run lint: `npx eslint src`
- [ ] Manually smoke-test in the running app (`npm run dev`): open a project's Scan report, Unified report, Executive summary, and Developer view; confirm TOC scroll-sync, comparison view, bulk triage, and the C shortcut all work as described.
- [ ] Update `TODO.md`: move items #1–25 from their current sections into a new "done ✅" entry (mirroring the existing "Reports UX fixes — done ✅" section format at line 375), so the file stays an accurate live record rather than going stale.
