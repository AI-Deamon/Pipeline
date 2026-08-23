# SonarQube Dashboard Integration

## Goal
Integrate detailed SonarQube scan results (vulnerabilities, code snippets, and remediation guidance) directly into the pipeline reports dashboard so users do not need to access the SonarQube server.

## Tasks
- [ ] Task 1: **Configure Backend SonarQube API Client**
  - Action: Set up async HTTP client to fetch raw issue data from SonarQube's `/api/issues/search` endpoint.
  - Verify: Backend successfully authenticates using `SONARQUBE_TOKEN` and retrieves issue JSON metadata.

- [ ] Task 2: **Fetch Rule Explanations & Remediation**
  - Action: Implement batch fetching from `/api/rules/search` to extract `htmlDesc` (description) and `htmlNote` (remediation) for unique rules found in the scan.
  - Verify: The unified `SecurityFinding` objects contain populated `description` and `recommendation` fields.

- [ ] Task 3: **Implement Code Snippet Extraction Endpoint**
  - Action: Create a backend endpoint (e.g., `GET /api/v1/projects/{id}/code-snippet`) that reads the specific `file_path` from the source repository and extracts +/- 10 lines around the exact `line_number`.
  - Verify: Endpoint returns the correct block of raw source code strings.

- [ ] Task 4: **Build Frontend Syntax Highlighter Component**
  - Action: Create a `CodeSnippet.tsx` component using `react-syntax-highlighter` to render the code context.
  - Verify: Component accurately renders code with the correct language syntax and visually highlights the target vulnerable line in red.

- [ ] Task 5: **Integrate Data into Issue Detail UI**
  - Action: Update the frontend issue modal (`IssueDetailModal.tsx`) to display severity badges, rule tags, and `dompurify`-sanitized descriptions alongside the `CodeSnippet`.
  - Verify: Clicking an issue opens the modal and displays all context safely and beautifully.

- [ ] Task 6: **Add Actionable Lifecycle Controls**
  - Action: Add interactive buttons in the UI for "Assign", "Mark Fixed", and "Request Rescan" that call your backend APIs.
  - Verify: A developer can successfully transition an issue's status to "Fixed" entirely within the custom dashboard.

## Done When
- [ ] Developers can view the exact line of code causing a vulnerability directly in the pipeline dashboard.
- [ ] "How to fix it" remediation instructions are clearly visible.
- [ ] Issues can be triaged, assigned, and transitioned (e.g., Open → Fixed) without ever logging into the SonarQube interface.
