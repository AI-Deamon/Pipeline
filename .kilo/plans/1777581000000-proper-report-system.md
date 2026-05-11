# Plan: Proper Unified Security Report System

**Date:** 2026-05-04  
**Feature:** Unified Security Report with Visualizations & Export

---

## Problem Statement

The current report system shows findings fragmented by tool (per-tool accordions in `ProjectReportsPage.tsx`). Users need:
1. **Unified view** - All findings in a single consolidated report
2. **Visualizations** - Charts showing severity distribution and tool comparison
3. **Executive summary** - AI-generated or template-based summary
4. **Export functionality** - PDF/HTML export (reporter.py exists but not integrated)
5. **Historical comparison** - Compare findings across scans

---

## Current State Analysis

### What Exists
| Component | Status | Location |
|-----------|--------|----------|
| **reporter.py** | EXISTS but NOT INTEGRATED | `backend/nmap_system/reporter.py` (2205 lines) |
| **ai_agent.py** | EXISTS standalone | `backend/nmap_system/ai_agent.py` (365 lines) |
| **Backend API** | Partial - endpoints exist | `backend/app/api/reports.py` |
| **Report fetching** | Working | `backend/app/services/reporting/fetcher.py` |
| **Frontend summary** | Working | `DashboardPage.tsx` (badges) |
| **Frontend per-tool** | Working | `ProjectReportsPage.tsx` (accordions) |
| **PDF/HTML generation** | EXISTS in reporter.py | `HTMLReportBuilder`, `PDFReportBuilder` classes |

### What's Missing
1. **Unified report view** - Not per-tool, but consolidated
2. **Charts/visualizations** - No pie/bar charts
3. **reporter.py integration** - Not called by backend
4. **AI recommendations** - ai_agent.py not integrated
5. **Historical trends** - No comparison across scans

---

## Solution Architecture

```
┌───────────────────── JENKINS ─────────────────────┐
│  Generates findings.json, trivy-*.json, zap.json, etc.  │
│  archiveArtifacts "reports/**"                     │
└───────────────────────┬───────────────────────┘
                            │
                            │ HTTP GET (fetch artifacts)
                            ▼
┌───────────────────── BACKEND ──────────────────────┐
│                                                       │
│  POST /api/v1/scans/{id}/callback                     │
│    └── process_scan_reports_task (Celery)              │
│         ├── ReportFetcher.fetch_all_reports()           │
│         │    ├── fetch_artifact() from Jenkins         │
│         │    └── parse_tool_report() → findings[]       │
│         │                                      │
│         ├── AI Validation (NEW)                      │
│         │    └── ai_agent.py → validate findings        │
│         │                                      │
│         ├── Unified Report Generation (NEW)             │
│         │    ├── Generate severity summary                 │
│         │    ├── Build findings list (all tools)          │
│         │    ├── Generate executive summary               │
│         │    └── Store to ScanReportDB                   │
│         │                                      │
│         └── Export Generation (NEW)                    │
│              ├── Call reporter.py (moved to backend)    │
│              │    ├── HTMLReportBuilder                │
│              │    └── PDFReportBuilder                 │
│              └── Save paths to ScanReportDB             │
└───────────────────────┬───────────────────────┘
                            │
                            │ React Query
                            ▼
┌───────────────────── FRONTEND ─────────────────────┐
│                                                       │
│  /projects/:id/reports/unified (NEW PAGE)               │
│    ├── Executive Summary Section                    │
│    ├── Severity Pie Chart (Recharts)                 │
│    ├── Tool Comparison Bar Chart (Recharts)           │
│    ├── Findings Table (all tools, filterable)        │
│    ├── Historical Trend Line Chart (NEW)              │
│    └── Export Buttons (PDF/HTML/JSON)               │
│                                                       │
│  /projects/:id/reports/:tool (EXISTING - keep)       │
│    └── Per-tool accordions (for drill-down)          │
└───────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Integrate reporter.py into Backend (2 days)

#### 1.1 Move and Refactor reporter.py
**File:** `backend/app/services/reporting/reporter.py` (new)

- Move `backend/nmap_system/reporter.py` to `backend/app/services/reporting/`
- Refactor to accept `List[SecurityFinding]` instead of reading files
- Create class `UnifiedReportGenerator`:
  ```python
  class UnifiedReportGenerator:
      def __init__(self, project_id: str, scan_id: str, findings: List[SecurityFinding]):
          self.project_id = project_id
          self.scan_id = scan_id
          self.findings = findings
          self.severity_summary = calculate_severity_summary(findings)
  
      def generate_html(self) -> str:
          """Generate standalone HTML report"""
          # Adapt HTMLReportBuilder from reporter.py
  
      def generate_pdf(self) -> bytes:
          """Generate PDF report using ReportLab"""
          # Adapt PDFReportBuilder from reporter.py
  
      def generate_executive_summary(self) -> str:
          """Generate text summary"""
          # Use ai_agent.py or template-based
  ```

#### 1.2 Integrate ai_agent.py
**File:** `backend/app/services/reporting/ai_validator.py` (new)

- Move `backend/nmap_system/ai_agent.py` logic
- Create `AIValidator` class:
  ```python
  class AIValidator:
      def __init__(self, ollama_url: str = "http://localhost:11434"):
          self.ollama_url = ollama_url
    
      async def validate_finding(self, finding: SecurityFinding) -> bool:
          """Use Ollama to validate if finding is real"""
      
      async def generate_recommendation(self, finding: SecurityFinding) -> str:
          """Generate AI-powered fix recommendation"""
      
      async def generate_executive_summary(self, findings: List[SecurityFinding]) -> str:
          """Generate overall summary using AI"""
  ```

#### 1.3 Update ReportFetcher
**File:** `backend/app/services/reporting/fetcher.py`

- Add AI validation step after parsing:
  ```python
  async def fetch_and_process_tool(...):
      raw_json = await self.fetch_artifact(filename)
      findings = self.parse_tool_report(tool_name, raw_json)
  
      # NEW: AI validation (optional, based on setting)
      if settings.ENABLE_AI_VALIDATION:
          validator = AIValidator()
          for finding in findings:
              finding["confirmed"] = await validator.validate_finding(finding)
              finding["recommendation"] = await validator.generate_recommendation(finding)
      
      return findings
  ```

#### 1.4 Update process_scan_reports_task
**File:** `backend/app/tasks/report_tasks.py`

- After fetching all reports, generate unified report:
  ```python
  @celery_app.task
  def process_scan_reports_task(scan_id, jenkins_build_number, jenkins_base_url):
      # ... existing code ...
      
      # NEW: Generate unified report
      all_findings = []
      for report in reports:
          all_findings.extend(report.findings)
      
      generator = UnifiedReportGenerator(project_id, scan_id, all_findings)
      
      # Generate exports
      html_content = generator.generate_html()
      pdf_bytes = generator.generate_pdf()
      
      # Save to storage
      html_path = save_to_storage(f"{scan_id}.html", html_content)
      pdf_path = save_to_storage(f"{scan_id}.pdf", pdf_bytes)
      
      # Update ScanReportDB with export paths
      # ...
  ```

---

### Phase 2: Backend API Enhancements (1 day)

#### 2.1 New Unified Report Endpoint
**File:** `backend/app/api/reports.py`

```python
@router.get("/projects/{project_id}/reports/unified")
def get_unified_report(project_id: str, scan_id: Optional[str] = None, db: Session = Depends(get_db)):
    """Get unified report combining all tools"""
    # If scan_id provided, get that scan's unified report
    # Otherwise, get latest completed scan
    # Return: UnifiedReportResponse with all findings + summary

@router.get("/projects/{project_id}/reports/unified/export")
def export_unified_report(project_id: str, format: str = "html", scan_id: Optional[str] = None):
    """Export unified report as HTML or PDF"""
    # Stream file to client

@router.get("/projects/{project_id}/reports/history")
def get_report_history(project_id: str, limit: int = 10, db: Session = Depends(get_db)):
    """Get historical report summaries for trend analysis"""
    # Return: List of ReportSummary objects with dates
```

#### 2.2 Update ReportDetail Model
**File:** `backend/app/models/db_models.py`

```python
class ScanReportDB(Base):
    # ... existing fields ...
    unified_html_path = Column(String, nullable=True)
    unified_pdf_path = Column(String, nullable=True)
    executive_summary = Column(String, nullable=True)
    ai_validated = Column(Boolean, default=False)
```

---

### Phase 3: Frontend Unified Report Page (3 days)

#### 3.1 New Page: UnifiedReportPage.tsx
**File:** `src/pages/UnifiedReportPage.tsx` (new)

**Components:**

| Section | Description | Library |
|---------|-------------|---------|
| **Executive Summary** | Text summary + risk score | Plain text |
| **Severity Pie Chart** | Shows critical/high/medium/low distribution | Recharts |
| **Tool Comparison Bar Chart** | Findings count per tool | Recharts |
| **Findings Table** | Filterable table with all findings | TanStack Table |
| **Historical Trend** | Line chart showing findings over time | Recharts |
| **Export Buttons** | Download PDF/HTML/JSON | HTML <a> download |

**Charts Implementation:**

```typescript
// Severity Pie Chart
import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';

const SEVERITY_COLORS = {
  critical: '#dc2626',  // red-600
  high: '#ea580c',      // orange-600
  medium: '#ca8a04',    // yellow-600
  low: '#16a34a',      // green-600
};

<PieChart width={400} height={300}>
  <Pie
    data={[
      { name: 'Critical', value: summary.critical },
      { name: 'High', value: summary.high },
      { name: 'Medium', value: summary.medium },
      { name: 'Low', value: summary.low },
    ]}
    dataKey="value"
    nameKey="name"
  >
    {data.map((entry, index) => (
      <Cell key={index} fill={SEVERITY_COLORS[entry.name.toLowerCase()]} />
    ))}
  </Pie>
</PieChart>
```

#### 3.2 Update Router
**File:** `src/App.tsx`

```typescript
<Route path="/projects/:projectId/reports/unified" element={<UnifiedReportPage />} />
```

#### 3.3 Update API Service
**File:** `src/services/api.ts`

```typescript
reports: {
  // ... existing methods ...
  getUnified: async (projectId: string, scanId?: string) => {
    const url = scanId 
      ? `/reports/projects/${projectId}/reports/unified?scan_id=${scanId}`
      : `/reports/projects/${projectId}/reports/unified`;
    const response = await apiClient.get(url);
    return response.data;
  },
  exportUnified: async (projectId: string, format: 'html' | 'pdf') => {
    const response = await apiClient.get(
      `/reports/projects/${projectId}/reports/unified/export?format=${format}`,
      { responseType: 'blob' }
    );
    return response.data;
  },
}
```

---

### Phase 4: Historical Comparison (2 days)

#### 4.1 Backend Trend API
**File:** `backend/app/api/reports.py`

```python
@router.get("/projects/{project_id}/reports/trends")
def get_report_trends(project_id: str, days: int = 30, db: Session = Depends(get_db)):
    """Get findings trends over time"""
    # Query ScanReportDB for last N days
    # Return: List of { date, critical, high, medium, low }
```

#### 4.2 Frontend Trend Chart
**File:** `src/pages/UnifiedReportPage.tsx`

```typescript
// Line Chart for Historical Trends
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

<LineChart width={800} height={300} data={trendData}>
  <XAxis dataKey="date" />
  <YAxis />
  <CartesianGrid strokeDasharray="3 3" />
  <Tooltip />
  <Line type="monotone" dataKey="critical" stroke="#dc2626" />
  <Line type="monotone" dataKey="high" stroke="#ea580c" />
  <Line type="monotone" dataKey="medium" stroke="#ca8a04" />
  <Line type="monotone" dataKey="low" stroke="#16a34a" />
</LineChart>
```

---

### Phase 5: Export & Download (1 day)

#### 5.1 Backend Export Endpoint
Already partially exists in Phase 2.1 - enhance:

```python
@router.get("/reports/{report_id}/export")
def export_report(report_id: int, format: str = "json", db: Session = Depends(get_db)):
    """Export single tool report"""
    # JSON: return raw_report
    # HTML: return unified_html_path content
    # PDF: return unified_pdf_path content
```

#### 5.2 Frontend Download Handler
**File:** `src/pages/UnifiedReportPage.tsx`

```typescript
const handleExport = async (format: 'pdf' | 'html' | 'json') => {
  try {
    const blob = await api.reports.exportUnified(projectId, format);
    const url = window.URL.createObjectURL(new Blob([blob]));
    const link = document.createElement('a');
    link.href = url;
    link.download = `security-report-${projectId}.${format}`;
    link.click();
  } catch (error) {
    addToast({ type: 'error', title: 'Export Failed' });
  }
};
```

---

## File Changes Summary

### New Files
| File | Purpose |
|------|---------|
| `backend/app/services/reporting/reporter.py` | Refactored from nmap_system/reporter.py |
| `backend/app/services/reporting/ai_validator.py` | Refactored from nmap_system/ai_agent.py |
| `src/pages/UnifiedReportPage.tsx` | New unified report page |
| `src/components/SeverityPieChart.tsx` | Recharts pie chart |
| `src/components/ToolBarChart.tsx` | Recharts bar chart |
| `src/components/TrendLineChart.tsx` | Recharts line chart |

### Modified Files
| File | Changes |
|------|---------|
| `backend/app/services/reporting/fetcher.py` | Add AI validation step |
| `backend/app/tasks/report_tasks.py` | Generate unified report after fetching |
| `backend/app/api/reports.py` | Add unified report + trends endpoints |
| `backend/app/models/db_models.py` | Add unified export paths to ScanReportDB |
| `src/services/api.ts` | Add getUnified + exportUnified methods |
| `src/App.tsx` | Add route for /reports/unified |
| `src/types.ts` | Add UnifiedReport type |

### Deleted Files
| File | Reason |
|------|--------|
| `backend/nmap_system/reporter.py` | Moved to backend |
| `backend/nmap_system/ai_agent.py` | Moved to backend |

---

## UI Mockup (UnifiedReportPage.tsx)

```
+─────────────────────────────────────────────────────────────+
|  Security Report - Project: MyApp                              |
+─────────────────────────────────────────────────────────────+
|                                                                 |
|  [Back to Project]     [Export: PDF ▼] [Export: HTML]    |
|                                                                 |
|  +───────────────+ +───────────────+ +───────────────+  |
|  | Critical       | | High           | | Medium         |  |
|  | 3             | | 12            | | 45            |  |
|  +───────────────+ +───────────────+ +───────────────+  |
|                                                                 |
|  +───────────────────────────────────────────────+          |
|  | Executive Summary                                |          |
|  | This report presents the results of the security     |          |
|  | assessment conducted on 2026-05-04.            |          |
|  | The assessment identified 60 security findings:     |          |
|  | 3 critical, 12 high, 45 medium. Immediate    |          |
|  | review is recommended for critical findings.         |          |
|  +───────────────────────────────────────────────+          |
|                                                                 |
|  +──────────────────+ +──────────────────────────+       |
|  | Severity Pie     | | Tool Comparison Bar          |       |
|  | Chart             | | Chart                         |       |
|  |     [pie]        | |     [bar]                    |       |
|  +──────────────────+ +──────────────────────────+       |
|                                                                 |
|  +───────────────────────────────────────────────+          |
|  | Historical Trend (Last 30 Days)                  |          |
|  |     [line chart with dates]                      |          |
|  +───────────────────────────────────────────────+          |
|                                                                 |
|  Findings Table (60 total)                             |
|  +────────+────────+────────+────────+──────────+    |
|  | Severity| Title          | Tool    | Host      |    |
|  +────────+────────+────────+────────+──────────+    |
|  | [CRIT] | CVE-2024-xxx | Nmap    | 10.0.0.1  |    |
|  | [HIGH]  | SSL Weak Cipher | Trivy   | -          |    |
|  | ... 58 more rows ...                              |    |
|  +────────+────────+────────+────────+──────────+    |
+─────────────────────────────────────────────────────────────+
```

---

## Acceptance Criteria

1. ✅ **Unified view** - Single page shows all findings (not per-tool accordions)
2. ✅ **Charts** - Severity pie chart + tool comparison bar chart
3. ✅ **Executive summary** - Text summary at top (AI-generated or template)
4. ✅ **Export** - PDF and HTML export buttons work
5. ✅ **Historical trends** - Line chart shows findings over time
6. ✅ **AI validation** - Findings marked as confirmed/unconfirmed
7. ✅ **Filtering** - Filter findings table by severity/tool
8. ✅ **Backward compatible** - Old per-tool page still works

---

## Estimated Effort

| Phase | Task | Effort |
|-------|------|--------|
| 1 | Integrate reporter.py + ai_agent.py | 2 days |
| 2 | Backend API enhancements | 1 day |
| 3 | Frontend UnifiedReportPage | 3 days |
| 4 | Historical comparison | 2 days |
| 5 | Export & download | 1 day |
| **Total** | | **9 days** |

---

## Open Questions

1. **AI Model**: Should we use Ollama (local) or call external API (OpenAI/Claude)?
   - *Recommendation*: Start with Ollama (free, local), make configurable

2. **Chart Library**: Recharts (already in project?) or Chart.js?
   - *Recommendation*: Recharts (more React-native, less config)

3. **Storage for exports**: Local filesystem or S3-compatible?
   - *Recommendation*: Local filesystem first (`storage/reports/`), add S3 later

4. **Historical retention**: How many scans to compare?
   - *Recommendation*: Last 10 scans or last 30 days

---

## Success Metrics

- [ ] User can view unified report with all findings
- [ ] Charts render correctly with real data
- [ ] PDF export generates valid file < 5MB
- [ ] HTML export opens correctly in browser
- [ ] Historical trend shows at least 2 data points
- [ ] AI validation marks findings as confirmed/unconfirmed
- [ ] Export buttons download files without errors

---

## 🐛 Critical Bug Fix: Trivy Image Scan Report

### Problem
The Trivy Image scan stage generates **dynamic filenames** per image:
```bash
# Jenkinsfile line 383
trivy image --format json -o reports/trivy-image-$(echo ${safeTag} | md5sum | cut -d' ' -f1).json ${safeTag}
```

But `fetcher.py:149` tries to fetch a **static filename**:
```python
("trivy_image", "trivy-image.json"),  # ❌ File doesn't exist!
```

### Solution Options

#### Option A: Change Jenkins to use static filename (Recommended)
**File:** `Agent/Jenkinsfile` (line 383)

```groovy
// Change from:
sh "/home/kali_linux/.local/bin/trivy image --format json -o reports/trivy-image-\$(echo ${safeTag} | md5sum | cut -d' ' -f1).json ${safeTag} || true"

// Change to:
sh "/home/kali_linux/.local/bin/trivy image --format json -o reports/trivy-image.json ${safeTag} || true"

// If multiple images, append:
if (scannedImages.size() > 1) {
    sh "cat reports/trivy-image-*.json > reports/trivy-image-all.json || true"
}
```

**Pros:** Simple, matches backend expectation  
**Cons:** If multiple images, overwrites; need to merge

#### Option B: Update backend to fetch dynamic filenames (Better for multiple images)
**File:** `backend/app/services/reporting/fetcher.py`

```python
async def fetch_trivy_image_reports(self, scan_id, project_id):
    """Fetch all trivy-image-*.json files from Jenkins"""
    # List artifacts via Jenkins API
    url = f"{self.jenkins_base_url}/job/{settings.JENKINS_TOKEN}/{self.jenkins_build_number}/api/json"
    async with httpx.AsyncClient() as client:
        response = await client.get(url)
        data = response.json()
        
        trivy_files = [
            a['relativePath'] for a in data.get('artifacts', [])
            if 'trivy-image-' in a['relativePath'] and a['relativePath'].endswith('.json')
        ]
        
        all_findings = []
        for filename in trivy_files:
            raw_json = await self.fetch_artifact(filename)
            if raw_json:
                findings = parse_trivy_image_report(raw_json)
                all_findings.extend(findings)
        
        # Store merged report
        # ...
```

**Pros:** Handles multiple images correctly  
**Cons:** More complex, needs Jenkins API call

#### Option C: Archive as tar.gz (Simple for multiple)
**File:** `Agent/Jenkinsfile`

```groovy
// After all images scanned:
sh "tar -czf reports/trivy-image-scans.tar.gz reports/trivy-image-*.json || true"
```

Then backend extracts and parses all.

### Recommendation: Option A (Simple Fix)
1. Change Jenkins to output static `reports/trivy-image.json`
2. If multiple images, merge JSON arrays in Jenkins:
   ```bash
   # Merge all trivy-image-*.json into one
   echo '[' > reports/trivy-image.json
   for f in reports/trivy-image-*.json; do
       # Extract Results array and append
       jq '.Results' "$f" >> reports/trivy-image.json
   done
   echo ']' >> reports/trivy-image.json
   ```

---

## Report Availability Summary

| Tool | Jenkins Generates | Backend Fetches | Status |
|------|-------------------|-------------------|--------|
| **Trivy FS** | `reports/trivy-fs.json` | `trivy-fs.json` | ✅ Working |
| **Trivy Image** | `reports/trivy-image-<md5>.json` | `trivy-image.json` | ❌ **BUG** |
| **ZAP** | `reports/zap.json` | `zap.json` | ✅ Working |
| **Dependency Check** | `reports/dependency-check.json` | `dependency-check.json` | ✅ Working |
| **Nmap** | `reports/nmap_findings.json` | `nmap_findings.json` | ✅ Working |
| **Docker Build** | N/A (build stage) | N/A | ℹ️ Not a report |
| **SonarQube** | N/A (link only) | Creates dashboard link | ℹ️ Link only |

---

## Updated Phase 0: Fix Trivy Image Bug (0.5 day)

**Before Phase 1** (integrating reporter.py), fix the Trivy Image bug:

### File Changes

| File | Change |
|------|--------|
| `Agent/Jenkinsfile` | Change line 383 to use static `trivy-image.json` filename |
| `backend/app/services/reporting/fetcher.py` | (no change needed if Jenkins fixed) |

### Verification
```bash
# Run a scan with Docker images
# Check Jenkins workspace: ls -la reports/
# Should see: trivy-image.json (static name)
# Backend should now fetch it correctly
```

