"""Regression/coverage test for #66: fix_note_sanitizer.py had zero test
references anywhere despite being security-relevant (redacts secrets from
user-supplied fix notes before they're stored/displayed).
"""
import os

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("JENKINS_BASE_URL", "http://jenkins.test")
os.environ.setdefault("STORAGE_PATH", "/tmp/sentinel-test-storage")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret")
os.environ.setdefault("ENVIRONMENT", "test")

from app.services.fix_note_sanitizer import sanitize


class TestSanitizePatterns:
    def test_aws_access_key_is_redacted(self):
        result = sanitize("Set AKIAIOSFODNN7EXAMPLE in the config")
        assert "AKIAIOSFODNN7EXAMPLE" not in result.sanitized
        assert "***REDACTED:aws_access_key***" in result.sanitized
        assert result.redactions[0]["kind"] == "aws_access_key"

    def test_github_pat_is_redacted(self):
        token = "ghp_" + "a" * 36
        result = sanitize(f"token={token}")
        assert token not in result.sanitized
        assert any(r["kind"] in ("github_pat", "password_kv") for r in result.redactions)

    def test_jwt_is_redacted(self):
        fake_jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"
        result = sanitize(f"used this jwt: {fake_jwt}")
        assert fake_jwt not in result.sanitized
        assert any(r["kind"] == "jwt" for r in result.redactions)

    def test_private_key_header_is_redacted(self):
        result = sanitize("-----BEGIN RSA PRIVATE KEY-----\nMIIEow...")
        assert "-----BEGIN RSA PRIVATE KEY-----" not in result.sanitized
        assert any(r["kind"] == "private_key" for r in result.redactions)

    def test_password_kv_is_redacted(self):
        result = sanitize("password: SuperSecret123")
        assert "SuperSecret123" not in result.sanitized
        assert any(r["kind"] == "password_kv" for r in result.redactions)

    def test_bearer_token_is_redacted(self):
        result = sanitize("Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789")
        assert "abcdefghijklmnopqrstuvwxyz0123456789" not in result.sanitized
        assert any(r["kind"] == "bearer_token" for r in result.redactions)


class TestSanitizeBehavior:
    def test_plain_text_with_no_secrets_is_unchanged(self):
        text = "Fixed the SQL injection by parameterizing the query."
        result = sanitize(text)
        assert result.sanitized == text
        assert result.redactions == []

    def test_empty_string_returns_empty_result(self):
        result = sanitize("")
        assert result.sanitized == ""
        assert result.raw == ""
        assert result.redactions == []

    def test_raw_text_is_preserved_unredacted_for_audit_access(self):
        raw = "AKIAIOSFODNN7EXAMPLE"
        result = sanitize(raw)
        assert result.raw == raw
        assert "AKIAIOSFODNN7EXAMPLE" not in result.sanitized

    def test_multiple_secrets_all_get_redacted(self):
        text = "key=AKIAIOSFODNN7EXAMPLE and password: hunter2222"
        result = sanitize(text)
        assert "AKIAIOSFODNN7EXAMPLE" not in result.sanitized
        assert "hunter2222" not in result.sanitized
        assert len(result.redactions) >= 2

    def test_mask_shows_only_a_short_prefix_and_suffix(self):
        result = sanitize("AKIAIOSFODNN7EXAMPLE")
        mask = result.redactions[0]["mask"]
        assert "AKIAIOSFODNN7EXAMPLE" not in mask
        assert mask.startswith("AKIA")
        assert "REDACTED" in mask
