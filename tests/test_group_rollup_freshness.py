"""Regression test for finding #112: get_group_aggregated_report merged findings
from every scan ever matched into a group, not just each project's latest scan per
tool. A project scanned Jan 1 (critical CVE found), then rescanned Feb 1 after
patching (CVE gone), still showed the Jan 1 CVE in the group dashboard forever.
"""

import os

os.environ.setdefault('ENV', 'test')
os.environ.setdefault('DATABASE_URL', 'sqlite:///test_group_rollup_freshness.db')
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

from datetime import datetime, timedelta, timezone

import pytest

from app.core.db import engine, Base, SessionLocal
from app.models.db_models import ProjectGroupDB, ScanAssignmentDB, ScanReportDB
from app.services.project_grouping import ProjectGroupingService


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def test_stale_finding_from_earlier_scan_does_not_persist_after_rescan():
    jan_1 = datetime(2026, 1, 1, tzinfo=timezone.utc)
    feb_1 = datetime(2026, 2, 1, tzinfo=timezone.utc)

    with SessionLocal() as db:
        db.add(ProjectGroupDB(group_id="grp-1", name="Kilo", naming_pattern="kilo_*"))

        # Jan 1 scan: critical CVE found.
        db.add(ScanReportDB(
            scan_id="scan-jan", project_id="kilo_frontend", tool_name="trivy_fs",
            severity_summary={"critical": 1, "high": 0, "medium": 0, "low": 0},
            findings=[{"id": "CVE-2024-1111", "severity": "Critical", "title": "Old vuln"}],
            created_at=jan_1,
        ))
        db.add(ScanAssignmentDB(group_id="grp-1", scan_id="scan-jan", project_id="kilo_frontend", match_confidence=100))

        # Feb 1 rescan after patching: CVE gone, clean report.
        db.add(ScanReportDB(
            scan_id="scan-feb", project_id="kilo_frontend", tool_name="trivy_fs",
            severity_summary={"critical": 0, "high": 0, "medium": 0, "low": 0},
            findings=[],
            created_at=feb_1,
        ))
        db.add(ScanAssignmentDB(group_id="grp-1", scan_id="scan-feb", project_id="kilo_frontend", match_confidence=100))

        db.commit()

        report = ProjectGroupingService.get_group_aggregated_report(db, "grp-1")

        assert report["severity_summary"]["critical"] == 0
        assert report["total_findings"] == 0
        assert all(f.get("id") != "CVE-2024-1111" for f in report["findings"])


def test_different_tools_for_same_project_both_kept():
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        db.add(ProjectGroupDB(group_id="grp-2", name="Kilo", naming_pattern="kilo_*"))

        db.add(ScanReportDB(
            scan_id="scan-a", project_id="kilo_backend", tool_name="trivy_fs",
            severity_summary={"critical": 1, "high": 0, "medium": 0, "low": 0},
            findings=[{"id": "CVE-A", "severity": "Critical", "title": "A"}],
            created_at=now,
        ))
        db.add(ScanAssignmentDB(group_id="grp-2", scan_id="scan-a", project_id="kilo_backend", match_confidence=100))

        db.add(ScanReportDB(
            scan_id="scan-b", project_id="kilo_backend", tool_name="zap",
            severity_summary={"critical": 0, "high": 1, "medium": 0, "low": 0},
            findings=[{"id": "ZAP-B", "severity": "High", "title": "B"}],
            created_at=now,
        ))
        db.add(ScanAssignmentDB(group_id="grp-2", scan_id="scan-b", project_id="kilo_backend", match_confidence=100))

        db.commit()

        report = ProjectGroupingService.get_group_aggregated_report(db, "grp-2")

        # Both tools' latest reports for the same project must both be kept.
        assert report["severity_summary"]["critical"] == 1
        assert report["severity_summary"]["high"] == 1
        ids = {f.get("id") for f in report["findings"]}
        assert ids == {"CVE-A", "ZAP-B"}
