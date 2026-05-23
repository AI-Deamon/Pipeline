"""
Test CORS configuration security.

Ensures CORS is properly configured with specific origins instead of wildcard,
preventing session hijacking attacks in production.
"""
import os
import pytest
from fastapi.testclient import TestClient

# Set required environment variables BEFORE importing app
os.environ.setdefault('ENV', 'test')
os.environ.setdefault('DATABASE_URL', 'postgresql://devsecops:test-password@localhost:5432/devsecops_test')
os.environ.setdefault('JENKINS_BASE_URL', 'http://localhost:8080')
os.environ.setdefault('JENKINS_TOKEN', 'test-jenkins-token-12345678901234567890')
os.environ.setdefault('STORAGE_PATH', './storage/test')
os.environ.setdefault('SCAN_TIMEOUT', '120')
os.environ.setdefault('LOG_LEVEL', 'DEBUG')
os.environ.setdefault('CALLBACK_TOKEN', 'test-callback-token-12345678901234567890')
os.environ.setdefault('API_KEY', 'test-api-key-12345678901234567890123456')
os.environ.setdefault('CORS_ORIGINS', '["http://localhost:5173"]')

from app.main import app
from app.core.config import settings

client = TestClient(app)


def test_cors_allows_configured_origins():
    """Test that CORS allows configured origins"""
    origin = settings.CORS_ORIGINS[0]
    response = client.get(
        "/",
        headers={"Origin": origin}
    )
    assert response.status_code == 200
    assert "access-control-allow-origin" in response.headers
    assert response.headers["access-control-allow-origin"] == origin


def test_cors_rejects_unconfigured_origins():
    """Test that CORS rejects unconfigured origins"""
    response = client.get(
        "/",
        headers={"Origin": "https://evil.com"}
    )
    # Should not include access-control-allow-origin header
    assert "access-control-allow-origin" not in response.headers


def test_cors_allows_localhost_for_dev():
    """Test that localhost:5173 is allowed for development"""
    response = client.get(
        "/",
        headers={"Origin": "http://localhost:5173"}
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_cors_credentials_header_present():
    """Test that credentials header is allowed"""
    origin = settings.CORS_ORIGINS[0]
    response = client.get(
        "/",
        headers={"Origin": origin}
    )
    assert response.headers.get("access-control-allow-credentials") == "true"


def test_cors_no_wildcard_with_credentials():
    """Test that CORS does not use wildcard with credentials (security vulnerability)"""
    # The original vulnerability: allow_origins=["*"] with allow_credentials=True
    # This test verifies the fix by ensuring we don't return "*" as the allowed origin
    response = client.get(
        "/",
        headers={"Origin": "http://localhost:5173"}
    )
    # Should return the specific origin, not wildcard
    assert response.headers.get("access-control-allow-origin") != "*"
