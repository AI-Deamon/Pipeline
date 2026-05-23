# Security Reporting System - Implementation Plan

**Date:** 2026-04-22
**Feature:** Unified Security Report Dashboard

---

## Overview

Add a combined security report that shows:
- **Summary dashboard** - severity counts across all tools (Critical/High/Medium/Low)
- **Per-tool drill-down** - detailed findings from each security tool
- **Async processing** - reports fetch in background after scan completes

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Jenkins Pipeline                                                    │
├─────────────────────────────────────────────────────────────────────┤
│  Stage 1-5: Trivy, ZAP, DepCheck (unchanged)                      │
│      │                                                               │
│      ▼                                                               │
│  Stage 9: Nmap_system                                               │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 1. scanner.py --single-target $TARGET_IP                      │  │
│  │    → runs 11 scan types → raw/*.txt                          │  │
│  │ 2. parser.py                                                 │  │
│  │    → 17 detection rules → findings.json                      │  │
│  │ 3. cp scans/*/findings.json reports/nmap_findings.json      │  │
│  └───────────────────────────────────────────────────────────────┘  │
│      │                                                               │
│      ▼                                                               │
│  Stage 10: SonarQube (pass sonar_key via config)                   │
│      │                                                               │
│      ▼                                                               │
│  Archive: reports/ (all JSON files)                                 │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Backend: Async Celery Task                                          │
│  1. Fetch all reports from Jenkins artifacts                        │
│  2. Parse each tool → UnifiedFinding[]                             │
│  3. Store in scan_reports table                                     │
│  4. WebSocket: "Reports ready"                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### New Table: scan_reports

```python
class ScanReport(Base):
    __tablename__ = "scan_reports"

    id = Column(Integer, primary_key=True, index=True)
    scan_id = Column(String, ForeignKey("scans.scan_id"), nullable=False)
    project_id = Column(String, ForeignKey("projects.project_id"), nullable=False)
    tool_name = Column(String, nullable=False)  # trivy_fs, zap, dependency_check, nmap, sonar
    
    # Summary counts
    severity_summary = Column(JSON)  # {"critical": 3, "high": 12, "medium": 45, "low": 89}
    
    # Detailed findings
    findings = Column(JSON)  # [{"id": "F001", "severity": "Critical", ...}]
    
    # Raw report storage
    raw_report = Column(Text)  # Full JSON from tool
    
    # Links
    report_url = Column(String)  # Jenkins artifact URL or Sonar dashboard URL
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Retention
    expires_at = Column(DateTime)  # created_at + 90 days

    # Relationships
    scan = relationship("ScanDB", back_populates="reports")
    project = relationship("ProjectDB", back_populates="reports")

# Add to existing ScanDB
class ScanDB:
    reports = relationship("ScanReport", back_populates="scan", cascade="all, delete-orphan")

# Add to existing ProjectDB  
class ProjectDB:
    reports = relationship("ScanReport", back_populates="project", cascade="all, delete-orphan")
```

### Cascade Delete
- When scan deleted → reports deleted (cascade)
- When project deleted → reports deleted (cascade)

---

## Unified Finding Schema

```python
@dataclass
class SecurityFinding:
    id: str                    # Tool-specific: "TRIVY-001", "ZAP-002", "NMAP-F001"
    tool: str                  # trivy_fs, zap, dependency_check, nmap, sonar
    severity: str              # Critical, High, Medium, Low, Info
    title: str                 # e.g., "CVE-2024-1234 in libfoo"
    description: str           # Human-readable description
    cve: Optional[str]         # CVE identifier if applicable
    host: Optional[str]        # Affected host/IP
    port: Optional[int]         # Affected port
    service: Optional[str]     # Service name
    uri: Optional[str]          # URL path (for web findings)
    package: Optional[str]     # Vulnerable package name
    recommendation: str         # How to fix
    raw_evidence: str          # Original finding text
```

---

## Nmap_system Integration

### Approach
Nmap_system is at repository root: `Nmap_system/pentest_system/`

Jenkinsfile uses: `../Nmap_system/pentest_system` (relative from Agent/)

Also copied to `backend/nmap_system/` for backend reference.

### Jenkinsfile Changes

```groovy
stage('9. Nmap System Scan') {
    when { expression { shouldRun('nmap_scan') } }
    steps {
        script {
            sh """
                cd ../Nmap_system/pentest_system
                
                # Create targets.json for single target
                echo '{"targets":[{"ip":"${PROJECT.target_ip}","name":"scan-target","environment":"scanned"}]}' > targets.json
                
                # Run scanner (11 scan types)
                python3 scanner.py
                
                # Run parser (17 detection rules)
                python3 parser.py
                
                # Copy findings to workspace reports/
                mkdir -p ${WORKSPACE}/reports
                cp scans/*/findings.json ${WORKSPACE}/reports/nmap_findings.json || true
            """
            recordStage('nmap_scan', 'PASS', 'Nmap system scan completed')
        }
    }
}
```

### Nmap_system Internal Flow

```
scanner.py (Phase 1 - Parallel Discovery)
         │
         ▼
    Runs 11 scan types in parallel:
    • ssl-enum-ciphers      • rdp-vuln-ms12-020
    • vuln,exploit          • http-security-headers
    • brute                 • http-methods
    • http-slowloris        • smtp-open-relay,smtp-starttls
    • ssl-cert               • aggressive
         │
         ▼
    Output: scans/YYYY-MM-DD/raw/*.txt (raw output per scan)
         │
         ▼
parser.py (Phase 2 - Detection)
         │
         ▼
    17 Detection Rules:
    • CVE detection → "VULNERABLE" context
    • Certificate expired → "Not valid after:" + past date
    • Weak DH params → "Modulus Length: 1024"
    • RDP vulnerability → "VULNERABLE" in rdp-* context
    • HTTP methods exposed → PUT/PATCH/DELETE/TRACE
    • SMTP open relay → not "Server is not an open relay"
    • Slowloris vulnerable → "LIKELY VULNERABLE"
    • Missing security headers → HSTS, X-Frame-Options, CSP
    • JMX console exposed → /jmx-console/
    • TLS 1.0/1.1 enabled → deprecated TLS
         │
         ▼
    Output: scans/YYYY-MM-DD/findings.json (structured)
```

---

## SonarQube Integration

### Approach
Use environment variable - no manual entry needed.

### Configuration
```bash
# In backend/.env or docker-compose.yml
SONARQUBE_URL=sonarqube.example.com
```

### Dashboard Link Generation
```python
# Get from environment, fallback to config
def get_sonar_dashboard_link(sonar_key: str) -> str:
    sonar_url = os.getenv("SONARQUBE_URL", "localhost:9000")
    return f"https://{sonar_url}/dashboard?id={sonar_key}"
```

### No changes needed to Project Model
- `sonar_key` already exists in project
- `sonar_url` comes from environment variable

---

## Tool Report Mapping

| Tool | Jenkins Output | Parse → DB |
|------|---------------|------------|
| Trivy FS | `reports/trivy-fs.json` | ✅ Parse |
| Trivy Image | `reports/trivy-image-*.json` | ✅ Parse |
| ZAP | `reports/zap.json` | ✅ Parse |
| DepCheck | `reports/dependency-check.json` | ✅ Parse |
| **Nmap_system** | `reports/nmap_findings.json` | ✅ Parse (adapted) |
| **SonarQube** | **N/A** | 🔗 Link only |

---

## Implementation Order

### Phase 1: Database & Models (1 day)
1. Add `ScanReport` model to `backend/app/models/db_models.py`
2. Add `sonar_url` field to ProjectDB
3. Add relationships to `ScanDB` and `ProjectDB`
4. Create Alembic migration

### Phase 2: Report Parsers (2 days)
Create `backend/app/services/reporting/parsers/`:

| File | Purpose |
|------|---------|
| `base.py` | UnifiedFinding dataclass, base parser |
| `trivy_parser.py` | Parse Trivy JSON → UnifiedFinding[] |
| `zap_parser.py` | Parse ZAP JSON → UnifiedFinding[] |
| `depcheck_parser.py` | Parse DepCheck JSON → UnifiedFinding[] |
| `nmap_parser.py` | Adapt from Nmap_system/parser.py |
| `sonar_provider.py` | Return dashboard URL |

### Phase 3: Report Fetcher Service (1 day)
Create `backend/app/services/reporting/fetcher.py`:

```python
class ReportFetcher:
    async def fetch_all_reports(scan_id: str, jenkins_build_url: str):
        # 1. Fetch artifacts from Jenkins
        # 2. Parse each tool's report
        # 3. Store in scan_reports table
        # 4. WebSocket notification
```

### Phase 4: Celery Task Integration (0.5 day)
Create `backend/app/tasks/report_tasks.py`:

```python
@celery_app.task
def process_scan_reports(scan_id: str, jenkins_build_url: str):
    """Async task called after scan completes"""
```

**Trigger:** Call from scan callback when status = COMPLETED

### Phase 5: API Endpoints (1 day)
Add to `backend/app/api/reports.py`:

```python
@router.get("/projects/{project_id}/reports")
def get_project_reports(project_id: str)

@router.get("/projects/{project_id}/reports/summary")
def get_reports_summary(project_id: str)

@router.get("/reports/{report_id}")
def get_report(report_id: str)

@router.get("/reports/{report_id}/download")
def download_raw_report(report_id: str)

@router.delete("/reports/{report_id}")
def delete_report(report_id: str)
```

### Phase 6: Cleanup Task (0.5 day)
Create `backend/app/tasks/cleanup_tasks.py`:

```python
@celery_app.task
def cleanup_expired_reports():
    """Delete reports older than 90 days"""
```

**Schedule:** Run daily at 3 AM

### Phase 7: Frontend (2 days)

**New Page:** `src/pages/ProjectReportsPage.tsx`

Components:
- `SummaryCards` - 4 cards: Critical, High, Medium, Low
- `ToolAccordion` - Expandable per-tool findings
- `FindingRow` - Individual finding with severity badge
- `DownloadButton` - Download raw JSON

**Navigation:** Add "Reports" tab to ProjectDetailsPage

---

## Retention Policy

- **Default:** 90 days
- **Configurable:** Can be changed to permanent (null expires_at)
- **Deletion:** When project deleted from dashboard → cascade delete reports
- **Cleanup:** Daily Celery task removes expired reports

---

## API Response Examples

### GET /projects/{id}/reports/summary
```json
{
  "project_id": "abc-123",
  "total_findings": 149,
  "severity": {
    "critical": 3,
    "high": 12,
    "medium": 45,
    "low": 89
  },
  "tools": [
    {"tool": "trivy_fs", "findings": 23, "critical": 1, "high": 5},
    {"tool": "zap", "findings": 8, "critical": 2, "high": 3},
    {"tool": "dependency_check", "findings": 67, "critical": 0, "high": 4},
    {"tool": "nmap", "findings": 51, "critical": 0, "high": 0},
    {"tool": "sonar", "findings": 0, "link": "https://sonarqube.example.com/dashboard?id=..."}
  ]
}
```

### GET /reports/{id}
```json
{
  "id": 1,
  "scan_id": "scan-uuid",
  "tool": "trivy_fs",
  "severity_summary": {"critical": 1, "high": 5, "medium": 10, "low": 7},
  "findings": [
    {
      "id": "TRIVY-001",
      "severity": "Critical",
      "title": "CVE-2024-1234 in libopenssl",
      "description": "...",
      "cve": "CVE-2024-1234",
      "package": "libopenssl",
      "version": "1.1.1",
      "recommendation": "Upgrade to version 1.1.1w"
    }
  ],
  "report_url": "https://jenkins.example.com/job/.../artifact/reports/trivy-fs.json",
  "created_at": "2026-04-22T10:00:00Z"
}
```

---

## Acceptance Criteria

1. ✅ Nmap_system runs inside Jenkins (11 scans → findings.json)
2. ✅ Findings parsed and displayed in UI
3. ✅ Summary shows severity counts across all tools
4. ✅ Per-tool expandable findings in UI
5. ✅ Users can download raw JSON reports
6. ✅ SonarQube shows as clickable link to dashboard
7. ✅ Nmap findings include CVE, port, service info
8. ✅ Reports auto-delete after 90 days
9. ✅ Reports deleted when project deleted
10. ✅ WebSocket notifies when reports are ready

---

## Estimated Effort

| Phase | Effort |
|-------|--------|
| Database & Models | 1 day |
| Report Parsers | 2 days |
| Fetcher Service | 1 day |
| Celery Integration | 0.5 day |
| API Endpoints | 1 day |
| Cleanup Task | 0.5 day |
| Frontend | 2 days |
| **Total** | **8 days** |

---

## Open Questions - Answered

- [x] Nmap_system location: Copied to `backend/nmap_system/`
- [x] PDF reports needed: No
- [x] Retention period: 90 days default, can be permanent
- [x] Delete behavior: Cascade delete with project
- [x] SonarQube URL: Use SONARQUBE_URL env variable
