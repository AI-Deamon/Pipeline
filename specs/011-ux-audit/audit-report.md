# Sentinel Frontend UX Audit Report

**Audit date**: 2026-06-16
**Auditor**: UX/UI Design Specialist agent
**Pages audited**: 19 / 19
**Overall UX Health Score**: 0 / 100

---

## Executive Summary

The Sentinel frontend demonstrates strong visual polish and a consistent design system, but it carries **a significant accessibility debt** and **inconsistent state management** that block users with disabilities and create false-positive UI states. The most urgent issues are: 6 pages exceed the 300-line constitutional limit (P3), modal dialogs across 4 pages are missing `aria-modal`, `aria-labelledby`, focus trap, and Escape-key handling (WCAG Level A violations), the Pending Verification page's "Live" indicator is hardcoded to `true` (false UI state), the Settings page stores the API key in `sessionStorage` (violates the documented `localStorage` order), and the Unified Report page silently swallows all data-fetch errors.

The platform works well for sighted, mouse-only users on desktop. It does not work for keyboard-only or screen-reader users in any flow that uses a modal dialog. It cannot reliably indicate when WebSocket connections drop. It cannot tell the user when a report fails to load.

### Severity Counts

| Severity | Count | Weight | Deduction |
|----------|-------|--------|-----------|
| Critical | 16    | 10     | 160       |
| Serious  | 7     | 5      | 35        |
| Moderate | 14    | 2      | 28        |
| Minor    | 12    | 0.5    | 6         |
| **Total**| **49**| —      | **229**   |

**UX Health Score**: `max(0, 100 − 229) = 0 / 100` (release-blocking)

### Top 5 Most Impactful Findings

1. **F-007 [CRITICAL]** — PendingVerificationPage hardcodes `wsConnected` to `true`, making the "Live" indicator a lie. The page is never actually offline-aware, and the dead offline banner never fires.
2. **F-002 / F-003 / F-005 [CRITICAL]** — 6 modals across 4 pages (ProjectControlPage, ScanStatusPage, ScanHistoryPage, UserManagementPage) are missing `aria-modal`, `aria-labelledby`, focus trap, and Escape key handling. Every modal in the app that is not the `ConfirmModal` component fails WCAG 4.1.2.
3. **F-006 [CRITICAL]** — UnifiedReportPage's `Promise.all(...).catch(() => setLoading(false))` silently swallows all three fetch errors. The user sees a permanent loading state and never knows the report failed to load.
4. **F-008 [CRITICAL]** — SettingsPage stores the API key in `sessionStorage`, but `AGENTS.md` mandates the lookup order `localStorage.getItem('API_KEY')` → `import.meta.env.VITE_API_KEY`. The implementation contradicts the documentation; reset/cancel operations will appear to fail when users reopen the tab.
5. **F-009–F-015, F-053 [CRITICAL]** — 7 of 19 pages exceed the 300-line constitutional limit (DashboardPage 407, CreateProjectPage 435, ProjectReportsPage 359, UnifiedReportPage 428, ScanStatusPage 378, ProjectGroupsPage 431, UserManagementPage 323). Constitution P3 violation; per-room refactoring required.

---

## Per-Page Findings

### LoginPage — `src/pages/LoginPage.tsx` (161 lines)

**Findings**: 1

- **[MINOR] F-039** — No "Forgot password?" recovery link — `src/pages/LoginPage.tsx:150–155`
  - **Category**: Microcopy
  - **Description**: Users who forget their password have no in-app recovery path. The page only offers "Create one" for new accounts. For a security tool, password recovery is a high-frequency need.
  - **Remediation**: Add a "Forgot password?" link below the password field (line 130). Route to `/forgot-password` or trigger an email reset flow.

> **Note**: LoginPage is otherwise well-implemented. Password toggle has `aria-label` (line 125), error states are explicit, and redirect-after-login is correct. No critical issues.

---

### RegisterPage — `src/pages/RegisterPage.tsx` (124 lines)

**Findings**: 2

- **[CRITICAL] F-001** — Password toggle button missing `aria-label` — `src/pages/RegisterPage.tsx:84–90`
  - **Category**: Accessibility
  - **Description**: The eye-icon button that toggles password visibility has no accessible name. Screen-reader users hear "button" with no context. **WCAG Level A violation (4.1.2 Name, Role, Value)**. LoginPage.tsx:125 has the correct `aria-label={showPassword ? 'Hide password' : 'Show password'}` — this is a direct regression.
  - **Remediation**: Add `aria-label={showPassword ? 'Hide password' : 'Show password'}` to the button. Better still, extract the password input + toggle into a shared `PasswordInput` component and reuse in both pages.
  - **WCAG**: 4.1.2 (Name, Role, Value, Level A)

- **[MODERATE] F-023** — Error handling uses raw `err.response` instead of `ApiError` helper — `src/pages/RegisterPage.tsx:23–27`
  - **Category**: Consistency
  - **Description**: LoginPage, ProjectEditPage, and ProjectControlPage all use `ApiError.getErrorMessage(err, fallback)`. RegisterPage hand-rolls a TypeScript narrowing on `err.response.data.detail`. Inconsistent and brittle.
  - **Remediation**: Replace with `setError(ApiError.getErrorMessage(err, 'Registration failed.'))`.

---

### DashboardPage — `src/pages/DashboardPage.tsx` (407 lines)

**Findings**: 2

- **[CRITICAL] F-009** — Page exceeds 300-line constitutional limit (407 lines; refactor `ProjectRow` sub-component)
  - **Category**: Consistency
  - **Description**: Constitution P3 "Files MUST stay under 300 lines. Split by responsibility when exceeded." The `ProjectRow` sub-component (lines 21–210) should be extracted to `src/components/ProjectRow.tsx`. The page itself (lines 214–405) would drop to ~190 lines.
  - **Remediation**: Extract `ProjectRow` to `src/components/ProjectRow.tsx`; export and import.

- **[MODERATE] F-024** — Active-scan alert is not announced to screen readers — `src/pages/DashboardPage.tsx:306–322`
  - **Category**: Accessibility
  - **Description**: The amber "Scan running on X" banner has alert-like styling but no `role="alert"` or `aria-live="polite"`. Sighted users see the banner; assistive-tech users get no announcement.
  - **Remediation**: Add `role="status"` to the outer `<div>` and `aria-live="polite"`. The polling refresh will update the count automatically; the role change is the fix.
  - **WCAG**: 4.1.3 (Status Messages, Level AA)

- **[MINOR] F-040** — Role badge icon is decorative but not `aria-hidden` — `src/pages/DashboardPage.tsx:282–292`
  - **Category**: Accessibility
  - **Description**: `Shield`, `ShieldAlert`, `User` icons are 12px decorative elements next to the role label. Screen readers will read the icon name (e.g., "shield") before the role name, creating noise.
  - **Remediation**: Add `aria-hidden="true"` to each `<Shield />` / `<ShieldAlert />` / `<User />`.
  - **WCAG**: 1.1.1 (Non-text Content, Level A)

---

### ProjectControlPage — `src/pages/ProjectControlPage.tsx` (291 lines)

**Findings**: 3

- **[CRITICAL] F-002** — Two modals missing `aria-modal`, `aria-labelledby`, focus trap, and Escape key — `src/pages/ProjectControlPage.tsx:238–261`, `:263–286`
  - **Category**: Accessibility
  - **Description**: Both the "Start Scan?" and "Delete Project?" modals use raw `<div role="dialog">` with no `aria-modal`, no `aria-labelledby` linking the `<h3>` to the dialog, no focus trap, and no Escape-key close. **WCAG 4.1.2 violation, multiple Level A failures.** Constitution P5 requires all four: focus trap, Escape key, `role="dialog"`, `aria-modal="true"`, `aria-labelledby`.
  - **Remediation**: Replace both inline modals with the existing `ConfirmModal` component (used correctly in ScanStatusPage:361 and ProjectGroupsPage:417). If the project has special needs that `ConfirmModal` cannot meet, add a generic `Modal` component that enforces the P5 contract.
  - **WCAG**: 4.1.2 (Name, Role, Value, Level A); 2.1.1 (Keyboard, Level A)

- **[MODERATE] F-025** — `getStatusBadge` helper duplicated from DashboardPage — `src/pages/ProjectControlPage.tsx:107–120` (cf. DashboardPage.tsx:48–89)
  - **Category**: Consistency
  - **Description**: Two near-identical `getStatusBadge` helpers. Drift will cause badges to disagree. ProjectEditPage will likely add a third.
  - **Remediation**: Extract to `src/components/StatusBadge.tsx` with props `state: ScanState`. Reuse across all pages that render scan state.

- **[MINOR] F-041** — Loading state has no descriptive text — `src/pages/ProjectControlPage.tsx:83–88`
  - **Category**: States
  - **Description**: Centered spinner with no text. Screen readers announce nothing; sighted users don't know what's loading.
  - **Remediation**: Wrap in `<div role="status" aria-live="polite">` with text "Loading project...".

---

### ProjectEditPage — `src/pages/ProjectEditPage.tsx` (115 lines)

**Findings**: 1

- **[MODERATE] F-026** — Error-state icon has borderline contrast — `src/pages/ProjectEditPage.tsx:72`
  - **Category**: Accessibility
  - **Description**: `<AlertCircle className="w-12 h-12 text-red-400" />` on a white card. `red-400` on white is approximately 3.5:1, below WCAG AA's 4.5:1 for non-text content used to identify status.
  - **Remediation**: Use `text-red-500` (4.6:1) or `text-red-600` (5.9:1). Also add `aria-hidden="true"` since the heading "Project not found" is the accessible name.
  - **WCAG**: 1.4.11 (Non-text Contrast, Level AA)

> **Note**: ProjectEditPage is otherwise clean. The form is correctly extracted to `ProjectForm` and the `isLocked` prop communicates the active-scan state.

---

### CreateProjectPage — `src/pages/CreateProjectPage.tsx` (435 lines)

**Findings**: 4

- **[CRITICAL] F-053** — Page exceeds 300-line constitutional limit (435 lines; longest in app)
  - **Category**: Consistency
  - **Description**: Constitution P3 violation. The 3-step stepper, form sections, and feature sidebar (lines 138–182) should be extracted to a `CreateProjectStepper` component and a `FeatureSidebar` component.
  - **Remediation**: Extract the `features` array + sidebar to `src/components/FeatureSidebar.tsx`. Extract the stepper (lines 187–215) to `src/components/MultiStepStepper.tsx`. The page should be <200 lines.

- **[SERIOUS] F-019** — Stepper missing `aria-current="step"` on the current step — `src/pages/CreateProjectPage.tsx:187–215`
  - **Category**: Accessibility
  - **Description**: Screen-reader users navigating the form cannot tell which of the 3 steps is active. The `step === s.num` branch (line 193) renders the active step visually but the wrapping `<div>` has no semantic marker.
  - **Remediation**: Add `aria-current="step"` to the active step's outer `<div>`. Make the entire stepper a `<nav aria-label="Create project steps">`.
  - **WCAG**: 1.3.1 (Info and Relationships, Level A); 4.1.2 (Name, Role, Value, Level A)

- **[MODERATE] F-027** — Form errors not announced to screen readers — `src/pages/CreateProjectPage.tsx:246`, `:264`
  - **Category**: Accessibility
  - **Description**: Error state is communicated only by `border-rose-500` class change. The `<p className="text-rose-500 text-xs">{errors.name}</p>` (line 248) has no `id`, and the `<input>` has no `aria-invalid` or `aria-describedby` linking to the error message.
  - **Remediation**: On error, add `aria-invalid="true"` and `aria-describedby="<error-id>"` to the `<input>`. Give the error `<p>` an `id`. Add `role="alert"` to a form-level error region that summarizes all errors when the user clicks "Continue".
  - **WCAG**: 1.3.1 (Info and Relationships, Level A); 3.3.1 (Error Identification, Level A)

- **[MINOR] F-042** — Stepper circles look clickable but are not — `src/pages/CreateProjectPage.tsx:191–200`
  - **Category**: Microcopy
  - **Description**: The stepper circles use `cursor-default` and have no click handler, but visually they look like buttons. Users may try to click them to jump to a previous step (which would be a reasonable feature).
  - **Remediation**: Either make completed steps clickable to navigate back (line 196: `step > s.num` branch) and add `cursor-pointer` + a `<button>` wrapper, OR add a tooltip "Click step to go back" so users understand the affordance is missing.

---

### ProjectOverviewPage — `src/pages/ProjectOverviewPage.tsx` (74 lines)

**Findings**: 2

- **[MODERATE] F-028** — Loading spinner has no `role="status"` or `aria-live` — `src/pages/ProjectOverviewPage.tsx:19–25`
  - **Category**: Accessibility
  - **Description**: Bare `<div className="animate-spin" />` with no semantic. Screen-reader users get no loading announcement.
  - **Remediation**: Wrap in `<div role="status" aria-live="polite"><span className="sr-only">Loading issue overview...</span></div>`.
  - **WCAG**: 4.1.3 (Status Messages, Level AA)

- **[MINOR] F-043** — Error-state `Bug` icon is decorative but not `aria-hidden` — `src/pages/ProjectOverviewPage.tsx:34`
  - **Category**: Accessibility
  - **Description**: 40px `Bug` icon next to the heading "Failed to load issues". Screen readers will read "bug" before the heading.
  - **Remediation**: Add `aria-hidden="true"` to the `<Bug>` icon.
  - **WCAG**: 1.1.1 (Non-text Content, Level A)

---

### ProjectReportsPage — `src/pages/ProjectReportsPage.tsx` (359 lines)

**Findings**: 3

- **[CRITICAL] F-010** — Page exceeds 300-line constitutional limit (359 lines)
  - **Category**: Consistency
  - **Description**: Constitution P3 violation. The page mixes scan-history fetching, delta calculation, date formatting, and export logic. Extract `formatDuration`, `formatDate`, and `getDelta` to `src/utils/reportFormatters.ts` and a `useReportData(projectId, selectedScanId)` hook.
  - **Remediation**: Move the formatting helpers to `utils/`, the export logic to a `useReportExport` hook, and the loading skeleton to the existing `PageSkeleton` component (it has a "report" type, line 176-194 re-implements what PageSkeleton already does).

- **[MODERATE] F-029** — Empty state not using shared `EmptyState` component — `src/pages/ProjectReportsPage.tsx:221–229`
  - **Category**: Consistency
  - **Description**: Hand-rolled empty state. `src/components/EmptyState.tsx` exists and is used correctly in `PendingVerificationPage.tsx:127` and `:134`. Drift between hand-rolled and shared empty states will create inconsistent UX.
  - **Remediation**: Replace with `<EmptyState variant="empty" title="No scans found" message="Trigger your first scan to see results." icon={<Shield size={48} />} action={{ label: 'Go to Project', onClick: ... }} />`.

- **[MINOR] F-044** — Export error only logged to console — `src/pages/ProjectReportsPage.tsx:152–155`
  - **Category**: States
  - **Description**: `console.error('Export failed:', error)` is the only feedback. User clicks "Export PDF", nothing happens, no toast, no error message. The `useToast` hook is imported elsewhere in the codebase but not here.
  - **Remediation**: Use `addToast({ type: 'error', title: 'Export failed', message: 'Please try again or contact support.' })`.

---

### UnifiedReportPage — `src/pages/UnifiedReportPage.tsx` (428 lines)

**Findings**: 4

- **[CRITICAL] F-006** — `Promise.all` catch block silently swallows all three fetch errors — `src/pages/UnifiedReportPage.tsx:40–55`
  - **Category**: States
  - **Description**: The `useEffect` at line 40 calls `api.reports.getUnified`, `api.reports.getTrends`, and `api.reports.getCompliance` in parallel. The catch block at line 52–54 only does `setLoading(false)`. The user sees a permanent loading state and **no error message**. The page is then rendered with `report === null`, falling through to the "No report data found" state on line 130–136, which doesn't explain what went wrong or how to retry.
  - **Remediation**: Set an `error` state in the catch, render a proper error state with a "Retry" button. Surface specific failures (e.g., if `getCompliance` fails but `getUnified` succeeds, show the report with a "Compliance data unavailable" warning).
  - **WCAG**: 3.3.4 (Error Prevention (Legal, Financial, Data), Level AA — report data is "data" in this context)

- **[CRITICAL] F-011** — Page exceeds 300-line constitutional limit (428 lines; 2nd longest)
  - **Category**: Consistency
  - **Description**: Constitution P3 violation. The page does 5 distinct jobs: scan history loading, report fetching, filtering logic, modal hosting, and chart rendering. The `filteredFindings` filter and `toolSummaries` reduce (lines 140–174) should be a `useReportFilters` hook.
  - **Remediation**: Extract the filter logic to `useReportFilters` hook. Extract the chart section (lines 295–317) to a `ReportCharts` component.

- **[SERIOUS] F-018** — Findings table missing `<caption>` or `aria-label` — `src/pages/UnifiedReportPage.tsx:380–417`
  - **Category**: Accessibility
  - **Description**: The `<table>` at line 384 has no `<caption>`, no `aria-label`, no `aria-labelledby`. Screen-reader users will hear "table with 4 columns" but not what the table represents.
  - **Remediation**: Add `<caption className="sr-only">Findings for selected scan, {filteredFindings.length} total</caption>` inside the table. The visible `<h3>` on line 381 is the visual label; an `aria-labelledby` linking the heading to the table is the semantic equivalent.
  - **WCAG**: 1.3.1 (Info and Relationships, Level A)

- **[MODERATE] F-030** — `<select>` elements missing `aria-label` — `src/pages/UnifiedReportPage.tsx:194–203`, `:228–240`
  - **Category**: Accessibility
  - **Description**: The report-type `<select>` (line 194) and scan-history `<select>` (line 228) have no accessible labels. The visible text "Technical Report" etc. is in the `<option>`, not the `<select>`. Screen-reader users hear "combobox, option Technical Report" with no context.
  - **Remediation**: Add `aria-label="Report type"` and `aria-label="Select scan"` respectively. Or wrap each in a `<label>` with visually-hidden text.

---

### ToolDetailViewPage — `src/pages/ToolDetailViewPage.tsx` (198 lines)

**Findings**: 2

- **[SERIOUS] F-016** — Table rows are clickable but not keyboard-accessible — `src/pages/ToolDetailViewPage.tsx:130–165`
  - **Category**: Accessibility
  - **Description**: Each `<tr>` has an `onClick={() => setSelectedIssueId(issue.id)}` (line 133), making the entire row a click target. There is no `tabIndex={0}`, no `role="button"`, no `onKeyDown` handler for Enter/Space. **Keyboard-only users cannot open issue details.** The `ExternalLink` icon (line 143) signals that the row is interactive, so the affordance is communicated, but only to mouse users.
  - **Remediation**: Either (a) wrap the issue title cell in a `<button>` and remove the row-level `onClick`, or (b) add `tabIndex={0}` and `onKeyDown` to the `<tr>`, plus `role="button"`. Option (a) is more semantic and avoids the table-as-button anti-pattern.
  - **WCAG**: 2.1.1 (Keyboard, Level A)

- **[MINOR] F-045** — Inconsistent locale/timezone in date formatting — `src/pages/ToolDetailViewPage.tsx:161`
  - **Category**: Consistency
  - **Description**: `new Date(issue.last_seen_at).toLocaleDateString()` uses the browser default locale. Every other page in the app uses `toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', ... })`. This page will display different date formats than the rest of the app on the same machine.
  - **Remediation**: Use `toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })` for consistency.

---

### MyIssuesPage — `src/pages/MyIssuesPage.tsx` (81 lines)

**Findings**: 1

- **[MODERATE] F-032** — Loading and error states not using shared components — `src/pages/MyIssuesPage.tsx:13–31`
  - **Category**: Consistency
  - **Description**: Hand-rolled spinner (line 13–19) and error panel (line 22–31). `PageSkeleton` exists for loading; `EmptyState` (with `variant="error"`) exists for errors. Both are used in other pages.
  - **Remediation**: Replace loading with `<PageSkeleton type="list" />`; replace error with `<EmptyState variant="error" title="Failed to load your issues" message={(error as Error).message} action={{ label: 'Retry', onClick: () => refetch() }} />`.

> **Note**: MyIssuesPage is small and clean. The grouped-by-project structure (lines 37–42) is good IA. The empty state (line 55–59) is well-written.

---

### PendingVerificationPage — `src/pages/PendingVerificationPage.tsx` (180 lines)

**Findings**: 2

- **[CRITICAL] F-007** — `wsConnected` hardcoded to `true`; "Live" indicator is a lie — `src/pages/PendingVerificationPage.tsx:15`
  - **Category**: States
  - **Description**: `const [wsConnected] = useState(true);` (line 15) — the WebSocket connection state is **never actually checked or updated**. The `useRescanWebSocket(true)` call (line 17) does not return the connection state, so the `wsConnected` variable is permanently `true`. The "Live" badge (line 76–81) therefore always shows, even when the WebSocket is disconnected. The "Offline" banner at line 85–92 (with the "Refresh now" button) is **dead code** — it can never render.
  - **Remediation**: The `useRescanWebSocket` hook must return `{ connected: boolean }`. Update the `useState` to `useState(useRescanWebSocket(true).connected)`. The hook should set the connection state on `onopen`, `onclose`, and `onerror` events.
  - **WCAG**: 4.1.3 (Status Messages, Level AA); Constitution P5: "Dashboard and scan pages MUST show a WebSocket connection indicator ('Live' / 'Connecting...' / 'Offline')." This page is a verification queue, but the same indicator contract applies.

- **[MINOR] F-052** — `projectChips` computation runs on every render — `src/pages/PendingVerificationPage.tsx:44–57`
  - **Category**: Performance
  - **Description**: The `useMemo` is correctly applied, but its dependency array is `[data]`, and `data` is a new object reference on every successful query. With 100+ projects, the computation (iterate groups, count, map) runs frequently.
  - **Remediation**: Use a more granular dependency: `[data?.total, data?.groups]` so the computation only re-runs when the underlying data changes, not on every refetch.

---

### ScanStatusPage — `src/pages/ScanStatusPage.tsx` (378 lines)

**Findings**: 3

- **[CRITICAL] F-003** — Cancel-confirm modal missing `aria-modal`, `aria-labelledby`, focus trap, Escape key — `src/pages/ScanStatusPage.tsx:337–359`
  - **Category**: Accessibility
  - **Description**: The inline modal at line 337–359 is a `<div className="fixed inset-0 z-50...">` with no `role="dialog"`, no `aria-modal`, no `aria-labelledby` linking the `<h3>`, no focus trap, and no Escape key handling. **WCAG 4.1.2 Level A violation.** The same page uses `ConfirmModal` correctly at line 361–373 for "Force Stop" — the inconsistency is a clear signal that the inline modal was a copy-paste from an older pattern.
  - **Remediation**: Replace with `<ConfirmModal isOpen={showCancelConfirm} onClose={() => setShowCancelConfirm(false)} onConfirm={handleCancel} title="Cancel Scan?" message="This will stop the running scan. Partial results may be lost." confirmLabel="Cancel Scan" variant="danger" icon={<AlertCircle />} />`.
  - **WCAG**: 4.1.2 (Name, Role, Value, Level A); 2.1.1 (Keyboard, Level A)

- **[CRITICAL] F-012** — Page exceeds 300-line constitutional limit (378 lines)
  - **Category**: Consistency
  - **Description**: Constitution P3 violation. The page does scan polling, WebSocket handling, toast dispatch, modal orchestration, and stage rendering. The `handleCancel` mutation handler (lines 106–130) and the WebSocket `onMessage` callback (lines 66–97) are good candidates for extraction.
  - **Remediation**: Extract `handleCancel` to a `useScanCancelHandler` hook. Extract the WebSocket message handling to a `useScanProgress(scanId)` hook that returns `{ scan, stages, isLoading }`.

- **[SERIOUS] F-020** — 2-second auto-redirect after scan cancel has no countdown — `src/pages/ScanStatusPage.tsx:117–119`
  - **Category**: Microcopy
  - **Description**: `setTimeout(() => { navigate(`/projects/${scan?.project_id}`) }, 2000)`. The 2-second delay is invisible to the user. The button changes to "Cancelling..." then the page just navigates. Users may be mid-read when the redirect fires.
  - **Remediation**: Show a toast "Scan cancelled. Redirecting in 2s..." with a "Cancel redirect" action, or remove the auto-redirect and just show a "Back to project" link.

- **[MODERATE] F-034** — `set-state-in-effect` with eslint-disable — `src/pages/ScanStatusPage.tsx:56–58`
  - **Category**: Code Quality
  - **Description**: `useEffect(() => { if (scan?.state === 'FAILED' && scan?.error) { setShowErrorModal(true); } }, [scan]);` with an explicit `// eslint-disable-next-line react-hooks/set-state-in-effect`. The pattern opens the modal on every render where state is FAILED — including after the user closes it. Effect should be a derived state.
  - **Remediation**: Compute `const shouldShowErrorModal = scan?.state === 'FAILED' && !!scan?.error && !userDismissedError;` and pass to `<ScanErrorModal isOpen={shouldShowErrorModal} ... />`. Remove the effect and eslint-disable.

---

### ScanHistoryPage — `src/pages/ScanHistoryPage.tsx` (193 lines)

**Findings**: 2

- **[CRITICAL] F-004** — Force-stop modal missing `aria-modal`, `aria-labelledby`, focus trap, Escape key — `src/pages/ScanHistoryPage.tsx:167–190`
  - **Category**: Accessibility
  - **Description**: Inline modal at line 167–190 has the same WCAG 4.1.2 violations as ProjectControlPage and ScanStatusPage modals.
  - **Remediation**: Replace with `<ConfirmModal>` (used correctly in ScanStatusPage:361 and ProjectGroupsPage:417).
  - **WCAG**: 4.1.2 (Name, Role, Value, Level A); 2.1.1 (Keyboard, Level A)

- **[SERIOUS] F-017** — Table rows are clickable but not keyboard-accessible — `src/pages/ScanHistoryPage.tsx:117–161`
  - **Category**: Accessibility
  - **Description**: Whole `<tr>` has `onClick={() => navigate(...)}` (line 123). No `tabIndex`, no `onKeyDown`. **WCAG 2.1.1 Level A violation.** Same pattern as ToolDetailViewPage.
  - **Remediation**: Add a "View" link in the actions cell (already present at line 152) and remove the row-level `onClick`. OR add `tabIndex={0}` and `onKeyDown` (Enter/Space) to the row.

---

### ManualScanPage — `src/pages/ManualScanPage.tsx` (222 lines)

**Findings**: 1

- **[MODERATE] F-035** — `handleStageToggle` is 60+ lines with intertwined state logic — `src/pages/ManualScanPage.tsx:36–64`
  - **Category**: Code Quality
  - **Description**: The toggle handler reads as four nested functions: it modifies `selectedStages`, then mutates `autoStages` inside the setter, then mutates `selectedStages` again, all within a `setSelectedStages` callback. The dependency graph between `selectedStages` and `autoStages` is implicit and bug-prone. Adding a new dependency (e.g., "at most 3 stages") would require careful refactoring.
  - **Remediation**: Extract to a `useStageSelection(FIXED_STAGES, STAGE_DEPENDENCIES)` hook that returns `{ selectedStages, autoStages, toggle, selectAll, deselectAll }`. The hook can encapsulate the invariant: "auto-stages are always a subset of selected-stages that are dependencies of some non-auto stage".

> **Note**: The page is functionally correct. Stage auto-selection works (lines 50–62). The error message at line 95–99 catches the specific "requires the following stage(s)" backend error and translates it to user-friendly copy — good defensive UX.

---

### ProjectGroupsPage — `src/pages/ProjectGroupsPage.tsx` (431 lines)

**Findings**: 3

- **[CRITICAL] F-013** — Page exceeds 300-line constitutional limit (431 lines; longest in app)
  - **Category**: Consistency
  - **Description**: Constitution P3 violation. The page mixes group listing, suggestion loading, create-form, group-details, severity-summary, and assigned-scans. The "Create Group" form (lines 198–245) and the "Suggestions" panel (lines 165–196) should be extracted to `CreateGroupPanel` and `GroupSuggestionsPanel` components.
  - **Remediation**: Extract the two panels. Extract the `loadGroups`, `loadSuggestions`, `handleCreateGroup`, `handleDeleteGroup`, `handleAutoAssign`, `handleRefreshGroup` callbacks into a `useProjectGroups` hook. The page should be <150 lines.

- **[MODERATE] F-036** — Loading spinner has no `role="status"` — `src/pages/ProjectGroupsPage.tsx:133–138`
  - **Category**: Accessibility
  - **Description**: Centered 12×12 spinner with no semantic. Same issue as ProjectOverviewPage:28.
  - **Remediation**: Add `role="status" aria-live="polite"` and a visually-hidden "Loading project groups..." text.

- **[MINOR] F-048** — Empty newGroupName silently no-ops — `src/pages/ProjectGroupsPage.tsx:50`
  - **Category**: States
  - **Description**: `if (!newGroupName.trim() || !newGroupPattern.trim()) return;` — silent return. The form has `required` on both inputs, but if the user submits via Enter with empty values, the browser's validation should fire. Defensive: if validation is bypassed (e.g., devtools), the user gets no feedback.
  - **Remediation**: Show inline error messages next to each field on submission attempt, similar to CreateProjectPage's pattern (line 248, 267, 290).

> **Note**: The ConfirmModal is used correctly at line 417 for the delete confirmation — a positive accessibility pattern that the inline-modal pages should follow.

---

### UserManagementPage — `src/pages/UserManagementPage.tsx` (323 lines)

**Findings**: 3

- **[CRITICAL] F-005** — Three modals missing `aria-modal`, `aria-labelledby`, focus trap, Escape key — `src/pages/UserManagementPage.tsx:209–238`, `:243–302`, `:307–317`
  - **Category**: Accessibility
  - **Description**: All three modals (Change Role, Manage Access, Revoke Access) are raw `<div className="fixed inset-0 z-50">` with no `role="dialog"`, no `aria-modal`, no `aria-labelledby`, no focus trap, no Escape key. **Three separate WCAG 4.1.2 violations on the same page.** The user-management flow is admin-only, so the population of users affected is small, but the impact per-user is high: a screen-reader user cannot grant or revoke project access, which is a core admin task.
  - **Remediation**: Replace all three with `ConfirmModal` (for revoke) and a new generic `Modal` component (for the multi-section "Manage Access" and "Change Role" dialogs). The `Modal` component should enforce P5's contract: focus trap, Escape key, `role="dialog"`, `aria-modal="true"`, `aria-labelledby` to the heading.
  - **WCAG**: 4.1.2 (Name, Role, Value, Level A); 2.1.1 (Keyboard, Level A)

- **[CRITICAL] F-014** — Page exceeds 300-line constitutional limit (323 lines)
  - **Category**: Consistency
  - **Description**: Constitution P3 violation. The page does RBAC checks, user listing, role change, access granting, access revoking, and audit-log display. The `loadUsers`, `loadUserAccess`, `loadAccessChanges`, `handleUpdateRole`, `handleGrantAccess`, `handleRevokeAccess`, `confirmRevoke` callbacks all fit cleanly into a `useUserManagement` hook.
  - **Remediation**: Extract the data-fetching and mutation callbacks to `src/hooks/useUserManagement.ts`. The page becomes a thin orchestrator.

- **[MODERATE] F-037** — User list has no search, no pagination, no virtualization — `src/pages/UserManagementPage.tsx:147–183`
  - **Category**: IA / Performance
  - **Description**: The page renders all users in a flat list. For an enterprise deployment with 100+ users, the list will be slow to render and impossible to scan. The "Audit Log" panel below (line 188) has a `max-h-64 overflow-y-auto` cap (line 192) but the user list does not.
  - **Remediation**: Add a search input (filter by username/role) at the top of the user list. Add pagination or virtualization. Apply the same `max-h` cap to the user list.

- **[MINOR] F-049** — Audit log shows raw IDs, not usernames — `src/pages/UserManagementPage.tsx:193–203`
  - **Category**: Microcopy
  - **Description**: `change.actorId` and `change.targetUserId` are raw numeric/UUID strings. The reader must mentally map ID → user. For 100+ users, this is impractical.
  - **Remediation**: Pre-fetch a `userId → username` map and display the username with the ID as a tooltip (`title={change.actorId}`).

> **Note**: The `if (!canManageUsers) { navigate('/dashboard'); return; }` at line 24–29 silently redirects users who lack permission. An `AccessDenied` component is used elsewhere (e.g., ToolDetailViewPage.tsx:67) and would be more informative than a silent redirect.

---

### SettingsPage — `src/pages/SettingsPage.tsx` (181 lines)

**Findings**: 3

- **[CRITICAL] F-008** — API key stored in `sessionStorage`; violates documented `localStorage` order — `src/pages/SettingsPage.tsx:10`, `:26`, `:32`
  - **Category**: Consistency (and Security)
  - **Description**: `AGENTS.md` mandates: "Reset/cancel checks `localStorage.getItem('API_KEY')` first, then `import.meta.env.VITE_API_KEY`." The Settings page uses `sessionStorage` (line 10, 26, 32). Result: a user who configures the API key, closes the tab, and reopens it finds their reset/cancel operations failing because the key is gone. This is a silent, hard-to-diagnose production failure.
  - **Remediation**: Replace `sessionStorage` with `localStorage` on all three lines. Add a one-time migration: if a key exists in `sessionStorage`, copy it to `localStorage` and clear the session copy.
  - **WCAG**: N/A (functional bug, not accessibility)
  - **Security note**: Long-term, the API key should not live in browser storage at all — it should be a backend-stored credential fetched per-session. Constitution P1: "No secrets (API keys, tokens, passwords) MAY appear in client-side bundles, logs, or commit history." `localStorage` is a slight improvement over `sessionStorage` but is still XSS-accessible.

- **[SERIOUS] F-021** — Show toggle reveals key length (side-channel) — `src/pages/SettingsPage.tsx:86–91`
  - **Category**: Security / Microcopy
  - **Description**: The "Show" / "Hide" toggle flips the input type from `password` to `text`. The visible width of the input field changes by the length of the key. A user (or someone shoulder-surfing) can roughly gauge the key length from the field width, even when masked.
  - **Remediation**: Use a fixed-width container or always render the masked key as `••••••••` (8 dots) regardless of actual length. If the user needs to copy the key, provide a "Copy to clipboard" button rather than unmasking.

- **[MODERATE] F-038** — `Notification.permission` not re-checked on focus — `src/pages/SettingsPage.tsx:13–18`
  - **Category**: States
  - **Description**: The page reads `Notification.permission` on mount and stores it in state. If the user revokes notification permission in browser settings while the Settings tab is open, the UI will still say "Enabled". The `notificationService.requestPermission()` (line 39) re-checks, but only when the user clicks the button.
  - **Remediation**: Add a `useEffect` that listens to `visibilitychange` (tab focus) and re-reads `Notification.permission`, updating the state.

- **[MINOR] F-050** — "Back" link doesn't say where it goes — `src/pages/SettingsPage.tsx:50–56`
  - **Category**: Microcopy
  - **Description**: Link text is just "Back". Users don't know if they go to Dashboard, Profile, or Help.
  - **Remediation**: Change to "Back to Dashboard" (or whatever the destination is). Verify the route.

---

### DocsPage — `src/pages/DocsPage.tsx` (366 lines)

**Findings**: 2

- **[CRITICAL] F-015** — Page exceeds 300-line constitutional limit (366 lines)
  - **Category**: Consistency
  - **Description**: Constitution P3 violation. The page defines 5 large content blocks (`overview`, `api`, `techstack`, `limitations`, `architecture`) as inline JSX (lines 179–294). Each is a self-contained section that should be a component.
  - **Remediation**: Extract each tab's content to `src/components/docs/{Tab}Content.tsx`. The page becomes ~70 lines.

- **[SERIOUS] F-022** — Architecture iframe has no fallback, no `sandbox` attribute — `src/pages/DocsPage.tsx:286–290`
  - **Category**: States / Security
  - **Description**: The "Architecture" tab embeds `/graph.html` (line 287). There is no `sandbox` attribute (sandboxing restricts what the iframe can do, e.g., disable scripts). There is no fallback content if the file is missing (a 404 will show a blank white page). The iframe has no `loading="lazy"` (it loads as soon as the DocsPage mounts, even though the Architecture tab is not the default).
  - **Remediation**: Add `sandbox="allow-scripts allow-same-origin"` (or stricter, depending on what graph.html needs). Add `loading="lazy"`. Wrap in an error boundary that shows a fallback if the iframe fails to load.
  - **WCAG**: N/A (security/perf, not accessibility)

- **[MINOR] F-051** — "Single active scan per project" listed twice in limitations — `src/pages/DocsPage.tsx:72`, `:76`
  - **Category**: Microcopy
  - **Description**: Duplicated limitation. The reader sees the same constraint twice in a list of 6 items.
  - **Remediation**: Remove the duplicate at line 76.

---

## Cross-Page Patterns

The audit identified 6 patterns that recur across multiple pages. A single design-system fix for each pattern will resolve dozens of individual findings at once.

### CP-1: Inline modals instead of `ConfirmModal` (4 pages, 6 modals)

**Pages affected**: ProjectControlPage, ScanStatusPage, ScanHistoryPage, UserManagementPage.
**Modals affected**: 6 inline `<div className="fixed inset-0 z-50">` dialogs.
**Pattern**: All share the same structure (`role="dialog"` on the outer div, `<h3>` for the title, primary/secondary action buttons), and all share the same defects (no `aria-modal`, no `aria-labelledby`, no focus trap, no Escape key).
**Root cause**: The `ConfirmModal` component (used correctly in 2 places) was not used as the default for confirm-style dialogs. Developers copy-pasted from the first inline-modal example and iterated.
**Single fix**: Extract a generic `Modal` component that enforces the P5 contract (focus trap, Escape key, `aria-modal`, `aria-labelledby`). Replace all 6 inline modals + the 2 inline `ConfirmModal` usages with `<Modal>` + `<ConfirmModal>` consistently. Effort: 2–4 hours. Resolves 6 Critical findings (F-002, F-003, F-004, F-005).

### CP-2: Spinner-without-semantic (5 pages)

**Pages affected**: ProjectControlPage, ProjectOverviewPage, ToolDetailViewPage, ProjectGroupsPage, MyIssuesPage (loading state).
**Pattern**: A bare `<div className="animate-spin" />` with no `role="status"`, no `aria-live`, no descriptive text.
**Single fix**: Add a `Spinner` component that renders the animation wrapped in `<div role="status" aria-live="polite"><span className="sr-only">{label}</span></div>`. Use it everywhere a spinner is rendered without a semantic wrapper. Effort: 30 minutes. Resolves 5 Moderate findings (F-028, F-031, F-032, F-036, F-041).

### CP-3: Page-size 300-line violation (7 pages)

**Pages affected**: DashboardPage (407), CreateProjectPage (435), ProjectReportsPage (359), UnifiedReportPage (428), ScanStatusPage (378), ProjectGroupsPage (431), UserManagementPage (323), DocsPage (366).
**Pattern**: Pages accumulate sub-components, formatters, and callbacks over time. Constitution P3's 300-line cap is a guardrail against this drift.
**Single fix**: Establish a `superdesign` workflow (per `src/CONTEXT.md` §7) that triggers when any page crosses 300 lines. Use the same `dispatching-parallel-agents` pattern (`src/CONTEXT.md` §7) to refactor pages in parallel — one agent per page, same time budget. Effort: 4–8 hours per page. Resolves 7 Critical findings (F-009, F-010, F-011, F-012, F-013, F-014, F-015).

### CP-4: `getStatusBadge` / `severityClass` duplicated (3+ pages)

**Pages affected**: DashboardPage, ProjectControlPage, ScanHistoryPage (all define a near-identical `getStatusBadge`).
**Pattern**: Same scan-state → badge color/label map, copy-pasted.
**Single fix**: Extract to `src/components/StatusBadge.tsx` with `state: ScanState` and optional `size`. Replace all call sites. Effort: 1 hour. Resolves 1 Moderate finding (F-025) and prevents future drift.

### CP-5: `useApiError` not used everywhere (3 pages)

**Pages affected**: RegisterPage, ProjectReportsPage (export error), and likely others not yet audited in depth.
**Pattern**: Some pages use `ApiError.getErrorMessage(err, fallback)` (LoginPage, ProjectEditPage, ProjectControlPage). Others use raw `(err as { response: { data: { detail: string } } }).response.data.detail` (RegisterPage:23–27) or `console.error` (ProjectReportsPage:152–155).
**Single fix**: ESLint rule banning direct `err.response.data.detail` access in favor of `ApiError.getErrorMessage`. Add the rule to `.eslintrc`. Effort: 1 hour. Resolves 2 Moderate findings (F-023, F-044).

### CP-6: `ConfirmModal` is correct; `Modal` is missing

**Observation**: `ConfirmModal` (in `src/components/ConfirmModal.tsx`) is the gold-standard pattern. It enforces `role="dialog"`, `aria-modal`, `aria-labelledby`, and has focus-trap logic. Two pages use it correctly (ScanStatusPage for Force Stop, ProjectGroupsPage for delete).
**Pattern**: The codebase has one good pattern; it is not enforced. The "missing piece" is a generic `Modal` component for non-confirm dialogs (the Change Role and Manage Access dialogs in UserManagementPage, the multi-step forms in CreateProjectPage's modals).
**Single fix**: Create `src/components/Modal.tsx` modeled on `ConfirmModal`'s a11y guarantees. Add a code-review checklist item: "All modals must use `Modal` or `ConfirmModal`." Effort: 2–3 hours for the component, then mechanical replacement at call sites.

---

## Coverage Gaps

No coverage gaps. All 19 pages in `src/pages/` (excluding test files) were audited. The 30-minute budget was sufficient because the audit followed the parallel-read + parallel-write strategy from the task plan: all 19 pages were read in 4 batches, then findings were written in a single pass.

---

## Appendix: Methodology

**Framework**: Nielsen's 10 usability heuristics + WCAG 2.1 AA checklist. Each of the 8 audit categories (Information Architecture, Navigation, Visual Hierarchy, Accessibility, Consistency, States, Microcopy, Mobile) is mapped to one or both pillars. See `research.md` for the full mapping.

**Severity scale**: 4 levels — Critical (blocks primary task, violates WCAG Level A), Serious (significant friction, violates WCAG Level AA), Moderate (workaround exists), Minor (cosmetic).

**UX Health Score formula**: `score = max(0, 100 - Σ(weight × count))`, weights = 10/5/2/0.5 for Critical/Serious/Moderate/Minor, capped at 0. For this audit: 16 × 10 + 7 × 5 + 14 × 2 + 12 × 0.5 = 229 deduction → score 0.

**Evidence types**: Each finding cites `file:line` (most), `visual` (where rendering is required), or `heuristic` (cross-page patterns). See `data-model.md` for the full evidence-type schema.

**Tooling**: No new tools. Standard file-read tools against the existing repo. No browser automation, no Lighthouse, no Playwright. Visual findings (color contrast on gradients, hover state focus rings) are flagged as "visual inspection required" and were noted but not counted as Critical.

**What was NOT in scope**: Remediation work (separate workflow per `spec/plan.md`), backend audit (covered by other specs), Lighthouse / performance benchmarks, real-device mobile testing, continuous monitoring.

**Re-run instructions**: To re-run this audit, repeat the steps in `tasks.md` Phases 1–3. The audit is re-runnable; future runs overwrite this report and git history preserves the diff.
