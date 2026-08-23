import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.db import engine, Base
from app.models.db_models import ProjectDB, UserDB, ScanDB
from app.core.db import SessionLocal
from app.core.security import get_password_hash
from app.state.scan_state import ScanState
from datetime import datetime, timezone

client = TestClient(app)


class TestProjectsPagination:
    def _seed_projects(self, count: int, db=None):
        """Create test projects and optionally a user for auth."""
        if db is None:
            db = SessionLocal()
        try:
            # Ensure test user exists
            existing = db.query(UserDB).filter(UserDB.username == "admin").first()
            if not existing:
                user = UserDB(
                    id="test-admin-id",
                    username="admin",
                    hashed_password=get_password_hash("admin123"),
                    role="admin",
                )
                db.add(user)
                db.commit()

            for i in range(count):
                project = ProjectDB(
                    project_id=f"proj-{i:04d}",
                    name=f"Project {i}",
                    status="CREATED",
                )
                db.add(project)
            db.commit()
        finally:
            db.close()

    def _ensure_admin_user(self):
        """Create admin user if it doesn't exist."""
        db = SessionLocal()
        try:
            existing = db.query(UserDB).filter(UserDB.username == "admin").first()
            if not existing:
                user = UserDB(
                    id="test-admin-id",
                    username="admin",
                    hashed_password=get_password_hash("admin123"),
                    role="admin",
                )
                db.add(user)
                db.commit()
        finally:
            db.close()

    def _login(self) -> dict[str, str]:
        """Login and return cookies as a dict for subsequent requests."""
        login_resp = client.post(
            "/api/v1/auth/login",
            data={"username": "admin", "password": "admin123"},
        )
        assert login_resp.status_code == 200
        set_cookie_headers = login_resp.headers.get_list("set-cookie")
        cookies = {}
        for h in set_cookie_headers:
            name, value = h.split(";")[0].split("=", 1)
            cookies[name] = value
        return cookies

    def _get_projects(self, cookies: dict, page: int = 1, page_size: int = 25):
        """Call GET /projects with auth cookies."""
        cookie_header = "; ".join(f"{k}={v}" for k, v in cookies.items())
        return client.get(
            f"/api/v1/projects?page={page}&page_size={page_size}",
            headers={"Cookie": cookie_header},
        )

    def test_first_page_returns_correct_items_and_metadata(self):
        """First page returns correct items count and pagination metadata."""
        self._seed_projects(30)
        cookies = self._login()

        response = self._get_projects(cookies, page=1, page_size=10)
        assert response.status_code == 200
        data = response.json()

        assert "items" in data
        assert "total" in data
        assert "page" in data
        assert "page_size" in data
        assert "total_pages" in data
        assert data["page"] == 1
        assert data["page_size"] == 10
        assert data["total"] == 30
        assert data["total_pages"] == 3
        assert len(data["items"]) == 10

    def test_second_page_returns_next_set(self):
        """Second page returns the next set of projects."""
        self._seed_projects(30)
        cookies = self._login()

        page1 = self._get_projects(cookies, page=1, page_size=10).json()
        page2 = self._get_projects(cookies, page=2, page_size=10).json()

        page1_ids = {p["project_id"] for p in page1["items"]}
        page2_ids = {p["project_id"] for p in page2["items"]}

        # No overlap between pages
        assert len(page1_ids & page2_ids) == 0
        assert len(page2["items"]) == 10

    def test_empty_result_set(self):
        """Empty result set returns correct total_pages: 0."""
        self._ensure_admin_user()
        cookies = self._login()

        response = self._get_projects(cookies, page=1, page_size=25)
        assert response.status_code == 200
        data = response.json()

        assert data["items"] == []
        assert data["total"] == 0
        assert data["total_pages"] == 0

    def test_page_size_clamped_to_max_100(self):
        """Page size is clamped to max 100."""
        self._seed_projects(5)
        cookies = self._login()

        response = self._get_projects(cookies, page=1, page_size=500)
        assert response.status_code == 200
        data = response.json()
        assert data["page_size"] == 100  # Clamped from 500

    def test_project_item_shape(self):
        """Each item in response has expected fields."""
        self._seed_projects(1)
        cookies = self._login()

        response = self._get_projects(cookies, page=1, page_size=25)
        data = response.json()
        assert len(data["items"]) == 1
        item = data["items"][0]
        assert "project_id" in item
        assert "name" in item
        assert "last_scan_state" in item
        assert "last_scan_id" in item
        assert "last_scan_time" in item
