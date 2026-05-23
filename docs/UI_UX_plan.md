Let me thoroughly analyze your codebase across all pages and components before giving you a comprehensive UI/UX plan.

After a deep review of all your pages, components, hooks, and services, here is a full, prioritized UI/UX design roadmap for your DevSecOps platform:

---

=======================source Agent/files  ===================


## Critical Issues (Broken UX — Fix First)

### 1. Scan Status Page — Invisible Results
**Problem:** `ScanStatusPage.tsx` tries `scan.results` first, then falls back to `api.scans.getResults()`. If both return empty, the user sees *"No scan results available yet"* with zero indication of whether the scan actually ran, failed silently, or is still loading. There's no state differentiation.

**Fix:**
- Show a distinct empty state per scan state: a pulsing skeleton for `RUNNING`, a "zero stages returned" warning card for `COMPLETED` with 0 results, and a clear error card for `FAILED`
- Add a **last-updated timestamp** next to the Refresh button so users know the data is fresh

### 2. Dashboard — No Scan State Feedback Loop
**Problem:** After triggering a scan from `ProjectControlPage`, the user is sent to `ScanStatusPage`. But if they navigate back to the Dashboard, `last_scan_state` shows "RUNNING" with a blue dot — but there's no way to click through to the active scan. The dot is decorative, not actionable.

**Fix:** Make the status badge a clickable link to the most recent scan for that project.

### 3. Error Modal Has No Retry Path
**Problem:** `ScanErrorModal` shows the error and a Jenkins link, but closes without offering a "Reset & Retry" action. The reset button only exists further down `ScanStatusPage` behind a `confirm()` dialog — a browser native popup that looks broken/unprofessional.

**Fix:** Move the reset/retry CTA into the modal itself. Replace `confirm()` with an inline confirmation UI.

---

## High Impact UX Improvements

### 4. Empty State Design — All Pages
Right now every empty state is a single centered text string. These need proper treatment:

| Page | Current | Needed |
|------|---------|--------|
| Dashboard (no projects) | `"No projects found. Create one..."` | Illustrated empty state with CTA button |
| Scan History (no scans) | `"No scan history yet"` | Contextual empty state with "Run your first scan" CTA |
| Scan Results (no stages) | Generic text | State-specific empty states (loading skeleton, true empty, error) |

### 5. `ScanProgressBar` — Misleading Progress
**Problem:** The progress bar calculates percentage based on `STAGE_ORDER.length` (always 11 stages), but a manual scan may only have 3 stages selected. A 3-stage manual scan shows 27% even when all 3 stages are PASS.

**Fix:** Base the denominator on `selected_stages.length` if present, falling back to 11.

### 6. Notification Permission — Bad Timing
**Problem:** In `ScanStatusPage`, `notificationService.requestPermission()` fires on component mount unconditionally. Users get a browser permission prompt immediately upon viewing any scan — before they've had any reason to want notifications.

**Fix:** Only request permission when a scan enters `RUNNING` state for the first time, or surface a subtle "Enable notifications" banner that the user can opt into.

### 7. Sidebar — No Active Project Context
The sidebar only has Dashboard and Create Project. When a user is deep in `/projects/:id/manual` or `/scans/:id`, there's no breadcrumb or sidebar context showing which project they're working on.

**Fix:** Add a collapsible "Current Project" section to the sidebar when a project is active, with quick-links to: Project Details, Run Scan, Scan History.

### 8. Header Title — Hardcoded and Incomplete
`Layout.tsx` uses a chain of `isActive()` checks that misses most routes (e.g., `/projects/:id/history` falls through to `'Project Details'`).

**Fix:** Add route matching for all routes, or use React Router's `useMatches` with route `handle` metadata to supply page titles declaratively.

---

## UX Polish & Missing Patterns

### 9. Form Validation — No Inline Feedback
`CreateProjectPage` validates on submit only. Fields like Git URL, Target IP, and Target URL have no real-time validation. Users fill out 6+ fields and only find errors after clicking submit.

**Fix:** Add per-field validation with `onBlur` + visual indicators (green checkmark / red border + helper text). Use a small IP address format hint under the Target IP field.

### 10. Manual Scan — Stage Selection Has No Order Visualization
`ManualScanPage` shows stages as a flat checklist. Users can't tell which stages depend on others (e.g., `trivy_image_scan` requires `docker_build`). The dependency validation only happens on the backend — the user discovers errors after clicking Start.

**Fix:** Render stages in a visual pipeline/chain. Show dependency arrows or groupings (Source Analysis → Build → Security Testing → Network). Disable dependent stages if their prerequisite isn't selected, with a tooltip explaining why.

### 11. Scan History Page — No Click-Through to Scan Detail
`ScanHistoryPage` shows scan rows but they're not clickable. Seeing `scan_id.slice(0, 8)...` with no link is a dead-end.

**Fix:** Make each row a link to `/scans/:id`. Add a status badge with color coding, and show a "retry" quick action on failed rows.

### 12. `ScanProgressBar` — ETA Is Always Wrong
The `calculateETA()` function uses hardcoded `STAGE_DURATIONS` that are unrelated to actual scan runtime. It will always show the same ETA regardless of the actual scan. This is worse than showing nothing.

**Fix:** Either base ETA on `started_at` + average historical duration (from scan history), or remove the ETA entirely and replace with elapsed time ("Running for 4m 32s") which is always accurate.

### 13. Loading States — Inconsistent Patterns
Some pages use a full-screen centered spinner (`ScanStatusPage`), some use inline text (`"Loading project details..."`), and some use nothing. This creates a jarring, inconsistent feel.

**Fix:** Create a `<PageSkeleton>` component with shimmer/pulse placeholders that match the actual page layout. Use it everywhere. The skeleton should mirror the shape of the content (card shapes for project cards, row shapes for tables).

### 14. Login / Register — No Success Feedback on Register
After registration, `RegisterPage` redirects to Login with a state message, but `LoginPage` only clears that message via `window.history.replaceState` after 5 seconds and never actually *shows* it to the user. The message from `location.state.message` is read but never rendered.

**Fix:** Render `location.state?.message` as a green success banner at the top of the login form.

### 15. Delete Project — No Undo / Toast Confirmation
`DashboardPage` deletes a project with an inline Yes/No confirm that disappears immediately on success. If a user accidentally confirms, there's no recovery path and no feedback that it succeeded.

**Fix:** Add a toast notification system (a `<Toast>` component) for all destructive and important actions. Show a toast after: project created, project deleted, scan triggered, scan cancelled, scan reset.

---

## Nice-to-Have UX Enhancements

### 16. Dark Mode
The sidebar is already `bg-slate-900`. The palette supports it. Adding a dark mode toggle would align with the DevSecOps/developer audience.

### 17. Keyboard Navigation & Accessibility
- The confirmation modal in `ProjectControlPage` traps focus correctly (it uses `aria-modal`, `aria-labelledby`) ✅
- But `ScanErrorModal` and the delete confirm in `DashboardPage` do not trap focus ❌
- Add `role="status"` and `aria-live="polite"` to the scan status badge so screen readers announce state changes


### 19. WebSocket Connection Status Indicator
`useScanWebSocket` has `connected` and `connecting` states but they're never surfaced in the UI. Users watching a running scan have no idea if their real-time connection is active or if they're seeing stale data.

**Fix:** Add a small "Live" indicator (green pulse dot + "Live") near the Refresh button when WebSocket is connected, and a "Reconnecting…" state when it drops.

### 20. API Key Setup Guidance
`useScanReset.ts` and `useScanCancel.ts` read `localStorage.getItem('API_KEY') || import.meta.env.VITE_API_KEY`. If neither is set, the reset/cancel calls will 401. There's no guidance anywhere in the UI about this requirement.

**Fix:** On first login, show a one-time setup banner: "To enable scan management features, configure your API key in Settings." Link to a Settings page or a modal where the API key can be saved to localStorage.

Now let's create the backend PATCH endpoint:Here's everything that was built — 14 files total, drop them straight into your project:

**New files (just add these):**
- `Toast.tsx` — global notification system with progress bar, auto-dismiss, 4 variants
- `ConfirmModal.tsx` — replaces every native `confirm()` dialog across the app
- `EditProjectPage.tsx` — full edit form at `/projects/:id/edit` with per-field inline validation and live error/success indicators

**Updated frontend files:**
- `App.tsx` — wraps everything in `<ToastProvider>`, adds the `/edit` route
- `api.ts` — adds `projects.update()` calling `PATCH /api/v1/projects/:id`
- `DashboardPage.tsx` — status badges are now clickable links to scan history, delete uses `ConfirmModal`, proper illustrated empty state, row actions fade in on hover
- `ProjectControlPage.tsx` — "Edit Project" button in header + sidebar card, automated scan uses `ConfirmModal`, all errors show as toasts
- `ScanStatusPage.tsx` — three distinct empty states (loading/no-data/failed), live elapsed timer replaces wrong ETA, WebSocket "Live" indicator in header, reset/cancel use `ConfirmModal` + toasts, notifications only fire when scan hits RUNNING (not on page mount)
- `ScanHistoryPage.tsx` — every row is now clickable to `/scans/:id`, proper empty state with CTA, duration shows `4m 30s` format, loading skeleton
- `LoginPage.tsx` — registration success banner now actually renders
- `ScanProgressBar.tsx` — denominator fixed to `selectedStages.length` for manual scans; ETA replaced with live elapsed timer
- `Layout.tsx` — accurate header title for all 8 routes via regex matching

**Backend files:**
- `backend/app/api/projects.py` — adds `PATCH /projects/{project_id}` endpoint
- `backend/app/schemas/project.py` — adds `ProjectUpdate` schema (all fields optional)