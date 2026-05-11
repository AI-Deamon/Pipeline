import logging
import os
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

from app.api import projects, scans, auth
from app.websockets import router as websocket_router
from app.core.auth import get_current_user
from app.core.config import settings
from app.core.db import engine, Base
from app.core.rate_limit import limiter

logger = logging.getLogger(__name__)

# Public endpoints that don't require authentication
PUBLIC_ENDPOINTS = [
    "/api/v1/auth/login",
    "/api/v1/auth/register",
    "/",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/api/v1/ws"
]

def public_endpoint_only(request):
    """Dependency that allows access to public endpoints without auth"""
    if any(request.url.path.startswith(endpoint) for endpoint in PUBLIC_ENDPOINTS):
        return True
    # For non-public endpoints, require authentication
    return Depends(get_current_user)

app = FastAPI(
    title="DevSecOps Control Plane API",
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

from app.services.scan_recovery import run_recovery_task
import threading

...

@app.on_event("startup")
def validate_configuration():
    if not settings.DATABASE_URL:
        raise RuntimeError("DATABASE_URL is required")
    if not settings.JENKINS_BASE_URL:
        raise RuntimeError("JENKINS_BASE_URL is required")
    if not settings.STORAGE_PATH:
        raise RuntimeError("STORAGE_PATH is required")

    Path(settings.STORAGE_PATH).mkdir(parents=True, exist_ok=True)

    # Initialize DB schema
    Base.metadata.create_all(bind=engine)

    # Start scan recovery background task (Phase 1.3)
    threading.Thread(target=run_recovery_task, daemon=True).start()
    logger.info("Started scan recovery background task")

# Auth routes are public - no authentication required
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])

# WebSocket routes
app.include_router(websocket_router, prefix="/api/v1/ws", tags=["websocket"])

# Protected routes - require authentication
protected_deps = [Depends(get_current_user)]
app.include_router(projects.router, prefix="/api/v1", tags=["projects"], dependencies=protected_deps)
app.include_router(scans.router, prefix="/api/v1", tags=["scans"], dependencies=protected_deps)

@app.get("/")
def read_root():
    return {"message": "DevSecOps Control Plane is live (via PostgreSQL)"}
