"""Regression test for #27: raw_report had no size guard before storage."""
import os

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("JENKINS_BASE_URL", "http://jenkins.test")
os.environ.setdefault("STORAGE_PATH", "/tmp/sentinel-test-storage")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret")
os.environ.setdefault("ENVIRONMENT", "test")

from app.services.reporting.fetcher import (
    _cap_raw_report,
    _RAW_REPORT_MAX_BYTES,
    _RAW_REPORT_TRUNCATION_NOTICE,
)


def test_small_report_is_stored_unchanged():
    raw = '{"ok": true}'
    assert _cap_raw_report(raw) == raw


def test_none_stays_none():
    assert _cap_raw_report(None) is None


def test_oversized_report_is_truncated_with_notice():
    huge = "x" * (_RAW_REPORT_MAX_BYTES + 1000)
    result = _cap_raw_report(huge)
    assert len(result.encode("utf-8")) <= _RAW_REPORT_MAX_BYTES
    assert result.endswith(_RAW_REPORT_TRUNCATION_NOTICE)
