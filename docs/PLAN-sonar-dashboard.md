# PLAN: SonarQube Detailed Dashboard Integration

## Overview
Implement a comprehensive, secure, and self-contained SonarQube results integration directly into the Sentinel pipeline reports dashboard. This dashboard will ingest detailed vulnerabilities, bugs, code smells, and dedicated **Security Hotspots** directly from SonarQube, and render local code snippets surrounding the issues. Users will be able to completely review, assign, and manage issues without ever accessing the SonarQube server itself.

## Project Type
- **Type:** WEB & BACKEND (Full-stack integration)
- **Primary Agent:** `frontend-specialist` (Web UI/UX) and `backend-specialist` (API & Ingestion logic)

## Tech Stack
- **Frontend:** React 19, TypeScript, Tailwind CSS, Lucide icons, `react-syntax-highlighter` (for code snippets), `dompurify` (for sanitizing descriptions).
- **Backend:** FastAPI, SQLAlchemy, HTTPX (for async API requests to SonarQube).
- **Database:** SQLite (local development/testing) / PostgreSQL (staging/production).

## File Structure
The following existing codebase directories and new structures are involved:
```
backend/app/
├── api/
│   ├── projects.py            # Code-snippet retrieval endpoint
│   └── issues.py              # Issue assignment & status transition APIs
├── services/
│   └── reporting/
│       └── parsers/
│           ├── base.py        # SecurityFinding data class
│           └── sonar.py       # Ingests issues and rules from SonarQube
src/
├── components/
│   ├── IssueDetailModal.tsx   # Displays findings, recommendations, and snippets
│   └── CodeSnippet.tsx        # Syntax highlighter with highlighted target lines
└── pages/
    └── ProjectReportsPage.tsx # Report summary dashboard with severity widgets
```

## Success Criteria
- [ ] Users can view SonarQube Bugs, Vulnerabilities, Code Smells, and **Security Hotspots** on the pipeline dashboard.
- [ ] Clicking any finding loads a modal showing the exact line of code (rendered via local workspace path) with syntax highlighting.
- [ ] The dashboard displays SonarQube rule remediation details (e.g. Compliant/Non-Compliant code examples).
- [ ] Users can assign and transition issues locally (Open -> Fixed) without write-backs to SonarQube.
- [ ] Access controls (RBAC) are strictly checked for all backend endpoints.

---

## Task Breakdown

### Phase 1: Ingestion & Parser Enhancements (Backend)

#### [ ] Task 1: Ingest Security Hotspots from SonarQube
- **Agent:** `backend-specialist`
- **Skill:** `api-patterns`
- **Description:** Implement an async call in `backend/app/services/reporting/parsers/sonar.py` to target the SonarQube Security Hotspots endpoint: `/api/hotspots/search?project=<project_key>&ps=500`.
- **INPUT:** Project SonarQube key, SonarQube HTTP Client instance.
- **OUTPUT:** Normalized `SecurityFinding` objects with `finding_type="HOTSPOT"` and severity matching hotspot priority (HIGH -> Critical, MEDIUM -> High, LOW -> Medium).
- **VERIFY:** Write a pytest test verifying `/api/hotspots/search` yields findings.

#### [ ] Task 2: Refine Code Snippet Service
- **Agent:** `backend-specialist`
- **Skill:** `python-patterns`
- **Description:** Refine `get_code_snippet` in `backend/app/api/projects.py` to securely read local file paths cloned by the pipeline runner and extract +/- 10 lines around the target line.
- **INPUT:** File path inside local workspace, line number, project ID.
- **OUTPUT:** JSON payload containing the extracted source code block and detected language.
- **VERIFY:** Send `GET /api/v1/projects/{project_id}/code-snippet?file=main.py&line=15` and check response for line context.

---

### Phase 2: User Interface & Snippet Presentation (Frontend)

#### [ ] Task 3: Display Security Hotspots in the Issues Table
- **Agent:** `frontend-specialist`
- **Skill:** `frontend-design`
- **Description:** Add visual tags and filters for `Security Hotspots` inside the project issues page and the main Issues Triage page.
- **INPUT:** Findings list containing type `HOTSPOT`.
- **OUTPUT:** Interactive table filters allowing users to view vulnerabilities/bugs or hotspots specifically.
- **VERIFY:** Open `/projects/{id}/issues`, select "Hotspots" filter, and see relevant items.

#### [ ] Task 4: Integrate local Code Snippet Highlighting
- **Agent:** `frontend-specialist`
- **Skill:** `react-best-practices`
- **Description:** Integrate `react-syntax-highlighter` inside `CodeSnippet.tsx` to display local file source code and highlight the vulnerable line in red.
- **INPUT:** Raw code string, language, and line number to highlight.
- **OUTPUT:** Syntax-highlighted code block with line numbers, styled inline with the theme.
- **VERIFY:** Click an issue in the UI, check that the modal displays the code context.

#### [ ] Task 5: Render Sanitized Rule Explanations
- **Agent:** `frontend-specialist`
- **Skill:** `clean-code`
- **Description:** Render the `description` and `recommendation` from the SonarQube rules API in `IssueDetailModal.tsx` using `dompurify` to prevent XSS.
- **INPUT:** HTML description string.
- **OUTPUT:** Safely rendered documentation inside the issue detail modal.
- **VERIFY:** Verify formatting (e.g. code blocks, compliance notes) renders correctly in the modal.

---

### Phase 3: Actionable Workflows & Dashboard Analytics (UI)

#### [ ] Task 6: Triage & Local Issue Lifecycle Management
- **Agent:** `frontend-specialist`
- **Skill:** `frontend-design`
- **Description:** Bind the UI transition actions (Assign, Mark Fixed, Request Rescan) to call `/api/v1/issues/{id}/transition` and `/assign` which update database state locally.
- **INPUT:** Local user interactions.
- **OUTPUT:** Updated state in local DB models (no external API calls to SonarQube).
- **VERIFY:** Click "Mark Fixed" on a finding; confirm the issue list updates to reflect the new state.

#### [ ] Task 7: Summary Dashboard Widgets
- **Agent:** `frontend-specialist`
- **Skill:** `frontend-design`
- **Description:** Create summary cards on the `ProjectReportsPage` showing count widgets for overall issues (Critical, High, Medium, Low) and the status of Security Hotspots (To Review, Reviewed).
- **INPUT:** Project reports summary API payload.
- **OUTPUT:** Metric summary cards displaying project health.
- **VERIFY:** Open the project reports page and observe counts aligning with database tables.

---

## Phase X: Verification Checklist

### Automated Verifications
- [ ] Run backend tests verifying SonarQube parsing: `pytest tests/`
- [ ] Verify frontend build and typecheck: `npm run build`
- [ ] Run playwirght E2E tests: `npx playwright test`

### Compliance Checklist
- [ ] All HTML rendering uses `dompurify` to protect against XSS injection from SonarQube rule descriptions.
- [ ] No purple or violet hex colors are used in new components (Compliance with workspace guidelines).
- [ ] RBAC is checked for all snippet and detail requests to prevent unauthorized source access.

---
## ✅ PHASE X COMPLETE
- Lint: [ ]
- Security: [ ]
- Build: [ ]
- Date: [Current Date]
