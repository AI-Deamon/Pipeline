import uuid
import re
from datetime import timedelta
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core import security
from app.core.config import settings
from app.core.db import get_db
from app.core.rate_limit import limiter
from app.models.db_models import UserDB
from app.schemas.user import UserCreate, User
from app.schemas.token import Token
from app.core.auth import get_current_user
from app.schemas.rbac import CurrentUserResponse
from app.services.rbac_service import get_rbac_service

router = APIRouter()

# `Settings.ENV` can only ever be "dev", "test", or "staging" (see config.py) — there is
# no "production" value. Rate limits must therefore be strict by default and only relaxed
# for the environments named here, so a future/renamed environment fails safe (strict).
_UNRESTRICTED_RATE_LIMIT_ENVS = {"dev", "test"}


def set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    """Set httpOnly cookies for access and refresh tokens."""
    response.set_cookie(
        key=settings.COOKIE_NAME,
        value=access_token,
        max_age=settings.COOKIE_MAX_AGE,
        httponly=True,
        samesite="Lax",
        secure=settings.COOKIE_SECURE,
        path="/",
    )
    response.set_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        value=refresh_token,
        # No max_age/expires: an actual session cookie, kept until the browser closes.
        # `max_age=0` (the previous value here) doesn't mean "session-only" — it's the
        # standard signal browsers use to delete a cookie immediately, so the refresh
        # cookie never survived past the login response and every hydrate-on-reload
        # or `/auth/refresh` call silently had nothing to read.
        httponly=True,
        samesite="Lax",
        secure=settings.COOKIE_SECURE,
        # Must match the router's actual mount point (`/api/v1/auth`, see main.py) —
        # a plain "/auth" never prefix-matches "/api/v1/auth/refresh", so the browser
        # would silently withhold the cookie from the one endpoint that needs it.
        path="/api/v1/auth",
    )

def _validate_password_strength(password: str) -> None:
    """Validate password meets minimum strength requirements."""
    if len(password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must be at least 8 characters long",
        )
    if not re.search(r'[A-Z]', password):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must contain at least one uppercase letter",
        )
    if not re.search(r'[a-z]', password):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must contain at least one lowercase letter",
        )
    if not re.search(r'[0-9]', password):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must contain at least one digit",
        )

@router.post("/register", response_model=User,
  responses={
    400: {"description": "Bad request"}
  })
@limiter.limit("1000/minute" if settings.ENV in _UNRESTRICTED_RATE_LIMIT_ENVS else "5/minute")
def register(request: Request, user: UserCreate, db: Annotated[Session, Depends(get_db)]):
    _validate_password_strength(user.password)

    # Check username collision
    db_user = db.query(UserDB).filter(UserDB.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")

    hashed_password = security.get_password_hash(user.password)
    db_user = UserDB(
        id=str(uuid.uuid4()),
        username=user.username,
        hashed_password=hashed_password
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@router.post("/login", response_model=Token,
  responses={
    401: {"description": "Unauthorized"}
  })
@limiter.limit("1000/minute" if settings.ENV in _UNRESTRICTED_RATE_LIMIT_ENVS else "10/minute")
def login_for_access_token(request: Request, response: Response, form_data: Annotated[OAuth2PasswordRequestForm, Depends()], db: Annotated[Session, Depends(get_db)]):
    user = db.query(UserDB).filter(UserDB.username == form_data.username).first()
    # Always run a password verification even when the user doesn't exist, against a
    # fixed dummy hash, so the response time doesn't reveal whether a username is valid
    # (argon2 verification is deliberately slow; skipping it for unknown users leaks
    # their non-existence via a fast 401 — a username-enumeration side channel).
    if user:
        password_ok = security.verify_password(form_data.password, user.hashed_password)
    else:
        security.verify_password(form_data.password, security.DUMMY_PASSWORD_HASH)
        password_ok = False

    if not user or not password_ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=security.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = security.create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    refresh_token = security.create_refresh_token(data={"sub": user.username})

    # Set httpOnly cookies
    set_auth_cookies(response, access_token, refresh_token)

    # Return token in body for 24-hour grace period (deprecated after migration)
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/refresh", response_model=Token,
  responses={
    401: {"description": "Invalid or missing refresh token"}
  })
def refresh_access_token(request: Request, response: Response, db: Annotated[Session, Depends(get_db)]):
    """Issue a new access token using the session-only refresh token cookie."""
    refresh_token_value = request.cookies.get(settings.REFRESH_COOKIE_NAME)
    if not refresh_token_value:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing refresh token",
        )

    try:
        import jwt  # PyJWT
        payload = jwt.decode(refresh_token_value, security.SECRET_KEY, algorithms=[security.ALGORITHM])
        username: str | None = payload.get("sub")
        # Reject an access token presented here — without this check the two token
        # types are interchangeable, letting a stolen (short-lived) access token be
        # laundered into a fresh one past its own expiry via this endpoint.
        if username is None or payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token payload",
            )
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing refresh token",
        )

    user = db.query(UserDB).filter(UserDB.username == username).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    access_token_expires = timedelta(minutes=security.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = security.create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )

    # Set new access token cookie
    response.set_cookie(
        key=settings.COOKIE_NAME,
        value=access_token,
        max_age=settings.COOKIE_MAX_AGE,
        httponly=True,
        samesite="Lax",
        secure=settings.COOKIE_SECURE,
        path="/",
    )

    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/logout")
def logout(response: Response):
    """Clear the httpOnly auth cookies server-side. The frontend previously tried to
    do this via `document.cookie`, which cannot touch httpOnly cookies at all — this
    endpoint is the actual fix (finding #13). `delete_cookie`'s path/samesite/secure
    must match how the cookies were originally set, or the browser treats it as a
    different cookie and won't delete the real one."""
    response.delete_cookie(
        key=settings.COOKIE_NAME,
        path="/",
        samesite="Lax",
        secure=settings.COOKIE_SECURE,
    )
    response.delete_cookie(
        key=settings.REFRESH_COOKIE_NAME,
        path="/api/v1/auth",
        samesite="Lax",
        secure=settings.COOKIE_SECURE,
    )
    return {"detail": "Logged out"}


@router.get("/me", response_model=CurrentUserResponse)
def get_current_user_info(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[dict, Depends(get_current_user)],
):
    rbac = get_rbac_service(db=db, user=current_user)
    return CurrentUserResponse(
        id=str(current_user.id),
        username=str(current_user.username),
        role=str(current_user.role),
        permissions=rbac.permissions,
    )
