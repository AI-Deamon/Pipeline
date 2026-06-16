# Implementation Plan: Sentinel Frontend UX Audit

**Branch**: `011-ux-audit` | **Date**: 2026-06-16 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/011-ux-audit/spec.md`

## Summary

Produce a comprehensive UX audit of the Sentinel DevSecOps platform frontend. The audit covers all 19 user-facing pages in `src/pages/` against 8 evaluation categories (Information Architecture, Navigation, Visual Hierarchy, Accessibility, Design System Consistency, States, Microcopy, Mobile Responsiveness). Output is a single markdown report at `specs/011-ux-audit/audit-report.md` with severity-classified findings and code-level remediation guidance. Read-only — no source code is modified.

## Technical Context

**Language/Version**: N/A (audit is read-only; the report is authored in markdown)
**Primary Dependencies**: None new (audit uses standard file-read tools against the existing repo)
**Storage**: Single file: `specs/011-ux-audit/audit-report.md` (markdown)
**Testing**: N/A (audit is a deliverable, not code). Validation: report covers all 19 pages, severity counts match findings, file committed to branch.
**Target Platform**: Sentinel frontend (React 19 + TypeScript + Vite + Tailwind CSS + lucide-react)
**Project Type**: Web application (frontend audit only)
**Performance Goals**: Audit completes within 30 minutes (SC-006); report reads in ≤15 minutes
**Constraints**: Read-only against `src/` (FR-009); no new dependencies; markdown only
**Scale/Scope**: 19 pages × 8 evaluation categories = up to 152 finding slots; expected 25+ findings per SC-002

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Compliance | Notes |
|-----------|----------|------------|-------|
| P1: Security-First | N/A | ✅ | Audit doesn't add endpoints or handle credentials |
| P2: State Consistency | N/A | ✅ | Audit doesn't touch state management |
| P3: Architectural Hygiene | ✅ | ✅ | Audit respects file-size limits; report file under 300 lines per page section (split if needed) |
| P4: Type Safety & Testing | ✅ | ✅ | No new code; if remediation examples use TypeScript, they follow no-`any` rule |
| P5: UI/UX Integrity | ✅ | ✅ | **Audit directly enforces P5** — every finding ties to a P5 sub-principle (WCAG, modals, loading states, mobile, etc.) |

**Gates: PASS** — no violations. The audit is itself a P5 enforcement activity.

## Project Structure

### Documentation (this feature)

```text
specs/011-ux-audit/
├── plan.md              # This file
├── research.md          # Phase 0 output — audit methodology
├── data-model.md        # Phase 1 output — entities (Finding, Severity, Category)
├── quickstart.md        # Phase 1 output — how to read the report
├── audit-report.md      # FINAL DELIVERABLE — findings + remediation
├── checklists/
│   └── requirements.md  # Quality validation (created during /speckit.specify)
└── contracts/           # Not applicable for a read-only audit
```

### Source Code (repository root)

No source code changes. The audit is a documentation deliverable.

**Structure Decision**: Document-only feature. The audit lives entirely under `specs/011-ux-audit/`. No new files in `src/`, `backend/`, or `docker/`.

## Complexity Tracking

> No constitution violations. Table omitted per template guidance.

## Phase 0: Research — Audit Methodology

The "research" for a UX audit is the selection of evaluation methods, severity scales, and audit structure. Decisions made in `research.md`:

1. **Evaluation framework**: Nielsen's 10 usability heuristics + WCAG 2.1 AA checklist (industry standard, well-documented, free).
2. **Severity scale**: Adapted from WCAG 2.1 severity tiers — Critical (blocks task / WCAG Level A violation), Serious (significant friction / WCAG Level AA), Moderate (workaround exists), Minor (cosmetic).
3. **UX Health Score formula**: 100 − Σ(weight × count) where weights are 10/5/2/0.5 for Critical/Serious/Moderate/Minor. Capped at [0, 100].
4. **Output format**: Single markdown file, sections per page, executive summary at top, severity counts table, top-5 findings.
5. **Evidence format**: Each finding cites file path and line number(s) where possible. For findings that require visual inspection (e.g., color contrast on a gradient), the evidence is "visual inspection required".

See `research.md` for full details.

## Phase 1: Design & Contracts

### Data Model

Documented in `data-model.md`. Five entities:

- **Audit Report**: markdown document, holds the full deliverable
- **Finding**: per-page issue, has severity, category, remediation
- **Severity**: enum (Critical, Serious, Moderate, Minor)
- **Category**: enum (IA, Navigation, Visual Hierarchy, Accessibility, Consistency, States, Microcopy, Mobile)
- **UX Health Score**: integer 0–100, derived from findings

### Contracts

Not applicable. The audit has no external interface — it's a single markdown file consumed by humans via git.

### Quickstart

`quickstart.md` describes:
- How to read the report (executive summary → top-5 findings → per-page sections → remediation)
- How to re-run the audit (overwrites the previous report)
- How to convert Critical/Serious findings to issues (manual process for v1)

### Agent Context

Update `AGENTS.md` between `<!-- SPECKIT START -->` and `<!-- SPECKIT END -->` to point to `specs/011-ux-audit/plan.md`.

## Phase 2: Implementation (Execution)

Not part of `/speckit.plan` output. Implementation is the act of writing `audit-report.md`. Task list will be generated by `/speckit.tasks`.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Audit too shallow (just restates what's obvious) | Require each finding to cite specific file:line and suggest a code-level change |
| Audit subjective (no two reviewers agree) | Use Nielsen heuristics + WCAG as the evaluation framework (industry standard) |
| Audit takes too long (>30 min) | Use parallel file reads; one pass per page; do not retry on parse errors |
| Page is too large to read in one go | Pages >300 lines are split into sections; findings recorded per section |
| Findings already known/fixed | Acceptable — the audit is a snapshot, not a live document; future audits overwrite |

## Open Questions

None. All clarified during `/speckit.specify` and `/speckit.clarify`.
