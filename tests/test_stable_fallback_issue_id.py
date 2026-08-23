"""Regression test for #111: the fallback issue ID for findings with no stable
parser-supplied `id` embedded the scan_id/count, guaranteeing a brand-new IssueDB
row every scan instead of updating the existing one, and could even churn between
otherwise-identical scans if an earlier finding failed to create.
"""
import os

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("JENKINS_BASE_URL", "http://jenkins.test")
os.environ.setdefault("STORAGE_PATH", "/tmp/sentinel-test-storage")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret")
os.environ.setdefault("ENVIRONMENT", "test")

from app.tasks.issue_tasks import _build_issue_data


class TestStableFallbackId:
    def test_same_finding_same_id_across_different_scans(self):
        finding = {"title": "Generic code smell", "rule": "S1234", "file_path": "app.py", "line_number": 42}
        data_scan_1 = _build_issue_data(finding, "scan-1", "proj-1", "sonar", count=0)
        data_scan_2 = _build_issue_data(finding, "scan-2", "proj-1", "sonar", count=0)
        assert data_scan_1["issue_id"] == data_scan_2["issue_id"]

    def test_id_unaffected_by_position_or_earlier_failures(self):
        finding = {"title": "Generic code smell", "rule": "S1234", "file_path": "app.py", "line_number": 42}
        data_count_0 = _build_issue_data(finding, "scan-1", "proj-1", "sonar", count=0)
        data_count_5 = _build_issue_data(finding, "scan-1", "proj-1", "sonar", count=5)
        assert data_count_0["issue_id"] == data_count_5["issue_id"]

    def test_different_findings_get_different_ids(self):
        finding_a = {"title": "Code smell A", "rule": "S1", "file_path": "a.py", "line_number": 1}
        finding_b = {"title": "Code smell B", "rule": "S2", "file_path": "b.py", "line_number": 2}
        data_a = _build_issue_data(finding_a, "scan-1", "proj-1", "sonar", count=0)
        data_b = _build_issue_data(finding_b, "scan-1", "proj-1", "sonar", count=0)
        assert data_a["issue_id"] != data_b["issue_id"]

    def test_parser_supplied_id_still_takes_priority(self):
        finding = {"id": "STABLE-ID-1", "title": "x", "rule": "S1"}
        data = _build_issue_data(finding, "scan-1", "proj-1", "sonar", count=0)
        assert data["issue_id"] == "STABLE-ID-1"
