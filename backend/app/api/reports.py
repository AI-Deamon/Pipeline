from typing import Annotated, List, Optional
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.db import get_db
from app.core.auth import get_current_user
from app.core.config import settings
from app.models.db_models import ScanReportDB, ProjectDB, ScanDB
from app.services.reporting.reporter import UnifiedReportGenerator
from app.services.reporting.parsers.base import SecurityFinding

router = APIRouter(prefix="/reports", tags=["reports"])

_PROJECT_NOT_FOUND = "Project not found"
_REPORT_NOT_FOUND = "Report not found"

# A trend direction is only shown when at least this many completed scans exist within
# the recent window; otherwise there isn't enough history and the trend is left None
# (the dashboards hide the indicator) rather than fabricated against a zero baseline.
TREND_MIN_SCANS = 2
TREND_WINDOW_DAYS = 30


def _compute_recent_trend(db: Session, project_id: str, current_score: int, calculator):
    """Return (trend, previous_score) or (None, None) when history is insufficient.

    Compares the two most recent completed scans within TREND_WINDOW_DAYS. If fewer
    than TREND_MIN_SCANS exist in that window, returns (None, None) so no trend is shown.
    """
    window_start = datetime.now(timezone.utc) - timedelta(days=TREND_WINDOW_DAYS)
    recent_scans = (
        db.query(ScanDB)
        .filter(
            ScanDB.project_id == project_id,
            ScanDB.state == "COMPLETED",
            ScanDB.finished_at.isnot(None),
            ScanDB.finished_at >= window_start,
        )
        .order_by(ScanDB.finished_at.desc())
        .limit(TREND_MIN_SCANS)
        .all()
    )
    if len(recent_scans) < TREND_MIN_SCANS:
        return None, None

    previous_scan = recent_scans[1]
    previous_reports = (
        db.query(ScanReportDB)
        .filter(
            ScanReportDB.project_id == project_id,
            ScanReportDB.scan_id == previous_scan.scan_id,
        )
        .all()
    )
    previous_severity = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    for report in previous_reports:
        summary = report.severity_summary or {}
        for key in previous_severity:
            previous_severity[key] += summary.get(key, 0)

    previous_score = calculator.calculate(previous_severity)
    return calculator.get_trend(current_score, previous_score), previous_score

class SeveritySummary(BaseModel):
    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0
    info: int = 0


class ToolSummary(BaseModel):
    tool: str
    findings: int
    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0
    info: int = 0
    link: Optional[str] = None
    parse_status: str = "ok"


class RiskScoreSummary(BaseModel):
    score: int
    level: str
    # None when there isn't enough recent history to compute a real trend
    # (see TREND_MIN_SCANS / TREND_WINDOW_DAYS). The frontend hides the indicator
    # in that case instead of showing a fabricated direction.
    trend: Optional[str] = None
    previous_score: Optional[int] = None


class ReportSummary(BaseModel):
    project_id: str
    total_findings: int
    severity: SeveritySummary
    tools: List[ToolSummary]
    risk_score: Optional[RiskScoreSummary] = None


class FindingItem(BaseModel):
    id: str
    severity: str
    title: str
    description: Optional[str] = None
    cve: Optional[str] = None
    host: Optional[str] = None
    port: Optional[int] = None
    service: Optional[str] = None
    uri: Optional[str] = None
    package: Optional[str] = None
    recommendation: Optional[str] = None


class ReportDetail(BaseModel):
    id: int
    scan_id: str
    tool: str
    severity_summary: SeveritySummary
    findings: List[FindingItem]
    report_url: Optional[str] = None
    created_at: str
    parse_status: str = "ok"


def _is_api_key_auth(request: Request) -> bool:
    """Check if request is authenticated via API key (service account pattern)."""
    api_key = request.headers.get("X-API-Key")
    return bool(api_key and api_key == settings.API_KEY)


def _verify_project_ownership(db: Session, project_id: str, request: Request, current_user) -> ProjectDB:
    """Verify the project belongs to the current user or user has RBAC access. API-key auth bypasses this check."""
    if _is_api_key_auth(request):
        project = db.query(ProjectDB).filter(ProjectDB.project_id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail=_PROJECT_NOT_FOUND)
        return project
    project = db.query(ProjectDB).filter(ProjectDB.project_id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail=_PROJECT_NOT_FOUND)
    from app.services.rbac_service import get_rbac_service
    rbac = get_rbac_service(db=db, user=current_user)
    if rbac.is_admin:
        return project
    if rbac.has_project_access(project_id):
        return project
    raise HTTPException(status_code=404, detail=_PROJECT_NOT_FOUND)


@router.get("/projects/{project_id}/reports", response_model=List[ReportDetail],
  responses={404: {"description": "Not found"}})
def get_project_reports(
    project_id: str,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
    scan_id: Optional[str] = None,
):
    """Get reports for a project, optionally filtered by scan_id"""
    _verify_project_ownership(db, project_id, request, current_user)

    query = db.query(ScanReportDB).filter(ScanReportDB.project_id == project_id)
    if scan_id:
        query = query.filter(ScanReportDB.scan_id == scan_id)
    reports = query.order_by(ScanReportDB.created_at.desc()).all()

    return [
        ReportDetail(
            id=r.id,
            scan_id=r.scan_id,
            tool=r.tool_name,
            severity_summary=r.severity_summary or SeveritySummary(),
            findings=[FindingItem(**f) for f in (r.findings or [])],
            report_url=r.report_url,
            created_at=r.created_at.isoformat() if r.created_at else "",
            parse_status=getattr(r, "parse_status", "ok"),
        )
        for r in reports
    ]


@router.get("/projects/{project_id}/reports/summary", response_model=ReportSummary,
  responses={404: {"description": "Not found"}})
def get_reports_summary(
    project_id: str,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
    scan_id: Optional[str] = None,
):
    """Get combined severity counts across all tools, optionally filtered by scan_id"""
    _verify_project_ownership(db, project_id, request, current_user)

    query = db.query(ScanReportDB).filter(ScanReportDB.project_id == project_id)
    if scan_id:
        query = query.filter(ScanReportDB.scan_id == scan_id)
        reports = query.all()
    else:
        # Bug found while investigating a live "reporting is unusable" report:
        # with no scan_id filter this returned every ScanReportDB row ever
        # created for the project — every past scan's report for every tool,
        # accumulating duplicates forever as more scans ran. A tool could show
        # up 5-6+ times in the response (several stale, all-zero) and severity
        # totals were massively inflated by double/triple-counting old reports.
        # Same "keep only the latest report per (project_id, tool_name)"
        # pattern already applied to portfolio.py and project_grouping.py —
        # this endpoint was missed. Only apply this collapse for the
        # no-scan_id "current state" view; an explicit scan_id is a genuine
        # historical lookup and must return exactly that scan's reports.
        all_reports = (
            query.order_by(ScanReportDB.tool_name, ScanReportDB.created_at.desc()).all()
        )
        seen_tools = set()
        reports = []
        for r in all_reports:
            if r.tool_name in seen_tools:
                continue
            seen_tools.add(r.tool_name)
            reports.append(r)

    total_findings = 0
    severity = SeveritySummary()
    tools = []

    for r in reports:
        summary = r.severity_summary or {}
        findings_count = sum(summary.values())
        total_findings += findings_count

        severity.critical += summary.get("critical", 0)
        severity.high += summary.get("high", 0)
        severity.medium += summary.get("medium", 0)
        severity.low += summary.get("low", 0)
        severity.info += summary.get("info", 0)

        tool_link = r.report_url if r.tool_name == "sonar" else None

        tools.append(
            ToolSummary(
                tool=r.tool_name,
                findings=findings_count,
                critical=summary.get("critical", 0),
                high=summary.get("high", 0),
                medium=summary.get("medium", 0),
                low=summary.get("low", 0),
                info=summary.get("info", 0),
                link=tool_link,
                parse_status=getattr(r, "parse_status", "ok"),
            )
        )

    from app.services.reporting.risk_calculator import RiskCalculator

    calculator = RiskCalculator()
    aggregated_severity = {
        "critical": severity.critical,
        "high": severity.high,
        "medium": severity.medium,
        "low": severity.low,
    }
    score = calculator.calculate(aggregated_severity)
    trend, previous_score = _compute_recent_trend(db, project_id, score, calculator)

    return ReportSummary(
        project_id=project_id,
        total_findings=total_findings,
        severity=severity,
        tools=tools,
        risk_score=RiskScoreSummary(
            score=score,
            level=calculator.get_risk_level(score),
            trend=trend,
            previous_score=previous_score,
        ),
    )


@router.get("/{report_id}", response_model=ReportDetail,
  responses={404: {"description": "Not found"}})
def get_report(
    report_id: int,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    """Get detailed report for a specific tool with ownership check"""
    from app.services.rbac_service import get_rbac_service

    report = db.query(ScanReportDB).filter(ScanReportDB.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail=_REPORT_NOT_FOUND)

    rbac = get_rbac_service(db=db, user=current_user)
    if not rbac.is_admin and not rbac.has_project_access(report.project_id):
        raise HTTPException(status_code=404, detail=_REPORT_NOT_FOUND)

    return ReportDetail(
        id=report.id,
        scan_id=report.scan_id,
        tool=report.tool_name,
        severity_summary=report.severity_summary or SeveritySummary(),
        findings=[FindingItem(**f) for f in (report.findings or [])],
        report_url=report.report_url,
        created_at=report.created_at.isoformat() if report.created_at else "",
        parse_status=getattr(report, "parse_status", "ok"),
    )


@router.get("/{report_id}/download",
  responses={404: {"description": "Not found"}})
def download_raw_report(
    report_id: int,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    """Download raw JSON report"""
    report = db.query(ScanReportDB).filter(ScanReportDB.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail=_REPORT_NOT_FOUND)

    _verify_project_ownership(db, report.project_id, request, current_user)

    if not report.raw_report:
        raise HTTPException(status_code=404, detail="Raw report not available")

    return {
        "content": report.raw_report,
        "filename": f"{report.tool_name}_report.json",
        "content_type": "application/json",
    }


@router.delete("/{report_id}",
  responses={404: {"description": "Not found"}})
def delete_report(
    report_id: int,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    """Delete a specific report"""
    report = db.query(ScanReportDB).filter(ScanReportDB.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail=_REPORT_NOT_FOUND)

    _verify_project_ownership(db, report.project_id, request, current_user)

    db.delete(report)
    db.commit()

    return {"status": "success", "message": f"Report {report_id} deleted"}


@router.get("/projects/{project_id}/reports/unified",
  responses={404: {"description": "Not found"}})
def get_unified_report(
    project_id: str,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
    scan_id: Optional[str] = None,
):
    """Get unified report combining all tools"""
    _verify_project_ownership(db, project_id, request, current_user)

    # If scan_id provided, get that scan's reports
    # Otherwise, get latest completed scan
    query = db.query(ScanReportDB).filter(ScanReportDB.project_id == project_id)

    current_scan_id = scan_id

    if scan_id:
        query = query.filter(ScanReportDB.scan_id == scan_id)
        reports = query.all()
    else:
        # Get latest scan
        latest_scan = (
            db.query(ScanDB)
            .filter(ScanDB.project_id == project_id, ScanDB.state == "COMPLETED")
            .order_by(ScanDB.finished_at.desc())
            .first()
        )
        if latest_scan:
            current_scan_id = latest_scan.scan_id
            reports = query.filter(ScanReportDB.scan_id == latest_scan.scan_id).all()
        else:
            reports = []

    # Combine all findings
    all_findings = []
    total_severity = {"critical": 0, "high": 0, "medium": 0, "low": 0}

    for report in reports:
        findings = report.findings or []
        all_findings.extend(findings)
        severity = report.severity_summary or {}
        for key in total_severity:
            total_severity[key] += severity.get(key, 0)

    # Calculate risk score
    from app.services.reporting.risk_calculator import RiskCalculator

    calculator = RiskCalculator()
    risk_score = calculator.calculate(total_severity)

    # Get previous scan for trend
    previous = (
        db.query(ScanReportDB)
        .join(ScanDB, ScanReportDB.scan_id == ScanDB.scan_id)
        .filter(ScanReportDB.project_id == project_id)
        .filter(ScanReportDB.scan_id != current_scan_id)
        .filter(ScanDB.state == "COMPLETED")
        .order_by(ScanDB.finished_at.desc())
        .first()
    )
    previous_severity = (
        previous.severity_summary
        if previous
        else {"critical": 0, "high": 0, "medium": 0, "low": 0}
    )
    previous_score = calculator.calculate(previous_severity)
    risk_trend = calculator.get_trend(risk_score, previous_score)

    return {
        "project_id": project_id,
        "scan_id": current_scan_id,
        "total_findings": len(all_findings),
        "severity": total_severity,
        "risk_score": {
            "score": risk_score,
            "trend": risk_trend,
            "level": calculator.get_risk_level(risk_score),
            "previous_score": previous_score,
        },
        "findings": all_findings,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/projects/{project_id}/reports/trends",
  responses={404: {"description": "Not found"}})
def get_report_trends(
    project_id: str,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
    days: int = 30,
):
    """Get findings trends over time"""
    _verify_project_ownership(db, project_id, request, current_user)

    cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)

    reports = (
        db.query(ScanReportDB)
        .join(ScanDB, ScanReportDB.scan_id == ScanDB.scan_id)
        .filter(
            ScanReportDB.project_id == project_id, ScanDB.finished_at >= cutoff_date
        )
        .order_by(ScanDB.finished_at)
        .all()
    )

    trends = {}
    for report in reports:
        date_key = report.created_at.strftime("%Y-%m-%d")
        if date_key not in trends:
            trends[date_key] = {"critical": 0, "high": 0, "medium": 0, "low": 0}

        severity = report.severity_summary or {}
        for key in trends[date_key]:
            trends[date_key][key] += severity.get(key, 0)

    return [{"date": date, **data} for date, data in sorted(trends.items())]


@router.get("/projects/{project_id}/reports/compliance",
  responses={404: {"description": "Not found"}})
def get_compliance_report(
    project_id: str,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
    scan_id: Optional[str] = None,
):
    """Get OWASP Top 10 and CWE Top 25 compliance report"""
    _verify_project_ownership(db, project_id, request, current_user)

    from app.services.reporting.compliance_mapper import ComplianceMapper

    # Get findings (same logic as unified report)
    query = db.query(ScanReportDB).filter(ScanReportDB.project_id == project_id)

    current_scan_id = scan_id

    if scan_id:
        query = query.filter(ScanReportDB.scan_id == scan_id)
        reports = query.all()
    else:
        latest_scan = (
            db.query(ScanDB)
            .filter(ScanDB.project_id == project_id, ScanDB.state == "COMPLETED")
            .order_by(ScanDB.finished_at.desc())
            .first()
        )
        if latest_scan:
            current_scan_id = latest_scan.scan_id
            reports = query.filter(ScanReportDB.scan_id == latest_scan.scan_id).all()
        else:
            reports = []

    # Collect all findings
    all_findings = []
    for report in reports:
        for f_dict in report.findings or []:
            all_findings.append(f_dict)

    mapper = ComplianceMapper()
    compliance = mapper.get_compliance_summary(all_findings)

    return {
        "project_id": project_id,
        "scan_id": current_scan_id,
        "compliance": compliance,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/projects/{project_id}/reports/unified/export",
  responses={404: {"description": "Not found"}})
def export_unified_report(
    project_id: str,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
    format: str = "html",
    scan_id: Optional[str] = None,
    report_type: str = "technical",
):
    """Export unified report as HTML or PDF"""
    _verify_project_ownership(db, project_id, request, current_user)

    # Get unified report data (similar to get_unified_report)
    query = db.query(ScanReportDB).filter(ScanReportDB.project_id == project_id)

    current_scan_id = scan_id

    if scan_id:
        query = query.filter(ScanReportDB.scan_id == scan_id)
    else:
        latest_scan = (
            db.query(ScanDB)
            .filter(ScanDB.project_id == project_id, ScanDB.state == "COMPLETED")
            .order_by(ScanDB.finished_at.desc())
            .first()
        )
        if latest_scan:
            current_scan_id = latest_scan.scan_id
            query = query.filter(ScanReportDB.scan_id == latest_scan.scan_id)

    reports = query.all()

    # Collect findings into SecurityFinding objects
    all_findings = []
    for report in reports:
        for f_dict in report.findings or []:
            all_findings.append(
                SecurityFinding(
                    id=f_dict.get("id", "unknown"),
                    tool=report.tool_name,
                    severity=f_dict.get("severity", "Info"),
                    title=f_dict.get("title", "Untitled"),
                    description=f_dict.get("description", ""),
                    cve=f_dict.get("cve"),
                    host=f_dict.get("host"),
                    port=f_dict.get("port"),
                    package=f_dict.get("package"),
                    recommendation=f_dict.get("recommendation", ""),
                    raw_evidence=f_dict.get("raw_evidence", ""),
                )
            )

    # Get project name if available
    project = db.query(ProjectDB).filter(ProjectDB.project_id == project_id).first()
    project_name = project.name if project else project_id

    # Determine scan_id for report
    used_scan_id = current_scan_id or "unknown"

    # Normalize report_type
    valid_types = {"executive", "technical", "compliance", "comparison"}
    rtype = report_type if report_type in valid_types else "technical"

    generator = UnifiedReportGenerator(
        project_id=project_id,
        scan_id=used_scan_id,
        findings=all_findings,
        project_name=project_name,
        report_type=rtype,
    )

    if format == "pdf":
        content = generator.generate_pdf()
        media_type = "application/pdf"
        ext = "pdf"
    else:
        content = generator.generate_html()
        media_type = "text/html"
        ext = "html"

    from fastapi.responses import Response

    return Response(
        content=content,
        media_type=media_type,
        headers={
            "Content-Disposition": f"attachment; filename=security-report-project-{project_id}.{ext}"
        },
    )


# Developer Dashboard Models
class FileMeasures(BaseModel):
    coverage: str = "0"
    complexity: str = "0"
    cognitive_complexity: str = "0"
    duplicated_lines_density: str = "0"
    ncloc: str = "0"


class DeveloperIssue(BaseModel):
    id: str
    line: Optional[int] = None
    message: str
    severity: str
    effort: Optional[str] = None
    type: Optional[str] = None
    rule: Optional[str] = None
    rule_name: Optional[str] = None
    description: Optional[str] = None
    recommendation: Optional[str] = None
    file_path: Optional[str] = None


class FileHealth(BaseModel):
    file_path: str
    component_key: str
    measures: FileMeasures
    issues: List[DeveloperIssue]


class QualityGateCondition(BaseModel):
    metric: str
    status: str
    actual: str = ""
    expected: str = ""


class QualityGateStatus(BaseModel):
    status: str
    conditions: List[QualityGateCondition]


class DeveloperReportSummary(BaseModel):
    total_files: int
    files_with_issues: int
    total_issues: int


class DeveloperReportResponse(BaseModel):
    project_id: str
    scan_id: str
    quality_gate: QualityGateStatus
    files: List[FileHealth]
    summary: DeveloperReportSummary


@router.get(
    "/projects/{project_id}/reports/{scan_id}/developer",
    response_model=DeveloperReportResponse,
)
async def get_developer_report(
    project_id: str,
    scan_id: str,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user=Depends(get_current_user),
):
    """Aggregated developer report for a specific scan with SonarQube data."""
    # Every other endpoint in this file uses _verify_project_ownership; this one only
    # checked the project *existed*, with no RBAC/ownership check at all (finding
    # #115) — any authenticated user could read per-file Sonar issues, coverage, and
    # quality-gate detail for a project they have no assignment to.
    project = _verify_project_ownership(db, project_id, request, current_user)

    # Get scan reports for this scan
    reports = (
        db.query(ScanReportDB)
        .filter(
            ScanReportDB.project_id == project_id,
            ScanReportDB.scan_id == scan_id,
        )
        .all()
    )

    if not reports:
        raise HTTPException(status_code=404, detail="No reports found for this scan")

    # Aggregate findings by file
    files_map: dict[str, list] = {}
    for report in reports:
        findings = report.findings or []
        for f in findings:
            file_path = f.get("file_path") or f.get("host") or "unknown"
            if file_path not in files_map:
                files_map[file_path] = []
            files_map[file_path].append(f)

    # Fetch SonarQube data if available
    sonar_key = project.sonar_key
    quality_gate = {"status": "UNKNOWN", "conditions": []}
    file_measures: dict[str, dict] = {}

    if sonar_key:
        from app.services.reporting.parsers.sonar import (
            fetch_sonar_quality_gate,
            fetch_sonar_measures,
        )

        quality_gate = await fetch_sonar_quality_gate(sonar_key)

        # Fetch measures for each file with issues
        for file_path in files_map.keys():
            component_key = f"{sonar_key}:{file_path}"
            measures = await fetch_sonar_measures(component_key)
            if measures:
                file_measures[file_path] = measures

    # Build file health list
    files_health = []
    for file_path, issues in files_map.items():
        component_key = f"{sonar_key}:{file_path}" if sonar_key else file_path
        measures = file_measures.get(file_path, {})

        developer_issues = []
        for issue in issues:
            developer_issues.append(
                DeveloperIssue(
                    id=issue.get("id", ""),
                    line=issue.get("line_number"),
                    message=issue.get("title", ""),
                    severity=issue.get("severity", "Unknown"),
                    effort=issue.get("effort"),
                    type=issue.get("finding_type"),
                    rule=issue.get("rule"),
                    rule_name=issue.get("rule_name"),
                    description=issue.get("description"),
                    recommendation=issue.get("recommendation"),
                    file_path=issue.get("file_path"),
                )
            )

        files_health.append(
            FileHealth(
                file_path=file_path,
                component_key=component_key,
                measures=FileMeasures(**measures),
                issues=developer_issues,
            )
        )

    # Sort by issue count (most issues first)
    files_health.sort(key=lambda f: len(f.issues), reverse=True)

    # Build summary
    total_issues = sum(len(f.issues) for f in files_health)
    summary = DeveloperReportSummary(
        total_files=len(files_health),
        files_with_issues=len([f for f in files_health if f.issues]),
        total_issues=total_issues,
    )

    # Build quality gate response
    qg_response = QualityGateStatus(
        status=quality_gate.get("status", "UNKNOWN"),
        conditions=[
            QualityGateCondition(**c)
            for c in quality_gate.get("conditions", [])
        ],
    )

    return DeveloperReportResponse(
        project_id=project_id,
        scan_id=scan_id,
        quality_gate=qg_response,
        files=files_health,
        summary=summary,
    )


@router.get("/file-measures/{component_key:path}")
async def get_file_measures(
    component_key: str,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user=Depends(get_current_user),
):
    """Fetch SonarQube measures for a specific file."""
    # Previously had zero ownership check of any kind (finding #115) — any
    # authenticated user could pull Sonar file-level measures for arbitrary
    # sonar_key:file_path combinations across the whole system, not just their own
    # projects. component_key is "{sonar_key}:{file_path}"; split on the first ':'
    # (a file path can itself contain ':' on some filesystems, sonar_key cannot) to
    # recover the project and run it through the same ownership check every other
    # endpoint in this file uses.
    sonar_key = component_key.split(":", 1)[0]
    project = db.query(ProjectDB).filter(ProjectDB.sonar_key == sonar_key).first()
    if not project:
        raise HTTPException(status_code=404, detail=_PROJECT_NOT_FOUND)
    _verify_project_ownership(db, project.project_id, request, current_user)

    from app.services.reporting.parsers.sonar import fetch_sonar_measures

    measures = await fetch_sonar_measures(component_key)
    return {"component_key": component_key, "measures": measures}
