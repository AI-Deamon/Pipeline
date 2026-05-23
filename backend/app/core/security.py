import os
import warnings
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

# Use separate JWT secret; fall back to API_KEY with warning if not configured
if settings.JWT_SECRET_KEY:
    SECRET_KEY = settings.JWT_SECRET_KEY
else:
    SECRET_KEY = settings.API_KEY
    warnings.warn(
        "JWT_SECRET_KEY not configured — falling back to API_KEY as JWT signing secret. "
        "Set JWT_SECRET_KEY to limit blast radius if API_KEY is compromised.",
        RuntimeWarning,
        stacklevel=1,
    )
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # 7 days for convenience

pwd_context = CryptContext(schemes=["argon2", "bcrypt"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt
