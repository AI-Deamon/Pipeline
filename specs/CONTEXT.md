# CONTEXT.md — specs/

**Last updated**: 2026-06-05
**Location**: `specs/` at repo root
**Layer**: 2 (Distributed)
**Authoritative**: This file. No other context file.

## 1. ROOM DEFINITION

**Persona**: Solutions Architect.
**Objective**: Define what to build and why it belongs in the pipeline. Specs, plans, tasks, checklists, contracts. No code in this folder.

## 2. LOCAL TOKEN BUDGET

| Task | Load | Skip |
|------|------|------|
| Write a feature spec | `specs/<NNN>-<name>/`, `Agent/Jenkinsfile`, `docs/architecture-overview.md` | `src/`, `backend/`, `docker/jenkins/` |
| Plan an implementation | `specs/<NNN>-<name>/{plan,research,data-model}.md`, existing specs | `src/`, `backend/app/` |
| Generate tasks | `specs/<NNN>-<name>/spec.md`, `plan.md` | `src/`, `backend/` |
| Review a spec | All files in `specs/<NNN>-<name>/` | Source code folders |
| Update room manuals | Per-folder `CONTEXT.md` files | `src/`, `backend/` |
| Cross-feature consistency | `specs/*/spec.md` (active drafts only) | `.completed/` (archived) |

## 3. LOCAL MAP

```
specs/
├── 001-deep-code-audit/
├── 002-sonarqube-docker/
├── 003-upgrade-sonarqube-image/
├── 004-scan-stage-config/
├── 005-containerize-jenkins/
└── 006-icm-workspace-config/
    ├── spec.md            # User stories, FRs, SCs
    ├── plan.md            # Implementation plan
    ├── research.md        # Decisions + best practices
    ├── data-model.md      # Entity definitions
    ├── quickstart.md      # How to use the deliverable
    ├── tasks.md           # Dependency-ordered work items
    ├── contracts/         # External interfaces
    └── checklists/        # Quality + preservation
```

**Lifecycle**: `specs/<NNN>-<name>/` = workshop (drafts evolve). Per-folder `CONTEXT.md` files = published product (stable).

## 4. THE PROCESS

1. **Source** — read `Agent/Jenkinsfile`, existing active drafts, `docs/architecture-overview.md`, `docs/TROUBLESHOOTING_AND_KNOWN_ISSUES.md`
2. **Plan** — draft stage schema (name, tool, inputs, outputs, success criteria); research alternatives
3. **Execute** — write `spec.md` with 4 required components; run `writing-plans` to generate `tasks.md`
4. **Refine** — `brainstorming` to resolve ambiguity; `requesting-code-review` for cross-artifact consistency; `verification-before-completion` for quality

## 5. WHAT GOOD LOOKS LIKE

- Spec has all 4 components: name, tool list, execution order, success criteria. Zero `[NEEDS CLARIFICATION]` at completion.
- Plan includes data model, API contracts, quickstart. Tasks map directly to file paths.
- Cross-artifact drift caught before implementation. No duplication with `docs/` or per-folder CONTEXT.md.

## 6. CONSTRAINTS

- **Pipeline dependency**: Don't define a scan stage without reading the Jenkinsfile first. The pipeline must host it.
- **Stage validity**: Don't propose a stage without all 4 components (name, tool, execution order, success criteria).
- **Version conflicts**: Don't depend on tooling that conflicts with pinned versions (SonarQube 26.5, Jenkins 2.528.3, 133 plugins).
- **Clarification gate**: Don't move to tasks while `[NEEDS CLARIFICATION]` markers remain.
- **Docker assumptions**: Don't assume Docker behavior from local intuition. Read the `docker-compose*.yml` overlays.

## 7. MANDATORY SKILL TRIGGERS

- A spec has `[NEEDS CLARIFICATION]` markers → trigger `brainstorming` to resolve ambiguity
- A spec is complete and you need implementation tasks → trigger `writing-plans` to generate tasks
- A spec, plan, and tasks are written → trigger `requesting-code-review` for cross-artifact consistency
- A spec needs quality validation → trigger `verification-before-completion`
- A spec is approved and code is ready → trigger `executing-plans` (Coding room takes over)
- A spec touches multiple per-folder `CONTEXT.md` files → trigger `dispatching-parallel-agents` to update in parallel

## 8. HARD RULES

- **Thou shalt NOT skip validation against `docs/architecture-overview.md` and `docs/FINALIZED_ARCHITECTURE.md`.** Both are reference, not optional.
- **Thou shalt NOT duplicate content between `specs/` and `docs/` or per-folder `CONTEXT.md`.** Drafts evolve; final manuals stay stable.
