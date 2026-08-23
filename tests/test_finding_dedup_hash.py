"""Regression tests for #117 (severity in dedup hash blocked cross-tool CVE
dedup) and #48 (boilerplate no-signal findings from different tools collapsed
into one)."""
import os

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("JENKINS_BASE_URL", "http://jenkins.test")
os.environ.setdefault("STORAGE_PATH", "/tmp/sentinel-test-storage")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret")
os.environ.setdefault("ENVIRONMENT", "test")

from app.services.project_grouping import ProjectGroupingService


class TestSeverityExcludedFromIdentity:
    def test_same_cve_different_severity_across_tools_dedups_to_one(self):
        trivy_finding = {
            "title": "CVE-2024-9999 in libfoo", "severity": "High",
            "cve": "CVE-2024-9999", "package": "libfoo", "tool": "trivy",
        }
        depcheck_finding = {
            "title": "CVE-2024-9999 in libfoo", "severity": "Critical",
            "cve": "CVE-2024-9999", "package": "libfoo", "tool": "dependency_check",
        }
        result = ProjectGroupingService.deduplicate_findings([trivy_finding, depcheck_finding])
        # Previously severity was part of the hash, so High != Critical meant these
        # two never collapsed even though they're the same underlying CVE.
        assert len(result) == 1

    def test_re_triaged_finding_does_not_duplicate(self):
        original = {"title": "SQL Injection", "severity": "Medium", "file_path": "app.py", "line_number": 10}
        retriaged = {"title": "SQL Injection", "severity": "High", "file_path": "app.py", "line_number": 10}
        result = ProjectGroupingService.deduplicate_findings([original, retriaged])
        assert len(result) == 1


class TestNoSignalFindingsFallBackToTool:
    def test_generic_boilerplate_findings_from_different_tools_stay_distinct(self):
        sonar_finding = {"title": "Code smell detected", "severity": "Low", "tool": "sonar"}
        other_finding = {"title": "Code smell detected", "severity": "Low", "tool": "some_other_tool"}
        result = ProjectGroupingService.deduplicate_findings([sonar_finding, other_finding])
        assert len(result) == 2

    def test_generic_boilerplate_findings_from_same_tool_still_dedup(self):
        a = {"title": "Code smell detected", "severity": "Low", "tool": "sonar"}
        b = {"title": "Code smell detected", "severity": "Low", "tool": "sonar"}
        result = ProjectGroupingService.deduplicate_findings([a, b])
        assert len(result) == 1

    def test_findings_with_positional_signal_ignore_tool_fallback(self):
        # host/cve/package/file all present -> tool fallback must NOT kick in,
        # preserving normal cross-tool dedup behavior.
        a = {"title": "Vuln", "severity": "High", "host": "10.0.0.1", "tool": "nmap"}
        b = {"title": "Vuln", "severity": "High", "host": "10.0.0.1", "tool": "other_scanner"}
        result = ProjectGroupingService.deduplicate_findings([a, b])
        assert len(result) == 1
