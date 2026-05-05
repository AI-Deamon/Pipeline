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
