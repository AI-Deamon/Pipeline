# Feature Specification: Unified Issue Tracker

**Feature Branch**: `004-unified-issue-tracker`

**Created**: 2026-06-08

**Status**: Superseded by `specs/008-issue-resolution-workflow/spec.md` (implementation complete, all tasks done)

**Input**: User description: "unified issue tracking in detailed"

## Clarifications

### Session 2026-06-08

- Q: What features or capabilities are explicitly excluded from this feature? → A: Exclude bulk operations (assign/verify multiple issues at once)
- Q: How long should resolved/closed issues be retained in the system? → A: Retain for 6 months
- Q: What accessibility standard must the issue tracker meet? → A: WCAG 2.1 AA compliance
- Q: What is the expected scale of the system in terms of concurrent users and total issues? → A: 500 concurrent users, 100,000 total issues
- Q: What metrics and logs should the system provide to monitor issue tracker health and usage? → A: Metrics: issue counts by status, assignment/verification latency, error rates
- Q: What is the required system availability (uptime percentage)? → A: 99.5% uptime (43.8 hours downtime/year) - Best-effort availability with planned maintenance windows
- Q: What authentication method should the system use? → A: JWT tokens with 1-hour expiry and refresh tokens - Stateless, scalable, suitable for APIs
- Q: What level of audit logging is required? → A: Detailed audit log - Track all CRUD operations on issues, including field-level changes (before/after values)
- Q: What backup and disaster recovery strategy should the system implement? → A: Hourly backups with 30-day retention, automated recovery with < 4 hour RTO - Balanced approach for business continuity
- Q: What rate limiting strategy should the system implement? → A: Basic rate limiting - 100 requests per minute per user, 429 response when exceeded
- Q: How should the UI navigation work for viewing issues? → A: Keep existing overview (summary counts per tool) as landing view. Click on tool card (e.g., "SonarQube: 13 critical") → opens detailed issue list for that specific tool. Same pattern for all tools. Admin sees overview only, TL and Developer see detailed views.
- Q: Should the "My Issues" view still exist with the new tool-specific detail view design? → A: Keep "My Issues" as cross-tool, cross-project aggregation with links to tool detail views
- Q: What is the navigation structure for the overview-to-detail workflow? → A: Create a new project-level overview page. Dashboard remains as project listing. User selects project → sees project overview with tool cards → clicks tool card → sees tool detail view with individual issues.
- Q: How should existing scan_reports.findings JSON data be migrated to the new individual issue format? → A: Run a one-time migration script that parses existing JSON and creates individual issue records. Script must be idempotent and track migration status per scan report.
- Q: How strict should deduplication matching be when issue metadata changes across scans? → A: Identifier-based matching: use stable ID as primary key, update metadata to reflect latest scan, track changes in history.
- Q: How should the system integrate with external security scanning tools? → A: Pull-based integration with tool-specific adapters. System polls tool APIs or reads tool output files on a schedule or after scan completion.
- Q: Should SonarQube issue fetching be optimized with selective type filtering? → A: Yes, add UI toggle to select which issue types to fetch (bugs, vulnerabilities, security hotspots, code smells). Only fetch selected types from SonarQube API to reduce load and improve performance.
- Q: Which SonarQube API version should the system use for issue retrieval? → A: Pin to a specific API version (e.g., `api/issues/search`) for stability and predictability. Document the pinned version and test compatibility on SonarQube upgrades.
- Q: How should the UI handle loading, empty, and error states in issue views? → A: Use comprehensive approach: skeleton placeholders during loading, contextual empty state messages per tool view, and inline component-level error messages (not toast-based).

## Out of Scope

- Bulk operations (assigning or verifying multiple issues at once) are excluded from this feature. Each issue must be assigned or verified individually.

## User Scenarios & Testing

### User Story 1 - Overview to Detail Navigation (Priority: P1)

The system uses a 3-level navigation structure: (1) Dashboard shows a list of all projects. (2) When a user selects a project, they see a new project-level overview page displaying tool cards with summary counts (SonarQube: 13 critical, 1 high, 64 medium, 1 low; Trivy: 1 high; dependency-check: 3 high, 4 medium, 1 low, etc.). (3) When they click on a tool card, it opens a detailed issue list for that specific tool only. Each issue shows its title, severity, where it is in the code or infrastructure (file path and line number for code issues, vulnerability ID for dependency issues, web address for web application issues), the specific rule or standard that was violated, and how much effort it will take to fix. The same drill-down pattern works for every tool: click Trivy → see Trivy CVEs, click ZAP → see ZAP findings, click dependency-check → see dependency issues. The developer can filter issues within each tool's detail view by severity, type, status, and location.

**Why this priority**: This preserves the simplicity of the existing dashboard while giving developers and Team Leads the drill-down detail they need. The dashboard remains a high-level project listing. The project overview provides a quick glance at all tools for that project. The tool detail views provide actionable issue-level information. Admins can stop at the project overview. Developers and Team Leads drill down to tool details as needed.

**Independent Test**: Can be tested by running scans on a project with multiple tools, navigating from dashboard to project overview, clicking each tool card, and confirming the detailed issue list for that specific tool appears with complete context.

**Acceptance Scenarios**:

1. **Given** the user is on the dashboard, **When** they click on a project, **Then** they see the project overview page displaying tool cards with summary counts for each tool.
2. **Given** a project has completed scans using SonarQube, Trivy, and dependency-check, **When** the user views the project overview, **Then** they see summary counts per tool (e.g., "SonarQube: 13 critical, 1 high, 64 medium, 1 low").
3. **Given** the project overview is displayed, **When** the user clicks the SonarQube tool card, **Then** a detailed issue list for SonarQube issues only opens, showing file paths, line numbers, rules, and severity for each issue.
4. **Given** the user is in the SonarQube detail view, **When** they click the back button or navigate away, **Then** they return to the project overview page.
5. **Given** the user clicks the Trivy tool card from the project overview, **When** the Trivy detail view opens, **Then** they see vulnerability IDs, package names, versions, and severity for each Trivy finding.
6. **Given** the user is in any tool's detail view, **When** they filter by severity "Critical", **Then** only critical issues from that specific tool are shown.

---

### User Story 2 - Code Analysis Shows All Issue Categories with Selective Fetching (Priority: P1)

The code analysis tool currently only shows bugs and security vulnerabilities in the dashboard. It misses two important categories: code smells (poor coding practices that don't cause bugs but make code harder to maintain) and security hotspots (code that might be secure or might not, requiring human review). The system MUST support all four categories of issues.

The SonarQube detail view MUST include a toggle/filter allowing users to select which issue types to fetch: [ ] Bugs [ ] Vulnerabilities [ ] Security Hotspots [ ] Code Smells. By default, all four types are selected. When the user changes the selection, the system fetches only the selected types from the SonarQube API. This reduces API load and improves performance, especially for projects with hundreds of code smells.

**Typical workflow**: A Team Lead creates a project, runs the scan pipeline, and sees the project overview with tool cards showing summary counts (e.g., SonarQube: 10 bugs, 13 vulnerabilities, 6 security hotspots, 421 code smells; ODC: 16 issues; Trivy FS: 2 issues; Docker build: 1 failed, 1 success; Image scan: 5 issues; Nmap: 5 vulnerabilities; ZAP: 15 vulnerabilities). The TL clicks the SonarQube card to see the detailed issue list. If the TL wants to focus on critical issues first, they can toggle off "Code Smells" to fetch only bugs, vulnerabilities, and security hotspots (29 issues instead of 450). The TL reviews the issues, assigns them to developers, and developers fix them. When developers complete their fixes, they notify the TL, who triggers a re-scan to verify the fixes.

**Why this priority**: Without code smells and security hotspots, developers miss a large portion of their issues. In the reference project (Meraki), 64 medium-severity items are currently invisible. This defeats the purpose of bringing detailed issue information into the dashboard. However, fetching all 450+ issues every time is inefficient. Selective fetching lets users focus on what matters while keeping the system responsive.

**Independent Test**: Can be tested by running a code analysis scan on a project, opening the SonarQube detail view, toggling different issue type combinations, and verifying that only the selected types are fetched and displayed.

**Acceptance Scenarios**:

1. **Given** a code analysis scan completes for a project, **When** the system retrieves issues from the analysis tool, **Then** it supports retrieving all four categories: bugs, vulnerabilities, code smells, and security hotspots.
2. **Given** the user opens the SonarQube detail view, **When** the view loads, **Then** they see a toggle/filter with checkboxes for: Bugs, Vulnerabilities, Security Hotspots, Code Smells. All four are selected by default.
3. **Given** all four issue types are selected, **When** the user toggles off "Code Smells", **Then** the system fetches only bugs, vulnerabilities, and security hotspots from the SonarQube API, and the issue list updates to show only those types.
4. **Given** the user has toggled off "Code Smells" and "Security Hotspots", **When** they view the issue list, **Then** they see only bugs and vulnerabilities, and the system has made a single API call to SonarQube requesting only those types.
5. **Given** the system processes a code smell issue (when selected), **When** it creates the issue record, **Then** it includes the file path, line number, effort estimate, and the specific coding standard violated.
6. **Given** the system processes a security hotspot (when selected), **When** it creates the issue record, **Then** it includes the review status (needs review, acknowledged, or fixed) and the review priority level.
7. **Given** the Team Lead views the project overview after a scan, **When** they see the SonarQube card, **Then** it shows summary counts for all four issue types (e.g., "10 bugs, 13 vulnerabilities, 6 security hotspots, 421 code smells").

---

### User Story 3 - Team Lead Assigns Issues to Developers (Priority: P2)

A Team Lead navigates to a tool's detail view (e.g., clicks SonarQube card), sees the list of issues for that tool, and assigns specific issues to individual developers. They can set a priority level (critical, high, medium, low) and add a note explaining why this issue is important or providing context. The assigned developer sees the issue in their personal "My Issues" view. The Team Lead can see all assignments across the project and track who is working on what. This same assignment workflow works in every tool's detail view — SonarQube, Trivy, ZAP, dependency-check, nmap.

**Why this priority**: Assignment is the bridge between finding issues and fixing them. Without assignment, issues sit unowned and developers don't know what to prioritize. Assignment creates accountability and ensures issues get addressed.

**Independent Test**: Can be tested by logging in as a Team Lead, navigating to a tool's detail view, assigning three issues to a developer with different priorities, then logging in as that developer and confirming the issues appear in their "My Issues" view with correct priority and assignment information.

**Acceptance Scenarios**:

1. **Given** a Team Lead is viewing a tool's detail issue list (e.g., SonarQube), **When** they select an issue and choose "Assign", **Then** a dialog opens showing available developers and priority options.
2. **Given** the Team Lead assigns a critical issue (e.g., hardcoded password in configuration file) to Developer A with priority "Critical", **When** Developer A opens "My Issues", **Then** the issue appears at the top with status "Assigned", the Team Lead's name as assigner, and a critical priority indicator.
3. **Given** an issue is already assigned to Developer A, **When** the Team Lead reassigns it to Developer B, **Then** the assignment history shows: originally assigned to A on [date], reassigned to B on [date].
4. **Given** a Team Lead assigns five issues across two developers in different tool views, **When** they view the project assignment summary, **Then** they see: Developer A has 3 open issues (1 critical from SonarQube, 2 medium from Trivy), Developer B has 2 open issues (1 high from ZAP, 1 low from dependency-check).

---

### User Story 4 - Developer Updates Issue Status (Priority: P2)

A developer works through their assigned issues and updates the status as they progress. They can move an issue through the workflow: Assigned → In Progress → Fixed. When marking an issue as fixed, they can add a comment describing what they did (e.g., "Moved hardcoded password to environment variable"). The Team Lead is notified when an issue is marked as fixed so they can verify the resolution.

**Why this priority**: Status tracking creates visibility and accountability. Without it, there's no way to know if an issue is being worked on, how far along it is, or whether it's been resolved. Status updates enable the Team Lead to manage workload and verify fixes.

**Independent Test**: Can be tested by assigning an issue to a developer, having them update the status through the full workflow (Assigned → In Progress → Fixed with a comment), and confirming the Team Lead sees the updated status and the fix comment.

**Acceptance Scenarios**:

1. **Given** a developer has an assigned issue with status "Assigned", **When** they click "Start Working", **Then** the status changes to "In Progress" and the Team Lead sees the update.
2. **Given** a developer has an issue "In Progress", **When** they click "Mark as Fixed" and add a comment "Moved hardcoded password to environment variable", **Then** the status changes to "Fixed", the comment is recorded with a timestamp, and the Team Lead is notified.
3. **Given** an issue is marked "Fixed", **When** the Team Lead views it, **Then** they see: the original issue details, the assignment history, the status timeline (Assigned → In Progress → Fixed), and the developer's fix comment.

---

### User Story 5 - Team Lead Verifies or Rejects Fixes (Priority: P2)

After a developer marks an issue as fixed, the Team Lead reviews the fix. They can either verify it (status changes to Verified) or reject it with feedback explaining what's wrong (status changes to Rejected, and the issue goes back to the developer). Verification can be manual (Team Lead confirms the fix is correct) or automatic (the system re-runs the scan and confirms the issue no longer appears).

**Why this priority**: Verification closes the loop. Without it, there's no confirmation that the fix actually resolved the issue. A developer might think they fixed something, but the issue could still be present. Verification ensures quality and prevents false positives.

**Independent Test**: Can be tested by having a developer mark an issue as fixed, then having the Team Lead verify it and confirming the status changes to "Verified". Then test rejection: developer marks fixed, Team Lead rejects with feedback "Password still present in line 17", developer sees the rejection feedback.

**Acceptance Scenarios**:

1. **Given** an issue is marked "Fixed" by a developer, **When** the Team Lead clicks "Verify Fix", **Then** the status changes to "Verified" with a timestamp and the Team Lead's name.
2. **Given** an issue is marked "Fixed" but the Team Lead finds the fix incomplete, **When** they click "Reject" and enter feedback "Password still hardcoded in configuration file line 16", **Then** the status changes to "Rejected", the developer is notified, and the feedback is visible in the issue timeline.
3. **Given** an issue is "Fixed" and the Team Lead triggers a re-scan, **When** the scan completes and the issue no longer appears in the tool's results, **Then** the system automatically verifies the issue (status changes to "Auto-Verified") with a note "Confirmed resolved by scan on [date]".
4. **Given** an issue is "Fixed" but a re-scan still shows the issue, **When** the scan completes, **Then** the system flags it as "Still Present After Fix" and notifies the Team Lead.

---

### User Story 6 - Developer "My Issues" Dashboard (Priority: P3)

A developer logs in and sees a dedicated "My Issues" page showing all issues assigned to them across all projects and all tools. Issues are grouped by project and sorted by priority (critical first). Each issue shows: title, which tool found it, severity, project name, location (file path or vulnerability ID or web address), status, and when it was assigned. The developer can click any issue to navigate directly to that tool's detail view for that project, where they can see full context and take action (Start Working, Mark Fixed). This cross-tool, cross-project aggregation gives developers a single dashboard to see all their work, while the tool-specific detail views provide the context needed to actually fix issues.

**Why this priority**: This is the developer's daily starting point. Without it, they'd have to navigate project-by-project and tool-by-tool to find their work. A unified "My Issues" view gives developers a single place to see all their responsibilities and prioritize their day, with one-click navigation to the detailed context they need.

**Independent Test**: Can be tested by assigning issues to a developer across two different projects and multiple tools, then logging in as that developer and confirming the "My Issues" page shows all assigned issues grouped by project with correct metadata and sorted by priority. Verify that clicking an issue navigates to the correct tool detail view.

**Acceptance Scenarios**:

1. **Given** a developer is assigned issues across three projects and multiple tools, **When** they open "My Issues", **Then** they see all issues grouped by project, sorted by priority (critical issues first).
2. **Given** the "My Issues" page, **When** the developer filters by status "In Progress", **Then** only issues they're actively working on are shown.
3. **Given** the "My Issues" page, **When** the developer clicks an issue, **Then** they are navigated to that project's tool detail view (e.g., SonarQube detail view for that project) where they can see full context and action buttons (Start Working, Mark Fixed).
4. **Given** the "My Issues" page, **When** the developer clicks an issue from Trivy, **Then** they are navigated to that project's Trivy detail view showing the vulnerability details.

---

### User Story 7 - Issues Are Deduplicated Across Scans (Priority: P3)

When a project is scanned multiple times, the same issue (e.g., the same hardcoded password on line 15 of a configuration file) should not appear as multiple separate issues. The system recognizes that it's the same issue across scans and shows it only once. The issue displays its history: when it was first seen, when it was last seen, and whether it's been resolved. If an issue was present in earlier scans but disappears in a later scan, it's marked as resolved. If a new issue appears in a later scan that wasn't in earlier scans, it's marked as new.

**Why this priority**: Without deduplication, the issue list becomes noisy and unmanageable. A project with three scans might show the same issue three times, making it impossible to tell what's actually going on. Deduplication provides a clean, accurate view of the current state.

**Independent Test**: Can be tested by running three scans on a project where some issues persist across scans and some are resolved. Confirm that the issue list shows each unique issue only once, with accurate first-seen and last-seen dates, and correct resolved/new status.

**Acceptance Scenarios**:

1. **Given** a project has three completed scans, **When** the issue list loads, **Then** an issue that appears in all three scans (e.g., hardcoded password in configuration file line 15) appears exactly once with a history showing it was present in all three scans.
2. **Given** an issue was present in scans 1 and 2 but resolved in scan 3, **When** the issue list loads, **Then** the issue shows status "Resolved" with the last-seen date from scan 2 and the resolved date from scan 3.
3. **Given** a new issue appears in scan 3 that wasn't in scans 1 or 2, **When** the issue list loads, **Then** it appears with a "New" indicator and the first-seen date from scan 3.

---

### Edge Cases

- What happens when a code issue is fixed in the code but the scan hasn't run yet? → The issue stays "Open" until a re-scan confirms it's gone or the Team Lead manually verifies it.
- What happens when the same vulnerability appears in both dependency scanning tools? → Both are shown as separate issues (different tools, different evidence) but can be grouped by vulnerability ID in the user interface.
- What happens when a developer is removed from the system but has assigned issues? → Issues remain assigned (historical record) but show "Unassigned (user removed)" and can be reassigned by the Team Lead.
- What happens when a project is deleted? → All issues for that project are hidden from "My Issues" views and marked as archived.
- What happens when a security tool is unavailable during report retrieval? → Issues from other tools are still stored and visible. Issues from the unavailable tool show "Pending (tool unavailable)" and the system retries automatically.
- What happens when two Team Leads assign the same issue to different developers at the same time? → The last assignment wins, and both Team Leads see the final assignment in the history.
- What happens when loading issues and the API call takes too long? → Show skeleton placeholders during loading. If load fails, show inline error message with retry option.
- What happens when there are no issues for a tool in a project? → Show contextual empty state per tool view (e.g., "No SonarQube issues found" for SonarQube, "No Trivy vulnerabilities found" for Trivy).

## Requirements

### Functional Requirements

- **FR-001**: System MUST store individual issues as separate records (not aggregated summaries) with a stable identity that allows the same issue to be recognized across multiple scans.
- **FR-002**: System MUST support retrieving all four categories of code analysis issues: bugs, vulnerabilities, code smells, and security hotspots. System MUST provide a UI toggle in the SonarQube detail view allowing users to select which issue types to fetch. System MUST only fetch the selected issue types from the SonarQube API to reduce load and improve performance. By default, all four types MUST be selected.
- **FR-003**: System MUST normalize findings from all security scanning tools (code analysis, dependency scanning, web application testing, network scanning) into a unified internal format, while presenting them in tool-specific detail views in the user interface.
- **FR-004**: Each issue MUST include tool-specific context: file path, line number, and code snippet for code analysis; vulnerability ID, package name, and version for dependency scanning; web address, parameter, and attack description for web application testing; host, port, and service for network scanning.
- **FR-005**: System MUST use identifier-based deduplication: the stable identifier (SonarQube issue key, CVE ID + package name, ZAP alert ID, nmap host:port:service) serves as the primary key. When the same issue appears in multiple scans, the system MUST update metadata (line number, version, URL, etc.) to reflect the latest scan state. All metadata changes MUST be tracked in the issue history for auditability. The system MUST display each unique issue only once, with a history showing when it was first seen, last seen, and when it was resolved (if applicable).
- **FR-006**: System MUST track the lifecycle of each issue through these states: Open → Assigned → In Progress → Fixed → Verified or Rejected.
- **FR-007**: System MUST allow Team Leads to assign issues to developers with a priority level (critical, high, medium, low) and an optional comment.
- **FR-008**: System MUST allow Team Leads to verify fixes (manually or automatically via re-scan) or reject fixes with feedback.
- **FR-009**: System MUST provide a "My Issues" view showing all issues assigned to the current user across all projects, grouped by project and sorted by priority.
- **FR-010**: System MUST provide filtering on each tool's detail issue list by: severity, issue type, status, file path or location, and assignee. The tool context is established by which detail view the user is in (no tool filter needed within a tool's view).
- **FR-011**: System MUST maintain a complete history for each issue: status changes, assignments, comments, fix descriptions, and verification results.
- **FR-012**: System MUST detect when a previously fixed issue reappears in a new scan (regression) and flag it for attention.
- **FR-013**: System MUST preserve existing aggregated report data during the transition to individual issue tracking. A one-time migration script MUST parse existing `scan_reports.findings` JSON and create individual issue records. The migration script MUST be idempotent (safe to run multiple times) and MUST track migration status per scan report to avoid duplicate processing.
- **FR-014**: Issue detail views MUST load within 2 seconds for projects with up to 1000 issues.
- **FR-015**: Developers MUST only be able to update issue status and add comments after assignment. Priority and labels are controlled exclusively by Team Leads.
- **FR-016**: Resolved/closed issues MUST be retained for 6 months, after which they are archived or removed per data retention policy.
- **FR-017**: All user interface components MUST comply with WCAG 2.1 AA accessibility standards, including color contrast, keyboard navigation, screen reader support, and responsive design.
- **FR-018**: System MUST provide observability metrics including issue counts by status, assignment and verification latency, and error rates to monitor system health and usage patterns.
- **FR-019**: System MUST maintain 99.5% uptime (43.8 hours downtime/year) with best-effort availability and planned maintenance windows.
- **FR-020**: System MUST use JWT tokens with 1-hour expiry and refresh tokens for stateless, scalable authentication suitable for API access.
- **FR-021**: System MUST maintain a detailed audit log tracking all CRUD operations on issues, including field-level changes with before/after values, user ID, and timestamp.
- **FR-022**: System MUST implement hourly backups with 30-day retention and automated recovery with less than 4 hour recovery time objective (RTO) for business continuity.
- **FR-023**: System MUST implement basic rate limiting of 100 requests per minute per user, returning HTTP 429 (Too Many Requests) when the limit is exceeded.
- **FR-024**: System MUST implement a 3-level navigation structure: (1) Dashboard showing project list, (2) Project overview page showing tool cards with summary counts, (3) Tool detail view showing individual issues. Clicking a project on the dashboard MUST navigate to the project overview. Clicking a tool card on the project overview MUST open the tool detail view. This drill-down pattern MUST be consistent across all tools.
- **FR-025**: System MUST enforce role-based view access: Admin users see the overview only (no access to tool detail views or assignment features). Team Lead and Developer users see both overview and tool detail views with assignment and status update capabilities.

### Key Entities

- **Issue**: A single actionable finding from a security scanning tool. Has a stable identity (for deduplication) that serves as the primary key across scans. Metadata (file path, line number, version, URL, etc.) is updated to reflect the latest scan state, with all changes tracked in history. Includes: source tool, severity, type, title, description, tool-specific location information (file and line number for code, vulnerability ID for dependencies, web address for web apps, host and port for network), status, assignee, priority, and timestamps. One issue can span multiple scans (first seen, last seen).

- **Issue Assignment**: Links an issue to a developer. Tracks: who it's assigned to, who assigned it, priority, status, when it was assigned, and when it was last updated. Supports reassignment with full history.

- **Issue Comment**: A timestamped note on an issue. Types include: assignment note, fix description, rejection feedback, verification note, and system-generated notes (e.g., auto-verification). Each comment has an author, timestamp, and message.

- **Issue Scan History**: Links an issue to the scans where it appeared. Tracks: which scan first detected it, which scan most recently detected it, and which scan confirmed it was resolved (if applicable). Enables deduplication and trend tracking.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A user can view the project overview (summary counts per tool) and click into any tool's detail view to see individual issues within 2 seconds, without logging into any external tool.
- **SC-002**: The code analysis issue list for a project supports all four issue categories (bugs, vulnerabilities, code smells, security hotspots). The SonarQube detail view provides a toggle to selectively fetch issue types, reducing API calls by up to 90% when only critical issue types are selected.
- **SC-003**: After three scans of the same project, the deduplicated issue count is less than or equal to the unique issue count (no duplicate entries from repeated scans).
- **SC-004**: A Team Lead can assign an issue to a developer and the developer sees it in "My Issues" within 5 seconds.
- **SC-005**: 90% of fixed issues that are re-scanned are automatically verified within one scan cycle (the issue no longer appears in the tool's results).
- **SC-006**: The issue detail view shows complete tool-specific context (file and line number for code analysis, vulnerability details for dependency scanning, attack vector for web application testing) for 100% of issues.
- **SC-007**: Developers report spending 50% less time switching between security tools after the unified issue tracker is deployed (measured via user survey).

## Assumptions

- The system will support up to 500 concurrent users and 100,000 total issues across all projects.
- The existing aggregated report data (summary counts and JSON blobs) will be preserved during the transition. The new individual issue records will become the source of truth going forward, but old reports remain accessible.
- The code analysis tool (SonarQube) supports retrieving all four issue categories (bugs, vulnerabilities, code smells, security hotspots) via its standard retrieval interface. The API supports filtering by issue type to enable selective fetching. The system pins to a specific API version (e.g., `api/issues/search`) for stability and predictability.
- Issue deduplication uses identifier-based matching: the stable identifier (SonarQube issue key, CVE ID + package name, ZAP alert ID, nmap host:port:service) serves as the primary key. Metadata (line number, version, URL, etc.) is updated to reflect the latest scan state, with all changes tracked in the issue history for auditability.
- Developers are already registered in the system. Role assignment (who is a Team Lead vs. Developer) is handled by a separate feature (spec 005).
- Re-scanning for automatic verification uses the existing scan trigger mechanism (no changes to the scanning pipeline are needed).
- The reference project's existing data (79 code analysis findings, dependency findings, network findings) will be migrated to the new individual issue format via a one-time idempotent migration script that parses existing `scan_reports.findings` JSON and creates individual issue records, tracking migration status per scan report.
- Real-time notifications (when an issue is assigned or status changes) will use the existing real-time communication infrastructure already in place for scan progress updates.
