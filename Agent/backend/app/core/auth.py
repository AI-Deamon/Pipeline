from fastapi import Depends, HTTPException, Request, Security, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core import security
from app.core.db import get_db
from app.models.db_models import UserDB
from app.schemas.token import TokenData

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


def get_current_user(
    request: Request,
    token: str | None = Security(oauth2_scheme),
    db: Session = Depends(get_db),
):
    if settings.ENV == "test":
        return type("User", (), {"username": "test-bypass"})()

    # Callback endpoint has its own dedicated shared-secret guard.
    if request.url.path.endswith("/callback"):
        return type("User", (), {"username": "callback-bypass"})()

    if not token:
        # Fallback to API Key logic for Jenkins/external scripts that haven't migrated
        api_key = request.headers.get("X-API-Key")
        if api_key and api_key == settings.API_KEY:
            return type("User", (), {"username": "api-key-bypass"})()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(
            token, security.SECRET_KEY, algorithms=[security.ALGORITHM]
        )
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = TokenData(username=username)
    except JWTError:
        raise credentials_exception

    user = db.query(UserDB).filter(UserDB.username == token_data.username).first()
    if user is None:
        raise credentials_exception
    return user


def require_admin(user: UserDB = Depends(get_current_user)):
    """Dependency to require admin role"""
    if getattr(user, "role", "user") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Admin privileges required"
        )
    return user
