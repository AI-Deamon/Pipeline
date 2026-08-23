import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.db import SessionLocal
from app.models.db_models import UserDB
from app.core.security import get_password_hash


client = TestClient(app)


def _ensure_admin_user():
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


class TestAuthCookieFlow:
    def test_login_returns_set_cookie_headers(self):
        """Login response includes Set-Cookie headers for access and refresh tokens."""
        _ensure_admin_user()
        response = client.post(
            "/api/v1/auth/login",
            data={"username": "admin", "password": "admin123"},
        )
        assert response.status_code == 200

        set_cookie_headers = response.headers.get_list("set-cookie")
        cookie_names = [h.split("=")[0] for h in set_cookie_headers]
        assert "access_token" in cookie_names
        assert "refresh_token" in cookie_names

    def test_login_cookie_attributes(self):
        """Access token cookie has correct attributes (httponly, samesite, path)."""
        _ensure_admin_user()
        response = client.post(
            "/api/v1/auth/login",
            data={"username": "admin", "password": "admin123"},
        )
        set_cookie_headers = response.headers.get_list("set-cookie")

        access_cookie = [h for h in set_cookie_headers if h.startswith("access_token=")][0]
        assert "httponly" in access_cookie.lower()
        assert "samesite=lax" in access_cookie.lower()
        assert "path=/" in access_cookie.lower()

    def test_login_still_returns_token_in_body(self):
        """Login still returns access_token in JSON body (grace period)."""
        _ensure_admin_user()
        response = client.post(
            "/api/v1/auth/login",
            data={"username": "admin", "password": "admin123"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_refresh_with_invalid_token_returns_401(self):
        """Refresh endpoint returns 401 when refresh token cookie is missing/invalid."""
        response = client.post("/api/v1/auth/refresh")
        assert response.status_code == 401

    def test_refresh_with_valid_cookie_issues_new_access_token(self):
        """Refresh endpoint issues new access token when valid refresh cookie is present."""
        _ensure_admin_user()
        # Login to get cookies
        login_response = client.post(
            "/api/v1/auth/login",
            data={"username": "admin", "password": "admin123"},
        )
        assert login_response.status_code == 200

        # Extract refresh token cookie and send it manually
        set_cookie_headers = login_response.headers.get_list("set-cookie")
        refresh_cookie = [h for h in set_cookie_headers if h.startswith("refresh_token=")][0]
        refresh_value = refresh_cookie.split(";")[0]  # "refresh_token=eyJ..."

        # Call refresh with the cookie header
        refresh_response = client.post(
            "/api/v1/auth/refresh",
            headers={"Cookie": refresh_value},
        )
        assert refresh_response.status_code == 200
        data = refresh_response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

        # Verify new access token cookie is set
        set_cookie_headers = refresh_response.headers.get_list("set-cookie")
        cookie_names = [h.split("=")[0] for h in set_cookie_headers]
        assert "access_token" in cookie_names

    def test_refresh_token_has_bounded_expiry(self):
        """Regression test for finding #1: the refresh token JWT previously had no
        `exp` claim at all, so it was valid forever server-side if ever extracted."""
        import jwt as pyjwt
        from app.core import security

        token = security.create_refresh_token({"sub": "admin"})
        payload = pyjwt.decode(token, security.SECRET_KEY, algorithms=[security.ALGORITHM])
        assert "exp" in payload
        assert payload["type"] == "refresh"

    def test_access_token_rejected_at_refresh_endpoint(self):
        """Regression test for finding #2: access and refresh tokens were previously
        interchangeable — /refresh only checked `sub`, not token type — so a stolen
        access token could be replayed there to mint fresh tokens past its own expiry."""
        _ensure_admin_user()
        from app.core import security

        access_token = security.create_access_token({"sub": "admin"})
        response = client.post(
            "/api/v1/auth/refresh",
            headers={"Cookie": f"refresh_token={access_token}"},
        )
        assert response.status_code == 401


class TestLogout:
    """Regression tests for finding #13: logout was client-side only and could not
    actually clear the httpOnly session cookies (document.cookie has no access to
    them). /auth/logout is the real fix.
    """

    def test_logout_clears_auth_cookies(self):
        _ensure_admin_user()
        login_response = client.post(
            "/api/v1/auth/login",
            data={"username": "admin", "password": "admin123"},
        )
        assert login_response.status_code == 200

        logout_response = client.post("/api/v1/auth/logout")
        assert logout_response.status_code == 200

        set_cookie_headers = logout_response.headers.get_list("set-cookie")
        access_cookie = next(h for h in set_cookie_headers if h.startswith("access_token="))
        refresh_cookie = next(h for h in set_cookie_headers if h.startswith("refresh_token="))
        # A cleared cookie is re-set with an empty value and an immediate expiry.
        assert access_cookie.startswith("access_token=;") or "Max-Age=0" in access_cookie
        assert refresh_cookie.startswith("refresh_token=;") or "Max-Age=0" in refresh_cookie
