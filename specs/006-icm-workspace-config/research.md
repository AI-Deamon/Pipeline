# Research: ICM Workspace Configuration

## Overview

Research into the Interpretable Context Methodology (ICM) and the "Acme DevRel" benchmark structure for AI workspace configuration. All clarifications were resolved during the `/speckit.clarify` phase — no NEEDS CLARIFICATION items remain.

## Decisions

### Decision 1: AGENTS.md 8-Section Benchmark Structure

**Decision**: Restructure AGENTS.md into exactly 8 sections in order: WHAT THIS IS, FOLDER STRUCTURE, QUICK NAVIGATION, CROSS-WORKSPACE FLOW, ID & NAMING CONVENTIONS, FILE PLACEMENT RULES, TOKEN MANAGEMENT, SKILLS & TOOLS.

**Rationale**: The "Acme DevRel" benchmark is the prescribed format for Layer 1. It provides a complete "agent-drop-in" experience where an AI agent can read one file and immediately route itself to the correct room for any task.

**Alternatives considered**: The 7-section ICM variant (Identity, Map, Naming, Routing, Tech Stack, Principles, Skills) was considered but rejected in favor of the 8-section benchmark which includes explicit CROSS-WORKSPACE FLOW and FILE PLACEMENT RULES.

### Decision 2: Layer 2 Creation Kit Template

**Decision**: Each CONTEXT.md follows the 6-section Creation Kit: Soul Check → Noise Filter → Blueprint → Conversation → Magic Buttons → Safety Rail.

**Rationale**: The Creation Kit template provides a reproducible, question-driven approach to room design. Each section answers a specific driving question, ensuring completeness and consistency across rooms.

**Alternatives considered**: A free-form room description was rejected because it would lack the structured token budget and process steps needed for context efficiency.

### Decision 3: Per-Tool AI Config Consolidation

**Decision**: AGENTS.md becomes the single source of truth. All content from `.opencode/`, `.claude/`, `.kilo/`, `.qwen/`, `.agents/` is consolidated into AGENTS.md before those directories are removed.

**Rationale**: Multiple AI configs create fragmentation and conflicting instructions. A single AGENTS.md eliminates this, simplifies onboarding, and ensures consistent agent behavior regardless of which AI tool is used.

**Alternatives considered**: 
- AGENTS.md as primary with per-tool configs as subordinates (rejected: still allows drift)
- Coexistence with equal priority (rejected: agents read their own config first, ignoring AGENTS.md)

### Decision 4: Blueprint Drafts/Final Mapping

**Decision**: `specs/` = drafts area (ideas/proposals), CONTEXT.md files = final area (canonical truths). No new directories created.

**Rationale**: `specs/` already contains feature specifications that start as drafts and mature. CONTEXT.md files are the published, canonical room definitions. This mapping requires zero filesystem changes.

**Alternatives considered**: 
- New `drafts/` and `final/` directories per room (rejected: over-engineered, more files to maintain)
- Status tags in filenames only (rejected: doesn't answer "where on disk")

### Decision 5: Zero Data Loss Verification

**Decision**: Manual side-by-side checklist review. Each gotcha/command/convention from the original AGENTS.md is listed as a checklist item and ticked off against the restructured version.

**Rationale**: The original AGENTS.md has ~15 gotchas and ~10 command blocks — a manageable number for manual review. Automated diff would catch keyword presence but miss context and placement correctness.

**Alternatives considered**: 
- Automated keyword extraction + diff (rejected: false positives/negatives for contextual content)
- Pure diff on full file (rejected: restructuring changes too much for diff to be meaningful)

## Best Practices

### ICM Layer 1 (AGENTS.md)

- **WHAT THIS IS**: 2-3 sentences. Project identity + agent-drop-in philosophy. No more.
- **FOLDER STRUCTURE**: Visual code-block tree. Root → AGENTS.md → room files. Physical disk paths only.
- **QUICK NAVIGATION**: Markdown table. Intent column + room/file column + action column. Minimum 10 rows.
- **CROSS-WORKSPACE FLOW**: ASCII art or Mermaid diagram showing Planning → Coding → Reviewing with transition labels.
- **ID & NAMING CONVENTIONS**: Table with Pattern, Example, Status columns. Cover all file types in the repo.
- **FILE PLACEMENT RULES**: Lifecycle stages. Where a file goes at draft, review, and final status.
- **TOKEN MANAGEMENT**: Explicit Load vs. Skip table. Explain the "siloed" philosophy — each room is its own world.
- **SKILLS & TOOLS**: Table mapping !commands to rooms. Include verification/test commands.

### ICM Layer 2 (CONTEXT.md)

- **Soul Check**: One sentence. "This room is for [action]. Be a [persona]." If physical place metaphor helps clarity, add it parenthetically.
- **Noise Filter**: Table with Load paths and Skip paths. Skip paths MUST include folders from other rooms.
- **Blueprint**: Reference existing directories. No new directories for drafts/final unless explicitly needed.
- **Conversation**: 4 steps. Each step has a driving question and 2-3 concrete actions.
- **Magic Buttons**: !command → Step mapping. Each room gets its own subset of global !commands.
- **Safety Rail**: 5+ project-specific anti-patterns. Each answers "What always goes wrong here?" Use real gotchas.

## Risks

1. **Data loss during consolidation**: The 5 per-tool AI config directories must be carefully reviewed before deletion. Mitigation: diff the consolidated AGENTS.md against each per-tool config's key content.
2. **Inconsistent Soul Checks**: If rooms use different formats for their Soul Check, the methodology loses authority. Mitigation: FR-011 and SC-011 enforce the exact format.
3. **Token budget inaccuracy**: If file paths listed in Noise Filters become stale as the project evolves, agents will load wrong files. Mitigation: project-level Maintenance section in TOKEN MANAGEMENT.
