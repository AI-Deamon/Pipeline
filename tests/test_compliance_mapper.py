import pytest
def test_compliance_mapper_exists():
    """Verify ComplianceMapper exists"""
    try:
        from app.services.reporting.compliance_mapper import ComplianceMapper
        assert True
    except ImportError:
        assert False, "ComplianceMapper not found"

def test_owasp_mapping():
    """Verify OWASP Top 10 mapping"""
    from app.services.reporting.compliance_mapper import ComplianceMapper

    mapper = ComplianceMapper()

    # Test finding: SQL Injection → OWASP A03:2021
    finding = {"title": "SQL Injection in login form", "cve": "CVE-2021-12345"}
    owasp = mapper.map_to_owasp(finding)

    assert owasp is not None
    assert "A03" in owasp["id"]
