# CONTEXT.md — docs/

**Last updated**: 2026-06-05
**Location**: `docs/` at repo root
**Layer**: 2 (Distributed)
**Authoritative**: This file. No other context file.

## 1. ROOM DEFINITION

**Persona**: Reference / Documentation Librarian.
**Objective**: Read the right reference document fast. Do not edit here unless adding a new doc. Source-of-truth lives in `specs/` and per-folder `CONTEXT.md`.

## 2. LOCAL TOKEN BUDGET

| Task | Load | Skip |
|------|------|------|
| Find architecture | `docs/architecture-overview.md`, `docs/FINALIZED_ARCHITECTURE.md`, `docs/SYSTEM_DESIGN.md` | `docs/image*.png` (binary) |
| Find a contract | `docs/jenkins_payload_contract.md`, `docs/CI_CD_PIPELINE.md` | `docs/UI*plan*` (UX-only) |
| Find a flow | `docs/flows/`, `docs/AUTOMATED_SCAN_FLOW.md`, `docs/INFRASTRUCTURE_DIAGRAM.md` | `docs/image*.png` (binary) |
| Triage a bug | `docs/TROUBLESHOOTING_AND_KNOWN_ISSUES.md`, `docs/ERROR_HANDLING_AND_RECOVERY.md` | `docs/api/`, `docs/CHANGE_TRACKING_FEB2026.md` (historical) |
| Review past work | `docs/CODE_REVIEW_*.md`, `docs/reports-implementation*.md` | `docs/plans/` (older) |
| Find a plan | `docs/plans/`, `docs/PHASE_1_2_IMPLEMENTATION.md`, `docs/DEPLOYMENT_PLAN.md` | `docs/image*.png` |

## 3. LOCAL MAP

```
docs/
├── architecture-overview.md         # System map (start here)
├── FINALIZED_ARCHITECTURE.md        # Locked design decisions
├── SYSTEM_DESIGN.md                 # End-to-end system view
├── CI_CD_PIPELINE.md                # Pipeline summary
├── jenkins_payload_contract.md      # Callback contract
├── AUTOMATED_SCAN_FLOW.md           # Scan → report flow
├── INFRASTRUCTURE_DIAGRAM.md        # Service diagram
├── TROUBLESHOOTING_AND_KNOWN_ISSUES.md
├── ERROR_HANDLING_AND_RECOVERY.md
├── SECRETS_POLICY.md
├── RELIABILITY_POLICY.md
├── RESULT_NORMALIZATION.md
├── CODE_REVIEW_*.md                 # Historical review threads
├── plans/                           # Per-feature design notes
├── flows/                           # Per-flow diagrams
├── api/                             # API contract notes
├── docker/                          # Docker-related notes
└── image*.png                       # Binary diagrams (skip in code reviews)
```

## 4. THE PROCESS

1. **Source** — read `docs/architecture-overview.md` first; then drill into the specific subdoc
2. **Plan** — match your question to the doc category (architecture / flow / contract / bug)
3. **Execute** — read; do not edit. If the doc is wrong, file a fix in `specs/`
4. **Refine** — confirm the doc matches the code by spot-checking the cited file path

## 5. WHAT GOOD LOOKS LIKE

- All referenced file paths verified to exist. Version pins cross-checked against build files.
- Under 300 lines per file. No duplication with `specs/`. Tagged as reference — never authoritative for behavior.
- Every doc has a clear single purpose (architecture / flow / contract / bug triage).

## 6. CONSTRAINTS

- **Authority**: Don't treat `docs/` as authoritative for behavior. Source-of-truth lives in code and `specs/`. Docs lag code.
- **Edit scope**: Don't edit `docs/` from a feature branch unless the spec requires it. Docs are reference, not deliverables.
- **Historical docs**: Don't cite `CHANGE_TRACKING_FEB2026.md` for current behavior. It is a historical snapshot.
- **Binary files**: Don't read `image*.png` as text. They do not enter the LLM context.
- **Duplication**: Don't duplicate content between `docs/` and `specs/`. Specs evolve; `docs/` is reference.
- **Version pins**: Don't pin a version in `docs/` without cross-checking `backend/`, `frontend/`, `Agent/`.

## 7. MANDATORY SKILL TRIGGERS

- A doc contradicts the code → trigger `dispatching-parallel-agents` to update both
- A doc is needed for a new feature → trigger `dispatching-parallel-agents` to draft architecture + flow + contract in parallel
- A doc is bloated (>300 lines) → trigger `superdesign` to split or extract
- A doc references an old version → trigger `verification-before-completion` (cross-check pinned versions)

## 8. HARD RULES

- **Thou shalt NOT treat `docs/` as authoritative for behavior.** Source-of-truth lives in code and `specs/`. Docs lag code.
- **Thou shalt NOT edit `docs/` from a feature branch unless the spec requires it.** Docs are reference, not deliverables.
- **Thou shalt NOT duplicate content between `docs/` and `specs/`.** Specs evolve; `docs/` is reference.
- **Thou shalt NOT pin a version in `docs/` without cross-checking `backend/`, `frontend/`, `Agent/`.** Pinned versions live in the build files.
