"""Test export endpoint."""
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_export_endpoint():
    """Verify export endpoint exists"""
    response = client.get("/api/v1/reports/projects/test/reports/unified/export?format=html")
    assert response.status_code != 404, "Export endpoint not found"
