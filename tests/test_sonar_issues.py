import pytest
from unittest.mock import AsyncMock, Mock, patch

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


@pytest.mark.asyncio
async def test_fetch_sonar_rules_requests_html_desc_field():
    """Regression test for a real bug found live: SonarQube's /api/rules/search
    does not return htmlDesc/htmlNote in its default field set — it must be
    requested explicitly via the `f` query param. Without it, every Sonar
    finding's description/recommendation silently comes back empty (confirmed
    against production data: 151/184 real findings had no description at all).
    """
    from app.services.reporting.parsers.sonar import _fetch_sonar_rules
    import httpx

    mock_response = Mock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"rules": []}

    mock_client = Mock(spec=httpx.AsyncClient)
    mock_client.get = AsyncMock(return_value=mock_response)

    await _fetch_sonar_rules(mock_client, ["python:S2077"], auth=None)

    mock_client.get.assert_called_once()
    _, kwargs = mock_client.get.call_args
    sent_params = kwargs["params"]
    assert "f" in sent_params, "rules/search call must request extra fields explicitly"
    for required_field in ("htmlDesc", "htmlNote"):
        assert required_field in sent_params["f"]
