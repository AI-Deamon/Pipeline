# Tasks: ICM Workspace Configuration

**Input**: Design documents from `/specs/006-icm-workspace-config/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, quickstart.md

**Tests**: Not applicable — documentation-only feature. Verification is manual checklist review per FR-002.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

All paths are relative to repository root:
- `AGENTS.md` — Layer 1 root map file
- `.ai/CONTEXT-planning.md` — Planning room manual
- `.ai/CONTEXT-coding.md` — Coding room manual
- `.ai/CONTEXT-reviewing.md` — Reviewing room manual
- `.opencode/`, `.claude/`, `.kilo/`, `.qwen/`, `.agents/` — per-tool configs (to be consolidated then removed)

---

## Phase 1: Setup

**Purpose**: Audit existing files and prepare workspace structure

- [x] T001 Audit current AGENTS.md — catalog all 15+ gotchas, 10+ commands, architecture table, style conventions into a preservation checklist in `specs/006-icm-workspace-config/checklists/data-loss-checklist.md`
- [x] T002 [P] Audit per-tool AI config directories — catalog content from `.opencode/`, `.claude/`, `.kilo/`, `.qwen/`, `.agents/` into `specs/006-icm-workspace-config/checklists/consolidation-checklist.md`
- [x] T003 [P] Ensure `.ai/` directory exists at repository root

**Checkpoint**: Preservation and consolidation checklists ready. Workspace structure prepared.

---

## Phase 2: Foundational (US3 — AGENTS.md Restructure)

**Purpose**: Restructure AGENTS.md into the 8-section benchmark skeleton. This BLOCKS all other user stories — they add content TO these sections.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Implementation for User Story 3

- [x] T004 [US3] Restructure AGENTS.md — create all 8 section headers (`## WHAT THIS IS`, `## FOLDER STRUCTURE`, `## QUICK NAVIGATION`, `## CROSS-WORKSPACE FLOW`, `## ID & NAMING CONVENTIONS`, `## FILE PLACEMENT RULES`, `## TOKEN MANAGEMENT`, `## SKILLS & TOOLS`) with `---` dividers in `AGENTS.md`
- [x] T005 [P] [US3] Populate WHAT THIS IS — project identity "Archer", agent-drop-in philosophy, siloed workspace concept in `AGENTS.md`
- [x] T006 [P] [US3] Populate FOLDER STRUCTURE — visual tree (code block) showing root → `AGENTS.md` → `.ai/CONTEXT-*.md` with room labels in `AGENTS.md`
- [x] T007 [P] [US3] Populate ID & NAMING CONVENTIONS — table with Pattern, Example, Status columns for at least 4 file types (specs, Python, React, Docker) in `AGENTS.md`
- [x] T008 [P] [US3] Populate FILE PLACEMENT RULES — draft→review→final lifecycle; `specs/` = drafts, CONTEXT.md files = final in `AGENTS.md`
- [x] T009 [US3] Populate TOKEN MANAGEMENT — siloed philosophy paragraph, global gotchas from preservation checklist, load/skip guidance in `AGENTS.md`
- [x] T010 [US3] Verify zero data loss — side-by-side review of every gotcha, command, convention from original AGENTS.md against restructured version using `specs/006-icm-workspace-config/checklists/data-loss-checklist.md`

**Checkpoint**: AGENTS.md has all 8 sections populated. All existing content preserved. Verification checklist complete.

---

## Phase 3: User Story 1 — Quick Navigation (Priority: P1) 🎯 MVP

**Goal**: QUICK NAVIGATION table routes agents to the correct room file within 30 seconds.

**Independent Test**: Given 5 tasks (plan a scan rule, write a Celery task, review findings, fix Docker bug, update frontend), verify QUICK NAVIGATION directs each to the correct room.

### Implementation for User Story 1

- [x] T011 [US1] Populate QUICK NAVIGATION table in `AGENTS.md` — minimum 10 intent-to-path mappings covering: write a spec, implement a scan stage, fix a scan bug, review SonarQube report, update frontend component, configure Jenkins, triage ZAP findings, fix Docker networking, add new scanner, review security rules
- [x] T012 [US1] Add Multi-Room category to QUICK NAVIGATION table in `AGENTS.md` — tasks spanning Planning→Coding, Coding→Reviewing, Planning→Coding→Reviewing
- [x] T013 [US1] Verify QUICK NAVIGATION covers all primary task categories — count rows ≥ 10, each row maps intent → room + file path in `AGENTS.md`

**Checkpoint**: QUICK NAVIGATION table complete with ≥10 rows and Multi-Room category. Agents can route themselves.

---

## Phase 4: User Story 2 — Noise Filter (Priority: P1)

**Goal**: Each CONTEXT.md Noise Filter tells the agent exactly what to load and skip, especially cross-room folders.

**Independent Test**: For each room, verify the Noise Filter lists surgical file paths, marks folders from other rooms as Skip, and total loaded files ≤ 15.

### Implementation for User Story 2

- [x] T014 [US2] Create `.ai/CONTEXT-planning.md` — all 6 Creation Kit section headers (Soul Check, Noise Filter, Blueprint, Conversation, Magic Buttons, Safety Rail) with placeholder content
- [x] T015 [P] [US2] Create `.ai/CONTEXT-coding.md` — all 6 Creation Kit section headers with placeholder content
- [x] T016 [P] [US2] Create `.ai/CONTEXT-reviewing.md` — all 6 Creation Kit section headers with placeholder content
- [x] T017 [US2] Populate Planning room Noise Filter in `.ai/CONTEXT-planning.md` — Load: `specs/`, `.ai/`, `Agent/Jenkinsfile`; Skip: `src/`, `backend/app/models/`, `docker/jenkins/`, `node_modules/`
- [x] T018 [P] [US2] Populate Coding room Noise Filter in `.ai/CONTEXT-coding.md` — Load: `backend/app/api/scans/`, `backend/app/services/scan_orchestrator.py`, `backend/app/core/celery_app.py`, `backend/app/services/jenkins_service.py`; Skip: `backend/app/api/auth.py`, `src/pages/LoginPage.tsx`, `docker/jenkins/`
- [x] T019 [P] [US2] Populate Reviewing room Noise Filter in `.ai/CONTEXT-reviewing.md` — Load: `backend/app/services/reporting/`, `src/pages/UnifiedReportPage.tsx`, `src/pages/ScanStatusPage.tsx`, `src/pages/ScanHistoryPage.tsx`; Skip: `backend/app/api/auth.py`, `docker/jenkins/`, `backend/app/core/`
- [x] T020 [US2] Verify Noise Filter constraints — each room ≤ 15 load paths, ≥ 10 skip paths, cross-room folders explicitly skipped (per SC-003)

**Checkpoint**: All three CONTEXT.md files created with Noise Filters. Cross-room isolation verified.

---

## Phase 5: User Story 4 — Cross-Workspace Flow (Priority: P1)

**Goal**: CROSS-WORKSPACE FLOW diagram shows how work moves between rooms with labeled transition criteria.

**Independent Test**: Given a task spanning Planning→Coding, verify the flow diagram shows the transition with explicit criteria.

### Implementation for User Story 4

- [x] T021 [US4] Populate CROSS-WORKSPACE FLOW diagram in `AGENTS.md` — ASCII art or code block showing Planning → Coding → Reviewing with ≥ 3 transitions and labeled criteria (e.g., "spec approved → move to Coding room")
- [x] T022 [US4] Add reverse transitions to CROSS-WORKSPACE FLOW in `AGENTS.md` — Reviewing → Planning (findings require new rule), Coding → Planning (implementation needs redesign)
- [x] T023 [US4] Verify CROSS-WORKSPACE FLOW — ≥ 3 transitions with explicit criteria, visual format using code block (per SC-008)

**Checkpoint**: Cross-workspace flow diagram complete. Agents understand work lifecycle.

---

## Phase 6: User Story 5 — Conversation Process (Priority: P2)

**Goal**: Each room's Conversation section follows the 4-step Source→Plan→Execute→Refine cycle.

**Independent Test**: For each room, verify the Process has 4 steps, each with a driving question and room-specific actions.

### Implementation for User Story 5

- [x] T024 [US5] Populate Planning room Conversation in `.ai/CONTEXT-planning.md` — 4-step cycle: Source (review existing stage configs, Jenkinsfile), Plan (draft stage schema), Execute (define stage config), Refine (validate against constraints, get approval)
- [x] T025 [P] [US5] Populate Coding room Conversation in `.ai/CONTEXT-coding.md` — 4-step cycle: Source (read service module, celery_app.py), Plan (draft task signature, import paths), Execute (write task, update imports), Refine (verify with pytest, rebuild celery_worker)
- [x] T026 [P] [US5] Populate Reviewing room Conversation in `.ai/CONTEXT-reviewing.md` — 4-step cycle: Source (load parser module, filter settings), Plan (identify findings to cross-reference), Execute (cross-reference with code, categorize severity), Refine (summarize remediation priorities)
- [x] T027 [US5] Verify Conversation sections — each room has 4 steps, each step has driving question and ≥ 2 concrete actions (per SC-005)

**Checkpoint**: All three rooms have repeatable 4-step processes. Agents produce consistent output.

---

## Phase 7: User Story 6 — Safety Rail (Priority: P2)

**Goal**: Each room's Safety Rail lists ≥ 5 project-specific anti-patterns.

**Independent Test**: Attempt each forbidden action listed in Hard Rules. Verify the rule would have caught it.

### Implementation for User Story 6

- [x] T028 [US6] Populate Planning room Safety Rail in `.ai/CONTEXT-planning.md` — ≥ 5 anti-patterns: e.g., "Thou shalt NOT define a scan stage without checking Jenkinsfile pipeline structure first", "Thou shalt NOT skip validation against existing stage configs"
- [x] T029 [P] [US6] Populate Coding room Safety Rail in `.ai/CONTEXT-coding.md` — ≥ 5 anti-patterns from gotchas: "Thou shalt NOT edit scans.py (module is scans/)", "Thou shalt NOT rebuild backend without celery_worker", "Thou shalt NOT assume SonarQube token is valid without checking", "Thou shalt NOT use sonar.javascript.skip=true", "Thou shalt NOT run python run.py down without --volumes warning"
- [x] T030 [P] [US6] Populate Reviewing room Safety Rail in `.ai/CONTEXT-reviewing.md` — ≥ 5 anti-patterns: "Thou shalt NOT assume zero findings means zero vulnerabilities (check SonarQube container)", "Thou shalt NOT report CODE_SMELL findings (filtered out by types=BUG,VULNERABILITY)", "Thou shalt NOT skip SonarQube retry loop (3 attempts, 10s delay)"
- [x] T031 [US6] Verify Safety Rail sections — each room ≥ 5 anti-patterns, each derived from "What always goes wrong here?" (per SC-004)

**Checkpoint**: All rooms have Safety Rails. Known anti-patterns are explicitly called out.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final verification and consolidation cleanup

- [x] T032 Populate Planning room Soul Check in `.ai/CONTEXT-planning.md` — format: "This room is for [Primary Action]. Be a [Specialist Persona]." (per SC-011)
- [x] T033 [P] Populate Coding room Soul Check in `.ai/CONTEXT-coding.md` — same format
- [x] T034 [P] Populate Reviewing room Soul Check in `.ai/CONTEXT-reviewing.md` — same format
- [x] T035 Populate Planning room Blueprint in `.ai/CONTEXT-planning.md` — `specs/` = drafts, CONTEXT.md files = final (per FR-006 clarification)
- [x] T036 [P] Populate Coding room Blueprint in `.ai/CONTEXT-coding.md` — same mapping
- [x] T037 [P] Populate Reviewing room Blueprint in `.ai/CONTEXT-reviewing.md` — same mapping
- [x] T038 Populate Planning room Magic Buttons in `.ai/CONTEXT-planning.md` — ≥ 3 !commands mapped to Process steps (per SC-012)
- [x] T039 [P] Populate Coding room Magic Buttons in `.ai/CONTEXT-coding.md` — ≥ 3 !commands
- [x] T040 [P] Populate Reviewing room Magic Buttons in `.ai/CONTEXT-reviewing.md` — ≥ 3 !commands
- [x] T041 Populate SKILLS & TOOLS table in `AGENTS.md` — map specific skills/commands to rooms and stages (per FR-008)
- [x] T042 Consolidate per-tool AI configs — merge relevant content from `.opencode/`, `.claude/`, `.kilo/`, `.qwen/`, `.agents/` into `AGENTS.md` using `specs/006-icm-workspace-config/checklists/consolidation-checklist.md`
- [x] T043 [P] Remove consolidated per-tool AI config directories — delete `.opencode/`, `.claude/`, `.kilo/`, `.qwen/`, `.agents/` after consolidation verified
- [x] T044 Final verification — complete side-by-side checklist review of all gotchas/commands/conventions against restructured AGENTS.md + all three CONTEXT.md files (per FR-002, SC-002)
- [x] T045 [P] Run quickstart.md validation — verify all steps in `specs/006-icm-workspace-config/quickstart.md` are executable against the restructured workspace
- [x] T046 Verify tone compliance — manually review all files (`AGENTS.md`, `.ai/CONTEXT-*.md`) against FR-018 criteria: imperative mood, no hedging, sentences < 25 words, no hand-holding

**Checkpoint**: All 8 AGENTS.md sections complete. All 3 CONTEXT.md files complete. Per-tool configs consolidated and removed. Zero data loss verified. Tone compliance verified.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (US3 — Foundational)**: Depends on Phase 1 completion — BLOCKS all user stories
- **Phase 3 (US1)**: Depends on Phase 2 (AGENTS.md skeleton must exist)
- **Phase 4 (US2)**: Depends on Phase 2 (CONTEXT.md files must be created)
- **Phase 5 (US4)**: Depends on Phase 2 (AGENTS.md skeleton must exist)
- **Phase 6 (US5)**: Depends on Phase 4 (CONTEXT.md files must exist with section headers)
- **Phase 7 (US6)**: Depends on Phase 4 (CONTEXT.md files must exist with section headers)
- **Phase 8 (Polish)**: Depends on all user stories being complete

### User Story Dependencies

- **US3 (P1 — Foundational)**: Can start after Phase 1 — No dependencies on other stories
- **US1 (P1)**: Can start after Phase 2 — No dependencies on other stories
- **US2 (P1)**: Can start after Phase 2 — Creates CONTEXT.md files needed by US5, US6
- **US4 (P1)**: Can start after Phase 2 — No dependencies on other stories
- **US5 (P2)**: Can start after US2 (needs CONTEXT.md files) — No dependencies on US1, US4
- **US6 (P2)**: Can start after US2 (needs CONTEXT.md files) — No dependencies on US1, US4

### Within Each User Story

- Verify checklist format on every task
- Commit after each task or logical group
- Stop at checkpoint to validate story independently

### Parallel Opportunities

- T002 and T003 can run in parallel (different concerns)
- T005, T006, T007, T008 can run in parallel (different AGENTS.md sections)
- T014, T015, T016 can run in parallel (different CONTEXT.md files)
- T017, T018, T019 can run in parallel (different CONTEXT.md files)
- T021 and T022 can run in parallel (same section, different content)
- T024, T025, T026 can run in parallel (different rooms)
- T028, T029, T030 can run in parallel (different rooms)
- T032-T040 can run in parallel (different rooms/files)

---

## Parallel Example: Phase 4 (US2 — Noise Filter)

```bash
# Launch all three CONTEXT.md file creations in parallel:
Task: "Create .ai/CONTEXT-planning.md with all 6 Creation Kit section headers"
Task: "Create .ai/CONTEXT-coding.md with all 6 Creation Kit section headers"
Task: "Create .ai/CONTEXT-reviewing.md with all 6 Creation Kit section headers"

# Then launch all three Noise Filter populations in parallel:
Task: "Populate Planning room Noise Filter in .ai/CONTEXT-planning.md"
Task: "Populate Coding room Noise Filter in .ai/CONTEXT-coding.md"
Task: "Populate Reviewing room Noise Filter in .ai/CONTEXT-reviewing.md"
```

---

## Implementation Strategy

### MVP First (User Stories 3 + 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: US3 — AGENTS.md restructured with 8 sections
3. Complete Phase 3: US1 — QUICK NAVIGATION table populated
4. **STOP and VALIDATE**: Agent can read AGENTS.md and route itself to correct room
5. Deliver minimal viable routing

### Incremental Delivery

1. Phase 1 + Phase 2 → Foundation ready (AGENTS.md restructured, all content preserved)
2. Phase 3 (US1) → Agent routing works (MVP!)
3. Phase 4 (US2) → CONTEXT.md files exist with Noise Filters
4. Phase 5 (US4) → Cross-workspace flow understood
5. Phase 6 (US5) → Repeatable processes per room
6. Phase 7 (US6) → Safety Rails prevent anti-patterns
7. Phase 8 → Per-tool configs consolidated, final verification

### Parallel Team Strategy

With multiple developers:

1. Team completes Phase 1 + Phase 2 together (foundational)
2. Once Phase 2 is done:
   - Developer A: Phase 3 (US1 — QUICK NAVIGATION)
   - Developer B: Phase 4 (US2 — CONTEXT.md files + Noise Filters)
3. Once Phase 4 is done:
   - Developer A: Phase 5 (US4 — CROSS-WORKSPACE FLOW)
   - Developer B: Phase 6 (US5 — Conversation processes)
   - Developer C: Phase 7 (US6 — Safety Rails)
4. Phase 8 (Polish) — team review

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
- Verification is manual side-by-side checklist review (no automated tests for documentation)
