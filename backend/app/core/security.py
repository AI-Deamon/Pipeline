import os
import secrets
import warnings
from datetime import datetime, timedelta, timezone
from typing import Optional
import jwt  # PyJWT
from passlib.context import CryptContext

from app.core.config import settings

# Use separate JWT secret; an ephemeral key is only acceptable in dev/test, where
# losing sessions on restart is a non-issue. Staging (the only other environment —
# see Settings.ENV) must fail hard rather than silently sign tokens with a secret
# that changes every restart and was never actually configured.
if settings.JWT_SECRET_KEY:
    SECRET_KEY = settings.JWT_SECRET_KEY
elif settings.ENV in ("dev", "test"):
    SECRET_KEY = secrets.token_hex(32)
    warnings.warn(
        "JWT_SECRET_KEY not configured — using ephemeral random key. "
        "Tokens will not survive application restarts. Set JWT_SECRET_KEY for persistence.",
        RuntimeWarning,
        stacklevel=1,
    )
else:
    raise RuntimeError(
        "JWT_SECRET_KEY must be set outside dev/test environments — refusing to start "
        "with an ephemeral signing key."
    )
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60  # 1 hour for security-sensitive app
REFRESH_TOKEN_EXPIRE_DAYS = 7

pwd_context = CryptContext(schemes=["argon2", "bcrypt"], deprecated="auto")

# Precomputed hash of a random throwaway password. Used by the login handler to run a
# constant-time-equivalent verification for non-existent usernames, so login latency
# doesn't reveal whether an account exists (username-enumeration defense).
DUMMY_PASSWORD_HASH = pwd_context.hash("dummy-password-for-timing-equalization")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "type": "access"})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def create_refresh_token(data: dict) -> str:
    """Create a refresh token. The cookie itself is session-only (max_age=0, cleared
    when the browser closes), but the token is still bounded server-side — without an
    `exp` claim it would remain valid forever if ever extracted (XSS, logs, a synced
    browser profile). Also tagged with `type` so a stolen access token can't be
    replayed at /refresh to mint new tokens (they're no longer interchangeable)."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt
