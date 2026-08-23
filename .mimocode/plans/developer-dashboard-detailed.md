# Detailed Plan: Developer Dashboard with SonarQube Data

## Overview

Build a developer-focused view accessible from the per-scan per-project report. This view pulls rich data from SonarQube API to help developers understand and fix issues faster, similar to SonarQube's native issue detail view.

---

## Context

### Three-View Architecture

| View | Route | Audience | Focus |
|------|-------|----------|-------|
| DashboardPage | `/dashboard` | Everyone | Project list, stats cards |
| Reports Per Project | `/projects/:id/reports` | Managers | Scan details, severity, compliance |
| **Developer Report** | `/projects/:id/reports/:scanId/developer` | **Developers** | **File-centric, fix guidance** |

### User Flow

```
ProjectReportsPage (Manager View)
    │
    ├── [Developer View] Button (in left panel actions)
    │       │
    │       ▼
    └── DeveloperReportPage (Developer View)
            ├── File Health (coverage, complexity, duplication)
            ├── File Issues (grouped by file)
            ├── Issue Detail (code snippet, fix guidance)
            └── Quality Gate Status
```

---

## SonarQube API Endpoints

### Currently Used

| Endpoint | Method | Data |
|----------|--------|------|
| `/api/issues/search` | GET | Issues (bugs, vulns, code smells) |
| `/api/hotspots/search` | GET | Security hotspots |
| `/api/rules/show` | GET | Rule metadata (description, recommendation) |

### NEW: For Developer Dashboard

| Endpoint | Method | Data | Purpose |
|----------|--------|------|---------|
| `/api/measures/component` | GET | Coverage, complexity, duplication, ncloc | File health metrics |
| `/api/qualitygates/project_status` | GET | Gate status, conditions | Quality gate pass/fail |
| `/api/sources/show` | GET | Source code with line numbers | Inline code view |
| `/api/issues/search` | GET | Issues filtered by component | Issues per file |

### Authentication

All SonarQube API calls use HTTP Basic Auth:
- Username: `SONARQUBE_TOKEN` (from env)
- Password: empty string

---

## Backend Implementation

### 1. Add `fetch_sonar_measures()` Function

**File**: `backend/app/services/reporting/parsers/sonar.py`

```python
async def fetch_sonar_measures(
    sonar_key: str,
    component_key: str
) -> dict:
    """
    Fetch code measures for a specific component (file).
    
    Returns:
        {
            "coverage": "78.5",
            "complexity": "15",
            "cognitive_complexity": "12",
            "duplicated_lines_density": "3.2",
            "ncloc": "311"
        }
    """
    url = f"{get_sonar_protocol()}://{get_sonar_url()}/api/measures/component"
    params = {
        "component": component_key,
        "metricKeys": "coverage,complexity,cognitive_complexity,duplicated_lines_density,ncloc"
    }
    # ... HTTP request with auth ...
```

### 2. Add `fetch_sonar_quality_gate()` Function

**File**: `backend/app/services/reporting/parsers/sonar.py`

```python
async def fetch_sonar_quality_gate(sonar_key: str) -> dict:
    """
    Fetch quality gate status for a project.
    
    Returns:
        {
            "status": "OK",  # or "ERROR"
            "conditions": [
                {"metric": "coverage", "status": "OK", "actual": "78.5"},
                {"metric": "duplicated_lines", "status": "ERROR", "actual": "3.2"}
            ]
        }
    """
    url = f"{get_sonar_protocol()}://{get_sonar_url()}/api/qualitygates/project_status"
    params = {"projectKey": sonar_key}
    # ... HTTP request with auth ...
```

### 3. Add `fetch_sonar_source()` Function

**File**: `backend/app/services/reporting/parsers/sonar.py`

```python
async def fetch_sonar_source(component_key: str) -> list:
    """
    Fetch source code for a component.
    
    Returns:
        [
            {"line": 1, "code": "function parseInput(data) {"},
            {"line": 2, "code": "  const lines = data.split('\\n');"},
            ...
        ]
    """
    url = f"{get_sonar_protocol()}://{get_sonar_url()}/api/sources/show"
    params = {"key": component_key}
    # ... HTTP request with auth ...
```

### 4. Add Developer Dashboard API Endpoint

**File**: `backend/app/api/reports.py`

```python
@router.get("/projects/{project_id}/reports/{scan_id}/developer")
async def get_developer_report(
    project_id: str,
    scan_id: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Aggregated developer report for a specific scan.
    
    Returns:
        {
            "project_id": "...",
            "scan_id": "...",
            "quality_gate": {"status": "OK", "conditions": [...]},
            "files": [
                {
                    "file_path": "src/components/Layout.tsx",
                    "component_key": "sentinel-bfd7ff:src/components/Layout.tsx",
                    "measures": {"coverage": "78", "complexity": "15", ...},
                    "issues": [
                        {
                            "id": "SONAR-123",
                            "line": 109,
                            "message": "Click handler without keyboard...",
                            "severity": "Minor",
                            "effort": "5min",
                            "type": "Bug",
                            "rule": "typescript:S1082"
                        }
                    ]
                }
            ],
            "summary": {
                "total_files": 15,
                "files_with_issues": 8,
                "total_issues": 45
            }
        }
    """
```

---

## Frontend Implementation

### 1. Create DeveloperReportPage

**File**: `src/pages/DeveloperReportPage.tsx`

```tsx
// Side panel layout
// Left panel: file list with health metrics
// Right panel: selected file's issues with detail

const DeveloperReportPage = () => {
  const { projectId, scanId } = useParams();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  
  // Fetch developer report data
  const { data: report } = useQuery({
    queryKey: ['developerReport', projectId, scanId],
    queryFn: () => api.reports.getDeveloperReport(projectId!, scanId!),
  });
  
  return (
    <ProjectReportLayout
      scanInfo={...}
      severity={...}
      tools={...}
      projectId={projectId}
    >
      {/* File list in left panel */}
      {/* File health + issues in right panel */}
    </ProjectReportLayout>
  );
};
```

### 2. Create FileHealthCard Component

**File**: `src/components/reports/FileHealthCard.tsx`

```tsx
// Displays file health metrics
// - Coverage percentage with progress bar
// - Complexity level (low/medium/high)
// - Duplication percentage
// - Lines of code
// - Issue count badge

const FileHealthCard = ({ file, measures, issueCount }) => (
  <div className="bg-white rounded-xl border p-4">
    <h3 className="font-medium">{file}</h3>
    <div className="space-y-2">
      <MetricBar label="Coverage" value={measures.coverage} />
      <MetricBar label="Complexity" value={measures.complexity} />
      <MetricBar label="Duplication" value={measures.duplicated_lines_density} />
    </div>
    <div className="mt-2 text-sm text-slate-500">
      {issueCount} issues
    </div>
  </div>
);
```

### 3. Create IssueDetailPanel Component

**File**: `src/components/reports/IssueDetailPanel.tsx`

```tsx
// Shows full issue detail similar to SonarQube
// - Issue title and description
// - Rule key and type
// - Severity and effort
// - Code snippet with line highlighting
// - Fix guidance (WHERE, WHY, HOW)
// - Link to SonarQube

const IssueDetailPanel = ({ issue, codeSnippet }) => (
  <div className="bg-white rounded-xl border p-4">
    <div className="flex items-center gap-2 mb-2">
      <SeverityBadge severity={issue.severity} />
      <span className="font-medium">{issue.title}</span>
    </div>
    <div className="text-sm text-slate-500 mb-4">
      {issue.rule} • {issue.effort} • {issue.type}
    </div>
    <CodeSnippet lines={codeSnippet} highlightLine={issue.line} />
    <div className="mt-4 space-y-2">
      <FixGuidanceSection title="Where is the issue?" content={issue.where} />
      <FixGuidanceSection title="Why is this an issue?" content={issue.why} />
      <FixGuidanceSection title="How can I fix it?" content={issue.how} />
    </div>
  </div>
);
```

### 4. Create QualityGateCard Component

**File**: `src/components/reports/QualityGateCard.tsx`

```tsx
// Shows quality gate status
// - Pass/Fail indicator
// - List of conditions with actual values

const QualityGateCard = ({ gate }) => (
  <div className="bg-white rounded-xl border p-4">
    <div className="flex items-center gap-2 mb-3">
      {gate.status === 'OK' ? (
        <CheckCircle className="w-5 h-5 text-green-600" />
      ) : (
        <XCircle className="w-5 h-5 text-red-600" />
      )}
      <span className="font-medium">
        Quality Gate: {gate.status === 'OK' ? 'PASSED' : 'FAILED'}
      </span>
    </div>
    <div className="space-y-2">
      {gate.conditions.map((cond) => (
        <div key={cond.metric} className="flex items-center justify-between text-sm">
          <span>{cond.metric}</span>
          <span className={cond.status === 'OK' ? 'text-green-600' : 'text-red-600'}>
            {cond.actual}
          </span>
        </div>
      ))}
    </div>
  </div>
);
```

### 5. Add "Developer View" Button to ProjectReportsPage

**File**: `src/pages/ProjectReportsPage.tsx`

Add button in left panel actions:

```tsx
// In ProjectReportLayout actions section
<a
  href={`/projects/${projectId}/reports/${selectedScanId}/developer`}
  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition-colors"
>
  <Code className="w-4 h-4" />
  Developer View
</a>
```

### 6. Register Route

**File**: `src/App.tsx`

```tsx
const DeveloperReportPage = lazy(() => import('./pages/DeveloperReportPage'));

// Add route
<Route
  path="/projects/:projectId/reports/:scanId/developer"
  element={
    <Suspense fallback={<PageLoader />}>
      <DeveloperReportPage />
    </Suspense>
  }
/>
```

---

## API Client Updates

**File**: `src/services/api.ts`

```typescript
reports: {
  // ... existing methods ...
  
  getDeveloperReport: async (projectId: string, scanId: string) => {
    const response = await apiClient.get(
      `/reports/projects/${projectId}/reports/${scanId}/developer`
    );
    return response.data;
  },
  
  getFileMeasures: async (componentKey: string) => {
    const response = await apiClient.get(
      `/reports/file-measures/${encodeURIComponent(componentKey)}`
    );
    return response.data;
  },
}
```

---

## Types

**File**: `src/types.ts`

```typescript
export type FileHealth = {
  file_path: string;
  component_key: string;
  measures: {
    coverage: string;
    complexity: string;
    cognitive_complexity: string;
    duplicated_lines_density: string;
    ncloc: string;
  };
  issues: DeveloperIssue[];
};

export type DeveloperIssue = {
  id: string;
  line: number;
  message: string;
  severity: string;
  effort: string;
  type: string;
  rule: string;
  rule_name: string;
  description: string;
  recommendation: string;
};

export type QualityGate = {
  status: 'OK' | 'ERROR';
  conditions: QualityGateCondition[];
};

export type QualityGateCondition = {
  metric: string;
  status: 'OK' | 'ERROR';
  actual: string;
  expected: string;
};

export type DeveloperReport = {
  project_id: string;
  scan_id: string;
  quality_gate: QualityGate;
  files: FileHealth[];
  summary: {
    total_files: number;
    files_with_issues: number;
    total_issues: number;
  };
};
```

---

## File Summary

| File | Action | Lines (est.) |
|------|--------|--------------|
| `backend/app/services/reporting/parsers/sonar.py` | Modify | +100 |
| `backend/app/api/reports.py` | Modify | +80 |
| `src/pages/DeveloperReportPage.tsx` | **Create** | ~200 |
| `src/components/reports/FileHealthCard.tsx` | **Create** | ~80 |
| `src/components/reports/IssueDetailPanel.tsx` | **Create** | ~120 |
| `src/components/reports/QualityGateCard.tsx` | **Create** | ~60 |
| `src/pages/ProjectReportsPage.tsx` | Modify | +10 |
| `src/App.tsx` | Modify | +15 |
| `src/services/api.ts` | Modify | +20 |
| `src/types.ts` | Modify | +50 |

---

## Verification

1. **Backend**: `pytest tests/ -v` — all tests pass
2. **Frontend**: `npm run build` — no TypeScript errors
3. **Manual Testing**:
   - Navigate to `/projects/:id/reports`
   - Click "Developer View" button
   - Verify file list with health metrics displays
   - Click file to see issues
   - Click issue to see detail with code snippet
   - Verify quality gate status shows
   - Click "← Manager View" to return

---

## Timeline

| Step | Task | Est. Time |
|------|------|-----------|
| 1 | Backend: Add SonarQube measures endpoint | 1 hour |
| 2 | Backend: Add developer dashboard API | 1 hour |
| 3 | Frontend: Create DeveloperReportPage | 2 hours |
| 4 | Frontend: Create FileHealthCard | 30 min |
| 5 | Frontend: Create IssueDetailPanel | 1 hour |
| 6 | Frontend: Create QualityGateCard | 30 min |
| 7 | Frontend: Add button + route | 30 min |
| 8 | Testing and verification | 1 hour |
| **Total** | | **~7 hours** |
