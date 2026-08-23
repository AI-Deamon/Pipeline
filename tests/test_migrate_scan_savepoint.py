"""Regression test for #97: migrate_scan_to_issues's per-finding create_issue call
had no SAVEPOINT. Simulating a mid-loop IntegrityError (e.g. from a concurrent
migration flushing a colliding unique (issue_id, project_id) row) previously
poisoned the whole outer transaction, silently dropping every subsequent finding
in the same call and leaving report.migration_status stuck at "processing".
"""
import os

os.environ.setdefault('ENV', 'test')
os.environ.setdefault('DATABASE_URL', 'sqlite:///test_migrate_savepoint.db')
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

from datetime import datetime, timezone

import pytest

from app.core.db import engine, Base, SessionLocal
from app.models.db_models import ProjectDB, ScanDB, ScanReportDB, IssueDB
from app.state.scan_state import ScanState
from app.tasks import issue_tasks


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def _make_report(db):
    db.add(ProjectDB(project_id="proj-mig", name="Mig Project", status="ACTIVE"))
    db.add(ScanDB(
        scan_id="scan-mig-1", project_id="proj-mig", scan_mode="automated",
        state=ScanState.COMPLETED, selected_stages=[], stage_results=[], callback_digests=[],
    ))
    report = ScanReportDB(
        scan_id="scan-mig-1",
        project_id="proj-mig",
        tool_name="trivy",
        severity_summary={},
        findings=[
            {"id": "F-1", "tool": "trivy", "severity": "High", "title": "Finding one"},
            {"id": "F-2", "tool": "trivy", "severity": "High", "title": "Finding two"},
            {"id": "F-3", "tool": "trivy", "severity": "High", "title": "Finding three"},
        ],
        migration_status="pending",
    )
    db.add(report)
    db.commit()


def test_mid_loop_integrity_error_does_not_poison_remaining_findings(monkeypatch):
    db = SessionLocal()
    _make_report(db)
    db.close()

    real_create_issue = issue_tasks.service.create_issue

    def _flaky_create_issue(session, data):
        if data["issue_id"] == "F-2":
            # Simulate the real race #97 describes: bypass the check-then-insert
            # existence check entirely and directly flush a duplicate row against
            # the real unique (issue_id, project_id) index — a genuine DB-level
            # IntegrityError at flush(), not a mocked Python exception, so it
            # exercises the actual SQLAlchemy transaction-poisoning behavior the
            # SAVEPOINT is meant to contain.
            now = datetime.now(timezone.utc)
            session.add(IssueDB(
                issue_id="F-1", project_id=data["project_id"], tool_name=data["tool_name"],
                severity=data["severity"], title=data["title"],
                first_seen_at=now, last_seen_at=now,
            ))
            session.flush()
            return None
        return real_create_issue(session, data)

    monkeypatch.setattr(issue_tasks.service, "create_issue", _flaky_create_issue)

    result = issue_tasks.migrate_scan_to_issues.run("scan-mig-1", "proj-mig", "trivy")

    # F-2 was skipped, but F-1 and F-3 (which run after the failure in the same
    # loop) must still have been created — proving the outer transaction wasn't
    # poisoned by F-2's IntegrityError.
    assert result.get("migrated") == 2

    db = SessionLocal()
    issue_ids = {i.issue_id for i in db.query(IssueDB).filter(IssueDB.project_id == "proj-mig").all()}
    assert issue_ids == {"F-1", "F-3"}

    report = db.query(ScanReportDB).filter(ScanReportDB.scan_id == "scan-mig-1").first()
    assert report.migration_status == "completed"
    db.close()
