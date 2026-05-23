# Reports Pipeline: Detailed Backend & Frontend

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Jenkins Pipeline                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │  Stage 1  │→│  Stage 2  │→│  Stage 3  │→│    ...   │→│  Stage N  │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
│       │              │             │              │             │          │
│       ▼              ▼             ▼              ▼             ▼          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    reports/ (artifact files)                         │   │
│  │  zap.json │ trivy-fs.json │ nmap_findings.json │ docker-build.json  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  Post-build: archiveArtifacts + callback(scan_id, stages[], results) │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
                                    │
                        HTTP fetch (Jenkins API)
                                    ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  Backend (Python FastAPI + Celery)                                        │
│                                                                          │
│  ┌────────────┐   ┌────────────┐   ┌──────────────┐   ┌──────────────┐ │
│  │  Callback   │→  │  Celery    │→  │  ReportFetcher│→  │  Parsers     │ │
│  │  Endpoint  │   │  Task     │   │              │   │  (7 tools)  │ │
│  └────────────┘   └────────────┘   └──────────────┘   └──────────────┘ │
│                                           │                              │
│                                           ▼                              │
│                                   ┌──────────────┐                      │
│                                   │  scan_reports │                      │
│                                   │  (PostgreSQL) │                      │
│                                   └──────────────┘                      │
│                                           │                              │
│  ┌──────────────────┐   ┌────────────┐   │                              │
│  │  REST API        │   │  Unified   │   │                              │
│  │  /projects/{id}/ │←──│  Generator │←──┘                              │
│  │  reports/*       │   │  (PDF/HTML)│                                  │
│  └──────────────────┘   └────────────┘                                  │
└───────────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌───────────────────────────────────────────────────────────────────────────┐
│  Frontend (React 19 + TanStack Query + TypeScript)                       │
│                                                                          │
│  ┌─────────────────────┐   ┌──────────────────┐   ┌──────────────────┐ │
│  │  ProjectReportsPage │→  │  ToolsTable      │→  │  FindingsTable  │ │
│  │  (Page component)  │   │  (Accordion)     │   │  (Filter/Sort)  │ │
│  └─────────────────────┘   └──────────────────┘   └──────────────────┘ │
│  ┌─────────────────────┐   ┌──────────────────┐                        │
│  │  UnifiedReportPage  │   │  Export PDF      │                        │
│  │  (standalone)      │   │  (blob download) │                        │
│  └─────────────────────┘   └──────────────────┘                        │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Backend In Detail

### 1.1 Callback Endpoint

**File:** `backend/app/api/scans/` — `scans.py` (file) or `scans/` (module)

The Jenkins pipeline sends a POST to:

```
POST /api/v1/scans/{scan_id}/callback
```

**Request body (final callback):**
```json
{
  "status": "SUCCESS",
  "build_number": 42,
  "scan_id": "1815eaf2-33a8-460b-8812-c86b5ce40b36",
  "scan_mode": "AUTOMATED",
  "stages": [
    {"stage": "git_checkout", "status": "PASS", "summary": "Checkout successful", "timestamp": "..."},
    {"stage": "sonar_scanner", "status": "PASS", "summary": "Sonar scan completed", "timestamp": "..."},
    {"stage": "docker_build", "status": "WARN", "summary": "Succeeded: 2 | Failed: 2", "timestamp": "..."},
    {"stage": "zap_scan", "status": "PASS", "summary": "ZAP scan completed", "timestamp": "..."}
  ],
  "finished_at": "2026-05-19T12:06:00Z",
  "ERROR_MESSAGE": null,
  "ERROR_TYPE": null,
  "JENKINS_CONSOLE_URL": "http://jenkins:8080/job/.../42/console"
}
```

**Processing steps:**
1. **Auth validation** — `X-Callback-Token` header must match `settings.CALLBACK_TOKEN`. Skipped in test env
2. **Stage normalization** — `_normalize_stage()` in `utils.py`: converts Jenkins display names → snake_case IDs, normalizes status values
3. **Stage status mapping** — `STAGE_STATUS_MAP` in `utils.py`:
   ```
   PASSED → PASS  |  FAILED → FAIL  |  SUCCESS → PASS
   FAILURE → FAIL  |  SKIPPED → SKIPPED  |  UNSTABLE → WARN
   ```
4. **Validation** — each `stage` must be in `VALID_STAGES` set, status must be recognized
5. **DB update** — `scan_obj.state = COMPLETED`, `scan_obj.stage_results = stages`, `scan_obj.finished_at = now`
6. **Project sync** — `project_obj.last_scan_state = scan_obj.state`
7. **Celery trigger** — enqueues `fetch_scan_reports.delay(scan_id, ...)` for async artifact fetching

**Intermediate callbacks** (sent during pipeline execution):
```json
{
  "status": "RUNNING",
  "stages": [{...already completed stages...}],
  "scan_id": "...",
  "scan_mode": "AUTOMATED",
  "ERROR_MESSAGE": null,
  "ERROR_TYPE": null,
  "JENKINS_CONSOLE_URL": null
}
```
These update the frontend in real-time so users see stage-by-stage progress.

### 1.2 ReportFetcher Class

**File:** `backend/app/services/reporting/fetcher.py`

**Constructor:**
```python
ReportFetcher(jenkins_base_url, jenkins_build_number)
# → self.artifacts_base = "{base}/job/Security-pipeline/{num}/artifact/reports"
```

**Key methods:**

#### `fetch_artifact(filename) → Optional[str]`
- Builds URL: `{artifacts_base}/{filename}`
- Auth: Basic auth with `settings.JENKINS_TOKEN`
- Timeout: 30 seconds per file
- Returns raw JSON text or `None`

#### `parse_tool_report(tool_name, raw_json) → List[SecurityFinding]`
- Routes to parser via `TOOL_PARSERS` dict
- Falls back to empty list if parser not found

#### `fetch_and_process_tool(scan_id, project_id, tool_name, filename) → Optional[ScanReportDB]`
1. Fetch artifact from Jenkins
2. Skip if no content returned
3. Parse findings using tool-specific parser
4. Calculate severity summary from findings
5. Create `ScanReportDB` with: raw report, findings, severity summary, artifact URL
6. Save to database
7. Return the DB model or `None` on failure

#### `create_sonar_link(scan_id, project_id, sonar_key) → Optional[ScanReportDB]`
- Unlike other tools, SonarQube findings come from the Sonar API, not Jenkins artifacts
- Calls `fetch_sonar_issues(sonar_key)` which hits the SonarQube server's API
- Creates a link report pointing to `{sonar_url}/dashboard?id={sonar_key}`
- No `raw_report` data stored

#### `_get_active_tools(stage_results, selected_stages, scan_mode) → set`
- Determines which tools to fetch based on stage execution results
- Only fetches tools whose stage had PASS or FAIL status
- SKIPPED stages produce no reports
- For manual scans, also intersects with `selected_stages`
- Falls back to ALL tools if no stage context provided

#### `fetch_all_reports(...) → List[ScanReportDB]`
- Main orchestration method
- Determines active tools
- Iterates through tool/filename pairs:
  ```python
  [
    ("trivy_fs", "trivy-fs.json"),
    ("trivy_image", "trivy-image.json"),
    ("zap", "zap.json"),
    ("dependency_check", "dependency-check-report.json"),
    ("nmap", "nmap_findings.json"),
    ("npm_audit", "npm-audit.json"),
  ]
  ```
- Fetches + processes each active tool
- Handles Sonar separately via `create_sonar_link()`

### 1.3 Tool Parsers

**Directory:** `backend/app/services/reporting/parsers/`

Each parser implements a standalone function that converts tool-specific JSON into a list of `SecurityFinding` objects.

#### Unified SecurityFinding Model (`base.py`):
```python
SecurityFinding(
    id="F001",
    tool="zap",         # tool name
    severity="High",    # Critical | High | Medium | Low | Info
    title="XSS Vulnerability",
    description="Reflected cross-site scripting in parameter 'q'",
    cve="CVE-2024-XXXX",
    host="192.168.1.1",
    port=443,
    service="https",
    uri="/search",
    package="lodash@4.17.20",   # used by trivy/depcheck
    recommendation="Sanitize user input",
    raw_evidence="<script>alert(1)</script>",
    location="src/utils/helper.ts:42",  # used by sonar
    resolved=False,             # used by sonar
)
```

#### Parser details:

| Parser | Input File | Key Fields Extracted | Notes |
|--------|-----------|---------------------|-------|
| `parse_trivy_report` | `trivy-fs.json` | target, vulnerability_id, pkg_name, severity, installed_version, fixed_version | Maps trivy severity severity |
| `parse_trivy_image_report` | `trivy-image.json` | Same as trivy_fs + ImageName | Identical structure to FS scan |
| `parse_zap_report` | `zap.json` | name, desc, riskdesc, pluginid, uri, evidence | ZAP's `site` → host, `alert` → finding |
| `parse_depcheck_report` | `dependency-check-report.json` | name, description, cvssScore, severity, CVE entries | NVD cross-reference results |
| `parse_nmap_findings` | `nmap_findings.json` | title, severity, host, port, description, cve | Already pre-parsed by `parser.py` |
| `parse_npm_audit_report` | `npm-audit.json` | advisory, severity, cve, findings | Optional stage |
| `fetch_sonar_issues` | (Sonar API) | message, severity, component, line, type | Fetches from SonarQube via API |

### 1.4 Database Schema

**Table:** `scan_reports` (model: `ScanReportDB` in `backend/app/models/db_models.py`)

```python
ScanReportDB(
    id: int (PK, auto-increment)
    scan_id: str (FK → scans.scan_id)
    project_id: str (FK → projects.project_id)
    tool_name: str              # "zap" | "nmap" | "trivy_fs" | "trivy_image" | "dependency_check" | "sonar"
    severity_summary: JSON      # {"critical": 2, "high": 5, "medium": 13, "low": 8, "info": 1}
    findings: JSON              # List of SecurityFinding dicts
    raw_report: Text | None    # Original JSON from Jenkins (null for Sonar)
    report_url: str | None      # Jenkins artifact URL or Sonar dashboard URL
    created_at: DateTime
    expires_at: DateTime        # 90 days from creation
)
```

**Indexes:**
- `(scan_id, tool_name)` — unique per scan per tool
- `(project_id, scan_id)` — lookup for report pages
- `(created_at)` — for TTL cleanup

**Related tables:**
- `scans` (ScanDB): `scan_id`, `project_id`, `state`, `stage_results`, `jenkins_build_number`, `jenkins_base_url`
- `projects` (ProjectDB): `project_id`, `name`, `sonar_key`, `last_scan_state`

### 1.5 Celery Task Flow

**File:** `backend/app/tasks/report_tasks.py`

```
Callback Endpoint
    │
    └── fetch_scan_reports.delay(scan_id, project_id, jenkins_base_url, build_number, sonar_key,
    │                            stage_results, selected_stages, scan_mode)
    │
    ▼
Celery Worker picks up task
    │
    ├── Creates ReportFetcher(jenkins_base_url, build_number)
    ├── Calls fetcher.fetch_all_reports(...)
    │     ├── Determines active tools from stage_results
    │     ├── For each active tool:
    │     │     ├── Fetch artifact from Jenkins
    │     │     ├── Parse with tool-specific parser
    │     │     ├── Save ScanReportDB to database
    │     │     └── Log results
    │     └── Handle Sonar separately via API
    │
    └── Reports available at GET /projects/{id}/reports
```

**Error handling:**
- Missing artifacts → log warning, skip tool (not a failure)
- Parse errors → log error, skip tool (not a failure)
- DB write failures → log error, skip tool (not a failure)
- Network errors (Jenkins down) → task will retry via Celery

### 1.6 Unified Report Generator

**File:** `backend/app/services/reporting/reporter.py`

#### UnifiedReportGenerator Class

```python
UnifiedReportGenerator(
    project_id="uuid",
    scan_id="uuid",
    findings=[SecurityFinding, ...],       # Combined from all tools
    project_name="My Project",
    report_type="technical"               # executive | technical | compliance | comparison
)
```

#### Report Types

| Type | Content | Use Case |
|------|---------|----------|
| **executive** | Risk score + severity summary + high-level posture | Management briefing |
| **technical** | Full findings table with severity, title, tool, host/package | Engineering review |
| **compliance** | OWASP Top 10 2021 + CWE Top 25 mappings | Compliance audit |
| **comparison** | Severity delta vs previous scan (current, previous, change) | Trend tracking |

#### All reports include:
- Project name, scan ID, generation timestamp
- Risk score (0-100) with level and trend
- Severity summary with color-coded counts

#### generate_html() → str
- Produces a self-contained HTML page with inline CSS
- No external dependencies (images, CDN links, etc.)
- Type-specific content embedded in the HTML
- Can be saved, emailed, or displayed in a browser

#### generate_pdf() → bytes
- Uses ReportLab to produce a professionally styled PDF
- Color-coded severity sections (red=Critical, orange=High, yellow=Medium, green=Low)
- Type-specific tables and matrices
- Returns raw bytes suitable for file download

### 1.7 Risk Calculator

**File:** `backend/app/services/reporting/risk_calculator.py`

```python
RiskCalculator()

# Calculation:
score = (critical * 10 + high * 5 + medium * 2 + low * 1)
max_possible = total_findings * 10
normalized = min(100, round((score / max_possible) * 100)) if total_findings > 0 else 0

# Risk Level:
0-20   → "Low Risk"
21-40  → "Medium Risk"
41-70  → "High Risk"
71-100 → "Critical Risk"

# Trend:
Calculate current_score vs previous_scan_score
if current_score < previous_score * 0.9 → "improving"
if current_score > previous_score * 1.1 → "degrading"
else → "stable"
```

### 1.8 Compliance Mapper

**File:** `backend/app/services/reporting/compliance_mapper.py`

#### OWASP Top 10 2021 Mapping:
Maps findings to OWASP categories based on:
- CVE → predefined CVE-to-OWASP mapping
- Service/port (e.g., SSH findings → A07 Identification Failures)
- Tool name (e.g., ZAP alerts → specific OWASP categories)
- Keywords in finding title/description

| OWASP ID | Category | Example Detection |
|----------|----------|------------------|
| A01 | Broken Access Control | Missing auth headers |
| A02 | Cryptographic Failures | Weak SSL ciphers, deprecated TLS |
| A03 | Injection | SQLi, XSS via ZAP |
| A04 | Insecure Design | Missing security headers |
| A05 | Security Misconfiguration | Default credentials |
| A06 | Vulnerable Components | Trivy/Dependency Check CVEs |
| A07 | Identification Failures | SSH password auth |
| A08 | Software Integrity | Docker build issues |
| A09 | Logging Failures | (future) |
| A10 | SSRF | (future) |

#### CWE Top 25 Mapping:
- Maps from CVE ID → CWE weakness enumeration
- Matches finding severity/type to known CWE patterns
- Output: list of `{cwe_id: "CWE-79", count: 5}`

### 1.9 API Endpoints — Full Reference

**File:** `backend/app/api/reports.py`

```
┌──────────┬──────────────────────────────────────────────────────┬─────────────────────┐
│  Method  │  Path                                                │  Description         │
├──────────┼──────────────────────────────────────────────────────┼─────────────────────┤
│  GET     │  /api/v1/projects/{id}/report-summary?scan_id={s}   │  Summary + tools     │
│  GET     │  /api/v1/projects/{id}/reports?scan_id={s}          │  Per-tool reports    │
│  GET     │  /api/v1/projects/{id}/reports/{report_id}          │  Single tool report  │
│  DELETE  │  /api/v1/projects/{id}/reports/{report_id}          │  Delete report       │
│  GET     │  /api/v1/projects/{id}/reports/unified?scan_id={s}  │  Combined JSON       │
│  GET     │  /api/v1/projects/{id}/reports/unified/export?...   │  Download HTML/PDF   │
│  GET     │  /api/v1/projects/{id}/reports/trends?days=30       │  Trends over time    │
│  GET     │  /api/v1/projects/{id}/reports/compliance?scan={s}  │  Compliance report   │
└──────────┴──────────────────────────────────────────────────────┴─────────────────────┘
```

#### GET /report-summary
**Request:** `GET /api/v1/projects/{id}/report-summary?scan_id={scan_id}`
**Response:**
```json
{
  "project_id": "uuid",
  "total_findings": 47,
  "severity": {"critical": 2, "high": 5, "medium": 13, "low": 27, "info": 0},
  "tools": [
    {"tool": "zap", "findings": 15, "critical": 1, "high": 3, "medium": 5, "low": 6, "link": "..."},
    {"tool": "trivy_fs", "findings": 12, "critical": 1, "high": 2, "medium": 3, "low": 6, "link": "..."},
    {"tool": "nmap", "findings": 1, "critical": 0, "high": 0, "medium": 0, "low": 1, "link": "..."}
  ],
  "scan_date": "2026-05-19",
  "scan_id": "uuid",
  "last_scan_id": "uuid"
}
```

#### GET /reports (list per-tool)
**Response:**
```json
[
  {
    "id": 1,
    "tool_name": "zap",
    "status": "complete",
    "findings_count": 15,
    "severity_summary": {"critical": 1, "high": 3, "medium": 5, "low": 6, "info": 0},
    "findings": [
      {"id": "F001", "severity": "High", "title": "XSS", ...},
      {"id": "F002", "severity": "Medium", "title": "Missing CSP header", ...}
    ],
    "report_url": "http://jenkins/.../zap.json"
  }
]
```

#### GET /reports/unified
**Response:**
```json
{
  "project_id": "uuid",
  "scan_id": "uuid",
  "total_findings": 47,
  "severity": {"critical": 2, "high": 5, "medium": 13, "low": 27},
  "risk_score": {
    "score": 42,
    "trend": "improving",
    "level": "Medium Risk",
    "previous_score": 58
  },
  "findings": [ ...all findings from all tools... ],
  "generated_at": "2026-05-19T12:06:00Z"
}
```

#### GET /reports/unified/export
**Query params:**
- `format`: `html` (default) or `pdf`
- `report_type`: `technical` (default), `executive`, `compliance`, or `comparison`
- `scan_id`: specific scan (defaults to latest completed)

**Response:** File download with `Content-Disposition: attachment`

#### GET /reports/trends
**Response:**
```json
[
  {"date": "2026-04-19", "critical": 5, "high": 12, "medium": 30, "low": 45},
  {"date": "2026-05-05", "critical": 3, "high": 8, "medium": 20, "low": 35},
  {"date": "2026-05-19", "critical": 2, "high": 5, "medium": 13, "low": 27}
]
```

---

## 2. Frontend In Detail

### 2.1 TypeScript Types

**File:** `src/types.ts`

#### Core Types:
```typescript
type SeveritySummary = { critical: number; high: number; medium: number; low: number; info: number }
type ToolSummary = { tool: string; findings: number; critical: number; high: number; medium: number; low: number; link?: string }
type ReportSummary = { project_id: string; total_findings: number; severity: SeveritySummary; tools: ToolSummary[] }
type Finding = { id: string; severity: string; title: string; description?: string; cve?: string; host?: string; port?: number; ... }
type ScanStage = { stage: string; status: string; summary?: string; artifact_url?: string; ... }
type UnifiedReport = { project_id: string; total_findings: number; severity: SeveritySummary; findings: Finding[]; risk_score?: { ... } }
```

#### Stage Mapping Constants:
```typescript
const FIXED_STAGES = ['git_checkout', 'sonar_scanner', 'sonar_quality_gate', 'dependency_check', ...]
const STAGE_DISPLAY_NAMES: Record<StageId, string> = { 'git_checkout': 'Git Checkout', ... }
const STAGE_DEPENDENCIES: Record<string, StageId[]> = { 'sonar_scanner': ['git_checkout'], ... }
```

### 2.2 API Service Layer

**File:** `src/services/api.ts`

```typescript
api = {
  // Project
  projects: {
    list: () => AxiosRequest,            // GET /api/v1/projects
    get: (id) => AxiosRequest,           // GET /api/v1/projects/{id}
  },
  
  // Scans
  scans: {
    getHistory: (projectId) => AxiosRequest,     // GET /api/v1/projects/{id}/scans
    get: (scanId) => AxiosRequest,               // GET /api/v1/scans/{scanId}
  },
  
  // Reports
  reports: {
    getSummary: (projectId, scanId?) => AxiosRequest,   // GET /projects/{id}/report-summary
    getAll: (projectId, scanId?) => AxiosRequest,        // GET /projects/{id}/reports
    getUnified: (projectId, scanId?) => AxiosRequest,     // GET /projects/{id}/reports/unified
    getTrends: (projectId, days=30) => AxiosRequest,      // GET /projects/{id}/reports/trends
    getCompliance: (projectId, scanId?) => AxiosRequest,  // GET /projects/{id}/reports/compliance
  },
}
```

### 2.3 ProjectReportsPage

**File:** `src/pages/ProjectReportsPage.tsx` (352 lines)

#### Data Fetching (TanStack Query):
```typescript
// Project metadata
useQuery(['project', projectId], () => api.projects.get(projectId))

// Scan history
useQuery<Scan[]>(['scanHistory', projectId], () => api.scans.getHistory(projectId))

// Current scan report summary
useQuery<ReportSummary>(['reportSummary', projectId, selectedScanId],
  () => api.reports.getSummary(projectId, selectedScanId))

// Current scan tool reports
useQuery(['reports', projectId, selectedScanId],
  () => api.reports.getAll(projectId, selectedScanId))

// Previous scan summary (for delta)
useQuery<ReportSummary>(['reportSummary', projectId, previousScanId],
  () => api.reports.getSummary(projectId, previousScanId))
```

#### Page Sections:

**Section 1: Scan Selector** (lines ~90-96)
```typescript
// Dropdown of completed scans sorted by date desc
const completedScans = scans.filter(s => s.state === 'COMPLETED')
  .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
// Auto-selects latest by default, or honors initialScanId from navigation state
```

**Section 2: Metadata Bar** (lines ~130-170)
- Project name + scan ID (truncated)
- Date/time from `currentScan.created_at`
- Duration (from scan dates)
- Mode badge: `automated` (blue) or `manual` (purple)
- Selected stages: colored badges for each stage that ran
- Back navigation button

**Section 3: Severity Cards** (lines ~173-210)
```typescript
// For each severity level (Critical, High, Medium, Low, Info):
// Show count + delta vs previous scan
const delta = (currentCount - previousCount)
// Display: "4   +2 ↑" or "4   -1 ↓"
// Color: red for increase, green for decrease, slate for unchanged
```

**Section 4: Tools Accordion Table** (lines ~215)
- Renders `<ToolsTable tools={summary?.tools} reports={reports} stages={stages} />`
- See ToolsTable details below

**Section 5: Findings Table** (lines ~220-350)
- Renders `<FindingsTable findings={allFindings} />`
- See FindingsTable details below

**Export PDF Button** (lines ~350)
```typescript
const handleExport = async () => {
  setExportLoading(true)
  // Fetch unified report as HTML blob
  const response = await api.reports.getUnifiedExport(projectId, selectedScanId, 'html', 'technical')
  const blob = new Blob([response.data], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
  URL.revokeObjectURL(url)
  setExportLoading(false)
}
```
Note: The actual export may fetch PDF by passing `format=pdf`.

### 2.4 ToolsTable Component

**File:** `src/components/reports/ToolsTable.tsx` (194 lines)

#### Props:
```typescript
interface ToolsTableProps {
  tools: ToolSummary[]          // From report-summary API
  reports: ReportDetail[]       // From reports getAll API (includes findings)
  stages?: ScanStage[]          // From scan history (for status badge)
}
```

#### Tool Config:
```typescript
const toolConfig = {
  dependency_check: { label: 'Dependency Check', type: 'SCA',       icon: 'D',  color: 'bg-blue-500' },
  zap:              { label: 'OWASP ZAP',        type: 'DAST',      icon: 'Z',  color: 'bg-violet-500' },
  nmap:             { label: 'Nmap',             type: 'Network',   icon: 'N',  color: 'bg-emerald-500' },
  trivy_fs:         { label: 'Trivy FS',         type: 'Container', icon: 'TF', color: 'bg-cyan-500' },
  trivy_image:      { label: 'Trivy Image',      type: 'Container', icon: 'TI', color: 'bg-cyan-700' },
  sonar:            { label: 'SonarQube',        type: 'SAST',      icon: 'S',  color: 'bg-orange-500' },
}
```

#### Status Determination:
```typescript
function getToolStatus(toolKey, stages):
  const stage = stages.find(s => s.stage === toolKey)
  if !stage → 'skipped'
  if FAIL/FAILED → 'fail'
  else → 'pass'
```

#### Rendering:
- Accordion panel per tool (expand/collapse)
- Each row shows: tool icon, tool label, type badge, status badge (Pass/Fail/Skipped)
- Severity pills: `{n} C` (critical), `{n} H` (high), `{n} M` (medium), `{n} L` (low)
- Finding count: `{n} findings`
- Expanded panel: list of findings with severity color, title, description, host/cve/package

#### Visual States:
- **Skipped tool**: 60% opacity, non-interactive (no accordion)
- **No findings**: Green checkmark + "No findings for this tool"
- **Has findings**: Scrollable max-h-96 list of finding cards
- **Fallback tool**: If tool not in `toolConfig`, auto-generates from snake_case name

### 2.5 FindingsTable Component

**File:** `src/components/reports/FindingsTable.tsx` (170 lines)

#### Props:
```typescript
interface FindingsTableProps {
  findings: Finding[]  // Combined from all tool reports
}
```

#### Features:
- **Search**: Text input filters by title, description, CVE, host, package
- **Severity filter**: Dropdown (All / Critical / High / Medium / Low / Info)
- **Sorting**: Click column headers (severity, title, tool, host) — toggle asc/desc
- **Severity colors**: Same color scheme as cards (red / orange / yellow / green / slate)
- **Empty state**: "No findings match your filters" message when filtered results are empty

#### Column Headers:
| Column | Function |
|--------|----------|
| Severity | Color-coded badge, sortable |
| Title | Finding title text, sortable |
| Description | Truncated description, expandable |
| CVE | CVE identifier link, sortable |
| Host | Host:port location, sortable |
| Tool | Source tool name, sortable |

### 2.6 UnifiedReportPage (standalone)

**File:** `src/pages/UnifiedReportPage.tsx`

A dedicated page that shows all findings from a single scan (or latest scan) with:
- Full risk score panel (score, level, trend, previous score)
- Complete findings table (sortable, filterable)
- Export buttons (HTML, PDF, different report types)
- Compliance tab (OWASP + CWE breakdown)

Data source: `GET /api/v1/projects/{id}/reports/unified`

### 2.7 Export PDF Mechanism

**File:** `src/pages/ProjectReportsPage.tsx` (lines ~340-350)

```typescript
const handleExport = async () => {
  setExportLoading(true)
  try {
    // Fetch from backend — backend generates the report
    const response = await api.reports.getUnifiedExport(
      projectId, selectedScanId, 'pdf', 'technical'
    )
    // Create blob from response
    const blob = new Blob([response.data], { type: 'application/pdf' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `security-report-${projectId}.pdf`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  } finally {
    setExportLoading(false)
  }
}
```

Key pattern: `URL.createObjectURL(blob)` → create hidden `<a>` → trigger click → revoke. This avoids the blob being garbage-collected before download starts.

### 2.8 Skeleton Loading States

Both `ToolsTable` and `FindingsTable` show skeleton loaders while data is being fetched:
- ToolsTable skeleton: 5-6 placeholder rows with animated pulse background
- FindingsTable skeleton: 8-10 placeholder rows
- Severity cards: 5 placeholder cards
- Scan metadata: 3 placeholder text lines

### 2.9 Empty States

- **No scans**: "No completed scans found" with scan history link
- **No reports**: "No reports generated" — shown when a scan completed but had no tool reports
- **No findings**: "No findings — all clear" per tool in accordion
- **Filter no results**: "No findings match your filters" in findings table

---

## 3. Complete Data Flow Examples

### 3.1 Automated Scan (all stages)

```
1. Scan request → Jenkins
2. Jenkins iterates through ALL stages
3. Each stage generates its artifact file → /reports/
4. Intermediate callbacks update DB status per stage
5. Post-build:
   a. archiveArtifacts → saves /reports/ to Jenkins build
   b. Final callback → backend stores stage_results, triggers Celery
6. Celery fetches artifacts:
   → /job/Security-pipeline/42/artifact/reports/zap.json
   → /job/Security-pipeline/42/artifact/reports/trivy-fs.json
   → /job/Security-pipeline/42/artifact/reports/nmap_findings.json
   → (skips tools of skipped stages)
7. Each artifact parsed → findings →  scan_reports table
8. Frontend refreshes → ProjectReportsPage shows data
```

### 3.2 Manual Scan (selected stages)

```
1. User selects: [sonar_scanner, dependency_check, zap_scan]
2. Jenkins runs only these stages (+ git_checkout automatically)
3. Only selected stages produce artifact files
4. Backend receives stage_results with only these stages
5. _getActiveTools() intersects PASS/FAIL stages with selected_stages
6. Only fetches: trivy_fs and zap (skips nmap, trivy_image, docker_*
7. Frontend ToolsTable shows only fetched tools
8. All other tools show as "Skipped" (opacity-60, disabled accordion)
```

### 3.3 Stage Failure Handling

```
1. Docker Build stage fails (both frontend Dockerfiles fail)
2. Stage result: docker_build → WARN (partial success)
3. docker_build still in PASS/FAIL set → fetcher tries to fetch
4. But docker_build has no artifact fetch (no parser registered for docker_build)
5. docker_push → depends on docker_build → no images → SKIPPED
6. trivy_image_scan → also SKIPPED (no images to scan)
7. Frontend: Docker Build shows as Pass (with WARN context from stage status)
   Docker Push and Trivy Image: "Skipped" with 60% opacity
```

---

## 4. Key Edge Cases

### 4.1 No Reports Generated
If all stages fail before producing any artifact, the Celery task runs but finds no files. The reports API returns an empty list. Frontend shows "No reports generated" state.

### 4.2 Partial Stage Failure
Some stages pass, some fail. Only PASS/FAIL stages get artifact fetches. Example:
- `dependency_check` → PASS → fetch dependency-check-report.json
- `trivy_fs_scan` → PASS → fetch trivy-fs.json
- `docker_build` → FAIL → no artifact fetch (no parser registered anyway)
- `zap_scan` → SKIPPED → no fetch

### 4.3 Jenkins Down During Fetcher
If Jenkins is unreachable during the Celery task, the fetcher returns `None` for all artifacts. Reports table remains empty. The scan status is already COMPLETED. A manual retry mechanism (re-trigger Celery task) is needed.

### 4.4 90-Day TTL
Reports auto-expire. If user views a scan >90 days old:
- Backend returns empty reports list
- Frontend shows "No reports available (expired)"
- Stage results (pass/fail/summary) still visible in scan metadata

### 4.5 Duplicate Scan Runs
If a scan is re-triggered with the same `scan_id`, the callback processing overwrites existing stage_results and triggers a new Celery task. Reports for the previous run are deleted and re-fetched (idempotent behavior).
