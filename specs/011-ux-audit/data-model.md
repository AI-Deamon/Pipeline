# Data Model: UX Audit Entities

**Feature**: Sentinel Frontend UX Audit (spec 011)
**Date**: 2026-06-16

## Overview

The audit produces a structured report with five entities. None of these are persisted to a database — they live only in the markdown report. This document is the contract for what the report contains.

---

## Entity 1: Audit Report

The top-level deliverable. A single markdown file at `specs/011-ux-audit/audit-report.md`.

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| created_at | ISO 8601 date | Yes | Audit date (e.g., `2026-06-16`) |
| auditor | string | Yes | "UX/UI Design Specialist agent" |
| pages_audited | integer | Yes | Count of pages covered (19) |
| ux_health_score | integer (0–100) | Yes | Overall health (see formula) |
| severity_counts | object | Yes | `{critical: N, serious: N, moderate: N, minor: N}` |
| findings | Finding[] | Yes | All findings (page-major order) |
| executive_summary | string | Yes | 1–2 paragraph summary of state + top concerns |
| top_5_findings | Finding[] | Yes | Highest-impact 5 |
| methodology | string | Yes | Brief explanation of framework + severity + formula |

**Format**: Single markdown file, sections per FR-005.

**Validation**: File exists, parses as markdown, contains all required sections, has `ux_health_score` line, has severity_counts table.

---

## Entity 2: Finding

A single UX issue observed on a specific page.

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Stable identifier, e.g., `F-001`, `F-002`. Assigned in order of appearance. |
| page | string | Yes | Human-readable page name, e.g., `LoginPage` |
| file_path | string | Yes | Repo-relative path, e.g., `src/pages/LoginPage.tsx` |
| category | Category (enum) | Yes | One of the 8 categories |
| severity | Severity (enum) | Yes | One of 4 levels |
| title | string | Yes | Short, action-oriented (e.g., "Missing aria-label on password toggle") |
| description | string | Yes | What the issue is and why it matters |
| evidence | string or {type, value} | Yes | file:line OR visual OR runtime OR heuristic |
| remediation | string | Yes | Specific code change or design change. May include a code snippet. |
| wcag_criterion | string | No | e.g., `WCAG 1.3.1 (Info and Relationships)` — only for accessibility findings |

**Format in markdown**:
```markdown
- **[MODERATE]** Missing aria-label on password toggle button — `src/pages/LoginPage.tsx:120`
  - **Description**: The eye-icon button that toggles password visibility has no accessible name. Screen reader users hear "button" with no context.
  - **Remediation**: Add `aria-label={isVisible ? 'Hide password' : 'Show password'}` to the button element.
  - **WCAG**: 4.1.2 (Name, Role, Value)
```

**Validation**: Every finding has page, file_path, severity, title, description, remediation. ≥50% reference specific file:line (per SC-005).

---

## Entity 3: Severity (enum)

| Value | Definition | WCAG tie |
|-------|-----------|----------|
| `Critical` | Blocks primary task. Violates WCAG Level A. | WCAG A |
| `Serious` | Significant friction. Violates WCAG Level AA. | WCAG AA |
| `Moderate` | Noticeable, workaround exists. | — |
| `Minor` | Cosmetic. | — |

**Weight for health score**: 10 / 5 / 2 / 0.5 respectively.

---

## Entity 4: Category (enum)

Eight evaluation dimensions. Each finding belongs to exactly one category.

| Value | Full name | Examples |
|-------|-----------|----------|
| `IA` | Information Architecture | Card sort, taxonomy, page structure |
| `Navigation` | Navigation | Breadcrumbs, back buttons, links |
| `VisualHierarchy` | Visual Hierarchy | Typography scale, color contrast, spacing |
| `Accessibility` | Accessibility (WCAG 2.1 AA) | ARIA, alt text, focus management |
| `Consistency` | Design System Consistency | Token reuse, component reuse |
| `States` | Loading/Empty/Error States | Skeletons, error toasts, empty-state copy |
| `Microcopy` | Microcopy | Button labels, error messages, tooltips |
| `Mobile` | Mobile Responsiveness | Breakpoints, tap targets, scroll |

---

## Entity 5: UX Health Score

A single number 0–100 representing overall app health.

**Formula**:
```
score = max(0, 100 - Σ(weight_i × count_i))
weights = { Critical: 10, Serious: 5, Moderate: 2, Minor: 0.5 }
```

**Interpretation**:
- 90–100: Excellent — minor polish only
- 75–89: Good — a few issues to address
- 60–74: Fair — multiple issues, prioritize Moderate+
- 40–59: Poor — significant UX debt
- 0–39: Critical — release-blocking

**Display**: Single integer, e.g., `UX Health Score: 78/100`.

---

## Relationships

```
Audit Report
  ├── contains 1..N Findings
  ├── has 1 Severity Count
  ├── has 1 UX Health Score
  └── references 8 Categories
```

```
Finding
  ├── belongs to 1 Page
  ├── has 1 Severity
  ├── has 1 Category
  └── has 1 Evidence (one of: file:line, visual, runtime, heuristic)
```

## Example: A Complete Finding

```markdown
- **[SERIOUS]** Color contrast on disabled buttons is 2.1:1, below WCAG AA 4.5:1 — `src/components/Button.tsx:34`
  - **Category**: Accessibility
  - **Description**: Disabled buttons use `text-slate-300` on `bg-slate-100`, which has a contrast ratio of ~2.1:1. WCAG 1.4.3 requires 4.5:1 for body text. Screen reader and low-vision users may not perceive the button as disabled.
  - **Remediation**: Use `text-slate-400` on `bg-slate-100` (contrast ~3.5:1) OR add a non-color indicator (e.g., reduced opacity + strikethrough or icon).
  - **WCAG**: 1.4.3 (Contrast Minimum, Level AA)
```

## Constraints

- The report is a snapshot. Re-runs overwrite. Git history preserves the diff.
- Severity and Category are enums. The audit MUST NOT invent new values (e.g., "Critical-Plus").
- File paths MUST be repo-relative (start with `src/`, `backend/`, etc.).
- WCAG criterion is optional; only for accessibility findings.
- Findings with `evidence.type === 'visual'` or `'runtime'` cannot be auto-verified by re-running the audit. They require human review.
