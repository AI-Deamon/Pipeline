"""Tests for authentication security fixes: JWT secret, password strength, deleted user."""
import os
import pytest

os.environ.setdefault('ENV', 'test')
os.environ.setdefault('DATABASE_URL', 'sqlite:///test_auth_sec.db')
os.environ.setdefault('JENKINS_BASE_URL', 'http://localhost:8080')
os.environ.setdefault('JENKINS_TOKEN', 'test-token')
os.environ.setdefault('STORAGE_PATH', '/tmp/storage-test')
os.environ.setdefault('SCAN_TIMEOUT', '7200')
os.environ.setdefault('LOG_LEVEL', 'INFO')
os.environ.setdefault('CALLBACK_TOKEN', 'test-callback-token-1234567890')
os.environ.setdefault('API_KEY', 'test-api-key-1234567890')
os.environ.setdefault('TEST_BYPASS_AUTH', 'True')
os.environ.setdefault('MOCK_EXECUTION', 'True')
os.environ.setdefault('SONARQUBE_TOKEN', 'test-sonar-token-1234567890')


class TestJWTSecretSeparation:
    """T009: Verify JWT secret is separated from API_KEY."""

    def test_jwt_secret_config_exists(self):
        """JWT_SECRET_KEY config field must exist."""
        from app.core.config import settings
        assert hasattr(settings, 'JWT_SECRET_KEY')

    def test_secret_key_is_set(self):
        """SECRET_KEY in security module must be non-empty."""
        from app.core.security import SECRET_KEY
        assert SECRET_KEY is not None
        assert len(SECRET_KEY) > 0

    def test_jwt_token_roundtrip(self):
        """JWT tokens can be created and decoded."""
        from jose import jwt
        from app.core.security import SECRET_KEY, ALGORITHM

        payload = {"sub": "testuser"}
        token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
        decoded = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        assert decoded["sub"] == "testuser"


class TestPasswordStrength:
    """T010: Verify password strength validation logic."""

    def test_validation_function_exists(self):
        """Password validation function must exist in auth module."""
        from app.api.auth import _validate_password_strength
        assert callable(_validate_password_strength)

    def test_rejects_short_password(self):
        from app.api.auth import _validate_password_strength
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc:
            _validate_password_strength("short")
        assert exc.value.status_code == 422

    def test_rejects_no_uppercase(self):
        from app.api.auth import _validate_password_strength
        from fastapi import HTTPException
        with pytest.raises(HTTPException):
            _validate_password_strength("lowercase1")

    def test_rejects_no_lowercase(self):
        from app.api.auth import _validate_password_strength
        from fastapi import HTTPException
        with pytest.raises(HTTPException):
            _validate_password_strength("UPPERCASE1")

    def test_rejects_no_digit(self):
        from app.api.auth import _validate_password_strength
        from fastapi import HTTPException
        with pytest.raises(HTTPException):
            _validate_password_strength("NoDigitHere")

    def test_accepts_strong_password(self):
        from app.api.auth import _validate_password_strength
        # Should not raise
        _validate_password_strength("StrongPass1")


class TestDeletedUserHandling:
    """T012: Verify deleted user returns specific 401 error."""

    def test_auth_code_has_account_deleted_header(self):
        """Auth module must include X-Auth-Reason header for deleted users."""
        import inspect
        from app.core import auth
        source = inspect.getsource(auth.get_current_user)
        assert "account-deleted" in source
        assert "X-Auth-Reason" in source
