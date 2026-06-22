import hmac

from fastapi import Depends, HTTPException, Request, Security, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core import security
from app.core.db import get_db
from app.models.db_models import UserDB
from app.schemas.token import TokenData
from app.services.rbac_service import get_rbac_service

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

# Common prefix for scan routes (used in callback path matching)
_SCAN_PREFIX = "/api/v1/scans"


def _is_callback_route(path: str) -> bool:
    """Check if path is a callback endpoint that uses X-Callback-Token instead of JWT.

    Matches:
      - /api/v1/scans/callback                (legacy prefix)
      - /api/v1/scans/{scan_id}/callback       (actual callback route)
    """
    path = path.rstrip("/")
    if path == "/api/v1/scans/callback":
        return True
    if path.startswith(_SCAN_PREFIX + "/") and path.endswith("/callback"):
        return True
    return False


def get_current_user(
    request: Request,
    token: str | None = Security(oauth2_scheme),
    db: Session = Depends(get_db)
):
    # Safeguard: never allow env-based auth bypass in non-test environments
    # In test env, require explicit TEST_BYPASS_AUTH=true to enable bypass
    if settings.ENV == "test" and settings.TEST_BYPASS_AUTH:
        return type("User", (), {"username": "test-bypass", "role": "admin", "id": "bypass-id"})()

    # Callback endpoints use their own dedicated shared-secret guard (X-Callback-Token).
    # Only match registered callback route patterns, not arbitrary paths.
    if _is_callback_route(request.url.path):
        return type("User", (), {"username": "callback-bypass", "id": None, "role": None})()

    if not token:
        # Fallback to API Key logic for Jenkins/external scripts that haven't migrated
        api_key = request.headers.get("X-API-Key")
        if api_key and hmac.compare_digest(api_key, settings.API_KEY):
            # Return the service account from DB so RBAC checks work correctly
            service_user = db.query(UserDB).filter(UserDB.username == "service-account").first()
            if not service_user:
                service_user = UserDB(
                    id="service-account",
                    username="service-account",
                    role="admin",
                    is_active=True,
                )
                db.add(service_user)
                db.commit()
                db.refresh(service_user)
            return service_user
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
        payload = jwt.decode(token, security.SECRET_KEY, algorithms=[security.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = TokenData(username=username)
    except JWTError:
        raise credentials_exception

    user = db.query(UserDB).filter(UserDB.username == token_data.username).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer", "X-Auth-Reason": "account-deleted"},
        )
    return user


def require_role(*roles: str):
    """Dependency factory: require the current user to have one of the given roles."""
    def dependency(
        request: Request,
        db: Session = Depends(get_db),
        current_user=Depends(get_current_user),
    ):
        rbac = get_rbac_service(db=db, user=current_user)
        if rbac.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Required role: {', '.join(roles)}",
            )
        return current_user
    return dependency


def require_admin():
    """Shortcut: require admin role."""
    return require_role("admin")


def get_rbac(
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Dependency: inject RbacService for the current user."""
    return get_rbac_service(db=db, user=current_user)
