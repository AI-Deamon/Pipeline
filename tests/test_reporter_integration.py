"""Test reporter module integration."""
import pytest


def test_reporter_module_exists():
    """Verify reporter module exists in backend services"""
    try:
        from app.services.reporting.reporter import UnifiedReportGenerator
        assert True
    except ImportError:
        assert False, "UnifiedReportGenerator not found in app.services.reporting.reporter"


def test_reporter_accepts_findings():
    """Verify reporter accepts List[SecurityFinding]"""
    from app.services.reporting.reporter import UnifiedReportGenerator
    from app.services.reporting.parsers.base import SecurityFinding

    findings = [
        SecurityFinding(
            id="TEST-001",
            tool="trivy_fs",
            severity="High",
            title="Test Vulnerability",
            description="Test description"
        )
    ]

    generator = UnifiedReportGenerator(
        project_id="test-project",
        scan_id="test-scan",
        findings=findings
    )

    assert generator.findings == findings
    assert generator.project_id == "test-project"


def test_strip_html_to_text_removes_tags():
    from app.services.reporting.reporter import _strip_html_to_text

    assert _strip_html_to_text("<p>Upgrade to the latest version.</p>") == "Upgrade to the latest version."


def test_strip_html_to_text_neutralizes_embedded_script():
    from app.services.reporting.reporter import _strip_html_to_text

    result = _strip_html_to_text("<script>alert(1)</script>Evidence text")
    assert "<" not in result
    assert result == "alert(1) Evidence text"


def test_strip_html_to_text_empty_string():
    from app.services.reporting.reporter import _strip_html_to_text

    assert _strip_html_to_text("") == ""


def test_finding_cve_display_with_score():
    from app.services.reporting.reporter import _finding_cve_display
    from app.services.reporting.parsers.base import SecurityFinding

    f = SecurityFinding(id="F1", tool="t", severity="High", title="T", cve="CVE-2024-1234", cvss_score=9.8)
    assert _finding_cve_display(f) == "CVE-2024-1234 (CVSS 9.8)"


def test_finding_cve_display_no_score():
    from app.services.reporting.reporter import _finding_cve_display
    from app.services.reporting.parsers.base import SecurityFinding

    f = SecurityFinding(id="F1", tool="t", severity="High", title="T", cve="CVE-2024-1234")
    assert _finding_cve_display(f) == "CVE-2024-1234"


def test_finding_cve_display_no_cve():
    from app.services.reporting.reporter import _finding_cve_display
    from app.services.reporting.parsers.base import SecurityFinding

    f = SecurityFinding(id="F1", tool="t", severity="High", title="T")
    assert _finding_cve_display(f) == "-"


def test_technical_report_shows_full_finding_detail():
    """Regression test for the real finding found during investigation:
    High | Vulnerable JS Library | zap | - with no fix, no location."""
    from app.services.reporting.reporter import UnifiedReportGenerator
    from app.services.reporting.parsers.base import SecurityFinding

    finding = SecurityFinding(
        id="ZAP-1",
        tool="zap",
        severity="High",
        title="Vulnerable JS Library",
        description="<p>The identified library appears to be vulnerable.</p>",
        uri="https://it-tools.tech/assets/index-61effc08.js",
        recommendation="<p>Upgrade to the latest version of the affected library.</p>",
        cwe_ids=["CWE-1395"],
    )
    generator = UnifiedReportGenerator(
        project_id="p1", scan_id="s1", findings=[finding], report_type="technical"
    )
    html = generator.generate_html()

    assert "https://it-tools.tech/assets/index-61effc08.js" in html
    assert "The identified library appears to be vulnerable." in html
    assert "Upgrade to the latest version of the affected library." in html
    # the tool's own HTML must not survive as live markup
    assert "<p>The identified library" not in html


def test_technical_report_neutralizes_embedded_script_in_description():
    from app.services.reporting.reporter import UnifiedReportGenerator
    from app.services.reporting.parsers.base import SecurityFinding

    finding = SecurityFinding(
        id="F1", tool="zap", severity="High", title="Reflected content",
        description="<script>alert(document.cookie)</script>",
    )
    generator = UnifiedReportGenerator(project_id="p1", scan_id="s1", findings=[finding])
    html = generator.generate_html()
    assert "<script>" not in html


def test_technical_report_location_prefers_file_path_over_host():
    """Regression test for the real bug found: a SonarQube finding showed the
    project key ("IT_tools_soner") instead of src/composable/validation.ts:6."""
    from app.services.reporting.reporter import UnifiedReportGenerator
    from app.services.reporting.parsers.base import SecurityFinding

    finding = SecurityFinding(
        id="S1", tool="sonar", severity="Medium", title="Code smell",
        host="IT_tools_soner", file_path="src/composable/validation.ts", line_number=6,
    )
    generator = UnifiedReportGenerator(project_id="p1", scan_id="s1", findings=[finding])
    html = generator.generate_html()
    assert "src/composable/validation.ts:6" in html
    assert "<td>IT_tools_soner</td>" not in html


def test_technical_report_omits_detail_block_when_no_description_or_recommendation():
    from app.services.reporting.reporter import UnifiedReportGenerator
    from app.services.reporting.parsers.base import SecurityFinding

    finding = SecurityFinding(id="F1", tool="nmap", severity="Low", title="Open port", host="10.0.0.1", port=22)
    generator = UnifiedReportGenerator(project_id="p1", scan_id="s1", findings=[finding])
    html = generator.generate_html()
    assert "<strong>What:</strong>" not in html
    assert "<strong>Fix:</strong>" not in html


def test_generate_pdf_grows_when_finding_has_description_and_recommendation():
    from app.services.reporting.reporter import UnifiedReportGenerator
    from app.services.reporting.parsers.base import SecurityFinding

    sparse = SecurityFinding(id="F1", tool="zap", severity="High", title="Vulnerable JS Library")
    rich = SecurityFinding(
        id="F1", tool="zap", severity="High", title="Vulnerable JS Library",
        description="The identified library appears to be vulnerable.",
        recommendation="Upgrade to the latest version of the affected library.",
        uri="https://it-tools.tech/assets/index-61effc08.js",
    )

    sparse_pdf = UnifiedReportGenerator(project_id="p1", scan_id="s1", findings=[sparse]).generate_pdf()
    rich_pdf = UnifiedReportGenerator(project_id="p1", scan_id="s1", findings=[rich]).generate_pdf()

    assert sparse_pdf[:4] == b"%PDF"
    assert rich_pdf[:4] == b"%PDF"
    assert len(rich_pdf) > len(sparse_pdf)
