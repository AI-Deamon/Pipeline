import pytest

from app.services.reporting.parsers.base import SecurityFinding
from app.services.reporting.reporter import UnifiedReportGenerator


def _make_finding(title: str, severity: str = "HIGH", tool: str = "test", host: str = "host1") -> SecurityFinding:
    return SecurityFinding(
        id="test-001",
        title=title,
        severity=severity,
        tool=tool,
        host=host,
        description="desc",
    )


class TestXssPreventionInHtmlReports:
    def test_title_xss_escaped_in_technical(self):
        findings = [_make_finding('<script>alert("xss")</script>')]
        report = UnifiedReportGenerator(
            project_id="proj-001",
            scan_id="scan-001",
            findings=findings,
            project_name="test",
            report_type="technical",
        )
        html = report.generate_html()
        assert "<script>" not in html
        assert "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;" in html

    def test_title_ampersand_escaped(self):
        findings = [_make_finding('a & b < c > d "e"')]
        report = UnifiedReportGenerator(
            project_id="proj-001",
            scan_id="scan-001",
            findings=findings,
            project_name="test",
            report_type="technical",
        )
        html = report.generate_html()
        assert "a &amp; b &lt; c &gt; d &quot;e&quot;" in html

    def test_tool_xss_escaped(self):
        findings = [_make_finding("normal", tool='<img src=x onerror=alert(1)>')]
        report = UnifiedReportGenerator(
            project_id="proj-001",
            scan_id="scan-001",
            findings=findings,
            project_name="test",
            report_type="technical",
        )
        html = report.generate_html()
        assert "<img" not in html
        assert "&lt;img" in html

    def test_host_xss_escaped(self):
        findings = [_make_finding("normal", host='<svg onload=alert(1)>')]
        report = UnifiedReportGenerator(
            project_id="proj-001",
            scan_id="scan-001",
            findings=findings,
            project_name="test",
            report_type="technical",
        )
        html = report.generate_html()
        assert "<svg" not in html
        assert "&lt;svg" in html

    def test_package_field_used_when_host_none(self):
        finding = SecurityFinding(
            id="test-002",
            title="test",
            severity="HIGH",
            tool="nmap",
            host=None,
            description="desc",
            package='<script>bad</script>',
        )
        report = UnifiedReportGenerator(
            project_id="proj-001",
            scan_id="scan-001",
            findings=[finding],
            project_name="test",
            report_type="technical",
        )
        html = report.generate_html()
        assert "<script>" not in html
        assert "&lt;script&gt;bad&lt;/script&gt;" in html

    def test_executive_report_does_not_render_findings(self):
        findings = [_make_finding('<script>alert(1)</script>')]
        report = UnifiedReportGenerator(
            project_id="proj-001",
            scan_id="scan-001",
            findings=findings,
            project_name="test",
            report_type="executive",
        )
        html = report.generate_html()
        assert "Executive Summary" in html
