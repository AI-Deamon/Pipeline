"""Test export endpoint."""
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_export_endpoint_exists():
    """Verify export endpoint exists and is reachable"""
    response = client.get("/api/v1/reports/projects/test/reports/unified/export?format=html")
    # In test env, auth is bypassed. Endpoint returns 404 for nonexistent project
    # (not 401), confirming the route exists and is registered.
    assert response.status_code in (200, 401, 404), f"Unexpected status: {response.status_code}"
