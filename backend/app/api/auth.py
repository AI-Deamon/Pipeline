import uuid
import re
from datetime import timedelta
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core import security
from app.core.db import get_db
from app.core.rate_limit import limiter
from app.models.db_models import UserDB
from app.schemas.user import UserCreate, User
from app.schemas.token import Token
from app.core.auth import get_current_user
from app.schemas.rbac import CurrentUserResponse
from app.services.rbac_service import get_rbac_service

router = APIRouter()

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
@limiter.limit("5/minute")
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
@limiter.limit("10/minute")
def login_for_access_token(request: Request, form_data: Annotated[OAuth2PasswordRequestForm, Depends()], db: Annotated[Session, Depends(get_db)]):
    user = db.query(UserDB).filter(UserDB.username == form_data.username).first()
    if not user or not security.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=security.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = security.create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}


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
