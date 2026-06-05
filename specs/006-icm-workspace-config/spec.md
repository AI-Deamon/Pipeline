# Feature Specification: ICM Workspace Configuration

**Feature Branch**: `006-icm-workspace-config`

**Created**: 2026-06-04

**Status**: Draft

**Input**: Create a root AGENTS.md for the Archer DevSecOps scanning platform using the Interpretable Context Methodology (ICM). The project is called **Archer**. AGENTS.md must follow the 8-section "Acme DevRel" benchmark structure: (1) WHAT THIS IS, (2) FOLDER STRUCTURE, (3) QUICK NAVIGATION, (4) CROSS-WORKSPACE FLOW, (5) ID & NAMING CONVENTIONS, (6) FILE PLACEMENT RULES, (7) TOKEN MANAGEMENT, (8) SKILLS & TOOLS. Layer 2 room manuals (CONTEXT.md) must be created for three mental modes: Planning, Coding, Reviewing — each with 6 sections (Room Definition, Token Budget, Local Map, Process, Triggers, Hard Rules). All existing gotchas, commands, and conventions from the current AGENTS.md must be preserved in the restructured version. Tone: direct, professional, optimized for a senior engineering partner.

## Clarifications

- Q: Should AGENTS.md be rewritten from scratch or restructured in-place? → A: Restructure in-place. Preserve all existing gotchas, commands, and conventions. Reorganize into the 8-section benchmark without losing content.
- Q: Where should room-specific CONTEXT.md files live? → A: Alongside AGENTS.md in `.ai/` (the existing AI context directory), one file per room.
- Q: How many rooms? → A: Three, matching the three mental modes: Planning, Coding, Reviewing. Each room = one CONTEXT.md.
- Q: Where should the Blueprint (Local Map) drafts/ and final/ areas physically live? → A: Map existing directories — `specs/` = drafts (ideas/proposals), CONTEXT.md files = final (canonical truths). No new directories needed.
- Q: Should AGENTS.md reference or supersede the multiple per-tool AI config directories (`.opencode/`, `.claude/`, `.kilo/`, `.qwen/`, `.agents/`)? → A: AGENTS.md replaces all per-tool configs. Consolidate everything into AGENTS.md and delete the others.
- Q: What is the concrete verification method for FR-002 "zero data loss"? → A: Manual side-by-side checklist review of each gotcha/command/convention by name, checking each off a list.
- Q: How should the FR-010 violation (CONTEXT.md files created with only headers, sections populated incrementally) be resolved? → A: Revise FR-010 to allow incremental population — all 6 sections MUST be present as headers from file creation onward, but content may be populated incrementally.
- Q: How should the FR-018 ambiguity (vague tone requirements) be made verifiable? → A: Add measurable criteria to FR-018 (imperative mood, no hedging, sentences < 25 words) AND add a verification task in Phase 8.
- Q: How should "valid scan stage specification" (SC-007) be defined? → A: Define as containing: (1) stage name, (2) list of tools to run, (3) execution order, (4) success criteria.

## User Scenarios & Testing

### User Story 1 - Agent Drops In and Routes Instantly (Priority: P1)

As an AI agent dropped into the Archer workspace with no prior context, I need AGENTS.md's QUICK NAVIGATION table to tell me exactly which files to read for my task so that I can be productive within one read of the root file.

**Why this priority**: The "agent-drop-in" philosophy is the core value proposition. Without quick routing, agents waste tokens reading everything or miss critical context.

**Independent Test**: Present the agent with 5 different tasks (plan a scan rule, write a Celery task, review a SonarQube report, fix a Docker networking bug, update a frontend component). For each task, verify the agent consults the QUICK NAVIGATION table, enters the correct room, and loads only that room's CONTEXT.md.

**Acceptance Scenarios**:

1. **Given** a task to implement a new scan stage, **When** the agent reads AGENTS.md, **Then** the QUICK NAVIGATION table directs it to the "Coding" room and it loads `.ai/CONTEXT-coding.md`
2. **Given** a task to review vulnerability findings, **When** the agent reads AGENTS.md, **Then** the QUICK NAVIGATION table directs it to the "Reviewing" room and it loads `.ai/CONTEXT-reviewing.md`
3. **Given** a task to define a new security rule, **When** the agent reads AGENTS.md, **Then** the QUICK NAVIGATION table directs it to the "Planning" room and it loads `.ai/CONTEXT-planning.md`

---

### User Story 2 - Noise Filter Prevents Context Waste (Priority: P1)

As an AI agent, I need each room's Noise Filter (Token Budget) to tell me exactly what to load and what to skip — especially folders from other rooms that would confuse or waste my time — so I never waste context window on irrelevant files.

**Why this priority**: The Noise Filter is the core waste-reduction mechanism. Without it, agents load entire directory trees and hallucinate from cross-room contamination.

**Independent Test**: For each room, verify the Noise Filter lists surgical file paths (not globs), explicitly marks folders from other rooms as Skip, and the total loaded files cover exactly what the room's Process requires.

**Acceptance Scenarios**:

1. **Given** the Coding room, **When** the agent checks the Noise Filter, **Then** it loads `backend/app/api/scans/`, `backend/app/services/scan_orchestrator.py`, and `backend/app/core/celery_app.py` — and skips `backend/app/api/auth.py`, `src/pages/LoginPage.tsx`, and `docker/jenkins/` (rooms that would waste its time)
2. **Given** the Reviewing room, **When** the agent checks the Noise Filter, **Then** it loads `backend/app/services/reporting/`, `src/pages/UnifiedReportPage.tsx`, and `src/pages/ScanStatusPage.tsx` — and skips `backend/app/api/auth.py` and `docker/jenkins/`
3. **Given** the Planning room, **When** the agent checks the Noise Filter, **Then** it loads `specs/`, `.ai/`, and `Agent/Jenkinsfile` — and skips `src/` and `backend/app/models/`

---

### User Story 3 - AGENTS.md Restructured Without Data Loss (Priority: P1)

As a developer maintaining this workspace, I need AGENTS.md reorganized into the 8-section benchmark structure without losing any existing commands, gotchas, or conventions so that all institutional knowledge is preserved in a more navigable format.

**Why this priority**: AGENTS.md contains 15+ critical gotchas (dual scans module, Docker rebuild vs restart, SonarQube config). Losing any of these would cause real bugs.

**Independent Test**: Compare the restructured AGENTS.md against the original. Every command, every gotcha, every convention must be present and findable within its benchmark section.

**Acceptance Scenarios**:

1. **Given** the original AGENTS.md, **When** restructured, **Then** all 15+ gotchas appear in TOKEN MANAGEMENT and/or room-specific Hard Rules (with cross-references)
2. **Given** the original AGENTS.md, **When** restructured, **Then** all commands (frontend, backend, Docker) appear in SKILLS & TOOLS
3. **Given** the original AGENTS.md, **When** restructured, **Then** all architecture paths (Key architecture table) appear in FOLDER STRUCTURE

---

### User Story 4 - Cross-Workspace Flow Guides Sequential Work (Priority: P1)

As an AI agent, I need the CROSS-WORKSPACE FLOW diagram in AGENTS.md to show me how work moves between rooms (Planning → Coding → Reviewing) so that I understand the full lifecycle and where my current task fits.

**Why this priority**: Without a cross-workspace flow, agents treat each room as isolated. Real work in Archer flows through all three rooms — a scan rule is planned, then coded, then verified against reports.

**Independent Test**: Given a task that spans Planning → Coding, verify the agent follows the flow diagram: reads Planning room first, transitions to Coding room, and has context from Planning when entering Coding.

**Acceptance Scenarios**:

1. **Given** AGENTS.md's CROSS-WORKSPACE FLOW section, **When** the agent reads it, **Then** a visual logic diagram shows Planning → Coding → Reviewing with labeled transitions
2. **Given** a task to add a new security scanner, **When** the agent follows the flow, **Then** it starts in Planning (define stage config), transitions to Coding (implement parser + Celery task), then optionally Reviews (verify findings appear)
3. **Given** the flow diagram, **When** work moves from Planning to Coding, **Then** theTransfer criteria are explicit (e.g., "spec approved → move to Coding room")

---

### User Story 5 - Room Process Provides Repeatable 4-Step Conversation (Priority: P2)

As an AI agent, I need each room's Process section to give me the 4-step conversational cycle (Source → Plan → Execute → Refine) so that I produce consistent, high-quality output without improvising my workflow each time.

**Why this priority**: Without a defined 4-step process, agents alternate between overplanning and underplanning unpredictably. The Source→Plan→Execute→Refine cycle is the repeatable heartbeat of every room.

**Independent Test**: For each room, follow the 4-step Process for a real task. Verify every step has a clear answer to its driving question and the output matches what a senior DevSecOps engineer would produce.

**Acceptance Scenarios**:

1. **Given** the Coding room Process, **When** implementing a new Celery task, **Then** the agent follows: (1) **Source** — Read the relevant service module and celery_app.py, (2) **Plan** — Draft the task signature and import paths, (3) **Execute** — Write the task and update imports, (4) **Refine** — Verify with `pytest` and rebuild celery_worker
2. **Given** the Planning room Process, **When** defining a new scan stage, **Then** the agent follows: (1) **Source** — Review existing stage configs and Jenkinsfile, (2) **Plan** — Draft the stage schema, (3) **Execute** — Define the stage config, (4) **Refine** — Validate against constraints and get approval
3. **Given** the Reviewing room Process, **When** analyzing a SonarQube report, **Then** the agent follows: (1) **Source** — Load the parser module and filter settings, (2) **Plan** — Identify which findings to cross-reference, (3) **Execute** — Cross-reference findings with code and categorize severity, (4) **Refine** — Summarize remediation priorities

---

### User Story 6 - Safety Rails Prevent Known Anti-Patterns (Priority: P2)

As a developer, I need each room's Safety Rail (Hard Rules) to list the "thou shalt nots" — each derived from asking "What always goes wrong when I work on this topic?" — so that known mistakes (editing `scans.py` instead of `scans/`, running `python run.py down` when data should be preserved) are explicitly called out.

**Why this priority**: The gotchas in AGENTS.md exist because these mistakes happened. Room-specific Safety Rails prevent recurrence by encoding painful lessons as hard rules.

**Independent Test**: Attempt each forbidden action listed in Hard Rules. Verify the rule would have caught it before execution.

**Acceptance Scenarios**:

1. **Given** the Coding room Safety Rail, **When** an agent is about to edit `backend/app/api/scans.py`, **Then** the rule "Thou shalt NOT edit scans.py — the module is scans/ (directory)" catches this
2. **Given** the Coding room Safety Rail, **When** an agent rebuilds backend but not celery_worker, **Then** the rule "Thou shalt NOT rebuild backend without also rebuilding celery_worker" catches this
3. **Given** the Reviewing room Safety Rail, **When** an agent reports zero SonarQube findings, **Then** the rule "Thou shalt NOT assume zero findings means zero vulnerabilities — check if SonarQube container is down" catches this

---

### Edge Cases

- What if a task spans two rooms (e.g., planning a scan stage then coding it)? → QUICK NAVIGATION lists multi-room tasks; CROSS-WORKSPACE FLOW shows the transition; agent loads both CONTEXT files in sequence.
- What if AGENTS.md content doesn't fit neatly into the 8 benchmark sections? → Use cross-references. ID & NAMING CONVENTIONS can reference external docs; FOLDER STRUCTURE can link to rooms.
- What if a gotcha applies to multiple rooms? → Place it in AGENTS.md TOKEN MANAGEMENT (global) and reference it from room-specific Hard Rules.
- What if a new room is needed later? → FOLDER STRUCTURE and QUICK NAVIGATION are tables; add a row. Create a new CONTEXT.md in `.ai/`.

## Requirements

### Functional Requirements

- **FR-001**: AGENTS.md MUST contain exactly 8 sections in this order: WHAT THIS IS, FOLDER STRUCTURE, QUICK NAVIGATION, CROSS-WORKSPACE FLOW, ID & NAMING CONVENTIONS, FILE PLACEMENT RULES, TOKEN MANAGEMENT, SKILLS & TOOLS
- **FR-002**: Every existing command, gotcha, convention, and architecture reference in the current AGENTS.md MUST be preserved in the restructured version — zero data loss verified by manual side-by-side checklist review of each gotcha/command/convention by name. Additionally, all relevant content from per-tool AI config directories (`.opencode/`, `.claude/`, `.kilo/`, `.qwen/`, `.agents/`) MUST be consolidated into AGENTS.md before those directories are removed.
- **FR-003**: QUICK NAVIGATION MUST be a table mapping user intent (e.g., "Write a spec", "Fix a scan bug", "Review findings") to specific file paths and room names
- **FR-004**: CROSS-WORKSPACE FLOW MUST be a visual logic diagram showing how work moves between rooms (Planning → Coding → Reviewing) with labeled transition criteria
- **FR-005**: ID & NAMING CONVENTIONS MUST be a table defining the pattern and status of files (e.g., `[slug]-[status].md` with statuses like `draft`, `review`, `final`) that align with existing project conventions (kebab-case for specs, snake_case for Python, PascalCase for React)
- **FR-006**: FILE PLACEMENT RULES MUST specify where files live at each stage of their life cycle within each silo: `specs/` is the drafts area (ideas/proposals), CONTEXT.md files are the final area (canonical truths). No new directories are created.
- **FR-007**: TOKEN MANAGEMENT MUST explain the "Siloed" philosophy and list what to load vs. skip for context efficiency, incorporating all existing gotchas as global rules
- **FR-008**: SKILLS & TOOLS MUST be a table mapping specific skills and commands (e.g., `/speckit-plan`, `pytest`, `npm run build`) to the rooms and stages where they should be invoked
- **FR-009**: Three CONTEXT.md files MUST be created in `.ai/`: `CONTEXT-planning.md`, `CONTEXT-coding.md`, `CONTEXT-reviewing.md`
- **FR-010**: Each CONTEXT.md MUST contain 6 sections following the Layer 2 Creation Kit template, in this exact order. Sections may be populated incrementally across phases, but all 6 MUST be present (even as headers with placeholder content) from file creation onward:
  1. **Room Definition (The Soul Check)**: Must answer "If this room was a physical place, what would it be?" and be written as: "This room is for [Primary Action]. Be a [Specialist Persona]."
  2. **Token Budget (The Noise Filter)**: Must list folders to Load and folders to Skip, answering "What information from other rooms will confuse me or waste my time?"
  3. **Local Map (The Blueprint)**: Must map existing directories to the drafts/final paradigm: `specs/` = drafts area for ideas, CONTEXT.md files = final area for truths, answering "Where is the Working area and where is the Storage area?"
  4. **Process (The Conversation)**: Must follow the 4-step cycle: (1) Source — Where do we start? (2) Plan — Where do we draft? (3) Execute — What do we build? (4) Refine — How do we finish?
  5. **Triggers (The Magic Buttons)**: Must list !commands mapped to specific Process steps, answering "Which Elite Shortcuts from Layer 1 apply to this specific workbench?"
  6. **Hard Rules (The Safety Rail)**: Must list anti-patterns sourced from known gotchas, each answering "What is one thing that always goes wrong when I work on this topic?"
- **FR-011**: Each Token Budget (Noise Filter) table MUST list specific file paths (not globs) with Load/Skip directives, and MUST explicitly call out which folders from other rooms to Skip
- **FR-012**: Each Process (Conversation) section MUST follow the 4-step Source → Plan → Execute → Refine cycle with room-specific detail at each step
- **FR-013**: Each Hard Rules (Safety Rail) section MUST list anti-patterns specific to that room's domain, each derived from asking "What always goes wrong here?" and sourced from known gotchas in AGENTS.md
- **FR-014**: FOLDER STRUCTURE MUST use a visual tree format (code block) showing the root, the task router (AGENTS.md), and the specific room files (CONTEXT-planning.md, etc.) with room labels
- **FR-015**: WHAT THIS IS section MUST state the project identity as "Archer" and describe the siloed workspace philosophy with the agent-drop-in principle
- **FR-016**: The QUICK NAVIGATION table MUST include a "Multi-Room" category for tasks that span two or more rooms
- **FR-017**: AGENTS.md MUST use clear Markdown headers (`##`) and horizontal dividers (`---`) between all 8 sections
- **FR-018**: Tone MUST be direct, professional, and optimized for a senior engineering partner. Measurable criteria: (1) imperative mood for all instructions, (2) no hedging language (e.g., "perhaps", "maybe", "might want to"), (3) sentences under 25 words, (4) no explanatory tangents or hand-holding phrases. Verified by manual review against these criteria.

### Key Entities

- **AGENTS.md**: Layer 1 — The single source of truth. The root map file and task router. Contains the 8 benchmark sections. Replaces all per-tool AI config directories (`.opencode/`, `.claude/`, `.kilo/`, `.qwen/`, `.agents/`), consolidating their relevant content. Already exists; must be restructured, not replaced. Project identity: Archer.
- **CONTEXT.md (per room)**: Layer 2 — Room manual / "Workbench." Created via the Layer 2 Creation Kit template with 6 sections: (1) Soul Check, (2) Noise Filter, (3) Blueprint, (4) Conversation, (5) Magic Buttons, (6) Safety Rail. New files to create.
- **Room**: A bounded workspace for one mental mode. Three rooms: Planning (security rules, stage configs), Coding (pipeline automation, backend/frontend code), Reviewing (scan reports, vulnerability triage).
- **Soul Check (Room Definition)**: One sentence defining the room's purpose and specialist persona. Format: "This room is for [Primary Action]. Be a [Specialist Persona]."
- **Noise Filter (Token Budget)**: A table in each CONTEXT.md specifying which files to Load vs. Skip, explicitly blocking folders from other rooms that would confuse or waste time.
- **Blueprint (Local Map)**: Maps existing directories to the drafts/final paradigm: `specs/` = drafts area for ideas and proposals, CONTEXT.md files = final area for canonical truths. No new directories created.
- **Conversation (Process)**: The 4-step repeatable cycle: Source → Plan → Execute → Refine. Each step answers a driving question.
- **Magic Buttons (Triggers)**: !commands mapped to specific Process steps, telling the AI exactly when to invoke each Elite Shortcut.
- **Safety Rail (Hard Rules)**: Anti-patterns derived from the question "What always goes wrong here?" Sourced from known gotchas in AGENTS.md.
- **QUICK NAVIGATION**: A table in AGENTS.md mapping user intent to rooms and file paths, enabling efficient context isolation.
- **CROSS-WORKSPACE FLOW**: A visual diagram in AGENTS.md showing how work transitions between rooms with labeled criteria.
- **ID & NAMING CONVENTIONS**: A table defining file naming patterns and statuses for the project.
- **FILE PLACEMENT RULES**: Explicit rules for where files live at each lifecycle stage within each silo.
- **TOKEN MANAGEMENT**: A section explaining the siloed philosophy and global load/skip rules, incorporating existing gotchas.
- **SKILLS & TOOLS**: A table mapping skills and commands to rooms and invocation stages.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A developer given 5 random tasks can identify the correct room and CONTEXT file within 30 seconds by consulting the QUICK NAVIGATION table
- **SC-002**: Every gotcha from the original AGENTS.md appears in the restructured version (100% preservation, verified by manual side-by-side checklist review of each gotcha/command/convention by name). All relevant content from per-tool AI config directories (`.opencode/`, `.claude/`, `.kilo/`, `.qwen/`, `.agents/`) has been consolidated before those directories are removed.
- **SC-003**: Each CONTEXT.md Noise Filter (Token Budget) loads no more than 15 file paths and skips at least 10 irrelevant paths, including explicit Skip directives for cross-room folders
- **SC-004**: Each room's Safety Rail (Hard Rules) section contains at least 5 project-specific anti-patterns, each derived from "What always goes wrong here?"
- **SC-005**: Each room's Conversation (Process) section follows the Source → Plan → Execute → Refine 4-step cycle with room-specific detail at each step
- **SC-006**: The full Noise Filter across all three rooms loads no more than 50% of the project's total files (ensuring real noise reduction and cross-room isolation)
- **SC-007**: A new team member can follow the Planning room process and produce a valid scan stage specification without external guidance. "Valid" is defined as the specification contains: (1) stage name, (2) list of tools to run, (3) execution order, (4) success criteria.
- **SC-008**: CROSS-WORKSPACE FLOW diagram shows at least 3 transitions (Planning→Coding, Coding→Reviewing, Reviewing→Planning) with explicit transition criteria
- **SC-009**: QUICK NAVIGATION table has at least 10 intent-to-path mappings covering primary task categories
- **SC-010**: ID & NAMING CONVENTIONS table defines naming patterns for at least 4 file types (specs, Python, React, Docker)
- **SC-011**: Each CONTEXT.md Soul Check (Room Definition) follows the exact format: "This room is for [Primary Action]. Be a [Specialist Persona]." with no more than one sentence per clause
- **SC-012**: Each CONTEXT.md Magic Buttons (Triggers) section maps at least 3 !commands to specific Process steps (Source, Plan, Execute, or Refine)

## Assumptions

- AGENTS.md is the canonical root map file and the single source of truth — no separate GEMINI.md or per-tool AI config files are needed
- All per-tool AI config directories (`.opencode/`, `.claude/`, `.kilo/`, `.qwen/`, `.agents/`) will be consolidated into AGENTS.md and then removed as part of this feature
- The project identity is "Archer" — this name appears in the WHAT THIS IS section
- The `.ai/` directory already exists for AI context files and is the appropriate location for CONTEXT.md files
- The three mental modes (Planning, Coding, Reviewing) map cleanly to room boundaries; tasks that span modes use multi-room routing per the CROSS-WORKSPACE FLOW diagram
- Existing project file naming conventions (kebab-case for specs, snake_case for Python, PascalCase for React) are documented and respected in ID & NAMING CONVENTIONS
- The current AGENTS.md content is accurate and up-to-date; restructuring preserves it — nothing is deleted, only reorganized
- Room files are named `CONTEXT-planning.md`, `CONTEXT-coding.md`, `CONTEXT-reviewing.md` following the kebab-case convention
- File statuses follow the pattern: `draft` → `review` → `final`. The `specs/` directory serves as the drafts area (proposals and ideas); CONTEXT.md files are the final area (canonical truths). No new directories are created.
- Formatting uses Markdown headers (`##`) and horizontal dividers (`---`) between sections, with code blocks for FOLDER STRUCTURE and CROSS-WORKSPACE FLOW
- Each CONTEXT.md section uses the Layer 2 Creation Kit naming: Soul Check (Room Definition), Noise Filter (Token Budget), Blueprint (Local Map), Conversation (Process), Magic Buttons (Triggers), Safety Rail (Hard Rules)
- The Soul Check for each room answers the question "If this room was a physical place, what would it be?" in one sentence
- The Process for each room follows the Source → Plan → Execute → Refine cycle with driving questions at each step