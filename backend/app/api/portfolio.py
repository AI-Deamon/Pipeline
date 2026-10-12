from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends
from sqlalchemy import func, and_
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.core.auth import get_current_user
from app.models.db_models import ProjectDB, ScanReportDB, IssueDB, ScanMetricDB, ScanDB
from app.services.reporting.risk_calculator import RiskCalculator
from app.services.rbac_service import get_rbac_service

router = APIRouter()
_risk_calculator = RiskCalculator()


@router.get("/portfolio/overview")
def get_portfolio_overview(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    rbac = get_rbac_service(db=db, user=current_user)
    query = db.query(ProjectDB)
    if not rbac.is_admin:
        effective = rbac.get_effective_project_ids()
        if not effective:
            return {
                "total_projects": 0,
                "total_findings": 0,
                "severity": {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0},
                "projects": [],
            }
        query = query.filter(ProjectDB.project_id.in_(effective))
    projects = query.all()
    project_ids = [p.project_id for p in projects]

    if not project_ids:
        return {
            "total_projects": 0,
            "total_findings": 0,
            "severity": {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0},
            "projects": [],
        }

    latest_reports = (
        db.query(
            ScanReportDB.project_id,
            ScanReportDB.tool_name,
            ScanReportDB.severity_summary,
            ScanReportDB.created_at,
        )
        .filter(ScanReportDB.project_id.in_(project_ids))
        .order_by(ScanReportDB.project_id, ScanReportDB.created_at.desc())
        .all()
    )

    seen = set()
    project_summaries: dict = {}
    for project_id, tool_name, severity_summary, created_at in latest_reports:
        key = (project_id, tool_name)
        if key in seen:
            continue
        seen.add(key)
        if project_id not in project_summaries:
            project_summaries[project_id] = {
                "critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0,
                "total": 0, "tools": [], "oldest_tool_report_time": None,
            }
        s = severity_summary or {}
        ps = project_summaries[project_id]
        for level in ("critical", "high", "medium", "low", "info"):
            ps[level] += s.get(level, 0)
        ps["total"] += sum(s.get(level, 0) for level in ("critical", "high", "medium", "low", "info"))
        ps["tools"].append(tool_name)
        # Finding #114: `last_scan_time` below comes from ScanDB (any scan, e.g. a
        # manual "Nmap-only" rescan updates it to today), independent of how old
        # each tool's own latest ScanReportDB actually is. Track the oldest
        # contributing tool's report time so the frontend can show that the
        # severity summary is only as fresh as its stalest tool, instead of
        # implying everything is "as of" last_scan_time.
        if created_at and (ps["oldest_tool_report_time"] is None or created_at < ps["oldest_tool_report_time"]):
            ps["oldest_tool_report_time"] = created_at

    # Fetch latest quality gate + coverage per project from ScanMetricDB (batched)
    metric_rows = (
        db.query(ScanMetricDB)
        .filter(
            ScanMetricDB.project_id.in_(project_ids),
            ScanMetricDB.tool_name == "sonar",
        )
        .order_by(ScanMetricDB.project_id, ScanMetricDB.created_at.desc())
        .all()
    )
    latest_metrics = {}
    seen_metric = set()
    for row in metric_rows:
        if row.project_id in seen_metric:
            continue
        seen_metric.add(row.project_id)
        metrics = row.metrics or {}
        latest_metrics[row.project_id] = {
            "quality_gate_status": (row.quality_gate or {}).get("status"),
            "coverage": metrics.get("coverage"),
            "bugs": metrics.get("bugs"),
            "vulnerabilities": metrics.get("vulnerabilities"),
            "code_smells": metrics.get("code_smells"),
            "ncloc": metrics.get("ncloc"),
        }

    # Fetch last scan per project (batched)
    scan_rows = (
        db.query(ScanDB.project_id, ScanDB.scan_id, ScanDB.started_at)
        .filter(
            ScanDB.project_id.in_(project_ids),
            ScanDB.state.in_(["COMPLETED", "FAILED"]),
        )
        .order_by(ScanDB.project_id, ScanDB.created_at.desc())
        .all()
    )
    last_scans = {}
    seen_scan = set()
    for row in scan_rows:
        if row.project_id in seen_scan:
            continue
        seen_scan.add(row.project_id)
        last_scans[row.project_id] = {
            "scan_id": row.scan_id,
            "scan_time": row.started_at.isoformat() if row.started_at else None,
        }

    total_severity = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
    project_list = []
    for p in projects:
        ps = project_summaries.get(p.project_id, {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0, "total": 0, "tools": [], "oldest_tool_report_time": None})
        # Previously duplicated the risk formula inline instead of calling
        # RiskCalculator (finding #113) — the two had already drifted (this copy used
        # the same flat linear weights the shared calculator no longer uses).
        risk_score = _risk_calculator.calculate(ps)
        for level in total_severity:
            total_severity[level] += ps[level]
        ls = last_scans.get(p.project_id, {})
        project_entry = {
            "project_id": p.project_id,
            "name": p.name,
            "risk_score": risk_score,
            "total_findings": ps["total"],
            "critical": ps["critical"],
            "high": ps["high"],
            "medium": ps["medium"],
            "low": ps["low"],
            "info": ps["info"],
            "tools": ps["tools"],
            "last_scan_state": p.last_scan_state,
            "last_scan_id": ls.get("scan_id"),
            "last_scan_time": ls.get("scan_time"),
            "severity_as_of": (
                ps["oldest_tool_report_time"].isoformat() if ps.get("oldest_tool_report_time") else None
            ),
        }
        metrics = latest_metrics.get(p.project_id, {})
        if metrics:
            project_entry["quality_gate_status"] = metrics["quality_gate_status"]
            project_entry["sonar_metrics"] = {
                "coverage": metrics["coverage"],
                "bugs": metrics["bugs"],
                "vulnerabilities": metrics["vulnerabilities"],
                "code_smells": metrics["code_smells"],
                "ncloc": metrics["ncloc"],
            }
        project_list.append(project_entry)

    project_list.sort(key=lambda x: x["risk_score"], reverse=True)

    return {
        "total_projects": len(projects),
        "total_findings": sum(total_severity.values()),
        "severity": total_severity,
        "projects": project_list,
    }


@router.get("/portfolio/project/{project_id}/tools")
def get_project_tool_detail(
    project_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Per-tool breakdown for a project, including severity summaries and Sonar metrics."""
    rbac = get_rbac_service(db=db, user=current_user)
    if not rbac.has_project_access(project_id):
        # 404, not 403 — same convention as project_groups.py (#116): don't
        # confirm to an out-of-scope caller that this project even exists.
        return {"error": "Project not found"}

    project = db.query(ProjectDB).filter(ProjectDB.project_id == project_id).first()
    if not project:
        return {"error": "Project not found"}

    reports = (
        db.query(ScanReportDB)
        .filter(
            ScanReportDB.project_id == project_id,
            ScanReportDB.parse_status.in_(["ok", "auth_error"]),
        )
        .order_by(ScanReportDB.created_at.desc())
        .all()
    )

    seen_tools = set()
    tool_data = []
    for report in reports:
        if report.tool_name in seen_tools:
            continue
        seen_tools.add(report.tool_name)
        s = report.severity_summary or {}
        total = sum(s.get(level, 0) for level in ("critical", "high", "medium", "low", "info"))
        entry = {
            "tool_name": report.tool_name,
            "total_findings": total,
            "critical": s.get("critical", 0),
            "high": s.get("high", 0),
            "medium": s.get("medium", 0),
            "low": s.get("low", 0),
            "info": s.get("info", 0),
            "parse_status": report.parse_status,
            "last_scan_at": report.created_at.isoformat() if report.created_at else None,
        }

        # Include Sonar metrics for sonar tool
        if report.tool_name == "sonar":
            metric_row = (
                db.query(ScanMetricDB)
                .filter(
                    ScanMetricDB.project_id == project_id,
                    ScanMetricDB.tool_name == "sonar",
                )
                .order_by(ScanMetricDB.created_at.desc())
                .first()
            )
            if metric_row:
                metrics = metric_row.metrics or {}
                entry["sonar_metrics"] = {
                    "coverage": metrics.get("coverage"),
                    "bugs": metrics.get("bugs"),
                    "vulnerabilities": metrics.get("vulnerabilities"),
                    "code_smells": metrics.get("code_smells"),
                    "ncloc": metrics.get("ncloc"),
                    "duplicated_lines_density": metrics.get("duplicated_lines_density"),
                    "sqale_index": metrics.get("sqale_index"),
                }
                qg = metric_row.quality_gate or {}
                entry["quality_gate"] = {
                    "status": qg.get("status"),
                    "conditions": qg.get("conditions", []),
                }

        tool_data.append(entry)

    return {
        "project_id": project_id,
        "project_name": project.name,
        "tools": tool_data,
    }


@router.get("/portfolio/trends")
def get_portfolio_trends(
    months: int = 6,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    rbac = get_rbac_service(db=db, user=current_user)
    if not rbac.is_admin:
        effective = rbac.get_effective_project_ids()
        if not effective:
            return {"trends": [], "months": months}

    cutoff = datetime.now(timezone.utc) - timedelta(days=months * 30)

    reports_query = (
        db.query(ScanReportDB.created_at, ScanReportDB.severity_summary, ScanReportDB.project_id)
        .filter(ScanReportDB.created_at >= cutoff)
    )
    if not rbac.is_admin:
        reports_query = reports_query.filter(ScanReportDB.project_id.in_(effective))
    reports = reports_query.order_by(ScanReportDB.created_at).all()

    monthly: dict[str, dict] = {}
    for created_at, severity_summary, project_id in reports:
        month_key = created_at.strftime("%Y-%m")
        if month_key not in monthly:
            monthly[month_key] = {
                "critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0, "total": 0,
            }
        s = severity_summary or {}
        for level in ("critical", "high", "medium", "low", "info"):
            monthly[month_key][level] += s.get(level, 0)
        monthly[month_key]["total"] += sum(s.get(l, 0) for l in ("critical", "high", "medium", "low", "info"))

    # Build coverage trend from ScanMetricDB
    metrics_query = db.query(ScanMetricDB.created_at, ScanMetricDB.metrics).filter(
        ScanMetricDB.tool_name == "sonar",
        ScanMetricDB.created_at >= cutoff,
    )
    if not rbac.is_admin:
        metrics_query = metrics_query.filter(ScanMetricDB.project_id.in_(effective))
    metrics_rows = metrics_query.order_by(ScanMetricDB.created_at).all()
    coverage_by_month: dict[str, list[float]] = {}
    for created_at, metrics in metrics_rows:
        month_key = created_at.strftime("%Y-%m")
        if month_key not in coverage_by_month:
            coverage_by_month[month_key] = []
        cov = metrics.get("coverage")
        if cov is not None:
            try:
                coverage_by_month[month_key].append(float(cov))
            except (ValueError, TypeError):
                pass

    trends = [
        {"month": month, **counts}
        for month, counts in sorted(monthly.items())
    ]

    # Merge coverage averages into trends
    for trend in trends:
        month = trend["month"]
        cov_values = coverage_by_month.get(month, [])
        if cov_values:
            trend["coverage_avg"] = round(sum(cov_values) / len(cov_values), 1)

    return {"trends": trends, "months": months}


@router.get("/portfolio/team-workload")
def get_team_workload(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    rbac = get_rbac_service(db=db, user=current_user)
    query = db.query(IssueDB).filter(IssueDB.status.in_(["open", "in_progress"]))
    if not rbac.is_admin:
        effective = rbac.get_effective_project_ids()
        if not effective:
            return {"developers": [], "unassigned": {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0, "total": 0}}
        query = query.filter(IssueDB.project_id.in_(effective))
    open_issues = query.all()

    developer_stats: dict = {}
    unassigned = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0, "total": 0}

    for issue in open_issues:
        assignee = issue.assignee_id or "unassigned"
        if assignee == "unassigned":
            severity = (issue.severity or "info").lower()
            if severity in unassigned:
                unassigned[severity] += 1
            unassigned["total"] += 1
            continue

        if assignee not in developer_stats:
            developer_stats[assignee] = {
                "username": assignee,
                "total_issues": 0,
                "critical": 0, "high": 0, "medium": 0, "low": 0,
            }
        ds = developer_stats[assignee]
        ds["total_issues"] += 1
        severity = (issue.severity or "low").lower()
        if severity in ds:
            ds[severity] += 1

    developers = sorted(developer_stats.values(), key=lambda d: d["total_issues"], reverse=True)

    return {
        "developers": developers,
        "unassigned": unassigned,
    }
