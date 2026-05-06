"""
Unified Security Report Generator
Refactored from backend/nmap_system/reporter.py (2205 lines)
"""
import json
from datetime import datetime
from typing import List, Optional, Dict, Any, Literal
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY

from app.services.reporting.parsers.base import SecurityFinding, calculate_severity_summary
from app.services.reporting.risk_calculator import RiskCalculator

ReportType = Literal["executive", "technical", "compliance", "comparison"]
from app.services.reporting.risk_calculator import RiskCalculator

# Color constants
DARK_BLUE = colors.HexColor("#1F3864")
MID_BLUE = colors.HexColor("#2E5FA3")
LIGHT_BLUE = colors.HexColor("#D6E4F7")
CRITICAL_COLOR = colors.HexColor("#DC2626")
HIGH_COLOR = colors.HexColor("#EA580C")
MEDIUM_COLOR = colors.HexColor("#CA8A04")
LOW_COLOR = colors.HexColor("#16A34A")


class UnifiedReportGenerator:
    """Generate unified HTML/PDF reports from all tool findings"""

    def __init__(
        self,
        project_id: str,
        scan_id: str,
        findings: List[SecurityFinding],
        project_name: str = "Project",
        report_type: ReportType = "technical"
    ):
        self.project_id = project_id
        self.scan_id = scan_id
        self.findings = findings
        self.project_name = project_name
        self.report_type = report_type
        self.severity_summary = calculate_severity_summary(findings)

    def generate_html(self) -> str:
        """Generate standalone HTML report based on report type"""
        # Common head and opening
        html_parts = []
        html_parts.append(f"""<!DOCTYPE html>
<html>
<head>
    <title>Security Report - {self.project_name}</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 40px; }}
        .critical {{ color: #dc2626; font-weight: bold; }}
        .high {{ color: #ea580c; font-weight: bold; }}
        .medium {{ color: #ca8a04; font-weight: bold; }}
        .low {{ color: #16a34a; }}
        table {{ border-collapse: collapse; width: 100%; margin: 20px 0; }}
        th, td {{ border: 1px solid #ddd; padding: 12px; text-align: left; }}
        th {{ background-color: #f2f2f2; }}
        .section {{ margin-bottom: 40px; }}
        .risk-badge {{
            display: inline-block;
            padding: 8px 16px;
            border-radius: 8px;
            font-weight: bold;
        }}
        .risk-Low\ Risk {{ background-color: #dcfce7; color:#166534; }}
        .risk-Medium\ Risk {{ background-color: #fef9c3; color:#854d0e; }}
        .risk-High\ Risk {{ background-color: #fed7aa; color:#9a3412; }}
        .risk-Critical\ Risk {{ background-color: #fecaca; color:#991b1b; }}
    </style>
</head>
<body>
    <h1>Security Report</h1>
    <p><strong>Project:</strong> {self.project_name}</p>
    <p><strong>Scan ID:</strong> {self.scan_id}</p>
    <p><strong>Generated:</strong> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
    <p><strong>Report Type:</strong> {self.report_type.capitalize()}</p>
""")

        # Common Summary section (all types)
        html_parts.append("""
<div class="section">
<h2>Summary</h2>
<p>
    Critical: <span class="critical">{}</span> |
    High: <span class="high">{}</span> |
    Medium: <span class="medium">{}</span> |
    Low: <span class="low">{}</span>
</p>
</div>
""".format(
            self.severity_summary.get('critical', 0),
            self.severity_summary.get('high', 0),
            self.severity_summary.get('medium', 0),
            self.severity_summary.get('low', 0)
        ))

        # Risk Score section (all types)
        risk = self.generate_risk_summary()
        html_parts.append(f"""<div class="section">
<h2>Risk Assessment</h2>
<p>Risk Score: <strong>{risk['score']}/100</strong></p>
<p>Level: {risk['level']}</p>
<p>Trend: {risk['trend'].capitalize()}</p>
<p>Previous Score: {risk.get('previous_score', 'N/A')}</p>
</div>
""")

        # Type-specific content
        if self.report_type == "technical":
            # Technical full findings
            html_parts.append(f"""<div class="section">
<h2>Findings ({len(self.findings)} total)</h2>
<table>
    <tr>
        <th>Severity</th>
        <th>Title</th>
        <th>Tool</th>
        <th>Host/Package</th>
    </tr>
""")
            for finding in self.findings:
                severity_class = finding.severity.lower()
                html_parts.append(f"""
    <tr>
        <td class="{severity_class}">{finding.severity}</td>
        <td>{finding.title}</td>
        <td>{finding.tool}</td>
        <td>{finding.host or finding.package or '-'}</td>
    </tr>
""")
            html_parts.append("</table></div>")

        elif self.report_type == "executive":
            # Executive summary only: no detailed findings
            html_parts.append("""<div class="section">
<h2>Executive Summary</h2>
<p>This executive summary presents the high-level security posture. For detailed findings, please refer to a technical report.</p>
</div>
""")

        elif self.report_type == "compliance":
            # Compliance mapping
            from app.services.reporting.compliance_mapper import ComplianceMapper
            mapper = ComplianceMapper()
            findings_dict = [f.to_dict() for f in self.findings]
            compliance = mapper.get_compliance_summary(findings_dict)

            html_parts.append("""<div class="section">
<h2>OWASP Top 10 2021 Compliance</h2>
<table>
    <tr><th>Category</th><th>Name</th><th>Count</th></tr>
""")
            for item in compliance.get("owasp_top_10", []):
                html_parts.append(f"<tr><td>{item['id']}</td><td>{item['name']}</td><td>{item['count']}</td></tr>")
            html_parts.append("</table></div>")

            html_parts.append("""<div class="section">
<h2>CWE Top 25 Compliance</h2>
<table>
    <tr><th>CWE ID</th><th>Count</th></tr>
""")
            for cwe in compliance.get("cwe_top_25", []):
                html_parts.append(f"<tr><td>{cwe['id']}</td><td>{cwe['count']}</td></tr>")
            html_parts.append("</table></div>")

        elif self.report_type == "comparison":
            # Show comparison with previous scan
            from app.core.db import SessionLocal
            from app.models.db_models import ScanReportDB, ScanDB
            from sqlalchemy import desc
            db = SessionLocal()
            try:
                previous = (
                    db.query(ScanReportDB)
                    .join(ScanDB, ScanReportDB.scan_id == ScanDB.scan_id)
                    .filter(ScanReportDB.project_id == self.project_id)
                    .filter(ScanReportDB.scan_id != self.scan_id)
                    .filter(ScanDB.state == "COMPLETED")
                    .order_by(desc(ScanDB.finished_at))
                    .first()
                )
                prev_severity = previous.severity_summary if previous else {"critical": 0, "high": 0, "medium": 0, "low": 0}
                prev_findings_count = sum(prev_severity.values())
                curr_counts = self.severity_summary
                diff = {
                   sev: curr_counts.get(sev,0) - prev_severity.get(sev,0)
                    for sev in ["critical","high","medium","low"]
                }
                total_diff = sum(curr_counts.values()) - prev_findings_count
            finally:
                db.close()

            html_parts.append("""<div class="section">
<h2>Comparison with Previous Scan</h2>
<table>
    <tr><th>Severity</th><th>Current</th><th>Previous</th><th>Change</th></tr>
""")
            for sev in ["critical","high","medium","low"]:
                cur = self.severity_summary.get(sev,0)
                prev = prev_severity.get(sev,0)
                change = diff[sev]
                change_str = f"+{change}" if change > 0 else str(change)
                html_parts.append(f"<tr><td>{sev.capitalize()}</td><td>{cur}</td><td>{prev}</td><td>{change_str}</td></tr>")
            html_parts.append("</table></div>")

        html_parts.append("""
</body>
</html>
""")
        return "".join(html_parts)

    def generate_pdf(self) -> bytes:
        """Generate PDF report using ReportLab"""
        from io import BytesIO
        buffer = BytesIO()

        doc = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            rightMargin=72,
            leftMargin=72,
            topMargin=72,
            bottomMargin=18,
        )

        styles = getSampleStyleSheet()
        elements = []

        # Title
        elements.append(Paragraph(f"Security Report - {self.project_name}", styles['Heading1']))
        elements.append(Spacer(1, 0.3 * inch))

        # Summary table (all types)
        summary_data = [
            ['Severity', 'Count'],
            ['Critical', str(self.severity_summary.get('critical', 0))],
            ['High', str(self.severity_summary.get('high', 0))],
            ['Medium', str(self.severity_summary.get('medium', 0))],
            ['Low', str(self.severity_summary.get('low', 0))],
        ]
        table = Table(summary_data, colWidths=[2 * inch, 1 * inch])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), DARK_BLUE),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ]))
        elements.append(table)
        elements.append(Spacer(1, 0.3 * inch))

        # Risk score (all types)
        risk = self.generate_risk_summary()
        elements.append(Paragraph(f"Risk Score: {risk['score']}/100", styles['Heading2']))
        elements.append(Paragraph(f"Level: {risk['level']}", styles['Normal']))
        elements.append(Paragraph(f"Trend: {risk['trend'].capitalize()}", styles['Normal']))
        elements.append(Spacer(1, 0.2 * inch))

        # Type-specific content
        if self.report_type == "technical":
            # Findings table
            elements.append(Paragraph("Detailed Findings", styles['Heading2']))
            findings_data = [["Severity", "Title", "Tool", "Host/Package"]]
            for f in self.findings:
                findings_data.append([
                    f.severity,
                    f.title[:80] + ("..." if len(f.title) > 80 else ""),
                    f.tool,
                    f.host or f.package or "-"
                ])
            findings_table = Table(findings_data, colWidths=[1*inch, 3*inch, 1.5*inch, 1.5*inch])
            findings_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
            ]))
            elements.append(findings_table)

        elif self.report_type == "executive":
            elements.append(Paragraph("Executive Summary", styles['Heading2']))
            elements.append(Paragraph(
                "This executive summary presents the high-level security posture. "
                "For detailed findings, please refer to a technical report.",
                styles['Normal']
            ))

        elif self.report_type == "compliance":
            elements.append(Paragraph("OWASP Top 10 2021 Compliance", styles['Heading2']))
            from app.services.reporting.compliance_mapper import ComplianceMapper
            mapper = ComplianceMapper()
            findings_dict = [f.to_dict() for f in self.findings]
            compliance = mapper.get_compliance_summary(findings_dict)
            owasp_data = [["Category", "Name", "Count"]]
            for item in compliance.get("owasp_top_10", []):
                owasp_data.append([item["id"], item["name"], str(item["count"])])
            owasp_table = Table(owasp_data, colWidths=[1.5*inch, 3*inch, 1*inch])
            owasp_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1F3864")),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ]))
            elements.append(owasp_table)
            elements.append(Spacer(1, 0.3 * inch))

            elements.append(Paragraph("CWE Top 25", styles['Heading3']))
            cwe_data = [["CWE ID", "Count"]]
            for cwe in compliance.get("cwe_top_25", []):
                cwe_data.append([cwe["id"], str(cwe["count"])])
            cwe_table = Table(cwe_data, colWidths=[2*inch, 1*inch])
            cwe_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1F3864")),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ]))
            elements.append(cwe_table)

        elif self.report_type == "comparison":
            elements.append(Paragraph("Comparison with Previous Scan", styles['Heading2']))
            # Fetch previous scan severity
            from app.core.db import SessionLocal
            from app.models.db_models import ScanReportDB, ScanDB
            from sqlalchemy import desc
            db = SessionLocal()
            try:
                previous = (
                    db.query(ScanReportDB)
                    .join(ScanDB, ScanReportDB.scan_id == ScanDB.scan_id)
                    .filter(ScanReportDB.project_id == self.project_id)
                    .filter(ScanReportDB.scan_id != self.scan_id)
                    .filter(ScanDB.state == "COMPLETED")
                    .order_by(desc(ScanDB.finished_at))
                    .first()
                )
                prev_severity = previous.severity_summary if previous else {"critical": 0, "high": 0, "medium": 0, "low": 0}
            finally:
                db.close()

            comp_data = [["Severity", "Current", "Previous", "Change"]]
            curr = self.severity_summary
            for sev in ["critical", "high", "medium", "low"]:
                cur = curr.get(sev, 0)
                prev = prev_severity.get(sev, 0)
                change = cur - prev
                change_str = f"+{change}" if change > 0 else str(change)
                comp_data.append([sev.capitalize(), str(cur), str(prev), change_str])
            comp_table = Table(comp_data, colWidths=[1.5*inch, 1.5*inch, 1.5*inch, 1*inch])
            comp_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), DARK_BLUE),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ]))
            elements.append(comp_table)

        # Build PDF
        doc.build(elements)
        return buffer.getvalue()

    def generate_risk_summary(self) -> dict:
        """Generate risk score and trend"""
        calculator = RiskCalculator()
        score = calculator.calculate(self.severity_summary)

        # Get previous scan for trend (if available)
        from app.core.db import SessionLocal
        from app.models.db_models import ScanReportDB, ScanDB
        from sqlalchemy import desc

        db = SessionLocal()
        try:
            previous = (
                db.query(ScanReportDB)
                .join(ScanDB, ScanReportDB.scan_id == ScanDB.scan_id)
                .filter(ScanReportDB.project_id == self.project_id)
                .filter(ScanReportDB.scan_id != self.scan_id)
                .filter(ScanDB.state == "COMPLETED")
                .order_by(desc(ScanDB.finished_at))
                .first()
            )

            previous_severity = previous.severity_summary if previous else {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
            previous_score = calculator.calculate(previous_severity)

            return {
                "score": score,
                "trend": calculator.get_trend(score, previous_score),
                "level": calculator.get_risk_level(score),
                "previous_score": previous_score,
            }
        finally:
            db.close()
