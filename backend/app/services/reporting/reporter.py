"""
Unified Security Report Generator
Refactored from backend/nmap_system/reporter.py (2205 lines)
"""
import json
from datetime import datetime
from typing import List, Optional, Dict, Any
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
        project_name: str = "Project"
    ):
        self.project_id = project_id
        self.scan_id = scan_id
        self.findings = findings
        self.project_name = project_name
        self.severity_summary = calculate_severity_summary(findings)

    def generate_html(self) -> str:
        """Generate standalone HTML report"""
        html_template = f"""
<!DOCTYPE html>
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
    </style>
</head>
<body>
    <h1>Security Report</h1>
    <p><strong>Project:</strong> {self.project_name}</p>
    <p><strong>Scan ID:</strong> {self.scan_id}</p>
    <p><strong>Generated:</strong> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>

    <h2>Severity Summary</h2>
    <p>
        Critical: <span class="critical">{self.severity_summary.get('critical', 0)}</span> |
        High: <span class="high">{self.severity_summary.get('high', 0)}</span> |
        Medium: <span class="medium">{self.severity_summary.get('medium', 0)}</span> |
        Low: <span class="low">{self.severity_summary.get('low', 0)}</span>
    </p>

    <h2>Findings ({len(self.findings)} total)</h2>
    <table>
        <tr>
            <th>Severity</th>
            <th>Title</th>
            <th>Tool</th>
            <th>Host/Package</th>
        </tr>
"""

        for finding in self.findings:
            severity_class = finding.severity.lower()
            html_template += f"""
        <tr>
            <td class="{severity_class}">{finding.severity}</td>
            <td>{finding.title}</td>
            <td>{finding.tool}</td>
            <td>{finding.host or finding.package or '-'}</td>
        </tr>
"""

        html_template += """
    </table>
</body>
</html>
"""
        return html_template

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

        # Summary
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
        elements.append(Spacer(1, 0.5 * inch))

        # Build PDF
        doc.build(elements)
        return buffer.getvalue()
