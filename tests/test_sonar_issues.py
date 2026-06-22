import pytest
from unittest.mock import Mock, patch

def test_fetch_sonar_issues():
    """Verify SonarQube issues are fetched"""
    try:
        from app.services.reporting.parsers.sonar import fetch_sonar_issues
        assert callable(fetch_sonar_issues)
    except ImportError:
        assert False, "fetch_sonar_issues not found"

@pytest.mark.asyncio
async def test_fetch_sonar_issues_returns_findings():
    """Verify API call returns findings"""
    from app.services.reporting.parsers.sonar import fetch_sonar_issues
    from app.services.reporting.parsers.base import SecurityFinding

    with patch('app.services.reporting.parsers.sonar.httpx.AsyncClient') as mock_client:
        # Mock response
        mock_resp = Mock()
        mock_resp.status_code = 200
        mock_resp.text = '{"issues": [{"key": "ABC123", "severity": "BLOCKER", "component": "myapp:src/main.py", "line": 42, "message": "SQL Injection", "rule": "python:S2077"}]}'
        mock_resp.json.return_value = {
            "issues": [
                {
                    "key": "ABC123",
                    "severity": "BLOCKER",
                    "component": "myapp:src/main.py",
                    "line": 42,
                    "message": "SQL Injection",
                    "rule": "python:S2077",
                }
            ]
        }
        mock_client.return_value.__aenter__.return_value.get.return_value = mock_resp

        findings, raw_json = await fetch_sonar_issues("my-project", "localhost:9000")
        assert isinstance(findings, list), "findings should be a list"
        assert isinstance(raw_json, str), "raw_json should be a string"
