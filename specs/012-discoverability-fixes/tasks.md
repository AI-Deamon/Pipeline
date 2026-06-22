# Tasks: Discoverability & Navigation Fixes

**Spec**: `spec.md`
**Plan**: `plan.md`
**Last updated**: 2026-06-16 (refinement pass)

Tasks are ordered by dependency. Each task lists: ID, title, file(s), effort estimate, blocked-by.

## Phase 1 — Foundation (no inter-deps, can run in parallel)

- [ ] **T01** [P1] Add `canViewProjectGroups` and `canUpdateProject` flags to `useRbac()` — `src/hooks/useRbac.ts` — 15 min — **Blocked by**: none
- [ ] **T02** [P1] Add `useRbac()` call to `Layout.tsx`; import `ListChecks`, `FolderTree`, `Edit3` icons — `src/components/Layout.tsx` — 15 min — **Blocked by**: none
- [ ] **T03** [P1] Add "Issues" + "Groups" `NavLink` entries with RBAC gate (FR1.3) — `src/components/Layout.tsx:124-130` — 15 min — **Blocked by**: T01, T02
- [ ] **T04** [P1] Add "Edit" icon to active-project block in `Layout.tsx` (FR1.5) — `src/components/Layout.tsx:140-151` — 10 min — **Blocked by**: T01, T02
- [ ] **T05** [P1] Add `onClick` prop to `IssueCard`; render as `<button type="button">` with `onKeyDown` (Enter/Space) when provided — `src/components/IssueCard.tsx:1-57` — 20 min — **Blocked by**: none
- [ ] **T06** [P1] Add `/issues` and tool-name cases to `Breadcrumbs` (use `STAGE_DISPLAY_NAMES`) — `src/components/Breadcrumbs.tsx:27-82` — 25 min — **Blocked by**: none
- [ ] **T07** [P2] Add `Issues` link button in `ProjectControlPage` action row — `src/pages/ProjectControlPage.tsx:206-224` — 10 min — **Blocked by**: none

## Phase 2 — IssuesTriagePage (depends on T01, T05)

- [ ] **T08** [P1] Create `IssuesTriagePage.tsx` with empty states (0 projects, 0 issues) + RBAC guard + in-page redirect — `src/pages/IssuesTriagePage.tsx` (NEW) — 45 min — **Blocked by**: T01, T05
- [ ] **T09** [P1] Wire `IssuesTriagePage` to fetch issues per project (cap 10, parallel `getProjectOverview`) — `src/pages/IssuesTriagePage.tsx` — 30 min — **Blocked by**: T08
- [ ] **T10** [P1] Add sort by severity desc + last_seen tiebreaker; default status filter `['open']`; 60s refetchInterval — `src/pages/IssuesTriagePage.tsx` — 25 min — **Blocked by**: T08
- [ ] **T11** [P1] Add severity + tool filter chips to `IssuesTriagePage` header — `src/pages/IssuesTriagePage.tsx` — 30 min — **Blocked by**: T08
- [ ] **T12** [P1] Add "Show more projects" link when projects.length > 10 — `src/pages/IssuesTriagePage.tsx` — 15 min — **Blocked by**: T09
- [ ] **T13** [P1] Register `/issues` route in `App.tsx` — `src/App.tsx:55-200` — 5 min — **Blocked by**: T08
- [ ] **T14** [P1] Make `MyIssuesPage` cards open `IssueDetailModal` (pass `onClick`); mount modal; update test to mock modal — `src/pages/MyIssuesPage.tsx`, `src/tests/pages/MyIssuesPage.test.tsx` — 25 min — **Blocked by**: T05

## Phase 3 — User picker in IssueDetailModal (depends on T01)

- [ ] **T15** [P2] Add `useUsersForProject(projectId)` hook (calls `api.rbac.getUsers`, filters by project) — `src/hooks/useRbac.ts` or new `src/hooks/useUsersForProject.ts` — 25 min — **Blocked by**: T01
- [ ] **T16** [P2] Replace free-text `<input>` in `IssueDetailModal` with `<select>` of project members (FR9) — `src/components/IssueDetailModal.tsx:191-198` — 20 min — **Blocked by**: T15
- [ ] **T17** [P2] Handle "0 project members" empty state in `IssueDetailModal` Assign control — `src/components/IssueDetailModal.tsx` — 10 min — **Blocked by**: T16

## Phase 4 — Reports ↔ Issues (depends on T01, T15)

- [ ] **T18** [P2] Add `api.issues.findByFindingKey(projectId, tool, key)` with 5-page loop — `src/services/api.ts`, `src/hooks/useIssues.ts` — 30 min — **Blocked by**: none
- [ ] **T19** [P2] Add `projectId` and `scanId` props to `FindingDetailModal`; update both call sites — `src/components/FindingDetailModal.tsx`, `src/pages/ProjectReportsPage.tsx`, `src/pages/UnifiedReportPage.tsx` — 25 min — **Blocked by**: none
- [ ] **T20** [P2] Add "Open in Issue Tracker" + "Create issue" buttons to `FindingDetailModal` footer (FR4) — `src/components/FindingDetailModal.tsx` — 40 min — **Blocked by**: T15, T18, T19
- [ ] **T21** [P2] Add success/error toasts via `useToast()` in `FindingDetailModal` mutation handlers — `src/components/FindingDetailModal.tsx` — 15 min — **Blocked by**: T20
- [ ] **T22** [P2] Add "Issues" link in `ProjectReportsPage` page header (gated by `canAssignIssues || isAdmin`) — `src/pages/ProjectReportsPage.tsx` — 15 min — **Blocked by**: T03
- [ ] **T23** [P2] Add same "Issues" link in `UnifiedReportPage` — `src/pages/UnifiedReportPage.tsx` — 15 min — **Blocked by**: T03

## Phase 5 — Tests

- [ ] **T24** [P1] **NEW FILE** `Layout.test.tsx` — Issues + Groups + Edit icon visibility by role — `src/tests/components/Layout.test.tsx` — 25 min — **Blocked by**: T03, T04
- [ ] **T25** [P1] Test: `IssueCard` clickable variant calls `onClick`; read-only variant has no handler — `src/tests/components/IssueCard.test.tsx` — 15 min — **Blocked by**: T05
- [ ] **T26** [P1] Test: `IssuesTriagePage` empty state (0 projects); 0 issues; in-page redirect for developers — `src/tests/pages/IssuesTriagePage.test.tsx` (NEW) — 30 min — **Blocked by**: T08
- [ ] **T27** [P1] Test: `IssuesTriagePage` renders issues grouped by project, sorted by severity — `src/tests/pages/IssuesTriagePage.test.tsx` — 25 min — **Blocked by**: T09, T10
- [ ] **T28** [P1] Test: `IssuesTriagePage` filter chips update the list — `src/tests/pages/IssuesTriagePage.test.tsx` — 20 min — **Blocked by**: T11
- [ ] **T29** [P2] Test: `Breadcrumbs` produces correct chain for `/projects/:id/issues/:tool` using `STAGE_DISPLAY_NAMES` — `src/tests/components/Breadcrumbs.test.tsx` — 15 min — **Blocked by**: T06
- [ ] **T30** [P2] Update `FindingDetailModal.test.tsx` to mock `useAuth`; add test for "Open in Issue Tracker" calls `findByFindingKey` and "Create issue" calls `useCreateIssue` — `src/tests/components/FindingDetailModal.test.tsx` — 30 min — **Blocked by**: T20
- [ ] **T31** [P2] Test: `IssueDetailModal` `<select>` user picker replaces free-text input; 0-members empty state — `src/tests/components/IssueDetailModal.test.tsx` — 20 min — **Blocked by**: T16, T17

## Phase 6 — Verification

- [ ] **T32** [P1] Run `npm run lint` and fix all warnings — 15 min
- [ ] **T33** [P1] Run `npm run build` (typecheck) and fix all errors — 20 min
- [ ] **T34** [P1] Run `npx vitest run` and ensure all tests pass — 15 min
- [ ] **T35** [P2] Manual smoke test: log in as admin, complete SC1 + SC2 + SC9 — 20 min
- [ ] **T36** [P2] Manual smoke test: log in as team_lead, complete SC3-SC8 — 20 min
- [ ] **T37** [P2] Manual smoke test: log in as developer, confirm SC2 + "Issues"/"Groups" hidden — 10 min

## Effort summary

| Phase | Tasks | Effort |
|-------|-------|--------|
| 1 — Foundation | T01–T07 | 1h 50m |
| 2 — IssuesTriagePage | T08–T14 | 2h 55m |
| 3 — User picker | T15–T17 | 55m |
| 4 — Reports ↔ Issues | T18–T23 | 2h 20m |
| 5 — Tests | T24–T31 | 3h 00m |
| 6 — Verification | T32–T37 | 1h 40m |
| **Total** | **37 tasks** | **~12h 40m** |

## Critical path

T01 → T02 → T03 → T08 → T09 → T10 → T11 → T26 → T27 → T28 → T32 → T33 → T34 → T35
