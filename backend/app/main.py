import logging
import os
from pathlib import Path

from typing import Annotated

from fastapi import Depends, FastAPI, Header
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

from app.api import projects, scans, auth, reports, project_groups, scanner_tools, issues, portfolio
from app.api import users
from app.websockets import router as websocket_router
from app.core.auth import get_current_user
from app.core.config import settings
from app.core.db import engine, Base
from app.core.rate_limit import limiter

logger = logging.getLogger(__name__)

_API_V1 = "/api/v1"


app = FastAPI(
    title="DevSecOps Control Plane API",
    # finding #54: Settings.DEBUG was defined and validated (staging must have it
    # False) but never actually wired to FastAPI — dead code that looked live. Safe
    # to wire now specifically because that staging guard already exists in
    # config.py's validate_runtime_rules: DEBUG can never be True outside dev/test,
    # so this can't leak tracebacks in a real deployment.
    debug=settings.DEBUG,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

from app.services.scan_recovery import run_recovery_task, shutdown_event
import threading

...


def _create_default_admin(db: Session) -> None:
    from app.models.db_models import UserDB
    from app.core.security import get_password_hash
    import uuid

    admin_exists = db.query(UserDB).filter(UserDB.username == "admin").first()
    if not admin_exists:
        admin_password = os.environ.get("ADMIN_PASSWORD")
        if not admin_password:
            import secrets
            admin_password = secrets.token_urlsafe(16)
            print(f"Generated random admin password: {admin_password}")
            print("Set ADMIN_PASSWORD env var for a known password")
        admin_user = UserDB(
            id=str(uuid.uuid4()),
            username="admin",
            hashed_password=get_password_hash(admin_password),
            role="admin",
        )
        db.add(admin_user)
        db.commit()
        print("Created default admin user")


def _backfill_admin_role(db: Session) -> None:
    from app.models.db_models import UserDB

    admin_user = db.query(UserDB).filter(UserDB.username == "admin").first()
    if admin_user and admin_user.role is None:
        admin_user.role = "admin"
        db.commit()
        print("Backfilled admin user with role='admin'")


def _backfill_user_roles(db: Session) -> None:
    from app.models.db_models import UserDB

    users_no_role = db.query(UserDB).filter(UserDB.role == None).all()
    if users_no_role:
        for user in users_no_role:
            user.role = "developer"
        db.commit()
        print(f"Backfilled {len(users_no_role)} users with role='developer'")


def _backfill_project_users(db: Session) -> None:
    from app.models.db_models import UserDB, ProjectDB

    admin_user = db.query(UserDB).filter(UserDB.username == "admin").first()
    if admin_user:
        projects_without_user = db.query(ProjectDB).filter(ProjectDB.user_id == None).all()
        if projects_without_user:
            for project in projects_without_user:
                project.user_id = admin_user.id
            db.commit()
            print(f"Backfilled {len(projects_without_user)} projects with admin user_id")


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

    _run_schema_migrations(engine)

    # Bootstrap DB data
    from app.core.db import get_db

    db = next(get_db())
    try:
        _create_default_admin(db)
        _backfill_admin_role(db)
        _backfill_user_roles(db)
        _backfill_project_users(db)
        # Seed the service-account row here so the X-API-Key auth path is read-only
        # and can't race two concurrent first-requests into a duplicate-insert 500.
        from app.core.auth import ensure_service_account
        ensure_service_account(db)
    finally:
        db.close()

    # Start scan recovery background task (Phase 1.3)
    threading.Thread(target=run_recovery_task, daemon=True).start()
    logger.info("Started scan recovery background task")


@app.on_event("shutdown")
def shutdown_recovery_task():
    """Signal the recovery thread to shut down gracefully."""
    logger.info("Signaling recovery task to shut down...")
    shutdown_event.set()


# Auth routes are public - no authentication required
app.include_router(auth.router, prefix=_API_V1 + "/auth", tags=["auth"])

# WebSocket routes
app.include_router(websocket_router, prefix=_API_V1 + "/ws", tags=["websocket"])

# Scanner tool downloads — authenticated via callback token header, not JWT
app.include_router(scanner_tools.router, tags=["scanner"])

# Protected routes - require authentication
protected_deps = [Depends(get_current_user)]
app.include_router(
    projects.router, prefix=_API_V1, tags=["projects"], dependencies=protected_deps
)
app.include_router(
    scans.router, prefix=_API_V1, tags=["scans"], dependencies=protected_deps
)
app.include_router(
    reports.router, prefix=_API_V1, tags=["reports"], dependencies=protected_deps
)
app.include_router(
    project_groups.router, prefix=_API_V1, tags=["project-groups"], dependencies=protected_deps
)
app.include_router(
    issues.router, prefix=_API_V1, tags=["issues"], dependencies=protected_deps
)
app.include_router(
    users.router, prefix=_API_V1, tags=["users"], dependencies=protected_deps
)
app.include_router(
    portfolio.router, prefix=_API_V1, tags=["portfolio"], dependencies=protected_deps
)


from fastapi import HTTPException, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
import base64
import secrets

from app.core.config import settings


def _require_metrics_auth(authorization: str) -> None:
    if not authorization.startswith("Basic "):
        raise HTTPException(
            status_code=401,
            detail="Basic auth required",
            headers={"WWW-Authenticate": "Basic"},
        )
    encoded = authorization.split(" ", 1)[1]
    decoded = base64.b64decode(encoded).decode("utf-8", errors="ignore")
    if ":" not in decoded:
        raise HTTPException(
            status_code=401,
            detail="Invalid Basic auth",
            headers={"WWW-Authenticate": "Basic"},
        )
    _, supplied = decoded.split(":", 1)
    expected = settings.METRICS_TOKEN
    if not expected or not secrets.compare_digest(supplied, expected):
        raise HTTPException(status_code=403, detail="Invalid metrics token")


@app.get("/metrics", include_in_schema=False,
  responses={401: {"description": "Unauthorized"}, 403: {"description": "Forbidden"}})
def metrics(authorization: Annotated[str, Header()] = "") -> Response:
    _require_metrics_auth(authorization)
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/")
def read_root():
    return {"message": "DevSecOps Control Plane is live (via PostgreSQL)"}


@app.get("/api/v1/health")
def health_check():
    """Health check endpoint for frontend and monitoring."""
    return {"status": "operational"}


def _run_schema_migrations(engine) -> None:
    """Apply idempotent ALTER TABLE migrations for columns added after initial release."""
    from sqlalchemy import text

    statements = [
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'developer'",
        "ALTER TABLE scan_reports ADD COLUMN IF NOT EXISTS migration_status VARCHAR(20) DEFAULT 'pending'",
        "ALTER TABLE issues ADD COLUMN IF NOT EXISTS sonar_status VARCHAR(50)",
        "ALTER TABLE issues ADD COLUMN IF NOT EXISTS sonar_resolution VARCHAR(50)",
        "ALTER TABLE scans ADD COLUMN IF NOT EXISTS timeout_seconds INTEGER",
        "ALTER TABLE scan_reports ADD COLUMN IF NOT EXISTS parse_status VARCHAR(20) DEFAULT 'ok'",
    ]
    try:
        with engine.begin() as conn:
            for stmt in statements:
                conn.execute(text(stmt))

            # finding #22: add FK constraints from project_id columns to
            # projects.project_id, for referential integrity nothing previously
            # enforced at the DB level (RBAC scoping, project_grouping.py, and
            # portfolio rollups all silently depend on every project_id here mapping
            # to a live project). NOT VALID skips checking existing rows — avoids
            # failing outright if any already-orphaned rows exist, and avoids a
            # full-table scan/lock on what can be a large table — while still
            # enforcing the constraint for every new insert/update going forward.
            # Postgres-only: SQLite (what the test suite runs against) has no ALTER
            # TABLE ADD CONSTRAINT support at all, so this is skipped there rather
            # than erroring.
            if engine.dialect.name == "postgresql":
                fk_constraints = [
                    ("fk_scans_project_id", "scans"),
                    ("fk_scan_reports_project_id", "scan_reports"),
                    ("fk_issues_project_id", "issues"),
                    ("fk_scan_assignments_project_id", "scan_assignments"),
                ]
                for constraint_name, table_name in fk_constraints:
                    conn.execute(text(f"""
                        DO $$
                        BEGIN
                            IF NOT EXISTS (
                                SELECT 1 FROM pg_constraint WHERE conname = '{constraint_name}'
                            ) THEN
                                ALTER TABLE {table_name} ADD CONSTRAINT {constraint_name}
                                    FOREIGN KEY (project_id) REFERENCES projects(project_id) NOT VALID;
                            END IF;
                        END $$;
                    """))
    except Exception as exc:
        # Finding #55: previously print()'d — invisible to log aggregation/alerting
        # in a containerized deployment where logger output is shipped but raw
        # stdout may not be (or is at a different verbosity). logger.error with
        # exc_info gives on-call the actual root cause; without it, the only signal
        # is the more confusing downstream crash in _backfill_admin_role/
        # _backfill_user_roles when they hit a column that migration should have
        # added.
        logger.error(f"Schema migration skipped/failed: {exc}", exc_info=True)
