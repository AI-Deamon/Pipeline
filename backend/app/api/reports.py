from typing import List, Optional
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


class ReportSummary(BaseModel):
    project_id: str
    total_findings: int
    severity: SeveritySummary
    tools: List[ToolSummary]


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


def _is_api_key_auth(request: Request) -> bool:
    """Check if request is authenticated via API key (service account pattern)."""
    api_key = request.headers.get("X-API-Key")
    return bool(api_key and api_key == settings.API_KEY)


def _verify_project_ownership(db: Session, project_id: str, request: Request, current_user) -> ProjectDB:
    """Verify the project belongs to the current user. API-key auth bypasses this check."""
    if _is_api_key_auth(request):
        project = db.query(ProjectDB).filter(ProjectDB.project_id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        return project
    project = db.query(ProjectDB).filter(
        ProjectDB.project_id == project_id,
        ProjectDB.user_id == (current_user.id if hasattr(current_user, 'id') else None)
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("/projects/{project_id}/reports", response_model=List[ReportDetail])
def get_project_reports(
    project_id: str,
    request: Request,
    scan_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
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
        )
        for r in reports
    ]


@router.get("/projects/{project_id}/reports/summary", response_model=ReportSummary)
def get_reports_summary(
    project_id: str,
    request: Request,
    scan_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Get combined severity counts across all tools, optionally filtered by scan_id"""
    _verify_project_ownership(db, project_id, request, current_user)

    query = db.query(ScanReportDB).filter(ScanReportDB.project_id == project_id)
    if scan_id:
        query = query.filter(ScanReportDB.scan_id == scan_id)
    reports = query.all()

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
            )
        )

    return ReportSummary(
        project_id=project_id,
        total_findings=total_findings,
        severity=severity,
        tools=tools,
    )


@router.get("/{report_id}", response_model=ReportDetail)
def get_report(report_id: int, db: Session = Depends(get_db)):
    """Get detailed report for a specific tool"""
    report = db.query(ScanReportDB).filter(ScanReportDB.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    return ReportDetail(
        id=report.id,
        scan_id=report.scan_id,
        tool=report.tool_name,
        severity_summary=report.severity_summary or SeveritySummary(),
        findings=[FindingItem(**f) for f in (report.findings or [])],
        report_url=report.report_url,
        created_at=report.created_at.isoformat() if report.created_at else "",
    )


@router.get("/{report_id}/download")
def download_raw_report(report_id: int, db: Session = Depends(get_db)):
    """Download raw JSON report"""
    report = db.query(ScanReportDB).filter(ScanReportDB.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    if not report.raw_report:
        raise HTTPException(status_code=404, detail="Raw report not available")

    return {
        "content": report.raw_report,
        "filename": f"{report.tool_name}_report.json",
        "content_type": "application/json",
    }


@router.delete("/{report_id}")
def delete_report(report_id: int, db: Session = Depends(get_db)):
    """Delete a specific report"""
    report = db.query(ScanReportDB).filter(ScanReportDB.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    db.delete(report)
    db.commit()

    return {"status": "success", "message": f"Report {report_id} deleted"}


@router.get("/projects/{project_id}/reports/unified")
def get_unified_report(
    project_id: str, scan_id: Optional[str] = None, db: Session = Depends(get_db)
):
    """Get unified report combining all tools"""
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


@router.get("/projects/{project_id}/reports/trends")
def get_report_trends(project_id: str, days: int = 30, db: Session = Depends(get_db)):
    """Get findings trends over time"""
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


@router.get("/projects/{project_id}/reports/compliance")
def get_compliance_report(
    project_id: str, scan_id: Optional[str] = None, db: Session = Depends(get_db)
):
    """Get OWASP Top 10 and CWE Top 25 compliance report"""
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


@router.get("/projects/{project_id}/reports/unified/export")
def export_unified_report(
    project_id: str,
    format: str = "html",
    scan_id: Optional[str] = None,
    report_type: str = "technical",
    db: Session = Depends(get_db),
):
    """Export unified report as HTML or PDF"""
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
