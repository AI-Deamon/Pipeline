# Implementation Plan: ICM Workspace Configuration

**Branch**: `006-icm-workspace-config` | **Date**: 2026-06-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/006-icm-workspace-config/spec.md`

## Summary

Restructure the existing `AGENTS.md` into the 8-section "Acme DevRel" benchmark format (WHAT THIS IS, FOLDER STRUCTURE, QUICK NAVIGATION, CROSS-WORKSPACE FLOW, ID & NAMING CONVENTIONS, FILE PLACEMENT RULES, TOKEN MANAGEMENT, SKILLS & TOOLS), consolidating all per-tool AI configs (`.opencode/`, `.claude/`, `.kilo/`, `.qwen/`, `.agents/`) into a single source of truth. Create three room-specific Layer 2 CONTEXT.md files (Planning, Coding, Reviewing) in `.ai/` following the Creation Kit template. All existing gotchas, commands, and conventions must be preserved.

## Technical Context

**Language/Version**: Markdown (no code language)

**Primary Dependencies**: None (documentation-only feature)

**Storage**: `.ai/CONTEXT-planning.md`, `.ai/CONTEXT-coding.md`, `.ai/CONTEXT-reviewing.md` (new files), `AGENTS.md` (restructured in-place)

**Testing**: Manual side-by-side checklist review of each gotcha/command/convention by name (per FR-002 clarification)

**Target Platform**: AI agent context files — consumed by AI coding assistants (opencode, Claude Code, etc.)

**Project Type**: Workspace configuration / documentation

**Performance Goals**: N/A — the deliverable is static Markdown files. Token efficiency is measured by SC-003 (≤15 load paths per room) and SC-006 (≤50% of total project files loaded).

**Constraints**: Zero data loss from existing AGENTS.md (FR-002); all 8 sections must appear in order (FR-001); each CONTEXT.md must follow the 6-section Creation Kit template (FR-010); formatting must use `##` headers and `---` dividers (FR-017).

**Scale/Scope**: ~200 lines AGENTS.md restructured + ~100 lines per CONTEXT.md × 3 = ~500 lines total

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

No constitution file found (`.specify/memory/constitution.md` does not exist). Gates: **PASS** (no constraints defined).

## Project Structure

### Documentation (this feature)

```text
specs/006-icm-workspace-config/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (empty — no external interfaces)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
# Workspace configuration files
AGENTS.md                # Restructured in-place (8 benchmark sections)
.ai/
├── CONTEXT-planning.md  # New — Planning room manual
├── CONTEXT-coding.md    # New — Coding room manual
└── CONTEXT-reviewing.md # New — Reviewing room manual

# To be removed (consolidated into AGENTS.md):
.opencode/               # Consolidated then removed
.claude/                 # Consolidated then removed
.kilo/                   # Consolidated then removed
.qwen/                   # Consolidated then removed
.agents/                 # Consolidated then removed
```

**Structure Decision**: Single root-level AGENTS.md + `.ai/` directory for room files. This is a documentation-only feature; no code changes to `src/` or `backend/`.

## Complexity Tracking

> No Constitution violations to justify.
