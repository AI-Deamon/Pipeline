# Feature Specification: Sentinel Frontend UX Audit

**Feature Branch**: `011-ux-audit`
**Created**: 2026-06-16
**Status**: Draft
**Input**: User description: "Acting as a UX/UI Design Specialist, produce a comprehensive UX audit of the Sentinel DevSecOps platform frontend. Audit all pages in src/pages/ for usability, accessibility, consistency, and design-system compliance. Deliver a prioritized remediation plan."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Audit Report for Designers and Developers (Priority: P1)

As a Sentinel team member, I want a comprehensive UX audit report covering every page in the application, so that I can prioritize and act on usability, accessibility, and consistency issues.

**Why this priority**: The audit is the primary deliverable. Without it, no remediation work can be planned or prioritized.

**Independent Test**: Can be fully tested by opening the audit report and verifying it covers all 19 pages in `src/pages/` (excluding test files), with findings categorized by severity and page.

**Acceptance Scenarios**:
1. **Given** the audit workflow, **When** it completes, **Then** the report includes a per-page section with findings, screenshots references, and remediation suggestions.
2. **Given** the audit report, **When** a developer searches for a specific page, **Then** the report has a direct link to that page's findings.
3. **Given** any finding, **When** the user reads the remediation, **Then** it includes specific code-level changes (file path, function/line, suggested replacement).

---

### User Story 2 - Severity-Indexed Issue List (Priority: P1)

As a project manager, I want all findings classified by severity (Critical / Serious / Moderate / Minor), so that I can schedule remediation work in the right order.

**Why this priority**: Severity classification is the mechanism for prioritization. Without it, the team cannot decide what to fix first.

**Independent Test**: Can be fully tested by counting findings per severity level and verifying Critical issues are listed first in the executive summary.

**Acceptance Scenarios**:
1. **Given** a finding, **When** the user views the report, **Then** each finding has a severity tag (Critical, Serious, Moderate, Minor) and a brief justification.
2. **Given** the executive summary, **When** a manager reviews it, **Then** the summary lists Critical findings first, followed by Serious, Moderate, and Minor.
3. **Given** severity counts, **When** a manager queries the totals, **Then** the report provides a count per severity and per page.

---

### User Story 3 - Audit Findings Stored Version-Controlled (Priority: P2)

As a team member, I want the audit report stored in `specs/011-ux-audit/audit-report.md` and version-controlled with the project, so that progress on remediation can be tracked over time via git history.

**Why this priority**: Version control is how the team tracks audit iterations and remediation progress. P2 because the audit itself is the primary deliverable; storage is a wrapper.

**Independent Test**: Can be fully tested by checking the file into git and verifying the report is preserved across branches.

**Acceptance Scenarios**:
1. **Given** an audit completion, **When** the file is written, **Then** it lives at `specs/011-ux-audit/audit-report.md` and is committed to the feature branch.
2. **Given** a follow-up audit, **When** the team runs the audit again, **Then** the new report overwrites the old one, and git history shows the diff.

---

### User Story 4 - Issue Tracker Sync for Critical/Serious (Priority: P3)

As a developer, I want Critical and Serious findings converted into tracked issues with labels, so that I can pick them up in the next sprint.

**Why this priority**: Issue sync is a process improvement, not the audit itself. P3 because manual triage is acceptable for v1; automation is a follow-up.

**Independent Test**: Can be fully tested by counting Critical+Serious findings and verifying an equal number of issues exist with the `ux-audit` label.

**Acceptance Scenarios**:
1. **Given** a Critical or Serious finding, **When** the user runs the issue-sync workflow, **Then** an issue is created with the `ux-audit` label and a body linking back to the audit finding.
2. **Given** a Moderate or Minor finding, **When** the user runs the issue-sync workflow, **Then** no issue is created (they remain in the report only).

### Edge Cases

- What happens if a page has no findings? Page gets a "No issues found" section and contributes 0 to severity counts.
- What happens if a page does not exist or is unreachable? Audit skips it and logs a warning; report shows the gap.
- What happens when two audits run concurrently? Last writer wins; git diff shows the conflict and the team resolves.
- What happens if the audit agent encounters JSX it cannot parse? It logs the file, the line, and the parse error; it does not crash the audit.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The audit MUST cover all 19 pages in `src/pages/` (CreateProjectPage, DashboardPage, DocsPage, LoginPage, ManualScanPage, MyIssuesPage, PendingVerificationPage, ProjectControlPage, ProjectEditPage, ProjectGroupsPage, ProjectOverviewPage, ProjectReportsPage, RegisterPage, ScanHistoryPage, ScanStatusPage, SettingsPage, ToolDetailViewPage, UnifiedReportPage, UserManagementPage), excluding test files (`*.test.tsx`).
- **FR-002**: Each page MUST be evaluated against at least the following 8 categories: Information Architecture, Navigation, Visual Hierarchy, Accessibility (WCAG 2.1 AA), Consistency with Design System, Error/Empty/Loading States, Microcopy, Mobile Responsiveness.
- **FR-003**: Each finding MUST be classified by severity: Critical (blocks user from completing a primary task, or violates WCAG Level A), Serious (significant friction, or violates WCAG Level AA), Moderate (noticeable but workaround exists), Minor (cosmetic or nice-to-have).
- **FR-004**: Each finding MUST include: page name, file path, finding title, severity, description, evidence (line numbers or screenshot reference), and remediation (specific code change or design change).
- **FR-005**: The audit MUST produce an executive summary with severity counts (total Critical/Serious/Moderate/Minor), the top 5 most impactful findings, and an overall UX health score (0–100).
- **FR-006**: The audit MUST be performed by a UX/UI Design Specialist agent acting in that role (research-driven, design-system-aware, accessibility-conscious).
- **FR-007**: The audit output MUST be a single markdown file at `specs/011-ux-audit/audit-report.md`.
- **FR-008**: The audit MUST identify duplicate patterns (e.g., the same broken navigation present in 3+ pages) so a single design-system fix can resolve them.
- **FR-009**: The audit MUST NOT change any source code; it produces findings only. Remediation is a separate workflow.
- **FR-010**: The audit MUST be re-runnable. Running the audit a second time overwrites the previous report; the new report is canonical.

### Key Entities

- **Audit Report**: A markdown document containing the executive summary, per-page findings, and overall UX health score. Attributes: created_at, version, total_findings, severity_counts, ux_health_score.
- **Finding**: A single UX issue observed on a specific page. Attributes: page, file_path, category, severity, title, description, evidence, remediation, created_at.
- **Severity**: An enumeration: Critical, Serious, Moderate, Minor. Each has a clear definition (see FR-003).
- **Category**: An evaluation dimension. Attributes: name (IA, Navigation, Visual Hierarchy, Accessibility, Consistency, States, Microcopy, Mobile), description, weight_in_score (each category contributes proportionally to UX health score).
- **UX Health Score**: A single number 0–100 representing the overall UX health of the app. Calculated as: start at 100, subtract weighted points for each finding (Critical = 10, Serious = 5, Moderate = 2, Minor = 0.5). Capped at 0.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The audit covers all 19 pages in `src/pages/` (excluding test files). A page is "covered" if it has a section in the report, even if the section is "No issues found". If the 30-minute budget is exhausted before all 19 pages are audited, the report includes a "Coverage Gaps" section listing the unaudited pages; pages already audited are kept at full depth.
- **SC-002**: The audit produces at least 25 findings across all 19 pages (an average of ~1.3 per page, accounting for the fact that some pages will have more issues).
- **SC-003**: Each finding has a severity tag and a remediation with specific code-level guidance.
- **SC-004**: The executive summary shows severity counts and a UX health score.
- **SC-005**: At least 50% of findings reference a specific file path and line number.
- **SC-006**: The audit completes within 30 minutes (start to written report).
- **SC-007**: The report is committed to the feature branch and visible in `git log`.

## Assumptions

- The 19 pages in `src/pages/` (excluding test files) are the complete user-facing surface of the application. Components in `src/components/` are audited indirectly when they appear on a page.
- The audit is read-only: it does not modify source code, run tests, or change build artifacts.
- The audit runs in the current working tree without needing a build. Static analysis of JSX/TSX is sufficient for this v1.
- The agent has access to the codebase via standard file read tools.
- The audit report is a snapshot, not a live document. Future audits overwrite it.
- "WCAG 2.1 AA" is the compliance target. Level AAA is out of scope for v1.
- Mobile responsiveness is evaluated by reading CSS/Tailwind class usage, not by running the app in a mobile viewport (no Playwright or browser automation in v1).
- The audit is performed in English; UI microcopy is reviewed in English (the existing locale).

## Clarifications

### Session 2026-06-16

- Q: When time runs short (or pages are unusually complex), what is the audit's completion policy? → A: Ship partial report with coverage gap flagged. Pages already audited are kept at full depth; pages not audited appear in a "Coverage Gaps" section in the report. This prioritizes depth over breadth and is honest about what was/wasn't reviewed.
