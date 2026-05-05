"""Test AI validator module."""
import pytest
from unittest.mock import Mock, patch


def test_ai_validator_exists():
    """Verify AIValidator module exists"""
    try:
        from app.services.reporting.ai_validator import AIValidator
        assert True
    except ImportError:
        assert False, "AIValidator not found"


@pytest.mark.asyncio
async def test_ai_validator_validate():
    """Verify AI validation works"""
    from app.services.reporting.ai_validator import AIValidator
    from app.services.reporting.parsers.base import SecurityFinding

    validator = AIValidator(ollama_url="http://localhost:11434")

    finding = SecurityFinding(
        id="TEST-001",
        tool="trivy_fs",
        severity="High",
        title="Test CVE",
        description="Test"
    )

    # Mock the Ollama API call using httpx
    with patch('httpx.AsyncClient.post') as mock_post:
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {"response": "true"}

        result = await validator.validate_finding(finding)
        assert isinstance(result, bool)
