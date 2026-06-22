"""
Unified Security Report Generator
Refactored from backend/nmap_system/reporter.py (2205 lines)
"""
import html as html_module
import json
from datetime import datetime
from typing import List, Optional, Dict, Any, Literal
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY

from app.services.reporting.parsers.base import SecurityFinding, calculate_severity_summary
from app.services.reporting.risk_calculator import RiskCalculator

ReportType = Literal["executive", "technical", "compliance", "comparison"]

def _esc(s: str) -> str:
    return html_module.escape(str(s))

_AMP_ENTITY = "&amp;"
_CLOSING_TABLE_DIV = "</table></div>"

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

    def _html_header(self) -> str:
        return f"""<!DOCTYPE html>
<html>
<head>
    <title>Security Report - {_esc(self.project_name)}</title>
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
        .risk-Low\\ Risk {{ background-color: #dcfce7; color:#166534; }}
        .risk-Medium\\ Risk {{ background-color: #fef9c3; color:#854d0e; }}
        .risk-High\\ Risk {{ background-color: #fed7aa; color:#9a3412; }}
        .risk-Critical\\ Risk {{ background-color: #fecaca; color:#991b1b; }}
    </style>
</head>
<body>
    <h1>Security Report</h1>
    <p><strong>Project:</strong> {_esc(self.project_name)}</p>
    <p><strong>Scan ID:</strong> {_esc(self.scan_id)}</p>
    <p><strong>Generated:</strong> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
    <p><strong>Report Type:</strong> {_esc(self.report_type.capitalize())}</p>
"""

    def _html_summary_section(self) -> str:
        return f"""
<div class="section">
<h2>Summary</h2>
<p>
    Critical: <span class="critical">{self.severity_summary.get('critical', 0)}</span> |
    High: <span class="high">{self.severity_summary.get('high', 0)}</span> |
    Medium: <span class="medium">{self.severity_summary.get('medium', 0)}</span> |
    Low: <span class="low">{self.severity_summary.get('low', 0)}</span>
</p>
</div>
"""

    def _html_risk_section(self) -> str:
        risk = self.generate_risk_summary()
        return f"""<div class="section">
<h2>Risk Assessment</h2>
<p>Risk Score: <strong>{risk['score']}/100</strong></p>
<p>Level: {risk['level']}</p>
<p>Trend: {risk['trend'].capitalize()}</p>
<p>Previous Score: {risk.get('previous_score', 'N/A')}</p>
</div>
"""

    def _html_technical_section(self) -> str:
        parts = [f"""<div class="section">
<h2>Findings ({len(self.findings)} total)</h2>
<table>
    <tr>
        <th>Severity</th>
        <th>Title</th>
        <th>Tool</th>
        <th>Host/Package</th>
    </tr>
"""]
        for finding in self.findings:
            severity_class = finding.severity.lower()
            safe_title = finding.title.replace("&", _AMP_ENTITY).replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
            safe_tool = finding.tool.replace("&", _AMP_ENTITY).replace("<", "&lt;").replace(">", "&gt;")
            safe_host = (finding.host or finding.package or "-").replace("&", _AMP_ENTITY).replace("<", "&lt;").replace(">", "&gt;")
            parts.append(f"""
    <tr>
        <td class="{severity_class}">{finding.severity}</td>
        <td>{safe_title}</td>
        <td>{safe_tool}</td>
        <td>{safe_host}</td>
    </tr>
""")
        parts.append(_CLOSING_TABLE_DIV)
        return "".join(parts)

    def _html_executive_section(self) -> str:
        return """<div class="section">
<h2>Executive Summary</h2>
<p>This executive summary presents the high-level security posture. For detailed findings, please refer to a technical report.</p>
</div>
"""

    def _html_compliance_section(self) -> str:
        from app.services.reporting.compliance_mapper import ComplianceMapper
        mapper = ComplianceMapper()
        findings_dict = [f.to_dict() for f in self.findings]
        compliance = mapper.get_compliance_summary(findings_dict)
        parts = ["""<div class="section">
<h2>OWASP Top 10 2021 Compliance</h2>
<table>
    <tr><th>Category</th><th>Name</th><th>Count</th></tr>
"""]
        for item in compliance.get("owasp_top_10", []):
            parts.append(f"<tr><td>{item['id']}</td><td>{item['name']}</td><td>{item['count']}</td></tr>")
        parts.append(_CLOSING_TABLE_DIV)

        parts.append("""<div class="section">
<h2>CWE Top 25 Compliance</h2>
<table>
    <tr><th>CWE ID</th><th>Count</th></tr>
""")
        for cwe in compliance.get("cwe_top_25", []):
            parts.append(f"<tr><td>{cwe['id']}</td><td>{cwe['count']}</td></tr>")
        parts.append(_CLOSING_TABLE_DIV)
        return "".join(parts)

    def _html_comparison_section(self) -> str:
        prev_severity = self._get_previous_scan_severity()
        prev_findings_count = sum(prev_severity.values())
        curr_counts = self.severity_summary
        diff = {
           sev: curr_counts.get(sev,0) - prev_severity.get(sev,0)
            for sev in ["critical","high","medium","low"]
        }
        parts = ["""<div class="section">
<h2>Comparison with Previous Scan</h2>
<table>
    <tr><th>Severity</th><th>Current</th><th>Previous</th><th>Change</th></tr>
"""]
        for sev in ["critical","high","medium","low"]:
            cur = self.severity_summary.get(sev,0)
            prev = prev_severity.get(sev,0)
            change = diff[sev]
            change_str = f"+{change}" if change > 0 else str(change)
            parts.append(f"<tr><td>{sev.capitalize()}</td><td>{cur}</td><td>{prev}</td><td>{change_str}</td></tr>")
        parts.append(_CLOSING_TABLE_DIV)
        return "".join(parts)

    def _html_type_specific(self) -> str:
        if self.report_type == "technical":
            return self._html_technical_section()
        elif self.report_type == "executive":
            return self._html_executive_section()
        elif self.report_type == "compliance":
            return self._html_compliance_section()
        elif self.report_type == "comparison":
            return self._html_comparison_section()
        return ""

    def generate_html(self) -> str:
        html_parts = [
            self._html_header(),
            self._html_summary_section(),
            self._html_risk_section(),
            self._html_type_specific(),
            "\n</body>\n</html>\n",
        ]
        return "".join(html_parts)

    def _pdf_summary_table(self, styles) -> Table:
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
        return table

    def _pdf_risk_elements(self, styles) -> list:
        risk = self.generate_risk_summary()
        return [
            Paragraph(f"Risk Score: {risk['score']}/100", styles['Heading2']),
            Paragraph(f"Level: {risk['level']}", styles['Normal']),
            Paragraph(f"Trend: {risk['trend'].capitalize()}", styles['Normal']),
            Spacer(1, 0.2 * inch),
        ]

    def _pdf_technical_elements(self, styles) -> list:
        elements = [
            Paragraph("Detailed Findings", styles['Heading2']),
        ]
        findings_data = [[
            Paragraph("Severity", styles["BodyText"]),
            Paragraph("Title", styles["BodyText"]),
            Paragraph("Tool", styles["BodyText"]),
            Paragraph("Host/Package", styles["BodyText"])
        ]]
        for f in self.findings:
            findings_data.append([
                Paragraph(str(f.severity), styles["BodyText"]),
                Paragraph(str(f.title), styles["BodyText"]),
                Paragraph(str(f.tool), styles["BodyText"]),
                Paragraph(str(f.host or f.package or "-"), styles["BodyText"])
            ])
        findings_table = Table(findings_data, colWidths=[0.8*inch, 4.5*inch, 1.0*inch, 1.8*inch])
        findings_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
        ]))
        elements.append(findings_table)
        return elements

    def _pdf_executive_elements(self, styles) -> list:
        return [
            Paragraph("Executive Summary", styles['Heading2']),
            Paragraph(
                "This executive summary presents the high-level security posture. "
                "For detailed findings, please refer to a technical report.",
                styles['Normal']
            ),
        ]

    def _pdf_compliance_elements(self, styles) -> list:
        from app.services.reporting.compliance_mapper import ComplianceMapper
        mapper = ComplianceMapper()
        findings_dict = [f.to_dict() for f in self.findings]
        compliance = mapper.get_compliance_summary(findings_dict)

        elements = [Paragraph("OWASP Top 10 2021 Compliance", styles['Heading2'])]

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
        return elements

    def _pdf_comparison_elements(self, styles) -> list:
        prev_severity = self._get_previous_scan_severity()
        elements = [Paragraph("Comparison with Previous Scan", styles['Heading2'])]
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
        return elements

    def generate_pdf(self) -> bytes:
        from io import BytesIO
        buffer = BytesIO()

        doc = SimpleDocTemplate(
            buffer,
            pagesize=landscape(letter),
            rightMargin=72,
            leftMargin=72,
            topMargin=72,
            bottomMargin=18,
        )

        styles = getSampleStyleSheet()
        elements = []

        elements.append(Paragraph(f"Security Report - {self.project_name}", styles['Heading1']))
        elements.append(Spacer(1, 0.3 * inch))

        elements.append(self._pdf_summary_table(styles))
        elements.append(Spacer(1, 0.3 * inch))

        elements.extend(self._pdf_risk_elements(styles))

        if self.report_type == "technical":
            elements.extend(self._pdf_technical_elements(styles))
        elif self.report_type == "executive":
            elements.extend(self._pdf_executive_elements(styles))
        elif self.report_type == "compliance":
            elements.extend(self._pdf_compliance_elements(styles))
        elif self.report_type == "comparison":
            elements.extend(self._pdf_comparison_elements(styles))

        doc.build(elements)
        return buffer.getvalue()

    def _get_previous_scan_severity(self) -> dict:
        from app.core.db import SessionLocal
        from app.models.db_models import ScanReportDB, ScanDB
        from sqlalchemy import desc

        db = SessionLocal()
        try:
            previous_scan = (
                db.query(ScanDB)
                .filter(ScanDB.project_id == self.project_id)
                .filter(ScanDB.scan_id != self.scan_id)
                .filter(ScanDB.state == "COMPLETED")
                .order_by(desc(ScanDB.finished_at))
                .first()
            )
            if not previous_scan:
                return {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}

            reports = (
                db.query(ScanReportDB)
                .filter(ScanReportDB.scan_id == previous_scan.scan_id)
                .all()
            )

            aggregated = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
            for report in reports:
                if report.severity_summary:
                    for key in aggregated:
                        aggregated[key] += report.severity_summary.get(key, 0)
            return aggregated
        finally:
            db.close()

    def generate_risk_summary(self) -> dict:
        calculator = RiskCalculator()
        score = calculator.calculate(self.severity_summary)

        previous_severity = self._get_previous_scan_severity()
        previous_score = calculator.calculate(previous_severity)

        return {
            "score": score,
            "trend": calculator.get_trend(score, previous_score),
            "level": calculator.get_risk_level(score),
            "previous_score": previous_score,
        }
