import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


class TestProjectOverview:
    def test_overview_returns_tools(self):
        resp = client.post("/api/v1/issues", json={
            "issue_id": "ov:001", "project_id": "proj_1", "tool_name": "sonar",
            "severity": "high", "title": "Test",
        })
        assert resp.status_code == 201

        resp = client.get("/api/v1/issues/projects/proj_1/overview")
        assert resp.status_code == 200
        data = resp.json()
        assert data["project_id"] == "proj_1"
        assert len(data["tools"]) > 0

    def test_overview_empty_project(self):
        resp = client.get("/api/v1/issues/projects/proj_empty/overview")
        assert resp.status_code == 200
        data = resp.json()
        assert data["project_id"] == "proj_empty"
        assert data["tools"] == []


class TestToolIssues:
    def test_tool_issues_paginated(self):
        for i in range(3):
            client.post("/api/v1/issues", json={
                "issue_id": f"ti:{i}", "project_id": "proj_2", "tool_name": "trivy",
                "severity": "medium", "title": f"TI {i}",
            })

        resp = client.get("/api/v1/issues/projects/proj_2/tools/trivy?page=1&page_size=2")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 3
        assert len(data["issues"]) == 2
        assert data["total_pages"] == 2

    def test_tool_issues_empty(self):
        resp = client.get("/api/v1/issues/projects/proj_3/tools/sonar")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["issues"] == []


class TestMyIssues:
    def test_my_issues_returns_assigned(self):
        resp = client.post("/api/v1/issues", json={
            "issue_id": "my:001", "project_id": "proj_4", "tool_name": "sonar",
            "severity": "high", "title": "My issue",
        })
        issue_id = resp.json()["id"]
        client.post(f"/api/v1/issues/{issue_id}/assign", json={
            "assignee_id": "test-bypass",
        })

        resp = client.get("/api/v1/issues/my")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1

    def test_my_issues_empty_for_nobody(self):
        resp = client.get("/api/v1/issues/my?page=1&page_size=10")
        assert resp.status_code == 200
        data = resp.json()
        assert "total" in data
        assert "projects" in data


class TestCreateIssue:
    def test_create_valid_issue(self):
        resp = client.post("/api/v1/issues", json={
            "issue_id": "cr:001", "project_id": "proj_5", "tool_name": "sonar",
            "severity": "critical", "title": "Critical bug",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["issue_id"] == "cr:001"
        assert data["status"] == "open"

    def test_create_duplicate_upserts(self):
        resp1 = client.post("/api/v1/issues", json={
            "issue_id": "cr:dup", "project_id": "proj_5", "tool_name": "sonar",
            "severity": "high", "title": "Original",
        })
        resp2 = client.post("/api/v1/issues", json={
            "issue_id": "cr:dup", "project_id": "proj_5", "tool_name": "sonar",
            "severity": "high", "title": "Updated",
        })
        assert resp1.status_code == 201
        assert resp2.status_code == 201
        assert resp1.json()["id"] == resp2.json()["id"]
        assert resp2.json()["title"] == "Updated"

    def test_create_empty_title_rejected(self):
        resp = client.post("/api/v1/issues", json={
            "issue_id": "cr:bad", "project_id": "proj_5", "tool_name": "sonar",
            "severity": "low", "title": "",
        })
        assert resp.status_code == 422


class TestGetIssue:
    def test_get_existing_issue(self):
        resp = client.post("/api/v1/issues", json={
            "issue_id": "get:001", "project_id": "proj_6", "tool_name": "sonar",
            "severity": "info", "title": "Get me",
        })
        issue_id = resp.json()["id"]

        resp = client.get(f"/api/v1/issues/{issue_id}")
        assert resp.status_code == 200
        assert resp.json()["issue_id"] == "get:001"

    def test_get_nonexistent_issue(self):
        resp = client.get("/api/v1/issues/99999")
        assert resp.status_code == 404


class TestAssignIssue:
    def test_assign_success(self):
        resp = client.post("/api/v1/issues", json={
            "issue_id": "as:001", "project_id": "proj_7", "tool_name": "sonar",
            "severity": "high", "title": "Assign me",
        })
        issue_id = resp.json()["id"]

        resp = client.post(f"/api/v1/issues/{issue_id}/assign", json={
            "assignee_id": "user_dev",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["assignee_id"] == "user_dev"
        assert data["status"] == "assigned"

    def test_assign_nonexistent(self):
        resp = client.post("/api/v1/issues/99999/assign", json={
            "assignee_id": "user_dev",
        })
        assert resp.status_code == 404


class TestTransitionIssue:
    def test_transition_full_flow(self):
        resp = client.post("/api/v1/issues", json={
            "issue_id": "tr:001", "project_id": "proj_8", "tool_name": "sonar",
            "severity": "high", "title": "Transition me",
        })
        issue_id = resp.json()["id"]

        client.post(f"/api/v1/issues/{issue_id}/assign", json={"assignee_id": "user_dev"})

        for status in ["in_progress", "fixed", "verified"]:
            resp = client.post(f"/api/v1/issues/{issue_id}/transition", json={"status": status})
            assert resp.status_code == 200, f"Failed transition to {status}"
            assert resp.json()["status"] == status

    def test_invalid_transition(self):
        resp = client.post("/api/v1/issues", json={
            "issue_id": "tr:bad", "project_id": "proj_8", "tool_name": "sonar",
            "severity": "low", "title": "Bad transition",
        })
        issue_id = resp.json()["id"]

        resp = client.post(f"/api/v1/issues/{issue_id}/transition", json={"status": "verified"})
        assert resp.status_code == 400

    def test_transition_nonexistent(self):
        resp = client.post("/api/v1/issues/99999/transition", json={"status": "fixed"})
        assert resp.status_code == 404


class TestMetrics:
    def test_metrics_empty_project(self):
        resp = client.get("/api/v1/issues/projects/proj_9/metrics")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert isinstance(data["by_status"], dict)

    def test_metrics_with_issues(self):
        resp = client.post("/api/v1/issues", json={
            "issue_id": "m:001", "project_id": "proj_10", "tool_name": "sonar",
            "severity": "high", "title": "Metric issue 1",
        })
        issue_id = resp.json()["id"]
        client.post(f"/api/v1/issues/{issue_id}/assign", json={"assignee_id": "test-bypass"})

        resp = client.get("/api/v1/issues/projects/proj_10/metrics")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert "assigned" in data["by_status"] or "open" in data["by_status"]
        assert isinstance(data["avg_assignment_latency_hours"], (int, float)) or data["avg_assignment_latency_hours"] is None
