# Tasks: Sentinel Frontend UX Audit (Spec 011)

**Input**: Design documents from `/specs/011-ux-audit/`
**Prerequisites**: plan.md ✓, spec.md ✓, research.md ✓, data-model.md ✓, quickstart.md ✓
**Tests**: Not applicable (audit is a documentation deliverable, not code)
**Organization**: Tasks grouped by user story. Each phase is an independently shippable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Audit deliverable**: `specs/011-ux-audit/audit-report.md` (the only output file)
- **Source under review**: `src/pages/*.tsx` (read-only)
- **No new code is written in `src/`**

---

## Phase 1: Setup (Audit Skeleton)

**Purpose**: Create the audit report file with the required structure (sections, tables, finding template).

- [x] T001 Create audit report skeleton at `specs/011-ux-audit/audit-report.md` with title, date placeholder, executive summary section, and per-page section headers (one per page)
- [x] T002 [P] Add executive summary template at top of `specs/011-ux-audit/audit-report.md` with severity-counts table and UX health score placeholder
- [x] T003 [P] Add finding-skeleton template inside each per-page section (severity tag, title, file:line, description, remediation, WCAG)

---

## Phase 2: Foundational (Source Material Loaded)

**Purpose**: Read all 19 source files so the audit has material to evaluate. No findings yet — just the inputs.

- [x] T004 [P] Read all 19 page source files in `src/pages/` (CreateProjectPage, DashboardPage, DocsPage, LoginPage, ManualScanPage, MyIssuesPage, PendingVerificationPage, ProjectControlPage, ProjectEditPage, ProjectGroupsPage, ProjectOverviewPage, ProjectReportsPage, RegisterPage, ScanHistoryPage, ScanStatusPage, SettingsPage, ToolDetailViewPage, UnifiedReportPage, UserManagementPage) — note line counts and visible patterns
- [x] T005 [P] Read all reusable components in `src/components/` that appear on the 19 pages — note shared patterns (Toast, Modal, Button, Form) for cross-page consistency findings
- [x] T006 Pre-fill per-page section headers in `specs/011-ux-audit/audit-report.md` with the page name and source file path, marked "Audit pending"

**Checkpoint**: Report skeleton exists; all source material is in working memory. Audit can begin.

---

## Phase 3: User Story 1 - Comprehensive Audit Report (Priority: P1) 🎯 MVP

**Goal**: Produce findings for all 19 pages, covering 8 evaluation categories per page.

**Independent Test**: Open the report and verify it covers all 19 pages, each with findings (or "No issues found" section) and severity tags.

### Audit Tasks for User Story 1

> **Note**: All 19 page audits can run in parallel. Each is a single page, so the work is naturally independent. Each task produces ≥1 finding (or "No issues found").

- [x] T007 [P] [US1] Audit LoginPage (`src/pages/LoginPage.tsx`) against 8 categories — record findings in `specs/011-ux-audit/audit-report.md` LoginPage section
- [x] T008 [P] [US1] Audit RegisterPage (`src/pages/RegisterPage.tsx`) — record findings
- [x] T009 [P] [US1] Audit DashboardPage (`src/pages/DashboardPage.tsx`) — record findings
- [x] T010 [P] [US1] Audit ProjectControlPage (`src/pages/ProjectControlPage.tsx`) — record findings
- [x] T011 [P] [US1] Audit ProjectEditPage (`src/pages/ProjectEditPage.tsx`) — record findings
- [x] T012 [P] [US1] Audit CreateProjectPage (`src/pages/CreateProjectPage.tsx`) — record findings
- [x] T013 [P] [US1] Audit ProjectOverviewPage (`src/pages/ProjectOverviewPage.tsx`) — record findings
- [x] T014 [P] [US1] Audit ProjectReportsPage (`src/pages/ProjectReportsPage.tsx`) — record findings
- [x] T015 [P] [US1] Audit UnifiedReportPage (`src/pages/UnifiedReportPage.tsx`) — record findings
- [x] T016 [P] [US1] Audit ToolDetailViewPage (`src/pages/ToolDetailViewPage.tsx`) — record findings
- [x] T017 [P] [US1] Audit MyIssuesPage (`src/pages/MyIssuesPage.tsx`) — record findings
- [x] T018 [P] [US1] Audit PendingVerificationPage (`src/pages/PendingVerificationPage.tsx`) — record findings
- [x] T019 [P] [US1] Audit ScanStatusPage (`src/pages/ScanStatusPage.tsx`) — record findings
- [x] T020 [P] [US1] Audit ScanHistoryPage (`src/pages/ScanHistoryPage.tsx`) — record findings
- [x] T021 [P] [US1] Audit ManualScanPage (`src/pages/ManualScanPage.tsx`) — record findings
- [x] T022 [P] [US1] Audit ProjectGroupsPage (`src/pages/ProjectGroupsPage.tsx`) — record findings
- [x] T023 [P] [US1] Audit UserManagementPage (`src/pages/UserManagementPage.tsx`) — record findings
- [x] T024 [P] [US1] Audit SettingsPage (`src/pages/SettingsPage.tsx`) — record findings
- [x] T025 [P] [US1] Audit DocsPage (`src/pages/DocsPage.tsx`) — record findings

### Synthesis for User Story 1

- [x] T026 [US1] Identify cross-page duplicate patterns (same broken nav/button in 3+ pages) — add a "Cross-Page Patterns" section to the report
- [x] T027 [US1] Write executive summary at top of `specs/011-ux-audit/audit-report.md` with severity counts, top-5 most impactful findings, and overall UX health score (per `research.md` formula)

**Checkpoint**: All 19 pages audited, executive summary written, UX health score calculated. Report is the MVP.

---

## Phase 4: User Story 2 - Severity-Indexed Issue List (Priority: P1)

**Goal**: Verify that every finding has a severity tag and that the executive summary lists Critical first.

**Independent Test**: Count findings per severity and verify the order in the executive summary is Critical → Serious → Moderate → Minor.

> **Note**: Severity tagging happens during US1 audit tasks (T007–T025). US2 is a verification pass, not new content.

- [x] T028 [US2] Verify every finding in `specs/011-ux-audit/audit-report.md` has a severity tag (`[CRITICAL]`, `[SERIOUS]`, `[MODERATE]`, or `[MINOR]`) — fix any missing
- [x] T029 [US2] Verify executive summary severity counts in `specs/011-ux-audit/audit-report.md` match the per-finding tallies — recompute and reconcile if drift

**Checkpoint**: Severity-indexed list is complete and self-consistent.

---

## Phase 5: User Story 3 - Version-Controlled Audit (Priority: P2)

**Goal**: Commit the report to the feature branch so it is version-controlled.

**Independent Test**: `git log` on the `011-ux-audit` branch shows the audit report commit.

- [ ] T030 [US3] Commit `specs/011-ux-audit/audit-report.md` to `011-ux-audit` branch with message "spec(011): add UX audit report — N findings, score X/100"
- [ ] T031 [US3] Push the `011-ux-audit` branch to `origin`

**Checkpoint**: Report is on the remote branch. Git history preserves the audit as a snapshot.

---

## Phase 6: User Story 4 - Issue Tracker Sync (Priority: P3)

**Goal**: Convert Critical and Serious findings into tracked GitHub issues with the `ux-audit` label.

**Independent Test**: Count `gh issue list --label ux-audit --state open` and verify it matches the number of Critical+Serious findings.

- [ ] T032 [P] [US4] For each Critical finding in `specs/011-ux-audit/audit-report.md`, create a GitHub issue via `gh issue create` with label `ux-audit`, title "[Critical] <finding title>", body linking to the report section
- [ ] T033 [P] [US4] For each Serious finding, create a GitHub issue via `gh issue create` with label `ux-audit`, title "[Serious] <finding title>", body linking to the report section
- [ ] T034 [US4] Verify Moderate and Minor findings are NOT in the issue tracker (only in the report)

**Checkpoint**: Critical and Severe findings are now tracked; lower-priority findings remain in the report only.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final touches to the report and agent context.

- [x] T035 [P] Add methodology appendix at end of `specs/011-ux-audit/audit-report.md` (link to `research.md` and `data-model.md`)
- [x] T036 [P] Update `AGENTS.md` SPECKIT marker to point to `specs/011-ux-audit/audit-report.md` (so future agents see the audit findings)
- [x] T037 Verify report reads in ≤15 minutes (length check: target 500–3000 lines depending on finding density; flag if >5000)
- [x] T038 Add "Coverage Gaps" section at end of report if 30-min budget was exhausted (per SC-001 / clarification 2026-06-16)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — gates all audit tasks
- **User Story 1 (Phase 3)**: Depends on Foundational completion. All 19 page audits can run in parallel.
- **User Story 2 (Phase 4)**: Depends on US1 completion (verifies US1 output)
- **User Story 3 (Phase 5)**: Depends on US2 completion (commit the verified report)
- **User Story 4 (Phase 6)**: Depends on US3 completion (issues reference the committed report)
- **Polish (Phase 7)**: Depends on all stories complete

### User Story Dependencies

- **US1 (P1)**: Self-contained — produces the report
- **US2 (P1)**: Reads US1 output, validates it; no new content
- **US3 (P2)**: Reads US1+US2 output, commits it
- **US4 (P3)**: Reads US1 output (Critical+Serious findings), creates issues

### Within Each User Story

- T007–T025 (page audits) MUST be done before T026 (cross-page patterns + executive summary)
- T026 MUST be done before T027 (severity validation in US2)
- T027 MUST be done before T028 (commit in US3)

### Parallel Opportunities

- All page audits (T007–T025) can run in parallel — they touch different parts of the same file but in distinct sections
- Setup tasks T002 and T003 can run in parallel with T001
- Foundational tasks T004 and T005 can run in parallel
- US4 issue creation (T032, T033) can run in parallel
- Polish tasks T035 and T036 can run in parallel

---

## Parallel Example: User Story 1

```bash
# All 19 page audits can run in parallel (each writes to a distinct section):
Task: "Audit LoginPage against 8 categories — record findings in audit-report.md LoginPage section"
Task: "Audit RegisterPage against 8 categories — record findings in audit-report.md RegisterPage section"
Task: "Audit DashboardPage against 8 categories — record findings in audit-report.md DashboardPage section"
# ... (16 more, one per page)

# All issue creation can run in parallel:
Task: "Create GitHub issue for Critical finding F-007"
Task: "Create GitHub issue for Critical finding F-012"
Task: "Create GitHub issue for Serious finding F-003"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 + 3)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1 (the audit itself)
4. Complete Phase 4: User Story 2 (severity validation)
5. **STOP and VALIDATE**: Report exists, all findings tagged, severity counts match
6. Complete Phase 5: User Story 3 (commit + push)
7. **MVP delivered**: Report is on the remote branch and ready to read

### Incremental Delivery

1. Phases 1–5 (Setup → US3) → MVP report shipped
2. Phase 6 (US4) → Critical/Serious findings become tracked issues
3. Phase 7 (Polish) → Final report with appendix and agent context update

### Parallel Team Strategy

With multiple auditors (or a single auditor with parallel tool calls):

1. Lead: Phase 1 (skeleton) + Phase 2 (load source)
2. Auditors A–M (in parallel): Phase 3 page audits (T007–T025, ~1.5 pages per auditor)
3. Lead: Phase 3 synthesis (T026, T027) + Phase 4 validation (T028, T029)
4. Anyone: Phase 5 commit/push + Phase 6 issue sync + Phase 7 polish

### Time Budget

- Phase 1: 2 min (skeleton)
- Phase 2: 3 min (load source)
- Phase 3: 20 min (19 pages × ~1 min each, parallel = 1–2 min if parallelized)
- Phase 4: 2 min (validation)
- Phase 5: 1 min (commit + push)
- Phase 6: 3 min (issue sync, ~1 min per Critical+Serious finding)
- Phase 7: 2 min (polish)
- **Total**: 30 min target (SC-006)

If Phase 3 exceeds 20 min, defer remaining pages to a "Coverage Gaps" section per clarification 2026-06-16.

---

## Notes

- This is a documentation deliverable, not a code project. Tasks produce text in a single file, not source code.
- [P] tasks = different sections of the same file (or different files), no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- The audit agent should perform tasks T007–T025 as parallel tool calls (one read per page) when possible, to fit the 30-min budget
- Stop at any checkpoint to validate the audit independently
- If a page is too large or ambiguous, mark its section "Audit pending — manual review recommended" and move on
