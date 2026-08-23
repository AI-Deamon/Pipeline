import pytest
from app.core.db import engine, Base
from app.models.db_models import ScanReportDB
from app.core.db import SessionLocal


class TestScanReportDedup:
    def test_upsert_replaces_existing_report(self):
        """Insert report, then insert again with same (scan_id, tool_name) — count must be 1."""
        db = SessionLocal()
        try:
            # First insert
            report1 = ScanReportDB(
                scan_id="scan-1",
                project_id="proj-1",
                tool_name="trivy_fs",
                severity_summary={"critical": 1, "high": 2, "medium": 3, "low": 4},
                findings=[{"id": "f1", "severity": "Critical"}],
            )
            db.add(report1)
            db.commit()

            # Upsert: delete + insert
            db.query(ScanReportDB).filter(
                ScanReportDB.scan_id == "scan-1",
                ScanReportDB.tool_name == "trivy_fs",
            ).delete(synchronize_session=False)

            report2 = ScanReportDB(
                scan_id="scan-1",
                project_id="proj-1",
                tool_name="trivy_fs",
                severity_summary={"critical": 5, "high": 6, "medium": 7, "low": 8},
                findings=[{"id": "f1", "severity": "Critical"}, {"id": "f2", "severity": "High"}],
            )
            db.add(report2)
            db.commit()

            count = db.query(ScanReportDB).filter(
                ScanReportDB.scan_id == "scan-1",
                ScanReportDB.tool_name == "trivy_fs",
            ).count()
            assert count == 1

            # Verify latest data is present
            stored = db.query(ScanReportDB).filter(
                ScanReportDB.scan_id == "scan-1",
                ScanReportDB.tool_name == "trivy_fs",
            ).first()
            assert stored.severity_summary["critical"] == 5
            assert len(stored.findings) == 2
        finally:
            db.close()

    def test_different_tool_names_coexist(self):
        """Concurrent inserts for different (scan_id, tool_name) both succeed."""
        db = SessionLocal()
        try:
            r1 = ScanReportDB(
                scan_id="scan-2",
                project_id="proj-2",
                tool_name="trivy_fs",
                severity_summary={"critical": 1},
                findings=[],
            )
            r2 = ScanReportDB(
                scan_id="scan-2",
                project_id="proj-2",
                tool_name="zap",
                severity_summary={"critical": 0, "high": 1},
                findings=[],
            )
            db.add(r1)
            db.add(r2)
            db.commit()

            count = db.query(ScanReportDB).filter(
                ScanReportDB.scan_id == "scan-2"
            ).count()
            assert count == 2
        finally:
            db.close()

    def test_different_scan_ids_coexist(self):
        """Different scan_ids for the same tool are independent."""
        db = SessionLocal()
        try:
            r1 = ScanReportDB(
                scan_id="scan-3",
                project_id="proj-3",
                tool_name="trivy_fs",
                severity_summary={},
                findings=[],
            )
            r2 = ScanReportDB(
                scan_id="scan-4",
                project_id="proj-3",
                tool_name="trivy_fs",
                severity_summary={},
                findings=[],
            )
            db.add(r1)
            db.add(r2)
            db.commit()

            count = db.query(ScanReportDB).filter(
                ScanReportDB.tool_name == "trivy_fs"
            ).count()
            assert count == 2
        finally:
            db.close()
