"""Regression tests for #41 (depcheck), #43 (severity mapping holes), #44 (nmap
unstable fallback ID), #45 (npm parser silent swallow)."""
import json

import pytest

from app.services.reporting.parsers.depcheck import parse_depcheck_report
from app.services.reporting.parsers.base import normalize_severity, calculate_severity_summary, SecurityFinding, ParseError
from app.services.reporting.parsers.nmap import parse_nmap_findings
from app.services.reporting.parsers.npm import parse_npm_audit_report


class TestDepcheckFileScoping:
    def test_same_cve_in_two_files_produces_two_findings(self):
        raw = json.dumps({"dependencies": [
            {"fileName": "app/package-lock.json", "vulnerabilities": [{"name": "CVE-2024-1111", "severity": "HIGH"}]},
            {"fileName": "worker/package-lock.json", "vulnerabilities": [{"name": "CVE-2024-1111", "severity": "HIGH"}]},
        ]})
        findings = parse_depcheck_report(raw)
        assert len(findings) == 2
        ids = {f.id for f in findings}
        assert len(ids) == 2


class TestSeverityMappingHoles:
    def test_unrecognized_severity_still_returns_info_but_logs(self, caplog):
        with caplog.at_level("WARNING"):
            result = normalize_severity("some-totally-unknown-value")
        assert result == "Info"
        assert "Unrecognized severity" in caplog.text

    def test_summary_counts_unrecognized_severity_findings_instead_of_dropping_them(self):
        findings = [
            SecurityFinding(id="1", tool="sonar", severity="Unknown", title="x"),
            SecurityFinding(id="2", tool="sonar", severity="Critical", title="y"),
        ]
        summary = calculate_severity_summary(findings)
        # Total must equal len(findings) — previously "Unknown" vanished entirely.
        assert sum(summary.values()) == len(findings)
        assert summary["info"] == 1
        assert summary["critical"] == 1


class TestNmapStableFallbackId:
    def test_same_content_produces_same_id_regardless_of_position(self):
        finding = {"host": "10.0.0.1", "port": "22", "service": "ssh", "severity": "Medium"}
        raw_a = json.dumps({"findings": [finding, {"host": "10.0.0.2", "port": "80", "service": "http", "severity": "Low"}]})
        raw_b = json.dumps({"findings": [{"host": "10.0.0.2", "port": "80", "service": "http", "severity": "Low"}, finding]})

        findings_a = parse_nmap_findings(raw_a)
        findings_b = parse_nmap_findings(raw_b)

        id_a = next(f.id for f in findings_a if f.host == "10.0.0.1")
        id_b = next(f.id for f in findings_b if f.host == "10.0.0.1")
        # Same finding, different position in the list — ID must be identical.
        assert id_a == id_b

    def test_explicit_id_still_wins_when_present(self):
        raw = json.dumps({"findings": [{"id": "custom-id", "host": "10.0.0.1", "port": "22", "severity": "Medium"}]})
        findings = parse_nmap_findings(raw)
        assert findings[0].id == "NMAP-custom-id"


class TestNpmParserErrorHandling:
    def test_corrupt_json_raises_parse_error_not_silently_returns_empty(self):
        with pytest.raises(ParseError):
            parse_npm_audit_report("{not valid json")
