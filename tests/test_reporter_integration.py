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
