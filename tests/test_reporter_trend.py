"""Tests for UnifiedReportGenerator trend aggregation"""
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.core.db import engine
from app.services.reporting.reporter import UnifiedReportGenerator
from app.services.reporting.parsers.base import SecurityFinding
from app.models.db_models import ScanDB, ScanReportDB, ProjectDB
from app.state.scan_state import ScanState


def test_get_previous_scan_severity_aggregates_all_tools():
    """Trend query should aggregate ALL reports from previous scan, not just one row"""
    with Session(engine) as db:
        # Create project
        project = ProjectDB(project_id="test-trend-proj", name="Trend Test")
        db.add(project)

        # Create previous scan
        prev_scan = ScanDB(
            scan_id="prev-scan-1",
            project_id="test-trend-proj",
            scan_mode="automated",
            state=ScanState.COMPLETED,
            finished_at=datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc),
        )
        db.add(prev_scan)

        # Create current scan
        curr_scan = ScanDB(
            scan_id="curr-scan-1",
            project_id="test-trend-proj",
            scan_mode="automated",
            state=ScanState.COMPLETED,
            finished_at=datetime(2024, 1, 2, 12, 0, 0, tzinfo=timezone.utc),
        )
        db.add(curr_scan)
        db.commit()

        # Add multiple reports for previous scan
        report1 = ScanReportDB(
            scan_id="prev-scan-1",
            project_id="test-trend-proj",
            tool_name="zap",
            severity_summary={"critical": 2, "high": 1, "medium": 0, "low": 0, "info": 0},
            findings=[],
        )
        report2 = ScanReportDB(
            scan_id="prev-scan-1",
            project_id="test-trend-proj",
            tool_name="trivy_fs",
            severity_summary={"critical": 1, "high": 3, "medium": 5, "low": 0, "info": 0},
            findings=[],
        )
        db.add_all([report1, report2])
        db.commit()

        # Create generator for current scan
        findings = [
            SecurityFinding(id="1", tool="zap", severity="Critical", title="Test"),
        ]
        gen = UnifiedReportGenerator(
            project_id="test-trend-proj",
            scan_id="curr-scan-1",
            findings=findings,
        )

        prev_sev = gen._get_previous_scan_severity()

        # Should aggregate both reports: critical=3, high=4, medium=5
        assert prev_sev["critical"] == 3
        assert prev_sev["high"] == 4
        assert prev_sev["medium"] == 5
        assert prev_sev["low"] == 0


def test_get_previous_scan_severity_no_previous_scan():
    """Returns all zeros when no previous scan exists"""
    with Session(engine) as db:
        project = ProjectDB(project_id="test-trend-proj-2", name="Trend Test 2")
        db.add(project)

        curr_scan = ScanDB(
            scan_id="curr-scan-2",
            project_id="test-trend-proj-2",
            scan_mode="automated",
            state=ScanState.COMPLETED,
        )
        db.add(curr_scan)
        db.commit()

        findings = []
        gen = UnifiedReportGenerator(
            project_id="test-trend-proj-2",
            scan_id="curr-scan-2",
            findings=findings,
        )

        prev_sev = gen._get_previous_scan_severity()
        assert prev_sev == {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
