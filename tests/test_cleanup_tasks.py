"""Regression test for #118 (cleanup_expired_reports deleted by absolute age
alone, silently zeroing out any project whose sole (project_id, tool_name)
report crossed the 90-day mark without a rescan) and #67 (cleanup_tasks.py had
zero direct test coverage).
"""
import os

os.environ.setdefault('ENV', 'test')
os.environ.setdefault('DATABASE_URL', 'sqlite:///test_cleanup_tasks.db')
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
from app.models.db_models import ProjectDB, ScanReportDB
from app.tasks.cleanup_tasks import cleanup_expired_reports, set_report_expiration


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def _add_report(db, scan_id, project_id, tool_name, created_at, expires_at):
    report = ScanReportDB(
        scan_id=scan_id, project_id=project_id, tool_name=tool_name,
        severity_summary={}, findings=[], migration_status="completed",
        created_at=created_at, expires_at=expires_at,
    )
    db.add(report)
    db.flush()
    return report


class TestCleanupPreservesLatestPerTool:
    def test_a_lone_expired_report_with_no_rescan_survives(self):
        """The literal #118 scenario: a project scanned once, never rescanned,
        crosses the 90-day expiry mark. It must NOT vanish from portfolio views."""
        db = SessionLocal()
        db.add(ProjectDB(project_id="proj-lonely", name="Lonely Project", status="ACTIVE"))
        old = datetime.now(timezone.utc) - timedelta(days=100)
        _add_report(db, "scan-1", "proj-lonely", "trivy", old, old + timedelta(days=90))
        db.commit()
        db.close()

        result = cleanup_expired_reports.run()
        assert result["deleted"] == 0

        db = SessionLocal()
        remaining = db.query(ScanReportDB).filter(ScanReportDB.project_id == "proj-lonely").all()
        assert len(remaining) == 1
        db.close()

    def test_a_genuinely_superseded_older_report_is_still_deleted(self):
        """A project WAS rescanned — the older, now-superseded report for the same
        tool must still be cleaned up once expired; only the latest is protected."""
        db = SessionLocal()
        db.add(ProjectDB(project_id="proj-rescanned", name="Rescanned Project", status="ACTIVE"))
        old = datetime.now(timezone.utc) - timedelta(days=100)
        recent = datetime.now(timezone.utc) - timedelta(days=1)
        _add_report(db, "scan-old", "proj-rescanned", "trivy", old, old + timedelta(days=90))
        _add_report(db, "scan-new", "proj-rescanned", "trivy", recent, recent + timedelta(days=90))
        db.commit()
        db.close()

        result = cleanup_expired_reports.run()
        assert result["deleted"] == 1

        db = SessionLocal()
        remaining = db.query(ScanReportDB).filter(ScanReportDB.project_id == "proj-rescanned").all()
        assert len(remaining) == 1
        assert remaining[0].scan_id == "scan-new"
        db.close()

    def test_each_tool_is_evaluated_independently(self):
        """A project with one fresh tool and one lone-expired tool: the expired
        tool's sole report must survive since it's still that tool's latest."""
        db = SessionLocal()
        db.add(ProjectDB(project_id="proj-mixed-tools", name="Mixed Tools", status="ACTIVE"))
        old = datetime.now(timezone.utc) - timedelta(days=100)
        recent = datetime.now(timezone.utc) - timedelta(days=1)
        _add_report(db, "scan-nmap", "proj-mixed-tools", "nmap", old, old + timedelta(days=90))
        _add_report(db, "scan-sonar", "proj-mixed-tools", "sonar", recent, recent + timedelta(days=90))
        db.commit()
        db.close()

        result = cleanup_expired_reports.run()
        assert result["deleted"] == 0

        db = SessionLocal()
        remaining = {r.tool_name for r in db.query(ScanReportDB).filter(ScanReportDB.project_id == "proj-mixed-tools").all()}
        assert remaining == {"nmap", "sonar"}
        db.close()

    def test_reports_with_no_expiry_are_never_deleted(self):
        db = SessionLocal()
        db.add(ProjectDB(project_id="proj-permanent", name="Permanent", status="ACTIVE"))
        old = datetime.now(timezone.utc) - timedelta(days=200)
        _add_report(db, "scan-1", "proj-permanent", "trivy", old, None)
        db.commit()
        db.close()

        result = cleanup_expired_reports.run()
        assert result["deleted"] == 0


class TestSetReportExpiration:
    def test_sets_expiration_n_days_out(self):
        db = SessionLocal()
        db.add(ProjectDB(project_id="proj-x", name="X", status="ACTIVE"))
        report = _add_report(db, "scan-1", "proj-x", "trivy", datetime.now(timezone.utc), None)
        report_id = report.id
        db.commit()
        db.close()

        result = set_report_expiration.run(report_id, days=30)
        assert result["success"] is True

        db = SessionLocal()
        refreshed = db.query(ScanReportDB).filter(ScanReportDB.id == report_id).first()
        assert refreshed.expires_at is not None
        db.close()

    def test_days_none_makes_it_permanent(self):
        db = SessionLocal()
        db.add(ProjectDB(project_id="proj-y", name="Y", status="ACTIVE"))
        report = _add_report(
            db, "scan-1", "proj-y", "trivy", datetime.now(timezone.utc),
            datetime.now(timezone.utc) + timedelta(days=10),
        )
        report_id = report.id
        db.commit()
        db.close()

        result = set_report_expiration.run(report_id, days=None)
        assert result["success"] is True

        db = SessionLocal()
        refreshed = db.query(ScanReportDB).filter(ScanReportDB.id == report_id).first()
        assert refreshed.expires_at is None
        db.close()
