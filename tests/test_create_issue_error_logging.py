"""Regression test for #38: create_issue's bare `except Exception` swallowed
the real error entirely with no logging, making failures undebuggable."""
import os

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("JENKINS_BASE_URL", "http://jenkins.test")
os.environ.setdefault("STORAGE_PATH", "/tmp/sentinel-test-storage")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret")
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("TEST_BYPASS_AUTH", "True")

from fastapi.testclient import TestClient

from app.main import app
from app.api import issues as issues_module

client = TestClient(app)


class TestCreateIssueErrorIsLogged:
    def test_unexpected_failure_is_logged_with_traceback(self, monkeypatch, caplog):
        def _boom(db, data):
            raise RuntimeError("simulated DB failure")

        monkeypatch.setattr(issues_module.service, "create_issue", _boom)

        with caplog.at_level("ERROR"):
            resp = client.post("/api/v1/issues", json={
                "issue_id": "boom:001", "project_id": "proj_boom", "tool_name": "sonar",
                "severity": "high", "title": "Test",
            })

        assert resp.status_code == 400
        assert "Failed to create issue" in caplog.text
        assert any(r.exc_info for r in caplog.records), "exception traceback was not captured"
