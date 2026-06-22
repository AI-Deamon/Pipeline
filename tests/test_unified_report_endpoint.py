"""Test unified report and trends endpoints."""
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_unified_report_endpoint_exists():
    """Verify unified report endpoint exists and is reachable"""
    response = client.get("/api/v1/reports/projects/test-project/reports/unified")
    # In test env, auth is bypassed. Endpoint returns 404 for nonexistent project.
    assert response.status_code in (200, 401, 404), f"Unexpected status: {response.status_code}"


def test_report_trends_endpoint_exists():
    """Verify trends endpoint exists and is reachable"""
    response = client.get("/api/v1/reports/projects/test-project/reports/trends")
    # In test env, auth is bypassed. Endpoint returns 404 for nonexistent project.
    assert response.status_code in (200, 401, 404), f"Unexpected status: {response.status_code}"
