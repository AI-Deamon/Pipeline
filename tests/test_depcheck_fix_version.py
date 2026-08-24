"""Regression tests for a real gap found while auditing report actionability:
OWASP Dependency-Check's own JSON report has no fix-version field at all —
unlike Trivy (which gets `FixedVersion` straight from its scanner output), a
Dependency-Check finding gave a developer a CVE ID and nothing telling them
what version actually fixes it. Fixed by looking the CVE up on OSV.dev.
"""
import json
import os
from unittest.mock import Mock, patch

os.environ.setdefault('ENV', 'test')
os.environ.setdefault('DATABASE_URL', 'sqlite:///test_depcheck_fix_version.db')
os.environ.setdefault('JENKINS_BASE_URL', 'http://localhost:8080')
os.environ.setdefault('JENKINS_TOKEN', 'test-token')
os.environ.setdefault('STORAGE_PATH', '/tmp/storage-test')
os.environ.setdefault('SCAN_TIMEOUT', '7200')
os.environ.setdefault('LOG_LEVEL', 'INFO')
os.environ.setdefault('CALLBACK_TOKEN', 'test-callback-token-1234567890')
os.environ.setdefault('API_KEY', 'test-api-key-1234567890')
os.environ.setdefault('TEST_BYPASS_AUTH', 'True')
os.environ.setdefault('MOCK_EXECUTION', 'True')
os.environ.setdefault('SONARQUBE_TOKEN', 'test-sonar-token-1234567890')

from app.services.reporting.parsers.depcheck import parse_depcheck_report


def _report(vulns_by_file: dict[str, list[dict]]) -> str:
    return json.dumps({
        "dependencies": [
            {"fileName": fname, "vulnerabilities": vulns}
            for fname, vulns in vulns_by_file.items()
        ]
    })


def _osv_response(fixed: str | None, range_type: str = "SEMVER", aliases: list[str] | None = None):
    if fixed is None:
        return Mock(status_code=200, json=lambda: {"affected": [], "aliases": aliases or []})
    return Mock(status_code=200, json=lambda: {
        "affected": [{"ranges": [{"type": range_type, "events": [{"introduced": "0"}, {"fixed": fixed}]}]}],
        "aliases": aliases or [],
    })


def test_depcheck_finding_gets_fixed_version_from_osv():
    raw = _report({
        "lodash-4.17.15.tgz": [{
            "name": "CVE-2021-23337",
            "severity": "HIGH",
            "version": "4.17.15",
            "description": "Command injection",
        }],
    })

    with patch("app.services.reporting.parsers.depcheck.httpx.get") as mock_get:
        mock_get.return_value = _osv_response("4.17.21")
        findings = parse_depcheck_report(raw)

    assert len(findings) == 1
    f = findings[0]
    assert f.fixed_version == "4.17.21"
    assert f.fix_command == "Upgrade lodash-4.17.15.tgz to version 4.17.21 or later"
    assert "4.17.21" in f.recommendation


def test_depcheck_dedupes_osv_lookups_across_files():
    """The same CVE flagged against two different dependency files should only
    trigger one OSV.dev call, not one per occurrence."""
    raw = _report({
        "a/lodash.tgz": [{"name": "CVE-2021-23337", "severity": "HIGH", "version": "4.17.15"}],
        "b/lodash.tgz": [{"name": "CVE-2021-23337", "severity": "HIGH", "version": "4.17.15"}],
    })

    with patch("app.services.reporting.parsers.depcheck.httpx.get") as mock_get:
        mock_get.return_value = _osv_response("4.17.21")
        findings = parse_depcheck_report(raw)

    assert mock_get.call_count == 1
    assert all(f.fixed_version == "4.17.21" for f in findings)


def test_depcheck_survives_osv_lookup_failure():
    """A network error / non-200 / malformed OSV response must never break
    report parsing — it should just leave fixed_version unset."""
    raw = _report({
        "pkg.tgz": [{"name": "CVE-9999-99999", "severity": "MEDIUM", "version": "1.0.0"}],
    })

    with patch("app.services.reporting.parsers.depcheck.httpx.get") as mock_get:
        mock_get.side_effect = Exception("network down")
        findings = parse_depcheck_report(raw)

    assert len(findings) == 1
    assert findings[0].fixed_version is None
    assert findings[0].fix_command is None
    # Recommendation still falls back to the generic guidance, not an error.
    assert findings[0].recommendation


def test_depcheck_ignores_git_range_and_falls_back_to_ghsa_alias():
    """Regression test for a real bug caught live: a CVE record's only range is
    sometimes GIT-typed (fixed = a commit hash, not a version). Confirmed
    against the real OSV.dev API for CVE-2021-23337 — the bare CVE resolves
    to a GIT-only record, but its GHSA-35jh-r3h4-6jhm alias has a clean
    SEMVER range with fixed=4.17.21. Returning the commit hash as a "fixed
    version" would be worse than showing nothing.
    """
    raw = _report({
        "lodash.tgz": [{"name": "CVE-2021-23337", "severity": "HIGH", "version": "4.17.15"}],
    })

    cve_response = Mock(status_code=200, json=lambda: {
        "affected": [{"ranges": [{"type": "GIT", "events": [{"introduced": "0"}, {"fixed": "c6e281b8"}]}]}],
        "aliases": ["GHSA-35jh-r3h4-6jhm"],
    })
    ghsa_response = _osv_response("4.17.21")

    with patch("app.services.reporting.parsers.depcheck.httpx.get") as mock_get:
        mock_get.side_effect = [cve_response, ghsa_response]
        findings = parse_depcheck_report(raw)

    assert mock_get.call_count == 2
    assert findings[0].fixed_version == "4.17.21"
    assert "c6e281b8" not in (findings[0].fixed_version or "")


def test_depcheck_never_looks_up_non_cve_ids():
    raw = _report({
        "pkg.tgz": [{"name": "GHSA-not-a-cve", "severity": "LOW", "version": "1.0.0"}],
    })

    with patch("app.services.reporting.parsers.depcheck.httpx.get") as mock_get:
        parse_depcheck_report(raw)

    mock_get.assert_not_called()
