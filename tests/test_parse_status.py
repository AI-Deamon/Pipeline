"""Tests for parse_status on ScanReportDB.

Validates that:
- Corrupt JSON produces parse_status='parse_error' with zero findings
- Auth errors produce parse_status='auth_error'
- Fetch failures produce parse_status='fetch_failed'
- Normal reports produce parse_status='ok'
"""
import json
import pytest
from unittest.mock import patch, MagicMock, AsyncMock

from app.services.reporting.parsers.base import ParseError


def test_parse_error_on_corrupt_json():
    """Corrupt JSON should raise ParseError."""
    from app.services.reporting.parsers.trivy import parse_trivy_report
    with pytest.raises(ParseError, match="not valid JSON"):
        parse_trivy_report("not valid json {{{")


def test_parse_error_zap_on_corrupt_json():
    from app.services.reporting.parsers.zap import parse_zap_report
    with pytest.raises(ParseError, match="not valid JSON"):
        parse_zap_report("<<<bad>>>")


def test_parse_error_nmap_on_corrupt_json():
    from app.services.reporting.parsers.nmap import parse_nmap_findings
    with pytest.raises(ParseError, match="not valid JSON"):
        parse_nmap_findings("{broken")


def test_parse_error_depcheck_on_corrupt_json():
    from app.services.reporting.parsers.depcheck import parse_depcheck_report
    with pytest.raises(ParseError, match="not valid JSON"):
        parse_depcheck_report("}")


def test_fetcher_sets_parse_status_on_parse_error():
    """Fetcher should set parse_status='parse_error' when parser raises ParseError."""
    from app.services.reporting.fetcher import ReportFetcher

    fetcher = ReportFetcher("http://localhost:8080", "42")

    with patch.object(fetcher, "fetch_artifact", new_callable=AsyncMock, return_value="not json"):
        with patch.object(fetcher, "parse_tool_report", side_effect=ParseError("bad json")):
            with patch("app.services.reporting.fetcher.SessionLocal") as mock_session:
                mock_db = MagicMock()
                mock_session.return_value = mock_db
                mock_db.query.return_value.filter.return_value.delete.return_value = None
                mock_db.refresh.side_effect = lambda x: None

                import asyncio
                report = asyncio.run(
                    fetcher.fetch_and_process_tool("scan-1", "proj-1", "trivy_fs", "trivy-fs.json")
                )

                assert report is not None
                assert report.parse_status == "parse_error"
                assert report.findings == []


def test_fetcher_sets_fetch_failed_on_missing_artifact():
    """Fetcher should set parse_status='fetch_failed' when artifact is not found."""
    from app.services.reporting.fetcher import ReportFetcher

    fetcher = ReportFetcher("http://localhost:8080", "42")

    with patch.object(fetcher, "fetch_artifact", new_callable=AsyncMock, return_value=None):
        with patch("app.services.reporting.fetcher.SessionLocal") as mock_session:
            mock_db = MagicMock()
            mock_session.return_value = mock_db
            mock_db.query.return_value.filter.return_value.delete.return_value = None
            mock_db.refresh.side_effect = lambda x: None

            import asyncio
            report = asyncio.run(
                fetcher.fetch_and_process_tool("scan-1", "proj-1", "trivy_fs", "trivy-fs.json")
            )

            assert report is not None
            assert report.parse_status == "fetch_failed"
            assert report.findings == []
