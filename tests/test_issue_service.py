import pytest
from datetime import datetime, timezone
from app.core.db import engine, Base, SessionLocal
from app.models.db_models import IssueDB, IssueHistoryDB, IssueScanDB, ScanDB
from app.state.scan_state import ScanState
from app.services.issue_service import IssueService


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def service():
    return IssueService()


def _create_scan(session, scan_id="scan_1", project_id="proj_1"):
    scan = ScanDB(
        scan_id=scan_id,
        project_id=project_id,
        scan_mode="automated",
        state=ScanState.COMPLETED,
    )
    session.add(scan)
    session.flush()
    return scan


class TestIssueServiceCRUD:
    def test_create_issue(self, service):
        with SessionLocal() as session:
            issue = service.create_issue(session, {
                "issue_id": "test:001",
                "project_id": "proj_1",
                "tool_name": "sonar",
                "severity": "critical",
                "title": "Hardcoded password",
            })
            assert issue.issue_id == "test:001"
            assert issue.status == "open"

    def test_get_issue_by_id(self, service):
        with SessionLocal() as session:
            created = service.create_issue(session, {
                "issue_id": "get:001",
                "project_id": "proj_1",
                "tool_name": "sonar",
                "severity": "high",
                "title": "Get test",
            })
            fetched = service.get_by_id(session, created.id)
            assert fetched is not None
            assert fetched.id == created.id

    def test_get_issue_not_found(self, service):
        with SessionLocal() as session:
            assert service.get_by_id(session, 99999) is None


class TestIssueServiceDedup:
    def test_dedup_same_issue_upserts(self, service):
        with SessionLocal() as session:
            i1 = service.create_issue(session, {
                "issue_id": "dedup:001",
                "project_id": "proj_1",
                "tool_name": "sonar",
                "severity": "high",
                "title": "Original",
            })
            i2 = service.create_issue(session, {
                "issue_id": "dedup:001",
                "project_id": "proj_1",
                "tool_name": "sonar",
                "severity": "high",
                "title": "Updated",
            })
            assert i1.id == i2.id
            assert i2.title == "Updated"

    def test_different_issue_ids_separate(self, service):
        with SessionLocal() as session:
            i1 = service.create_issue(session, {
                "issue_id": "dedup:a",
                "project_id": "proj_1",
                "tool_name": "sonar",
                "severity": "low",
                "title": "Issue A",
            })
            i2 = service.create_issue(session, {
                "issue_id": "dedup:b",
                "project_id": "proj_1",
                "tool_name": "sonar",
                "severity": "low",
                "title": "Issue B",
            })
            assert i1.id != i2.id

    def test_different_project_same_issue_id(self, service):
        with SessionLocal() as session:
            i1 = service.create_issue(session, {
                "issue_id": "shared:001",
                "project_id": "proj_1",
                "tool_name": "sonar",
                "severity": "medium",
                "title": "Project A",
            })
            i2 = service.create_issue(session, {
                "issue_id": "shared:001",
                "project_id": "proj_2",
                "tool_name": "sonar",
                "severity": "medium",
                "title": "Project B",
            })
            assert i1.id != i2.id


class TestIssueServiceOverview:
    def test_overview_counts(self, service):
        with SessionLocal() as session:
            for i in range(3):
                service.create_issue(session, {
                    "issue_id": f"ov:{i}",
                    "project_id": "proj_1",
                    "tool_name": "sonar",
                    "severity": "critical",
                    "title": f"Issue {i}",
                })
            service.create_issue(session, {
                "issue_id": "ov:other",
                "project_id": "proj_1",
                "tool_name": "trivy_fs",
                "severity": "high",
                "title": "Trivy issue",
            })
            overview = service.get_project_overview(session, "proj_1")
            tools = {t["tool"]: t for t in overview}
            assert tools["sonar"]["total"] == 3
            assert tools["sonar"]["severity"]["critical"] == 3
            assert tools["trivy_fs"]["total"] == 1

    def test_overview_empty_project(self, service):
        with SessionLocal() as session:
            overview = service.get_project_overview(session, "proj_empty")
            assert overview == []


class TestIssueServiceToolDetail:
    def test_tool_detail_pagination(self, service):
        with SessionLocal() as session:
            for i in range(5):
                service.create_issue(session, {
                    "issue_id": f"td:{i}",
                    "project_id": "proj_1",
                    "tool_name": "sonar",
                    "severity": "high",
                    "title": f"Issue {i}",
                })
            result = service.get_tool_issues(session, "proj_1", "sonar", page=1, page_size=2)
            assert result["total"] == 5
            assert len(result["issues"]) == 2
            assert result["page"] == 1
            assert result["total_pages"] == 3


class TestIssueServiceMyIssues:
    def test_my_issues_returns_assigned(self, service):
        with SessionLocal() as session:
            for i in range(3):
                issue = service.create_issue(session, {
                    "issue_id": f"my:{i}",
                    "project_id": "proj_1",
                    "tool_name": "sonar",
                    "severity": "high",
                    "title": f"Issue {i}",
                })
                issue.assignee_id = "user_dev"
            session.flush()
            result = service.get_my_issues(session, "user_dev")
            assert result["total"] == 3

    def test_my_issues_empty(self, service):
        with SessionLocal() as session:
            result = service.get_my_issues(session, "user_nobody")
            assert result["total"] == 0
            assert result["projects"] == []
