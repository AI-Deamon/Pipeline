# Quickstart: Using the ICM Rooms

This is a documentation-only workspace configuration. No code changes to `src/` or `backend/`. After implementation, the workspace will have:

## What You Get

1. **`AGENTS.md`** — Restructured 8-section root map (your GPS)
2. **`.ai/CONTEXT-planning.md`** — Planning room manual
3. **`.ai/CONTEXT-coding.md`** — Coding room manual
4. **`.ai/CONTEXT-reviewing.md`** — Reviewing room manual

## How to Use

### 1. Start at AGENTS.md

Read `AGENTS.md` first. The WHAT THIS IS section gives your identity. FOLDER STRUCTURE shows the file tree. **QUICK NAVIGATION** is the most important section — it maps intents to files.

### 2. Route to a Room

| If your task is... | Read this file |
|-------------------|----------------|
| Defining a new scan stage or security rule | `CONTEXT-planning.md` |
| Implementing pipeline automation or fixing a scan bug | `CONTEXT-coding.md` |
| Triaging SonarQube/ZAP findings or reviewing a report | `CONTEXT-reviewing.md` |
| A task that spans Planning → Coding → Reviewing | Load the primary room first, then follow CROSS-WORKSPACE FLOW |

### 3. Follow the Room's 4-Step Process

Each room's Conversation section uses Source → Plan → Execute → Refine:

1. **Source** — Where do we start? (read relevant files from Noise Filter's Load paths)
2. **Plan** — Where do we draft? (use `specs/` for proposals)
3. **Execute** — What do we build? (write the code/spec/report)
4. **Refine** — How do we finish? (run verification, update context, clean up)

### 4. Respect the Safety Rails

Each room has Hard Rules listing exactly what NOT to do. These come from real gotchas.

## File Lifecycle

| Status | Location | Meaning |
|--------|----------|---------|
| Draft | `specs/` | Ideas, proposals, in-progress work |
| Review | `specs/` with review status | Ready for feedback |
| Final | CONTEXT.md files, committed code | Canonical truths, published |

## Verification

After implementation, verify:
- `AGENTS.md` has all 8 sections in order
- Each `.ai/CONTEXT-*.md` has all 6 Creation Kit sections
- All gotchas from the original AGENTS.md appear in the restructured version (manual checklist)
