# Tasks: SonarQube Issue Enrichment — SUPERSEDED

**Superseded by**: `specs/008-issue-resolution-workflow/spec.md` (Phase 1 — Parser Enrichment)

All tasks from this spec have been consolidated into `specs/008-issue-resolution-workflow/spec.md` as part of the complete Issue Resolution Platform. Do not implement from this file — use spec 008 instead.

---

## Tier 1: Unlock Hidden Data (Low Effort, High Impact)

**Purpose**: Expose SonarQube fields the parser already receives but discards.

- [ ] T001 Add `line_number`, `file_path`, `effort`, `tags`, `sonar_status`, `sonar_resolution` fields to `SecurityFinding` dataclass in `backend/app/services/reporting/parsers/base.py`
- [ ] T002 Populate new fields in `fetch_sonar_issues()` in `backend/app/services/reporting/parsers/sonar.py` from the raw SonarQube API response (component → file_path, line → line_number, effort, tags, status, resolution)
- [ ] T003 Update `IssueDB` population in migration task (`backend/app/tasks/issue_tasks.py`) to store new fields into `location` (file_path + line_number as JSON), `effort`, and `extra_metadata` (tags, status, resolution)
- [ ] T044 Fix `test_issues_rbac.py` fixture — `IssueDB` not registered with `Base` before `create_all`, causing `no such table: issues`

**Checkpoint**: Parser captures line numbers, file paths, effort, and tags. All stored in IssueDB.

---

## Tier 2: Enable All Issue Types (Spec 004 Gap)

**Purpose**: Fulfill Spec 004 User Story 2 — dynamically fetch BUG, VULNERABILITY, CODE_SMELL, and SECURITY_HOTSPOT from SonarQube.

- [ ] T004 Make `types` param dynamic in `fetch_sonar_issues()` — accept `types` argument instead of hardcoding `BUG,VULNERABILITY`
- [ ] T005 Wire `types` param through `ScanReportDB` findings pipeline → `issue_tasks.py` migration preserves `finding_type` per issue
- [ ] T006 Verify `IssueTypeToggle` (Bugs / Vulnerabilities / Code Smells) `finding_type` filter reaches the issue API and filters results correctly — add `SECURITY_HOTSPOT` option to `IssueTypeToggle.tsx`

**Checkpoint**: All 4 SonarQube issue types appear in the dashboard. Type toggle actually filters results.

---

## Tier 3: Display Enriched Fields in Frontend

**Purpose**: Show the enriched data in the Tool Detail View and Issue Detail Modal.

- [ ] T007 Add `location`, `effort`, `finding_type`, `rule` columns to the Tool Detail View table in `src/pages/ToolDetailViewPage.tsx`
- [ ] T008 Expand `IssueDetailModal.tsx` to show file path, line number, effort, tags, rule link
- [ ] T009 Add `IssueResponse` type fields for new data in `src/types.ts` if missing

**Checkpoint**: Users see file paths, line numbers, effort, tags, and rule info in issue detail.

---

## Tier 4: Project Overview Type Breakdown (Spec 004 Gap)

**Purpose**: Project Overview page shows breakdown by finding type (e.g., "10 bugs, 13 vulns, 6 hotspots").

- [ ] T010 Update `GET /api/v1/issues/projects/{id}/overview` to return finding_type breakdown per tool in `backend/app/api/issues.py`
- [ ] T011 Update `ProjectOverviewPage.tsx` to display finding_type counts per tool card (e.g., "13 Critical, 4 High" → expand to "10 bugs, 13 vulns, 6 code smells")
- [ ] T012 Update `ToolCard.tsx` to accept and render finding_type breakdown

**Checkpoint**: Project overview shows type-level breakdown per tool.

---

## Tier 5: SonarQube Security Hotspot Integration

**Purpose**: Fetch and display Security Hotspots (separate SonarQube API endpoint).

- [ ] T013 Add `fetch_sonar_hotspots()` in `backend/app/services/reporting/parsers/sonar.py` — calls `api/hotspots/search` endpoint
- [ ] T014 Store hotspots alongside issues in the unified issue pipeline with `finding_type="SECURITY_HOTSPOT"`
- [ ] T015 Mark hotspots in frontend with distinct visual treatment (shield icon, different color)

**Checkpoint**: Security Hotspots appear in dashboards alongside other issue types.

---

## Tier 6: SonarQube Quality Gate & Measures (Beyond Spec 004)

**Purpose**: Surface quality gate status, coverage, duplication, and technical debt metrics.

- [ ] T016 Add `GET /api/v1/projects/{id}/sonar/measures` endpoint in `backend/app/api/` — calls `api/measures/component` for coverage, duplications, tech debt
- [ ] T017 Create `SonarMetricsCard.tsx` component showing quality gate (PASS/WARN/FAIL), coverage %, duplication %, tech debt ratio
- [ ] T018 Add `SonarMetricsCard` to `ProjectOverviewPage.tsx` above tool cards
- [ ] T019 Create `src/hooks/useSonarMetrics.ts` TanStack Query hook

**Checkpoint**: SonarQube quality gate and metrics visible on project overview.

---

## Tier 7: Issue Comments & Flow Visualization (Nice to Have)

**Purpose**: Show SonarQube issue comments and flow paths (code execution paths for vulnerabilities).

- [ ] T020 Add `fetch_sonar_issue_comments()` in `sonar.py` — calls `api/issues/comments` with issue key
- [ ] T021 Add `fetch_sonar_issue_flows()` in `sonar.py` — calls `api/issues/search` with `additionalFields=flows`
- [ ] T022 Display flows and comments in `IssueDetailModal.tsx`

**Checkpoint**: Users see SonarQube-specific comments and vulnerability flow paths.

---

## Tier 8: Polish & Verification

- [ ] T023 Run all existing tests (`pytest tests/`, `npx vitest run`) — confirm zero regressions
- [ ] T024 Run `npm run lint && npm run build` — fix any new lint/type errors
- [ ] T025 Update docs/spec references

---

## Effort Estimates

| Tier | Description | Est. Effort | Files Touched |
|------|-------------|-------------|---------------|
| 1 | Unlock hidden data | 2-3h | 3 files |
| 2 | Enable all issue types | 3-4h | 4 files |
| 3 | Display enriched fields | 2-3h | 2 files |
| 4 | Project overview breakdown | 2-3h | 3 files |
| 5 | Security hotspots | 4-5h | 2 files |
| 6 | Quality gate & measures | 5-6h | 4 files |
| 7 | Comments & flows | 4-5h | 3 files |
| T044 | Fix test_issues_rbac fixture | 0.5h | 1 file |

**Total**: ~22-29h for all 7 tiers + test fix.
