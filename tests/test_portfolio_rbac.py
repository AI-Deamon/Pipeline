"""RBAC regression test: portfolio.py's entire cross-project rollup API
(/portfolio/overview, /portfolio/project/{id}/tools, /portfolio/trends,
/portfolio/team-workload) had NO project-scoping at all — every route took
`_current_user=Depends(get_current_user)` (authentication only) and never
called into RbacService, unlike project_groups.py (#116) which got the same
fix earlier this session. Any authenticated non-admin could see severity,
risk score, coverage trends, and team workload data for every project in the
system, not just the ones they're assigned to.

TEST_BYPASS_AUTH short-circuits get_current_user before it looks at the
Authorization header, so cross-project denial tests disable it and
authenticate with a real JWT for the scoped user, matching the pattern in
tests/test_project_groups_rbac.py.
"""
import os

os.environ.setdefault('ENV', 'test')
os.environ.setdefault('DATABASE_URL', 'sqlite:///test_portfolio_rbac.db')
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
from fastapi.testclient import TestClient

from app.core.db import engine, Base, SessionLocal
from app.models.db_models import UserDB, ProjectDB, ScanReportDB, IssueDB, ProjectAssignmentDB


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    if not db.query(UserDB).first():
        db.add(UserDB(id="admin-1", username="admin", role="admin", hashed_password="h"))
        db.add(UserDB(id="dev-1", username="dev1", role="developer", hashed_password="h"))
        db.add(ProjectDB(project_id="proj-a", name="Project A", status="ACTIVE"))
        db.add(ProjectDB(project_id="proj-b", name="Project B", status="ACTIVE"))
        db.add(ScanReportDB(
            scan_id="scan-a-1", project_id="proj-a", tool_name="sonar",
            severity_summary={"critical": 3, "high": 0, "medium": 0, "low": 0, "info": 0},
            findings=[], migration_status="completed", created_at=datetime.now(timezone.utc),
        ))
        db.add(ScanReportDB(
            scan_id="scan-b-1", project_id="proj-b", tool_name="sonar",
            severity_summary={"critical": 9, "high": 0, "medium": 0, "low": 0, "info": 0},
            findings=[], migration_status="completed", created_at=datetime.now(timezone.utc),
        ))
        db.add(IssueDB(
            issue_id="issue-a-1", project_id="proj-a", tool_name="sonar",
            severity="critical", title="A issue", status="open", assignee_id="dev1",
            first_seen_at=datetime.now(timezone.utc), last_seen_at=datetime.now(timezone.utc),
            is_new=True,
        ))
        db.add(IssueDB(
            issue_id="issue-b-1", project_id="proj-b", tool_name="sonar",
            severity="critical", title="B issue", status="open", assignee_id="dev2",
            first_seen_at=datetime.now(timezone.utc), last_seen_at=datetime.now(timezone.utc),
            is_new=True,
        ))
        db.commit()
    db.close()
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    from app.main import app
    return TestClient(app)


@pytest.fixture
def admin_headers():
    return {"Authorization": "Bearer test-bypass"}


@pytest.fixture
def dev1_headers(monkeypatch):
    from app.core import auth as auth_module
    from app.core import security

    monkeypatch.setattr(auth_module.settings, "TEST_BYPASS_AUTH", False)

    db = SessionLocal()
    if not db.query(ProjectAssignmentDB).filter(ProjectAssignmentDB.user_id == "dev-1").first():
        db.add(ProjectAssignmentDB(user_id="dev-1", scope_type="project", scope_id="proj-a", assigned_by="admin-1"))
        db.commit()
    db.close()

    token = security.create_access_token({"sub": "dev1"})
    return {"Authorization": f"Bearer {token}"}


class TestPortfolioOverviewScoping:
    def test_admin_sees_both_projects(self, client, admin_headers):
        response = client.get("/api/v1/portfolio/overview", headers=admin_headers)
        assert response.status_code == 200
        project_ids = {p["project_id"] for p in response.json()["projects"]}
        assert project_ids == {"proj-a", "proj-b"}

    def test_dev_sees_only_assigned_project(self, client, dev1_headers):
        """Before the fix: a dev scoped only to proj-a saw proj-b's severity
        data (9 critical findings) too."""
        response = client.get("/api/v1/portfolio/overview", headers=dev1_headers)
        assert response.status_code == 200
        project_ids = {p["project_id"] for p in response.json()["projects"]}
        assert project_ids == {"proj-a"}
        assert "proj-b" not in project_ids


class TestPortfolioProjectToolsScoping:
    def test_dev_can_see_own_project(self, client, dev1_headers):
        response = client.get("/api/v1/portfolio/project/proj-a/tools", headers=dev1_headers)
        assert response.status_code == 200
        assert response.json()["project_id"] == "proj-a"

    def test_dev_cannot_see_other_project(self, client, dev1_headers):
        """Before the fix: any authenticated user could pull any project's
        per-tool severity breakdown and Sonar metrics by ID."""
        response = client.get("/api/v1/portfolio/project/proj-b/tools", headers=dev1_headers)
        assert response.json().get("error") == "Project not found"


class TestPortfolioTrendsScoping:
    def test_admin_trend_includes_both_projects_totals(self, client, admin_headers):
        response = client.get("/api/v1/portfolio/trends", headers=admin_headers)
        assert response.status_code == 200
        total_critical = sum(t.get("critical", 0) for t in response.json()["trends"])
        assert total_critical == 12  # 3 (proj-a) + 9 (proj-b)

    def test_dev_trend_excludes_other_projects_findings(self, client, dev1_headers):
        """Before the fix: portfolio trends aggregated severity across every
        project's scan reports with no project filter at all."""
        response = client.get("/api/v1/portfolio/trends", headers=dev1_headers)
        assert response.status_code == 200
        total_critical = sum(t.get("critical", 0) for t in response.json()["trends"])
        assert total_critical == 3  # only proj-a's, not proj-b's 9


class TestPortfolioTeamWorkloadScoping:
    def test_admin_sees_both_developers(self, client, admin_headers):
        response = client.get("/api/v1/portfolio/team-workload", headers=admin_headers)
        assert response.status_code == 200
        usernames = {d["username"] for d in response.json()["developers"]}
        assert usernames == {"dev1", "dev2"}

    def test_dev_does_not_see_workload_from_other_project(self, client, dev1_headers):
        """Before the fix: team-workload queried IssueDB with zero project
        filter — any authenticated user saw every developer's full workload
        across every project, including teams they have no access to."""
        response = client.get("/api/v1/portfolio/team-workload", headers=dev1_headers)
        assert response.status_code == 200
        usernames = {d["username"] for d in response.json()["developers"]}
        assert usernames == {"dev1"}
        assert "dev2" not in usernames
