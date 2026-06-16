# Research: UX Audit Methodology

**Feature**: Sentinel Frontend UX Audit (spec 011)
**Date**: 2026-06-16
**Status**: Complete

## Goal

Choose an evaluation framework, severity scale, and report structure that are:
- Industry-standard (so findings are defensible)
- Tooling-light (no Playwright or browser automation in v1)
- Reproducible (two audits should produce similar findings)
- Actionable (each finding has a code-level remediation)

## Decision 1: Evaluation Framework

**Decision**: Use Nielsen's 10 usability heuristics + WCAG 2.1 AA checklist as the two evaluation pillars. Map each of the 8 audit categories to one or both pillars.

**Rationale**:
- Nielsen's heuristics are the de-facto industry standard for usability evaluation. Well-known, well-documented, free.
- WCAG 2.1 AA is the regulatory baseline for accessibility in most jurisdictions. Non-negotiable.
- Together they cover ~90% of common UX issues without needing custom evaluation methods.

**Alternatives considered**:
- **Gerhardt-Powals cognitive dimensions**: more academic, less actionable.
- **Custom heuristics tuned to DevSecOps**: would require validation; not worth the effort for v1.
- **NN/g heuristic evaluation**: requires paid training/certification; Nielsen's original 10 are public.

**Category-to-pillar mapping**:

| Audit Category | Primary Pillar | Notes |
|----------------|----------------|-------|
| Information Architecture | Nielsen H6 (recognition over recall) + H8 (aesthetic/minimalist) | Card-sorting heuristics |
| Navigation | Nielsen H3 (user control) + H4 (consistency) | Breadcrumbs, back buttons, links |
| Visual Hierarchy | Nielsen H8 (aesthetic/minimalist) | Typography scale, color contrast |
| Accessibility | WCAG 2.1 AA | Perceivable, Operable, Understandable, Robust |
| Design System Consistency | Nielsen H4 (consistency) + H6 (standards) | Reuse of tokens, components |
| States (Loading/Empty/Error) | Nielsen H1 (visibility of system status) + H9 (error recovery) | Skeletons, error toasts, empty-state copy |
| Microcopy | Nielsen H2 (match real world) + H10 (help/docs) | Plain language, action-oriented buttons |
| Mobile Responsiveness | WCAG 1.4.10 (reflow) + 2.5.5 (target size) | Breakpoints, tap targets, scroll behavior |

## Decision 2: Severity Scale

**Decision**: 4-level severity — Critical, Serious, Moderate, Minor. Definitions adapted from WCAG's severity tiers and common UX audit practice.

**Rationale**:
- 4 levels is enough granularity to prioritize without overwhelming the team.
- Tying severity to user impact (and to WCAG level for accessibility) makes it defensible.

**Severity definitions**:

| Level | Definition | Example |
|-------|-----------|---------|
| **Critical** | Blocks user from completing a primary task. Violates WCAG Level A. Production-blocking. | Login button doesn't submit. Form has no labels (WCAG 1.3.1). |
| **Serious** | Significant friction. Most users will hit this. Violates WCAG Level AA. | Page has no loading indicator for >500ms operations. Color contrast ratio <4.5:1 for body text. |
| **Moderate** | Noticeable but workaround exists. Affects some users. | Empty state shows blank screen instead of helpful message. Button labels inconsistent across pages. |
| **Minor** | Cosmetic. Polish-level. Doesn't block users. | Spacing slightly off-grid. Icon misaligned. |

**Alternatives considered**:
- **3-level (High/Medium/Low)**: too coarse; Critical issues get conflated with Serious ones.
- **5-level (Blocker/Critical/Major/Minor/Trivial)**: more granularity than needed for v1.
- **CVSS-style scoring (0–10)**: too technical; UX team prefers categorical.

## Decision 3: UX Health Score

**Decision**: 0–100 integer. Start at 100, subtract weighted penalty per finding.

**Rationale**:
- A single number is easy to communicate to non-UX stakeholders.
- Weighted penalties emphasize that Critical issues are not just "5x worse than Minor" — they block users.
- Capped at 0 so a single very-broken page can't go below zero.

**Formula**:

```
score = max(0, 100 - Σ(weight_i × count_i))
where weights are:
  Critical = 10
  Serious  = 5
  Moderate = 2
  Minor    = 0.5
```

**Worked example**: 2 Critical + 5 Serious + 10 Moderate + 20 Minor
= 100 − (2×10 + 5×5 + 10×2 + 20×0.5)
= 100 − (20 + 25 + 20 + 10)
= 100 − 75
= **25** (poor health)

**Alternatives considered**:
- **Pass/fail per category**: loses cross-category comparison.
- **Letter grade (A–F)**: subject to grade inflation; numerical is clearer.

## Decision 4: Output Format

**Decision**: Single markdown file at `specs/011-ux-audit/audit-report.md`. Structure:

```markdown
# Sentinel Frontend UX Audit Report

**Audit date**: YYYY-MM-DD
**Auditor**: UX/UI Design Specialist agent
**Pages audited**: 19
**Overall UX Health Score**: 78/100

## Executive Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| Serious  | 3 |
| Moderate | 8 |
| Minor    | 14 |
| **Total** | **25** |

### Top 5 Most Impactful Findings
1. [Finding title + page + severity]
...

## Per-Page Findings

### LoginPage (src/pages/LoginPage.tsx)
**Findings**: 2
- [MODERATE] Finding title — file:line — description — remediation

### DashboardPage (src/pages/DashboardPage.tsx)
...

## Appendix: Methodology
[Brief explanation of evaluation framework, severity scale, and health-score formula]
```

**Rationale**:
- Top-down structure: health score first (1 sec), then counts, then top-5, then per-page detail.
- Each finding is self-contained (page, file, severity, description, remediation).
- Appendix lets the team audit the auditor's methodology.

## Decision 5: Evidence Format

**Decision**: Each finding cites the evidence type. Most findings cite `file_path:line_number`. Visual findings cite "visual inspection required".

**Evidence types**:

| Type | When to use | Example |
|------|-------------|---------|
| `file:line` | Direct code reference (e.g., missing `aria-label`, wrong class) | `src/components/Toast.tsx:23` |
| `file:symbol` | Cross-file or class-level issue | `src/components/Toast.tsx (Toast component)` |
| `visual` | Requires rendering to verify (e.g., color contrast, layout) | "Login button hover state requires visual check" |
| `runtime` | Requires running the app (e.g., tab order, focus trap) | "Tab order in modal — run dev server and tab through" |
| `heuristic` | Pattern that emerges from reading multiple files | "All pages use the same `className='p-8'` but Dashboard uses `p-6` — inconsistency" |

**Rationale**: Honest about what can be verified statically vs. needs human/visual inspection.

## Decision 6: Tooling

**Decision**: No new tools. The audit uses standard file-read tools against the existing repo. No Playwright, no headless browser, no Figma export, no Lighthouse.

**Rationale**:
- Spec says "Static analysis of JSX/TSX is sufficient for v1" (assumption).
- Adding browser automation would require npm install + Playwright setup + 100s of seconds per page.
- The 30-minute budget (SC-006) doesn't allow for it.

**Tradeoff**: Visual findings (color contrast, layout, hover states) are flagged as "visual inspection required" rather than verified. The team reviews them in a follow-up.

## Decision 7: Page Count and Coverage

**Decision**: 19 pages, all in `src/pages/`, excluding test files.

**Pages covered**:
CreateProjectPage, DashboardPage, DocsPage, LoginPage, ManualScanPage, MyIssuesPage, PendingVerificationPage, ProjectControlPage, ProjectEditPage, ProjectGroupsPage, ProjectOverviewPage, ProjectReportsPage, RegisterPage, ScanHistoryPage, ScanStatusPage, SettingsPage, ToolDetailViewPage, UnifiedReportPage, UserManagementPage.

**Rationale**: These are the route-level entry points. Components in `src/components/` are audited transitively when they appear on a page.

## Open Questions

None.
