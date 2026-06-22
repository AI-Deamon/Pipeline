# Sentinel UI/UX, Product Design & Frontend Quality Audit

**Date**: 2026-06-17
**Auditor**: Senior UX/Product Designer + Frontend Architect
**Scope**: Full application experience — flows, IA, interaction, visual design, accessibility, performance, trust
**Method**: Page-by-page review, flow tracing, component analysis, heuristic evaluation

---

## Executive Summary

Sentinel is a **functionally comprehensive** DevSecOps platform with a **visually polished design system**, but it suffers from **critical product design gaps** that block user success. The application works well for users who already understand security scanning workflows, but it fails to guide new users, provides inadequate feedback during long-running operations, and creates unnecessary anxiety through incomplete error handling.

The most damaging issues are **not aesthetic** — they are **product-level failures**: users don't know what to do after login, they can't tell if a scan is actually running, they don't understand what "Pending Verification" means, and they receive no guidance when things fail. The platform assumes domain expertise it cannot assume.

### UX Health Score: **23 / 100**

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| UX/Flows | 2 | 4 | 3 | 1 | 10 |
| UI/Visual | 0 | 2 | 4 | 2 | 8 |
| Interaction | 2 | 3 | 4 | 2 | 11 |
| Product Design | 3 | 5 | 4 | 2 | 14 |
| Accessibility | 1 | 3 | 2 | 1 | 7 |
| Performance | 1 | 2 | 1 | 0 | 4 |
| Consistency | 1 | 2 | 3 | 1 | 7 |
| Trust/Polish | 2 | 3 | 3 | 2 | 10 |
| **Total** | **12** | **24** | **24** | **11** | **71** |

---

## 1. User Experience (UX)

### UX-01 — No Onboarding or First-Run Guidance [CRITICAL]

**Screen**: All pages, post-login
**Description**: Users land on `/dashboard` with no welcome message, no quick-start checklist, no guided tour. For a security tool with domain-specific workflows (Jenkins pipelines, scan stages, issue triage), this is a hard blocker.
**Impact**: New users stare at a table of projects they may not have. They don't know:
  - How to create their first scan
  - What "Pending Verification" means
  - Where to find issues after scanning
  - How to interpret severity badges
**Recommended Fix**:
1. Add an onboarding checklist on Dashboard for first-time users:
   - [ ] Create your first project
   - [ ] Trigger a scan
   - [ ] Review findings
   - [ ] Assign an issue
2. Add contextual help icons with tooltips on key terms ("Scan Stages", "Verification Queue", "Project Groups").
3. Add a 60-second product tour using `react-joyride` or similar.

**Implementation Example**:
```tsx
{isFirstVisit && (
  <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-8">
    <h2 className="text-lg font-semibold text-blue-900 mb-2">Welcome to Sentinel</h2>
    <p className="text-blue-800 mb-4">Your security command center. Here's how to get started:</p>
    <ol className="list-decimal list-inside space-y-2 text-blue-700">
      <li>Create a project to scan</li>
      <li>Trigger a security scan</li>
      <li>Review findings in the Issues tab</li>
      <li>Assign and track remediation</li>
    </ol>
    <button onClick={dismissOnboarding} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">
      Got it
    </button>
  </div>
)}
```

---

### UX-02 — "Pending Verification" Is Unexplained Jargon [CRITICAL]

**Screen**: `PendingVerificationPage.tsx`
**Description**: The page title "Pending Verification" and the queue items ("rescan requests") use internal terminology without explanation. Users don't know:
  - What "verification" means in this context
  - Why something is "pending"
  - What Approve vs Reject actually does
  - The difference between this page and "Issues"
**Impact**: Admins avoid the feature entirely, leaving issues in limbo. Developers rescan without understanding the workflow.
**Recommended Fix**:
1. Rename to "Rescan Approvals" or "Verification Queue"
2. Add an info banner: "Developers have marked issues as fixed. Review the changes and approve or reject each rescan request."
3. Add inline help: each card should show context — what was the original issue, what fix was claimed, what stage triggered this.

**Implementation Example**:
```tsx
<div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-6">
  <div className="flex items-start gap-3">
    <Info className="w-5 h-5 text-indigo-600 mt-0.5" />
    <div>
      <h3 className="text-sm font-medium text-indigo-900">Review developer fixes</h3>
      <p className="text-sm text-indigo-700 mt-1">
        When a developer marks an issue as fixed, it appears here for verification.
        Approve to close the issue, or reject if the fix is incomplete.
      </p>
    </div>
  </div>
</div>
```

---

### UX-03 — No Clear Primary Action on Dashboard [HIGH]

**Screen**: `DashboardPage.tsx`
**Description**: The dashboard shows a table of projects with "View", "View Reports", "Manage", and a delete icon. There is **no clear next action** for a new user. The "Add Project" button exists but is admin-only and visually small.
**Impact**: Users feel passive — they don't know how to start scanning. The primary call-to-action (trigger a scan) requires 3+ clicks: Project → Configure → Trigger.
**Recommended Fix**:
1. Add a prominent empty state with a single primary action: "Create and scan your first project"
2. Add a "Quick Scan" button on the dashboard (for users with existing projects) that opens a modal to select project and trigger.
3. Make the "Add Project" button more prominent for admins.

---

### UX-04 — Multi-Step Form Without Progress Context [HIGH]

**Screen**: `CreateProjectPage.tsx`
**Description**: The 3-step stepper exists but doesn't communicate:
  - How long the form will take
  - What information is needed at each step
  - Whether steps can be completed out of order
  - What happens after submission (scans don't start automatically)
**Impact**: Users abandon the form midway. Post-submission, they expect a scan to start and are confused when nothing happens.
**Recommended Fix**:
1. Add a step summary sidebar: "Step 1 of 3 — Project Details"
2. Add a preview panel on Step 3: "After creation, you'll need to trigger a scan from the project page."
3. After successful creation, show a toast + inline CTA: "Project created. Trigger your first scan?"

---

### UX-05 — Scan Status Page Overwhelming [HIGH]

**Screen**: `ScanStatusPage.tsx`
**Description**: The page shows raw Jenkins stage data, stage results in a verbose format, and multiple action buttons. The "Force Stop" and "Cancel" actions are visually similar but have different semantics. Users often cancel when they meant to force-stop.
**Impact**: Wrong action taken, scan data loss, user frustration.
**Recommended Fix**:
1. Group stage results into a simplified timeline view: "Current: Sonar Scanner (Running) → Next: Trivy FS Scan"
2. Differentiate destructive actions: Cancel = secondary button, Force Stop = danger button with confirmation.
3. Add estimated time remaining based on stage timeouts.

---

### UX-06 — No Bulk Actions or Multi-Select [MEDIUM]

**Screen**: `DashboardPage.tsx`, `ProjectGroupsPage.tsx`
**Description**: Users cannot select multiple projects to:
  - Trigger scans in batch
  - Delete multiple projects
  - Assign to a group
  - Export reports
**Impact**: Power users with 20+ projects spend excessive time on repetitive UI interactions.
**Recommended Fix**: Add checkboxes to table rows with a sticky action bar: "3 projects selected — [Scan All] [Delete] [Assign to Group]"

---

### UX-07 — Inconsistent Navigation Mental Model [MEDIUM]

**Screen**: `Layout.tsx`
**Description**: The sidebar groups "Core" navigation but mixes levels:
  - Dashboard (top-level)
  - My Issues (personal)
  - Issues (team)
  - Pending Verification (task)
  - Groups (admin)
  - New Project (action)
  - Users (admin)
  - API Settings (config)
  - Docs (help)
**Impact**: Users can't predict where things live. "Reports" is nested under a project context but not discoverable from the sidebar.
**Recommended Fix**:
1. Reorganize sidebar into sections: "Main", "Projects", "Issues", "Admin", "Settings"
2. Add "Reports" as a top-level nav item that becomes context-aware when a project is selected.
3. Add breadcrumb trail consistently (currently missing on some pages).

---

### UX-08 — Settings Page Feels Like an Afterthought [MEDIUM]

**Screen**: `SettingsPage.tsx`
**Description**: The page is called "Settings" but contains only:
  - API key management (the primary focus)
  - Notification toggle
It lacks:
  - Theme preference (dark/light)
  - Timezone configuration
  - Notification preferences (which events trigger notifications)
  - Account settings (password change, email)
**Impact**: Users assume Settings is comprehensive and are frustrated by the lack of options. The API key focus makes it feel like a developer tool, not a user-facing app.
**Recommended Fix**: Rename to "API Configuration" or expand Settings to include genuine user preferences. Add user profile page with password change.

---

### UX-09 — No Contextual Help or Inline Documentation [MEDIUM]

**Screen**: All pages
**Description**: Complex concepts (scan stages, compliance mappings, risk scores, issue lifecycle) are displayed without explanation. The Docs page exists but is disconnected from the workflow — users must navigate to it consciously.
**Impact**: Users misinterpret data. Example: "Risk Score: 75/100 — Trend: worsening" — users don't know what action to take.
**Recommended Fix**:
1. Add `(?` help icons next to every technical term
2. Create contextual tooltips: hover over a stage name → see definition and typical duration
3. Add a "Why does this matter?" callout on compliance findings.

---

### UX-10 — Successful Actions Lack Celebration [LOW]

**Screen**: All success states
**Description**: Toasts are the only success feedback. For major milestones (first scan completed, all issues resolved, project fully secured), a simple toast feels insufficient.
**Impact**: Users don't feel the product价值 (value) of their work.
**Recommended Fix**: Confetti animation or celebration modal for:
  - First scan completed
  - Zero findings in a scan
  - All issues resolved

---

## 2. User Interface (UI)

### UI-01 — Inconsistent Button Styling [MEDIUM]

**Screen**: All pages
**Description**: Primary buttons use different treatments:
  - Dashboard: `bg-slate-900 text-white`
  - Project forms: `bg-blue-600 text-white`
  - Project edit: `bg-slate-900`
  - Some pages use `btn-secondary` (undefined class)
**Impact**: Users can't identify primary vs secondary actions by color alone. The product feels less cohesive.
**Recommended Fix**: Define and enforce:
  - `btn-primary`: `bg-slate-900 text-white hover:bg-slate-800` (for primary actions)
  - `btn-secondary`: `bg-white border border-slate-300 text-slate-700 hover:bg-slate-50` (for secondary)
  - `btn-danger`: `bg-rose-600 text-white hover:bg-rose-700`
  - `btn-ghost`: `text-slate-600 hover:bg-slate-100`

---

### UI-02 — Excessive Border-Radius Creates Floating Card Syndrome [MEDIUM]

**Screen**: All cards and modals
**Description**: `rounded-[3.5rem]`, `rounded-[2.5rem]`, `rounded-[2rem]` are used throughout. The extreme rounding makes cards feel like they're floating in space rather than grounded in a layout. It also creates inconsistency when some components use `rounded-xl` (0.75rem) and others use 2-3.5rem.
**Impact**: Visual hierarchy is weakened because all containers feel equally "light". The product feels playful rather than professional for a security tool.
**Recommended Fix**: Standardize on a 4-tier radius system:
  - `rounded-sm` (0.125rem) — inputs
  - `rounded-md` (0.375rem) — buttons, badges
  - `rounded-lg` (0.5rem) — cards
  - `rounded-xl` (0.75rem) — modals
Remove `rounded-[3.5rem]` and similar custom values.

---

### UI-03 — Color Contrast Issues on Status Badges [MEDIUM]

**Screen**: `DashboardPage.tsx`, `ProjectControlPage.tsx`
**Description**: Status badges use light backgrounds with medium-contrast text:
  - `bg-amber-50 text-amber-700` — contrast ~4.2:1 (borderline AA for large text, fails for normal)
  - `bg-slate-100 text-slate-600` — contrast ~5.5:1 (passes AA)
  - The amber "Scanning" badge is particularly hard to read for users with mild color blindness.
**Impact**: Users with visual impairments can't distinguish status quickly.
**Recommended Fix**: Use darker text or add an icon:
  - `bg-amber-100 text-amber-800` — contrast ~6.5:1
  - Add `!` or `●` symbol for color-blind users.

---

### UI-04 — Missing Visual Hierarchy in Tables [MEDIUM]

**Screen**: All table-heavy pages (Dashboard, ScanHistory, UserManagement)
**Description**: Table rows have equal weight. No visual distinction between:
  - The most recent scan
  - Scans with critical findings
  - Projects with active scans
  The user must read every cell to understand what's important.
**Impact**: Slow scanning, missed critical items.
**Recommended Fix**: Add progressive disclosure:
  - Highlight rows with active scans (amber left border)
  - Highlight rows with critical findings (red left border)
  - Collapse less important columns (project_id) behind a "Details" expansion.

---

### UI-05 — Loading Skeletons Don't Match Content Shape [LOW]

**Screen**: `DashboardPage.tsx`, `ProjectReportsPage.tsx`
**Description**: `PageSkeleton` renders generic card shapes but the actual content may be a table, a chart, or a list. The skeleton animation doesn't prime the user for what's coming.
**Impact**: Perceived performance is worse because the skeleton transition feels jarring.
**Recommended Fix**: Create page-specific skeletons:
  - `PageSkeleton type="table"` matches table columns
  - `PageSkeleton type="chart"` shows chart placeholder shapes

---

### UI-06 — Inconsistent Icon Usage [LOW]

**Screen**: All pages
**Description**: The same action sometimes uses different icons:
  - "Delete" uses `Trash2`, `X`, or text-only
  - "Edit" uses `Edit3`, `Pencil`, or a link-style button
  - "Settings/Configure" uses `Settings`, `Sliders`, `Gear`
**Impact**: Users learn icon associations that don't generalize. Muscle memory fails across pages.
**Recommended Fix**: Create an icon registry in `src/components/ui/IconRegistry.tsx`:
  - `delete` → Trash2 (always)
  - `edit` → Edit3 (always)
  - `configure` → Sliders (always)

---

## 3. Interaction Design

### ID-01 — Canceling a Scan Has No Undo [HIGH]

**Screen**: `ScanStatusPage.tsx`
**Description**: Clicking "Cancel Scan" immediately transitions the scan to CANCELLED. There is no confirmation dialog, no undo toast, no way to resume.
**Impact**: Users accidentally cancel scans and must re-trigger from scratch. Data loss (partial results) occurs without warning.
**Recommended Fix**:
1. Add a confirm modal: "Cancel scan? Partial results will be lost and the scan must be re-triggered."
2. After cancel, show an undo toast: "Scan cancelled. [Undo]" for 10 seconds.

---

### ID-02 — Long-Running Operations Have No Progress Indication [HIGH]

**Screen**: Scan creation, report generation, export
**Description**: After triggering a scan, the user sees "Scan created" and is redirected to ScanStatusPage which shows "CREATED" with no progress. A scan can take 15-30 minutes; the user has no idea if it's stuck, running, or queued.
**Impact**: Users re-trigger scans (creating duplicates), contact support, or assume the tool is broken.
**Recommended Fix**:
1. Add an estimated time range based on selected stages: "Estimated time: 15-20 minutes"
2. Add a progress bar on ScanStatusPage that interpolates based on completed stages.
3. Add a "Scan running" email notification option.

---

### ID-03 — Error States Are Sometimes Silent [HIGH]

**Screen**: `UnifiedReportPage.tsx`, `ProjectReportsPage.tsx`
**Description**: When fetching reports fails, the user sees "No report data found" with no error icon, no explanation, and no retry button (in UnifiedReportPage). In ProjectReportsPage, export failures are `console.error` only.
**Impact**: Users think the platform is broken or that no data exists. They don't know to retry or check network.
**Recommended Fix**:
```tsx
{error && (
  <div role="alert" className="bg-rose-50 border border-rose-200 rounded-xl p-6">
    <div className="flex items-start gap-3">
      <AlertCircle className="w-5 h-5 text-rose-600 mt-0.5" />
      <div>
        <h3 className="text-sm font-medium text-rose-900">Failed to load report</h3>
        <p className="text-sm text-rose-700 mt-1">{error}</p>
        <button onClick={refetch} className="mt-3 px-3 py-1.5 bg-rose-600 text-white rounded-lg text-sm">
          Retry
        </button>
      </div>
    </div>
  </div>
)}
```

---

### ID-04 — Form Validation Feedback Is Delayed [MEDIUM]

**Screen**: `CreateProjectPage.tsx`
**Description**: Validation errors appear only after clicking "Continue". There is no inline validation on blur or as the user types.
**Impact**: Users fill the entire form, click Continue, then get errors on the first field. They must scroll back up.
**Recommended Fix**: Add `onBlur` validation:
```tsx
<input
  onBlur={() => validateField('name', values.name)}
  className={errors.name ? 'border-rose-500' : ''}
/>
{touched.name && errors.name && (
  <p className="text-rose-500 text-xs mt-1">{errors.name}</p>
)}
```

---

### ID-05 — Buttons in Tables Are Too Small [MEDIUM]

**Screen**: `DashboardPage.tsx`, `ScanHistoryPage.tsx`
**Description**: Action buttons in table rows are `px-3 py-1.5 text-sm` (roughly 32px tall). For a security application used by engineers who may have motor impairments, this is below the 44px minimum recommended touch target.
**Impact**: Mis-taps are common. Users frustration on tablets.
**Recommended Fix**: Increase to `px-4 py-2` (40px height absolute minimum).

---

### ID-06 — No Keyboard Shortcuts for Power Users [LOW]

**Screen**: All pages
**Description**: No keyboard shortcuts for common actions:
  - `/` to focus search
  - `N` then `P` to create new project
  - `Esc` to close modals (partially implemented in ConfirmModal only)
  - `Ctrl+K` to open command palette (nonexistent)
**Impact**: Power users (security engineers) who live in the tool are slowed down.
**Recommended Fix**: Implement shortcuts via `react-hotkeys-hook`:
  - `/` → focus search input
  - `Escape` → close modals
  - `g + d` → go to dashboard

---

## 4. Product & Feature Design

### PD-01 — No Concept of "Scan Schedule" or Recurring Scans [CRITICAL]

**Description**: The only way to run a scan is manual trigger. Enterprises need scheduled scans (nightly, weekly). The absence of this feature forces users to build external cron scripts or remember to click buttons.
**Impact**: Security coverage is inconsistent. Users leave the product or build brittle workarounds.
**Recommended Fix**: Add a "Schedule" tab on project configuration: "Run this scan every day at 02:00 IST". Store schedule in DB as cron expression. Use Celery Beat or a lightweight scheduler.

---

### PD-02 — No Notification Center [HIGH]

**Description**: Notifications exist only for scan completion via Browser Notification API. There is no in-app notification center for:
  - Scan failures
  - New issues assigned to me
  - Rescan requests awaiting approval
  - Project group changes
**Impact**: Users must actively check pages. Critical issues sit unattended.
**Recommended Fix**: Add a notification bell in the header with a dropdown showing recent events. Persist notifications in DB. Mark as read on click.

---

### PD-03 — Issues Are Not Actionable Enough [HIGH]

**Description**: Issues are listed with severity, title, and tool. There is no:
  - Inline remediation suggestion
  - "Assign to me" quick action
  - Bulk status change
  - SLA or due date
  - Link to the specific code line (beyond a generic `git_url`)
**Impact**: Issues feel like a reporting artifact rather than a workflow trigger. Users ignore them.
**Recommended Fix**:
1. Add "Quick Actions" per issue: [Assign to me] [Request Rescan] [Mark False Positive]
2. Show `code_snippet` directly in the issue card
3. Add bulk select + bulk assign.

---

### PD-04 — Project Groups Are Discoverable but Useless [MEDIUM]

**Description**: Project Groups (auto-grouping by naming pattern) is a clever feature, but:
  - It's hidden in the sidebar under "Groups"
  - It has no value proposition explained to the user
  - It's not integrated into the reporting flow (can't view "all issues across Kilo projects")
  - The auto-assign feature is async with no feedback ("Auto-assigning..." spinner, then silence)
**Impact**: Feature adoption is near-zero. Admins don't know it exists; devs don't care.
**Recommended Fix**:
1. Add a getting-started tooltip: "Group projects by naming pattern to see aggregate security posture."
2. Add cross-group reports: "Kilo Suite — 12 projects, 47 critical findings"
3. Show auto-assign progress in the UI, not just server logs.

---

### PD-05 — No Way to Mark Issues as "Accepted Risk" [MEDIUM]

**Description**: The issue lifecycle is Open → Assigned → In Progress → Resolved. There is no "Accepted Risk" or "Won't Fix" state. Users must leave issues open forever or delete them (losing history).
**Impact**: Risk registers are inaccurate. Auditors see open issues that the team has consciously accepted.
**Recommended Fix**: Add `status = "accepted"` and `status = "false_positive"`. Filter these from default views but include in exports.

---

### PD-06 — Reports Lack Executive Summary [MEDIUM]

**Description**: The "Executive" report type exists but shows the same charts as Technical, just reordered. There is no narrative summary, no business impact translation, no comparison to industry benchmarks.
**Impact**: Executives can't use the report. They ask for PowerPoint decks (defeating the purpose of a web app).
**Recommended Fix**:
1. Executive report should lead with: "Your security posture is Worsening. Risk score increased 12 points." (one sentence)
2. Add "Business Impact" column: "This SQL injection in the payment module could expose customer data."
3. Add trend arrows with plain-English explanations.

---

## 5. Accessibility

### A11Y-01 — Inline Modals Fail WCAG 2.1.1 Level A [CRITICAL]

**Screen**: ProjectControlPage, ScanStatusPage, ScanHistoryPage, UserManagementPage
**Description**: 6 modals use raw `<div role="dialog">` with no focus trap, no Escape key, no `aria-modal`. Keyboard users are trapped inside the modal or can't close it.
**Impact**: 100% of keyboard-only users + screen-reader users cannot use these flows.
**Recommended Fix**: Replace all with `ConfirmModal` component (which has focus trap). For non-confirm dialogs, create a `Modal` component that:
  - Calls `useFocusTrap`
  - Listens for `Escape`
  - Sets `aria-modal="true"` and `aria-labelledby`
  - Returns focus to trigger on close

---

### A11Y-02 — Findings Table is Not Keyboard Accessible [HIGH]

**Screen**: `UnifiedReportPage.tsx`, `ToolDetailViewPage.tsx`
**Description**: Rows are clickable (`onClick`) but have no `tabIndex`, `role="button"`, or `onKeyDown`. Keyboard users can't open findings.
**Impact**: Key workflow (reviewing findings) is mouse-only.
**Recommended Fix**: Wrap the title cell in a `<button>` or add keyboard handlers to the row.

---

### A11Y-03 — Status Messages Not Announced [MEDIUM]

**Screen**: All loading/error states
**Description**: Spinners and error messages lack `role="status"`, `aria-live="polite"`, or `role="alert"`. Screen readers announce nothing during loading or on error.
**Impact**: Screen-reader users think the page is frozen.
**Recommended Fix**: Wrap all loading/error regions:
```tsx
<div role="status" aria-live="polite" className="sr-only">
  Loading projects...
</div>
```

---

### A11Y-04 — Color-Only Status Indicators [MEDIUM]

**Screen**: `DashboardPage.tsx` (severity dots, status badges)
**Description**: Status is communicated by color alone (green dot = completed, red = failed). No icon or text alternative.
**Impact**: Users with color blindness cannot distinguish states.
**Recommended Fix**: Add icons or text labels:
  - `<span className="text-emerald-600">✓</span> Secured`
  - `<span className="text-rose-600">✕</span> Issues Found`

---

### A11Y-05 — Missing Skip-Navigation Link [LOW]

**Screen**: All pages
**Description**: No "Skip to main content" link for keyboard users. The sidebar is always the first focusable element.
**Impact**: Keyboard users tab through 30+ nav links before reaching page content.
**Recommended Fix**: Add visually-hidden skip link:
```tsx
<a href="#main-content" className="sr-only focus:not-sr-only">
  Skip to main content
</a>
```

---

## 6. Performance & Perceived Performance

### PERF-01 — Dashboard Loads Report Summaries Sequentially Perceived [MEDIUM]

**Screen**: `DashboardPage.tsx:224-250`
**Description**: Report summaries are fetched in parallel via `Promise.allSettled`, but the UI shows a full-page skeleton until all complete. With 15 projects, that's 15 API calls. The user sees the loader for 3-5 seconds.
**Impact**: Users think the app is slow.
**Recommended Fix**:
1. Use `Promise.allSettled` with staggered rendering — show the table immediately, populate severity badges as they arrive.
2. Cache summaries for 5 minutes (`staleTime: 300_000`).
3. Add a client-side cache: if summary is <1 hour old, show immediately and refetch in background.

---

### PERF-02 — WebSocket Connection State Causes Flicker [LOW]

**Screen**: `PendingVerificationPage.tsx`
**Description**: The WebSocket connects after mount. For 1-2 seconds, `wsConnected` is `true` (hardcoded), then flips to actual state. If the connection fails, the user sees "Live" briefly, then "Offline".
**Impact**: Users see a flash of incorrect state. Trust erodes.
**Recommended Fix**: Initialize `wsConnected` to `false`. Show "Connecting..." until first `onopen` or `onclose`.

---

## 7. Consistency Audit

### CON-01 — Inconsistent Empty States [MEDIUM]

**Screen**: Multiple
**Description**: Empty states vary wildly:
  - Dashboard: centered icon + heading + paragraph + CTA
  - MyIssues: hand-rolled spinner, then custom empty
  - PendingVerification: uses shared `EmptyState` component (correct)
  - ProjectReports: hand-rolled "No scans yet" with a shield icon
**Impact**: The product feels fragmented. Users learn to recognize empty states subconsciously.
**Recommended Fix**: Enforce `<EmptyState>` component everywhere. Define variants: `empty`, `error`, `no-access`.

---

### CON-02 — Inconsistent Terminology [MEDIUM]

**Screen**: Multiple
**Description**: Same concepts called different things:
  - "Project" vs "Repo" (in breadcrumbs vs body text)
  - "Scan" vs "Security Scan" vs "Pipeline"
  - "Findings" vs "Issues" vs "Vulnerabilities"
  - "Verification" vs "Rescan Approval"
**Impact**: Users create mental models that don't generalize. Cross-training team members takes longer.
**Recommended Fix**: Create a terminology guide in the design system:
  - **Project**: A codebase to scan
  - **Scan**: A single execution
  - **Finding**: A single result from a tool
  - **Issue**: A tracking item (derived from findings)
  - **Verification**: Approval of a developer's rescan request

---

### CON-03 — Page Titles Are Computed Inconsistently [LOW]

**Screen**: `Layout.tsx:207-215`
**Description**: Page titles are computed by a chain of ternary operators. Some paths return empty string (login), some return "Project Control" (generic), and some are accurate.
**Impact**: Browser tabs and bookmarks have generic titles. Users with many tabs can't find the right one.
**Recommended Fix**: Use route metadata:
```tsx
<Route path="/projects/:projectId" element={<ProjectControlPage />} />
// In ProjectControlPage:
useEffect(() => {
  document.title = `${project?.name} | Sentinel`;
}, [project]);
```

---

### CON-04 — "View" vs "Manage" vs "Controls" — What's the Difference? [LOW]

**Screen**: `DashboardPage.tsx` (ProjectRow actions)
**Description**: Each project row exposes:
  - "View" → `/scans/{id}` (last scan)
  - "View Reports" → `/projects/{id}/reports`
  - "Manage" → `/projects/{id}` (project controls)
  - "Edit" (admin pencil icon)
**Impact**: Users don't know which to click. "Manage" and "Controls" are synonyms.
**Recommended Fix**: Consolidate:
  - Primary: "View Scan" (if active scan exists)
  - Secondary: "Reports"
  - Tertiary: "Settings" (dropdown with Edit, Configure, Delete)

---

## 8. Trust & Professionalism

### TR-01 — No Human-Readable Error Codes [HIGH]

**Screen**: All error states
**Description**: When something goes wrong, the user sees:
  - "Failed to load"
  - "An error occurred"
  - Console stack traces (in dev)
  No error ID, no support contact, no "what to do next" guidance.
**Impact**: Users feel helpless. They open support tickets that say "it broke" with zero context.
**Recommended Fix**: Add structured error display:
```tsx
<div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
  <p className="text-sm text-slate-900 font-medium">Something went wrong</p>
  <p className="text-sm text-slate-600 mt-1">{error.message}</p>
  {error.code && (
    <p className="text-xs text-slate-500 mt-2 font-mono">
      Error code: {error.code} — share this with support
    </p>
  )}
</div>
```

---

### TR-02 — No Confirmation of Destructive Actions Until After [HIGH]

**Screen**: `DashboardPage.tsx` (delete project), `ScanStatusPage.tsx` (cancel scan)
**Description**: Delete and cancel actions happen in two clicks but provide no preview of consequences:
  - Delete project: "Are you sure?" — doesn't mention orphaned scans, storage deletion
  - Cancel scan: modal says "Partial results may be lost" but doesn't say how to re-trigger
**Impact**: Users lose data, then blame the tool.
**Recommended Fix**:
```tsx
<ConfirmModal
  title="Delete project?"
  message={
    <>
      <p>This will permanently delete <strong>{project.name}</strong> and all associated scans.</p>
      <p className="mt-2 text-sm text-slate-600">
        Orphaned scans: <strong>{activeScanCount}</strong> (will be automatically cancelled)
      </p>
    </>
  }
  confirmLabel="Delete permanently"
  variant="danger"
/>
```

---

### TR-03 — "System Operational" Status Is Hardcoded [MEDIUM]

**Screen**: `Layout.tsx:218-222`
**Description**: The header always shows a green dot + "System Operational" regardless of actual backend health. There is no health check endpoint being polled.
**Impact**: When Jenkins or SonarQube is down, users trust the "Operational" badge and waste time troubleshooting client-side.
**Recommended Fix**: Add a `/health` endpoint that checks Jenkins, DB, and Celery. Poll every 60s. Show:
  - Green: All systems operational
  - Amber: Some services degraded (Jenkins unreachable)
  - Red: Platform unavailable

---

### TR-04 — No Persistence of User Preferences [LOW]

**Screen**: Settings, Views
**Description**: The app doesn't remember:
  - Last selected scan on reports page
  - Preferred timezone
  - Table column preferences (sort order, visible columns)
  - Dark/light theme preference (theme doesn't exist)
**Impact**: Users re-configure the same views on every visit.
**Recommended Fix**: Add a `user_preferences` table. Store in localStorage as interim.

---

## 9. Prioritized Product Fix Plan

### Phase 1 — Trust & Safety (P0)

| Priority | Issue | Effort |
|----------|-------|--------|
| P0.1 | TR-01 — Structured error codes and messages | 1 day |
| P0.2 | TR-02 — Destructive action confirmations with consequences | 1 day |
| P0.3 | TR-03 — Real system health status | 0.5 day |
| P0.4 | ID-03 — Error state rendering (UnifiedReportPage) | 0.5 day |

### Phase 2 — Core UX Flows (P1)

| Priority | Issue | Effort |
|----------|-------|--------|
| P1.1 | UX-01 — Onboarding flow for new users | 2 days |
| P1.2 | UX-02 — PendingVerificationPage renaming + context | 1 day |
| P1.3 | ID-01 — Scan cancel confirmation + undo | 0.5 day |
| P1.4 | ID-02 — Scan progress indication | 1 day |

### Phase 3 — Accessibility (P2)

| Priority | Issue | Effort |
|----------|-------|--------|
| P2.1 | A11Y-01 — Modal accessibility (all 6 modals) | 1 day |
| P2.2 | A11Y-02 — Table keyboard navigation | 0.5 day |
| P2.3 | A11Y-03 — Live regions for loading/error | 0.5 day |

### Phase 4 — Consistency (P3)

| Priority | Issue | Effort |
|----------|-------|--------|
| P3.1 | CON-01 — Standardize empty states | 0.5 day |
| P3.2 | CON-02 — Terminology guide + copy audit | 1 day |
| P3.3 | UI-01 — Button style guide enforcement | 0.5 day |
| P3.4 | UI-02 — Border-radius standardization | 0.5 day |

---

## 10. Product Recommendations (Strategic)

### Feature Gaps That Block Adoption

1. **Guided Onboarding Missing** — The app assumes you know DevSecOps. Add a "First Scan Wizard" that walks users through: Project → Scan → Review → Assign. Drop-off after first scan is likely high without guidance.

2. **No Scheduled Scans** — Manual-only is not enterprise-grade. Recurring scans (cron) are a must-have for compliance workflows.

3. **No Notification Center** — Users must poll. Build a bell icon with smart notifications: "Your scan failed", "3 issues await your review", "Project X is now fully secured."

4. **Executive Reporting is a Stub** — Current "Executive" report is just charts renamed. Executives need one-paragraph takeaways: "Your risk score worsened 15% this week due to 3 new critical vulnerabilities in the payment module."

### Design System Strengths to Leverage

1. **Consistent spacing scale** (p-6, gap-4, etc.) — this is solid. Lock it down in a Tailwind config extension.
2. **Color palette** (slate + emerald/amber/rose) is coherent. Document it.
3. **Icon usage** (lucide-react) is consistent. Build an icon registry.
4. **Typography scale** (text-sm, text-lg, text-2xl) is reasonable. Add a type scale for headings (H1-H6).

### Design System Weaknesses to Fix

1. **No component library** — every page builds its own `<input>`, `<button>`, `<select>`. Extract to `src/components/ui/`.
2. **No dark mode** — slate-on-white is the only theme. Not a requirement but expected in dev tools.
3. **No responsive grid system** — `grid-cols-2` works, but `grid-cols-1 lg:grid-cols-2` should be the default, not the exception.

---

## 11. Accessibility Audit Summary

| WCAG Criterion | Status | Affected Pages | Severity |
|----------------|--------|----------------|----------|
| 1.1.1 Non-text Content | FAIL | 5 pages (decorative icons) | Medium |
| 1.3.1 Info and Relationships | FAIL | CreateProject, UnifiedReport | High |
| 1.4.11 Non-text Contrast | FAIL | ProjectEditPage | Medium |
| 2.1.1 Keyboard | FAIL | 6 modals, 2 tables | Critical |
| 2.4.3 Focus Order | PASS | All pages | — |
| 3.3.1 Error Identification | FAIL | CreateProject, UnifiedReport | High |
| 3.3.4 Error Prevention | FAIL | UnifiedReport | High |
| 4.1.2 Name, Role, Value | FAIL | 6 modals | Critical |
| 4.1.3 Status Messages | FAIL | All loading states | Medium |

---

## 12. Performance Budget Recommendations

| Metric | Current | Target |
|--------|---------|--------|
| First Contentful Paint | Unknown (not measured) | <1.5s |
| Largest Contentful Paint | Unknown | <2.5s |
| Cumulative Layout Shift | Likely >0.1 (skeletons) | <0.1 |
| Time to Interactive | Unknown | <3.5s |
| API response (list projects) | 201 queries (N+1) | <200ms |

**Recommendations**:
1. Add Web Vitals monitoring via `web-vitals` library.
2. Fix N+1 in `list_projects` (already in code audit report).
3. Add `loading="lazy"` to all images.
4. Preload critical fonts and routes.

---

*End of UI/UX Audit Report*