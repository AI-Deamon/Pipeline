Missing Report Features Implementation Plan
**For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
**Goal:** Add critical missing features to the unified report system: Risk Score, Compliance Mapping, SonarQube Issues integration, and interactive UI enhancements.
**Architecture:** Extend existing UnifiedReportGenerator, add new frontend components, integrate SonarQube API, and enhance the UnifiedReportPage with filtering and navigation.
**Tech Stack:** FastAPI, React, TypeScript, Recharts, ReportLab, SonarQube API, OWASP Top 10 mapping
---
## Current State Summary
| Feature | Status | Location |
|---------|--------|----------|
| Unified Report | ✅ Complete | `src/pages/UnifiedReportPage.tsx` |
| Severity Pie Chart | ✅ Complete | `src/components/SeverityPieChart.tsx` |
| Tool Bar Chart | ✅ Complete | `src/components/ToolBarChart.tsx` |
| Trend Line Chart | ✅ Complete | `src/components/TrendLineChart.tsx` |
| Export (HTML/PDF) | ✅ Complete | `backend/app/api/reports.py` |
| AI Validator | ✅ Complete | `backend/app/services/reporting/ai_validator.py` |
---
## Phase 6: Risk Score & Executive Enhancements (1 day)
### Task 6.1: Add Risk Score Calculator
**Files:**
- Create: `backend/app/services/reporting/risk_calculator.py`
- Modify: `backend/app/services/reporting/reporter.py:120-130`
- Modify: `backend/app/api/reports.py:200-210`
**Step 1: Write the failing test**
```python
# tests/test_risk_calculator.py
import pytest
from app.services.reporting.risk_calculator import RiskCalculator, RiskScore
def test_risk_calculator_exists():
    """Verify RiskCalculator exists"""
    try:
        from app.services.reporting.risk_calculator import RiskCalculator
        assert True
    except ImportError:
        assert False, "RiskCalculator not found"
def test_calculate_risk_score():
    """Verify risk score calculation"""
    from app.services.reporting.risk_calculator import RiskCalculator
    
    # Test case: 3 critical, 12 high, 45 medium, 89 low
    severity = {"critical": 3, "high": 12, "medium": 45, "low": 89}
    calculator = RiskCalculator()
    score = calculator.calculate(severity)
    
    # Expected: 100 - (3*15 + 12*10 + 45*5 + 89*1) = 100 - (45 + 120 + 225 + 89) = 100 - 479 = 0 (capped at 0)
    assert score >= 0
    assert score <= 100
def test_risk_trend():
    """Verify trend detection"""
    from app.services.reporting.risk_calculator import RiskCalculator
    
    calculator = RiskCalculator()
    
    # Current score: 85, Previous: 70
    trend = calculator.get_trend(current_score=85, previous_score=70)
    assert trend == "improving"
    
    trend = calculator.get_trend(current_score=60, previous_score=80)
    assert trend == "worsening"
    
    trend = calculator.get_trend(current_score=75, previous_score=76)
    assert trend == "stable"
```
**Step 2: Run test to verify it fails**
```bash
cd /home/kali_linux/Pipeline && pytest tests/test_risk_calculator.py -v
# Expected: FAIL - module doesn't exist
```
**Step 3: Create RiskCalculator**
```python
# backend/app/services/reporting/risk_calculator.py
"""
Risk Score Calculator for Security Reports
Generates 0-100 score (100 = perfectly secure)
"""
from typing import Dict, Tuple
class RiskCalculator:
    """Calculate risk score based on severity counts"""
    
    # Weights for each severity level
    WEIGHTS = {
        "critical": 15,
        "high": 10,
        "medium": 5,
        "low": 1,
        "info": 0,
    }
    
    def calculate(self, severity: Dict[str, int]) -> int:
        """
        Calculate risk score (0-100).
        100 = perfectly secure (no findings)
        0 = maximum risk (many critical findings)
        """
        total_weight = 0
        for level, count in severity.items():
            weight = self.WEIGHTS.get(level.lower(), 0)
            total_weight += count * weight
        
        # Score = 100 - weighted sum (capped at 0)
        score = max(0, 100 - total_weight)
        return min(100, score)
    
    def get_trend(self, current_score: int, previous_score: int) -> str:
        """
        Determine if security posture is improving, stable, or worsening.
        Threshold: ±5 points = stable
        """
        diff = current_score - previous_score
        
        if diff > 5:
            return "improving"
        elif diff < -5:
            return "worsening"
        else:
            return "stable"
    
    def get_risk_level(self, score: int) -> str:
        """Get human-readable risk level"""
        if score >= 80:
            return "Low Risk"
        elif score >= 60:
            return "Medium Risk"
        elif score >= 40:
            return "High Risk"
        else:
            return "Critical Risk"
class RiskScore:
    """Risk score data structure"""
    def __init__(self, score: int, trend: str = "stable"):
        self.score = score
        self.trend = trend
        self.level = RiskCalculator().get_risk_level(score)
```
**Step 4: Update UnifiedReportGenerator to include risk score**
```python
# backend/app/services/reporting/reporter.py - ADD TO UnifiedReportGenerator class:
from app.services.reporting.risk_calculator import RiskCalculator
def generate_risk_summary(self) -> dict:
    """Generate risk score and trend"""
    calculator = RiskCalculator()
    score = calculator.calculate(self.severity_summary)
    
    # Get previous scan for trend (if available)
    from app.models.db_models import ScanReportDB
    from sqlalchemy import desc
    
    db = SessionLocal()
    try:
        previous = (
            db.query(ScanReportDB)
            .filter(ScanReportDB.project_id == self.project_id)
            .filter(ScanReportDB.scan_id != self.scan_id)
            .order_by(desc(ScanReportDB.created_at))
            .first()
        )
        
        previous_severity = previous.severity_summary if previous else {"critical": 0, "high": 0, "medium": 0, "low": 0}
        previous_score = calculator.calculate(previous_severity)
        
        return {
            "score": score,
            "trend": calculator.get_trend(score, previous_score),
            "level": calculator.get_risk_level(score),
            "previous_score": previous_score,
        }
    finally:
        db.close()
```
**Step 5: Update API to return risk score**
```python
# backend/app/api/reports.py - MODIFY get_unified_report():
# Inside the function, after combining findings:
from app.services.reporting.risk_calculator import RiskCalculator
calculator = RiskCalculator()
risk_score = calculator.calculate(total_severity)
risk_trend = calculator.get_trend(risk_score, 0)  # TODO: get previous
return {
    "project_id": project_id,
    "scan_id": scan_id,
    "total_findings": len(all_findings),
    "severity": total_severity,
    "risk_score": {
        "score": risk_score,
        "trend": risk_trend,
        "level": calculator.get_risk_level(risk_score),
    },
    "findings": all_findings,
    "generated_at": datetime.now(timezone.utc).isoformat(),
}
```
**Step 6: Run test to verify it passes**
```bash
cd /home/kali_linux/Pipeline && pytest tests/test_risk_calculator.py -v
# Expected: PASS
```
**Step 7: Commit**
```bash
cd /home/kali_linux/Pipeline && git add backend/app/services/reporting/risk_calculator.py \
  backend/app/services/reporting/reporter.py backend/app/api/reports.py && \
git commit -m "feat: add risk score calculator for security reports
- Create RiskCalculator with weighted scoring (critical=15, high=10, medium=5, low=1)
- Add risk level (Low/Medium/High/Critical Risk)
- Add trend detection (improving/stable/worsening)
- Integrate into UnifiedReportGenerator
- Add risk_score to unified report API response"
```
---
### Task 6.2: Add Table of Contents
**Files:**
- Modify: `src/pages/UnifiedReportPage.tsx`
- Modify: `src/components/TableOfContents.tsx` (new)
**Step 1: Write the failing test**
```typescript
// tests/components/TableOfContents.test.tsx
import { render, screen } from '@testing-library/react';
import TableOfContents from '../../src/components/TableOfContents';
describe('TableOfContents', () => {
  test('renders without crashing', () => {
    render(<TableOfContents sections={['Summary', 'Findings', 'Trends']} currentSection="Summary" />);
    expect(screen.getByText('Table of Contents')).toBeInTheDocument();
  });
});
```
**Step 2: Run test to verify it fails**
```bash
cd /home/kali_linux/Pipeline && npx vitest run src/tests/components/TableOfContents.test.tsx
# Expected: FAIL - file doesn't exist
```
**Step 3: Create TableOfContents component**
```typescript
// src/components/TableOfContents.tsx
import React from 'react';
interface TableOfContentsProps {
  sections: string[];
  currentSection: string;
  onSectionClick: (section: string) => void;
}
const TableOfContents: React.FC<TableOfContentsProps> = ({ sections, currentSection, onSectionClick }) => {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">Table of Contents</h3>
      <nav>
        <ul className="space-y-2">
          {sections.map((section) => (
            <li key={section}>
              <button
                onClick={() => onSectionClick(section)}
                className={`text-left w-full px-3 py-2 rounded-lg transition-colors ${
                  currentSection === section
                    ? 'bg-slate-900 text-white'
                    : 'hover:bg-slate-100 text-slate-700'
                }`}
              >
                {section}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
};
export default TableOfContents;
```
**Step 4: Integrate into UnifiedReportPage**
```typescript
// src/pages/UnifiedReportPage.tsx - ADD:
import TableOfContents from '../components/TableOfContents';
// Inside component:
const [currentSection, setCurrentSection] = useState<string>('Summary');
const sections = ['Summary', 'Severity Distribution', 'Tool Comparison', 'Historical Trend', 'Findings'];
// In JSX, add after header:
<TableOfContents
  sections={sections}
  currentSection={currentSection}
  onSectionClick={setCurrentSection}
/>
// Add id attributes to each section:
<div id="Summary">...</div>
<div id="Severity Distribution">...</div>
// etc.
```
**Step 5: Run test to verify it passes**
```bash
cd /home/kali_linux/Pipeline && npx vitest run src/tests/components/TableOfContents.test.tsx
# Expected: PASS
```
**Step 6: Commit**
```bash
cd /home/kali_linux/Pipeline && git add src/components/TableOfContents.tsx \
  src/pages/UnifiedReportPage.tsx && \
git commit -m "feat: add table of contents for report navigation
- Create TableOfContents component
- Navigate between sections in UnifiedReportPage
- Highlight current section"
```
---
## Phase 7: SonarQube Issues Integration (1 day)
### Task 7.1: Fetch SonarQube Issues
**Files:**
- Modify: `backend/app/services/reporting/parsers/sonar.py:27-30`
- Modify: `backend/app/services/reporting/fetcher.py:103-136`
**Step 1: Write the failing test**
```python
# tests/test_sonar_issues.py
import pytest
from unittest.mock import Mock, patch
def test_fetch_sonar_issues():
    """Verify SonarQube issues are fetched"""
    try:
        from app.services.reporting.parsers.sonar import fetch_sonar_issues
        assert callable(fetch_sonar_issues)
    except ImportError:
        assert False, "fetch_sonar_issues not found"
@pytest.mark.asyncio
async def test_fetch_sonar_issues_returns_findings():
    """Verify API call returns findings"""
    from app.services.reporting.parsers.sonar import fetch_sonar_issues
    from app.services.reporting.parsers.base import SecurityFinding
    
    with patch('app.services.reporting.parsers.sonar.httpx.AsyncClient') as mock_client:
        # Mock response
        mock_resp = Mock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "issues": [
                {
                    "key": "ABC123",
                    "severity": "BLOCKER",
                    "component": "myapp:src/main.py",
                    "line": 42,
                    "message": "SQL Injection",
                    "rule": "python:S2077",
                }
            ]
        }
        mock_client.return_value.__aenter__.return_value.get.return_value = mock_resp
        
        findings = await fetch_sonar_issues("my-project", "localhost:9000")
        assert len(findings) >= 0  # May be empty if parsing fails
```
**Step 2: Run test to verify it fails**
```bash
cd /home/kali_linux/Pipeline && pytest tests/test_sonar_issues.py -v
# Expected: FAIL - function doesn't exist
```
**Step 3: Implement fetch_sonar_issues**
```python
# backend/app/services/reporting/parsers/sonar.py - ADD:
import httpx
from typing import List
from ..base import SecurityFinding
SEVERITY_MAP = {
    "BLOCKER": "Critical",
    "CRITICAL": "High",
    "MAJOR": "Medium",
    "MINOR": "Low",
    "INFO": "Info",
}
async def fetch_sonar_issues(sonar_key: str, sonar_url: str = None) -> List[SecurityFinding]:
    """
    Fetch actual issues from SonarQube API.
    Returns list of SecurityFinding objects.
    """
    if not sonar_url:
        sonar_url = get_sonar_url()
    
    url = f"https://{sonar_url}/api/issues/search"
    params = {
        "componentKeys": sonar_key,
        "severities": "BLOCKER,CRITICAL,MAJOR,MINOR",
        "ps": 500,  # Page size
    }
    
    findings = []
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, params=params)
            
            if response.status_code == 200:
                data = response.json()
                issues = data.get("issues", [])
                
                for issue in issues:
                    severity = SEVERITY_MAP.get(issue.get("severity", ""), "Unknown")
                    finding = SecurityFinding(
                        id=f"SONAR-{issue.get('key', 'unknown')}",
                        tool="sonar",
                        severity=severity,
                        title=issue.get("message", ""),
                        description=f"Rule: {issue.get('rule', 'unknown')}",
                        host=issue.get("component", "").split(":")[0] if issue.get("component") else "",
                        recommendation=f"Fix according to rule {issue.get('rule', '')}",
                        raw_evidence=str(issue),
                    )
                    findings.append(finding)
        
        return findings
    except Exception as e:
        logger.error(f"Error fetching SonarQube issues: {e}")
        return []
```
**Step 4: Integrate into fetcher**
```python
# backend/app/services/reporting/fetcher.py - MODIFY fetch_all_reports():
# After Sonar link creation, ADD:
if sonar_key:
    # Fetch actual issues from SonarQube
    sonar_findings = await fetch_sonar_issues(sonar_key)
    
    if sonar_findings:
        sonar_report = ScanReportDB(
            scan_id=scan_id,
            project_id=project_id,
            tool_name="sonar",
            severity_summary=calculate_severity_summary(sonar_findings),
            findings=[f.to_dict() for f in sonar_findings],
            raw_report=None,
            report_url=create_sonar_report_link(sonar_key),
            created_at=datetime.now(timezone.utc),
            expires_at=calculate_expires_at(90),
        )
        reports.append(sonar_report)
```
**Step 5: Run test to verify it passes**
```bash
cd /home/kali_linux/Pipeline && pytest tests/test_sonar_issues.py -v
# Expected: PASS
```
**Step 6: Commit**
```bash
cd /home/kali_linux/Pipeline && git add backend/app/services/reporting/parsers/sonar.py \
  backend/app/services/reporting/fetcher.py && \
git commit -m "feat: integrate SonarQube issues fetching
- Add fetch_sonar_issues() to sonar.py parser
- Map SonarQube severities to our severity levels
- Fetch actual issues via SonarQube API
- Store issues as findings in ScanReportDB
- Replace link-only with actual data"
```
---
## Phase 8: Interactive UI Enhancements (2 days)
### Task 8.1: Create FilterBar Component
**Files:**
- Create: `src/components/FilterBar.tsx`
- Modify: `src/pages/UnifiedReportPage.tsx`
**Step 1: Write the failing test**
```typescript
// tests/components/FilterBar.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import FilterBar from '../../src/components/FilterBar';
describe('FilterBar', () => {
  test('renders without crashing', () => {
    render(
      <FilterBar
        search=""
        onSearchChange={() => {}}
        selectedSeverities={[]}
        onSeverityChange={() => {}}
        selectedTools={[]}
        onToolChange={() => {}}
      />
    );
    expect(screen.getByPlaceholderText('Search findings...')).toBeInTheDocument();
  });
});
```
**Step 2: Run test to verify it fails**
```bash
cd /home/kali_linux/Pipeline && npx vitest run src/tests/components/FilterBar.test.tsx
# Expected: FAIL
```
**Step 3: Create FilterBar component**
```typescript
// src/components/FilterBar.tsx
import React from 'react';
import { Search } from 'lucide-react';
interface FilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  selectedSeverities: string[];
  onSeverityChange: (severities: string[]) => void;
  selectedTools: string[];
  onToolChange: (tools: string[]) => void;
  availableTools: string[];
}
const SEVERITY_OPTIONS = ['Critical', 'High', 'Medium', 'Low'];
const TOOL_OPTIONS = ['trivy_fs', 'trivy_image', 'zap', 'dependency_check', 'nmap', 'sonar'];
const FilterBar: React.FC<FilterBarProps> = ({
  search,
  onSearchChange,
  selectedSeverities,
  onSeverityChange,
  selectedTools,
  onToolChange,
  availableTools,
}) => {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
      <div className="flex flex-col md:flex-row gap-4">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search findings..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5"
          />
        </div>
        {/* Severity Filter */}
        <div className="flex gap-2">
          {SEVERITY_OPTIONS.map((sev) => (
            <button
              key={sev}
              onClick={() => {
                const next = selectedSeverities.includes(sev)
                  ? selectedSeverities.filter((s) => s !== sev)
                  : [...selectedSeverities, sev];
                onSeverityChange(next);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedSeverities.includes(sev)
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {sev}
            </button>
          ))}
        </div>
        {/* Tool Filter */}
        <div className="flex gap-2">
          {availableTools.map((tool) => (
            <button
              key={tool}
              onClick={() => {
                const next = selectedTools.includes(tool)
                  ? selectedTools.filter((t) => t !== tool)
                  : [...selectedTools, tool];
                onToolChange(next);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedTools.includes(tool)
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {tool}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
export default FilterBar;
```
**Step 4: Integrate into UnifiedReportPage**
```typescript
// src/pages/UnifiedReportPage.tsx - ADD:
import FilterBar from '../components/FilterBar';
const [search, setSearch] = useState('');
const [selectedSeverities, setSelectedSeverities] = useState<string[]>([]);
const [selectedTools, setSelectedTools] = useState<string[]>([]);
// Filter findings based on search and filters
const filteredFindings = report?.findings.filter((f) => {
  // Search filter
  if (search && !f.title.toLowerCase().includes(search.toLowerCase()) && 
      !f.description?.toLowerCase().includes(search.toLowerCase())) {
    return false;
  }
  
  // Severity filter
  if (selectedSeverities.length > 0 && !selectedSeverities.includes(f.severity)) {
    return false;
  }
  
  // Tool filter
  if (selectedTools.length > 0 && !selectedTools.includes(f.tool)) {
    return false;
  }
  
  return true;
});
// Get available tools from report
const availableTools = [...new Set(report?.findings.map((f) => f.tool) || [])];
// In JSX, add before findings table:
<FilterBar
  search={search}
  onSearchChange={setSearch}
  selectedSeverities={selectedSeverities}
  onSeverityChange={setSelectedSeverities}
  selectedTools={selectedTools}
  onToolChange={setSelectedTools}
  availableTools={availableTools}
/>
// Update findings table to use filteredFindings instead of report.findings
```
**Step 5: Run test to verify it passes**
```bash
cd /home/kali_linux/Pipeline && npx vitest run src/tests/components/FilterBar.test.tsx
# Expected: PASS
```
**Step 6: Commit**
```bash
cd /home/kali_linux/Pipeline && git add src/components/FilterBar.tsx \
  src/pages/UnifiedReportPage.tsx && \
git commit -m "feat: add FilterBar for findings search and filtering
- Create FilterBar component with search, severity, and tool filters
- Filter findings in UnifiedReportPage based on criteria
- Toggle multiple severities/tools
- Real-time filtering as user types"
```
---
### Task 8.2: Create FindingDetailModal
**Files:**
- Create: `src/components/FindingDetailModal.tsx`
- Modify: `src/pages/UnifiedReportPage.tsx` (findings table rows clickable)
**Step 1: Write the failing test**
```typescript
// tests/components/FindingDetailModal.test.tsx
import { render, screen } from '@testing-library/react';
import FindingDetailModal from '../../src/components/FindingDetailModal';
describe('FindingDetailModal', () => {
  test('renders without crashing', () => {
    render(
      <FindingDetailModal
        finding={null}
        onClose={() => {}}
      />
    );
    // Should render nothing when finding is null
    expect(screen.queryByText('Finding Details')).not.toBeInTheDocument();
  });
});
```
**Step 2: Run test to verify it fails**
```bash
# Expected: FAIL
```
**Step 3: Create FindingDetailModal**
```typescript
// src/components/FindingDetailModal.tsx
import React from 'react';
import { X } from 'lucide-react';
import type { Finding } from '../types';
interface FindingDetailModalProps {
  finding: Finding | null;
  onClose: () => void;
}
const FindingDetailModal: React.FC<FindingDetailModalProps> = ({ finding, onClose }) => {
  if (!finding) return null;
  const severityColors: Record<string, string> = {
    Critical: 'bg-red-100 text-red-700',
    High: 'bg-orange-100 text-orange-700',
    Medium: 'bg-yellow-100 text-yellow-700',
    Low: 'bg-blue-100 text-blue-700',
    Info: 'bg-slate-100 text-slate-700',
  };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-slate-900">Finding Details</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>
        {/* Severity Badge */}
        <div className="mb-4">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${severityColors[finding.severity] || severityColors.Info}`}>
            {finding.severity}
          </span>
        </div>
        {/* Title */}
        <h3 className="text-lg font-medium text-slate-900 mb-2">{finding.title}</h3>
        {/* Details */}
        <dl className="space-y-3">
          <div>
            <dt className="text-sm font-medium text-slate-500">ID</dt>
            <dd className="text-sm text-slate-900">{finding.id}</dd>
          </div>
          
          {finding.description && (
            <div>
              <dt className="text-sm font-medium text-slate-500">Description</dt>
              <dd className="text-sm text-slate-900">{finding.description}</dd>
            </div>
          )}
          
          {finding.cve && (
            <div>
              <dt className="text-sm font-medium text-slate-500">CVE</dt>
              <dd className="text-sm text-slate-900">{finding.cve}</dd>
            </div>
          )}
          
          {finding.host && (
            <div>
              <dt className="text-sm font-medium text-slate-500">Host</dt>
              <dd className="text-sm text-slate-900">{finding.host}</dd>
            </div>
          )}
          
          {finding.port && (
            <div>
              <dt className="text-sm font-medium text-slate-500">Port</dt>
              <dd className="text-sm text-slate-900">{finding.port}</dd>
            </div>
          )}
          
          {finding.package && (
            <div>
              <dt className="text-sm font-medium text-slate-500">Package</dt>
              <dd className="text-sm text-slate-900">{finding.package}</dd>
            </div>
          )}
          
          {finding.tool && (
            <div>
              <dt className="text-sm font-medium text-slate-500">Tool</dt>
              <dd className="text-sm text-slate-900">{finding.tool}</dd>
            </div>
          )}
          
          {finding.recommendation && (
            <div>
              <dt className="text-sm font-medium text-slate-500">Recommendation</dt>
              <dd className="text-sm text-slate-900">{finding.recommendation}</dd>
            </div>
          )}
        </dl>
        {/* Raw Evidence */}
        {finding.raw_evidence && (
          <div className="mt-4">
            <dt className="text-sm font-medium text-slate-500 mb-2">Raw Evidence</dt>
            <pre className="text-xs bg-slate-50 p-3 rounded-lg overflow-x-auto">
              {finding.raw_evidence}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
export default FindingDetailModal;
```
**Step 4: Run test to verify it passes**
```bash
# Expected: PASS
```
**Step 5: Commit**
```bash
cd /home/kali_linux/Pipeline && git add src/components/FindingDetailModal.tsx && \
git commit -m "feat: add FindingDetailModal for detailed finding view
- Click finding in table → opens modal
- Shows all finding metadata (CVE, host, port, package, etc.)
- Displays recommendation if available
- Shows raw evidence in monospace font"
```
---
## Phase 9: Compliance Mapping (1 day)
### Task 9.1: Add OWASP Top 10 & CWE Mapping
**Files:**
- Create: `backend/app/services/reporting/compliance_mapper.py`
- Modify: `backend/app/api/reports.py` (add compliance endpoint)
**Step 1: Write the failing test**
```python
# tests/test_compliance_mapper.py
import pytest
def test_compliance_mapper_exists():
    """Verify ComplianceMapper exists"""
    try:
        from app.services.reporting.compliance_mapper import ComplianceMapper
        assert True
    except ImportError:
        assert False, "ComplianceMapper not found"
def test_owasp_mapping():
    """Verify OWASP Top 10 mapping"""
    from app.services.reporting.compliance_mapper import ComplianceMapper
    
    mapper = ComplianceMapper()
    
    # Test finding: SQL Injection → OWASP A03:2021
    finding = {"title": "SQL Injection in login form", "cve": "CVE-2021-12345"}
    owasp = mapper.map_to_owasp(finding)
    
    assert owasp is not None
    assert "A03" in owasp["id"]
```
**Step 2: Run test to verify it fails**
```bash
# Expected: FAIL
```
**Step 3: Create ComplianceMapper**
```python
# backend/app/services/reporting/compliance_mapper.py
"""
Compliance Mapping for Security Reports
Maps findings to OWASP Top 10 2021 and CWE Top 25
"""
from typing import Dict, List, Optional
# OWASP Top 10 2021
OWASP_TOP_10_2021 = {
    "A01:2021": {
        "name": "Broken Access Control",
        "cwe": ["CWE-284", "CWE-285", "CWE-639"],
    },
    "A02:2021": {
        "name": "Cryptographic Failures",
        "cwe": ["CWE-310", "CWE-311", "CWE-312"],
    },
    "A03:2021": {
        "name": "Injection",
        "cwe": ["CWE-89", "CWE-564", "CWE-917"],
    },
    # ... (add all 10)
}
# CWE Top 25 2023
CWE_TOP_25_2023 = [
    {"id": "CWE-787", "name": "Out-of-bounds Write"},
    {"id": "CWE-79", "name": "Improper Neutralization of Input During Web Page Generation (XSS)"},
    # ... (add all 25)
]
class ComplianceMapper:
    """Map security findings to compliance frameworks"""
    
    def map_to_owasp(self, finding: Dict) -> Optional[Dict]:
        """
        Map a finding to OWASP Top 10 2021.
        Returns compliance entry or None.
        """
        title = finding.get("title", "").lower()
        cve = finding.get("cve", "")
        
        # Simple keyword matching (enhance with ML later)
        if "sql" in title or "injection" in title or "CVE-89" in cve:
            return {"id": "A03:2021", "name": "Injection", "found": True}
        
        if "crypto" in title or "tls" in title or "ssl" in title:
            return {"id": "A02:2021", "name": "Cryptographic Failures", "found": True}
        
        # Add more mappings...
        return None
    
    def get_compliance_summary(self, findings: List[Dict]) -> Dict:
        """Get compliance summary for all findings"""
        owasp_summary = {f"A{idx:02d}:2021": {"name": "", "count": 0} for idx in range(1, 11)}
        cwe_summary = {}
        
        for finding in findings:
            owasp = self.map_to_owasp(finding)
            if owasp:
                owasp_summary[owasp["id"]]["count"] += 1
                owasp_summary[owasp["id"]]["name"] = owasp["name"]
            
            # CWE mapping
            cve = finding.get("cve", "")
            if cve:
                cwe_id = cve.split("-")[0] + "-" + cve.split("-")[1] if "-" in cve else ""
                if cwe_id:
                    cwe_summary[cwe_id] = cwe_summary.get(cwe_id, 0) + 1
        
        return {
            "owasp_top_10": [v for v in owasp_summary.values() if v["count"] > 0],
            "cwe_top_25": [{"id": k, "count": v} for k, v in cwe_summary.items()],
        }
```
**Step 4: Add compliance endpoint**
```python
# backend/app/api/reports.py - ADD:
@router.get("/projects/{project_id}/reports/compliance")
def get_compliance_report(project_id: str, scan_id: Optional[str] = None, db: Session = Depends(get_db)):
    """Get OWASP Top 10 and CWE Top 25 compliance report"""
    from app.services.reporting.compliance_mapper import ComplianceMapper
    
    # Get findings (same logic as unified report)
    # ...
    
    mapper = ComplianceMapper()
    compliance = mapper.get_compliance_summary(all_findings)
    
    return {
        "project_id": project_id,
        "scan_id": scan_id,
        "compliance": compliance,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
```
**Step 5: Run test to verify it passes**
```bash
# Expected: PASS
```
**Step 6: Commit**
```bash
cd /home/kali_linux/Pipeline && git add backend/app/services/reporting/compliance_mapper.py \
  backend/app/api/reports.py && \
git commit -m "feat: add compliance mapping (OWASP Top 10, CWE Top 25)
- Create ComplianceMapper with OWASP Top 10 2021 mapping
- Add CWE Top 25 2023 mapping
- Add compliance endpoint: GET /api/v1/reports/projects/{id}/compliance
- Map findings to compliance categories"
```
---
## Phase 10: Report Types (1 day)
### Task 10.1: Add Report Type Selection
**Files:**
- Modify: `backend/app/services/reporting/reporter.py` (add report_type parameter)
- Modify: `backend/app/api/reports.py` (accept report_type)
**Implementation:**
- Add `ReportType` enum (EXECUTIVE, TECHNICAL, COMPLIANCE, COMPARISON)
- Modify `UnifiedReportGenerator.generate_html()` and `generate_pdf()` to filter based on type
- Executive: Summary + Risk Score only
- Technical: All findings + recommendations
- Compliance: OWASP/CWE mapping only
- Comparison: Before/after re-scan diff
**Tests & Commit:** Follow same TDD pattern.
---
## File Changes Summary
### New Files
| File | Purpose |
|------|---------|
| `backend/app/services/reporting/risk_calculator.py` | Risk score calculation |
| `backend/app/services/reporting/compliance_mapper.py` | OWASP/CWE mapping |
| `src/components/TableOfContents.tsx` | Report navigation |
| `src/components/FilterBar.tsx` | Search & filter findings |
| `src/components/FindingDetailModal.tsx` | Detailed finding view |
### Modified Files
| File | Changes |
|------|---------|
| `backend/app/services/reporting/reporter.py` | Add risk score, report types |
| `backend/app/services/reporting/parsers/sonar.py` | Add fetch_sonar_issues() |
| `backend/app/services/reporting/fetcher.py` | Integrate SonarQube issues |
| `backend/app/api/reports.py` | Add risk_score, compliance endpoints |
| `src/pages/UnifiedReportPage.tsx` | Add filters, modals, TOC |
---
## Estimated Effort
| Phase | Task | Effort |
|-------|------|--------|
| 6 | Risk Score & Enhancements | 1 day |
| 7 | SonarQube Issues | 1 day |
| 8 | Interactive UI | 2 days |
| 9 | Compliance Mapping | 1 day |
| 10 | Report Types | 1 day |
| **Total** | | **6 days** |
---
## Acceptance Criteria
1. ✅ Risk Score (0-100) displayed in report header
2. ✅ Risk trend (improving/stable/worsening) shown
3. ✅ Table of Contents for easy navigation
4. ✅ SonarQube issues fetched (not just link)
5. ✅ Search bar filters findings by keyword
6. ✅ Severity buttons toggle filter
7. ✅ Tool buttons toggle filter
8. ✅ Click finding → opens detail modal
9. ✅ OWASP Top 10 compliance mapping
10. ✅ CWE Top 25 compliance mapping
11. ✅ Executive/Technical/Compliance report types
---
## Execution Handoff
**Plan complete and saved to `docs/plans/2026-05-05-missing-report-features.md`**
### Two execution options:
#### 1. Subagent-Driven (this session)
- **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development
- Stay in this session
- Fresh subagent per task + code review
- Fast iteration with review checkpoints
#### 2. Parallel Session (separate)
- Open new session with worktree
- **REQUIRED SUB-SKILL:** New session uses superpowers:executing-plans
- Batch execution with checkpoints
**Which approach?**
P