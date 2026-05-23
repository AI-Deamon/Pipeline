import pytest
from unittest.mock import patch
from app.services.reporting.reporter import UnifiedReportGenerator
from app.services.reporting.parsers.base import SecurityFinding

def test_report_type_accepted():
    findings = [SecurityFinding(id="1", tool="test", severity="High", title="Test", description="")]
    gen = UnifiedReportGenerator("proj", "scan", findings, report_type="executive")
    assert gen.report_type == "executive"

@pytest.fixture
def sample_findings():
    return [
        SecurityFinding(
            id="F001",
            tool="trivy_fs",
            severity="High",
            title="SQL Injection",
            description="A SQL injection vulnerability",
            host="example.com"
        ),
        SecurityFinding(
            id="F002",
            tool="zap",
            severity="Medium",
            title="XSS",
            description="Cross-site scripting",
            host="example.com"
        )
    ]

def test_executive_html_excludes_findings(sample_findings):
    gen = UnifiedReportGenerator("p","s", sample_findings, report_type="executive")
    # Patch risk summary to avoid DB
    with patch.object(gen, 'generate_risk_summary', return_value={"score": 80, "level": "Low Risk", "trend": "stable", "previous_score": 70}):
        html = gen.generate_html()
    assert "Findings" not in html or "detailed findings" not in html.lower()
    assert "Executive Summary" in html

def test_technical_html_includes_findings(sample_findings):
    gen = UnifiedReportGenerator("p","s", sample_findings, report_type="technical")
    with patch.object(gen, 'generate_risk_summary', return_value={"score": 80, "level": "Low Risk", "trend": "stable", "previous_score": 70}):
        html = gen.generate_html()
    assert "Findings" in html
    assert "SQL Injection" in html
    assert "XSS" in html

def test_compliance_html_includes_owasp(sample_findings):
    gen = UnifiedReportGenerator("p","s", sample_findings, report_type="compliance")
    with patch.object(gen, 'generate_risk_summary', return_value={"score": 80, "level": "Low Risk", "trend": "stable", "previous_score": 70}):
        html = gen.generate_html()
    assert "OWASP" in html or "owasp" in html.lower()
    # The SQL Injection finding should map to A03
    assert "A03" in html

def test_comparison_html_includes_table(sample_findings):
    gen = UnifiedReportGenerator("p","s", sample_findings, report_type="comparison")
    with patch.object(gen, 'generate_risk_summary', return_value={"score": 80, "level": "Low Risk", "trend": "stable", "previous_score": 70}):
        # Use test database (empty) so no previous scan exists
        html = gen.generate_html()
        assert "Comparison" in html