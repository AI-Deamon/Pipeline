"""
WebSocket API endpoints for real-time scan updates
"""
import logging
import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from app.core import security
from app.core.config import settings
from app.models.db_models import UserDB
from .manager import manager

logger = logging.getLogger(__name__)

router = APIRouter()


async def _authenticate(websocket: WebSocket) -> bool:
    """Verify the connecting client holds a valid access token before accepting the
    socket. Cookies are sent automatically by the browser on the WS handshake (same
    pattern as the existing cookie fallback in core.auth.get_current_user); a `token`
    query param is accepted as a fallback for non-browser/cross-origin clients.
    Closes the socket with 1008 (policy violation) and returns False on failure —
    callers must not call accept()/connect() afterward.
    """
    token = websocket.cookies.get(settings.COOKIE_NAME) or websocket.query_params.get("token")
    if not token:
        await websocket.close(code=1008)
        return False
    try:
        payload = jwt.decode(token, security.SECRET_KEY, algorithms=[security.ALGORITHM])
        username = payload.get("sub")
        if not username:
            raise jwt.PyJWTError("missing sub claim")
    except jwt.PyJWTError:
        await websocket.close(code=1008)
        return False

    from app.core.db import SessionLocal
    db = SessionLocal()
    try:
        user_exists = db.query(UserDB).filter(UserDB.username == username).first() is not None
    finally:
        db.close()
    if not user_exists:
        await websocket.close(code=1008)
        return False
    return True


@router.websocket("/scans")
async def scan_websocket_endpoint(
    websocket: WebSocket,
    scan_id: str = Query(None, description="Subscribe to specific scan updates"),
    project_id: str = Query(None, description="Subscribe to project scan updates"),
):
    """
    WebSocket endpoint for real-time scan status updates.

    Connect to receive live updates when scan state changes.

    Query Parameters:
    - scan_id: Subscribe to updates for a specific scan
    - project_id: Subscribe to updates for all scans in a project

    Example: ws://localhost:8000/api/v1/ws/scans?scan_id=abc123
    """
    if not await _authenticate(websocket):
        return
    await manager.connect(websocket, scan_id=scan_id, project_id=project_id)

    try:
        while True:
            # Keep connection alive
            # Client can send ping/pong messages if needed
            data = await websocket.receive_text()
            
            # Handle client messages (optional)
            if data == "ping":
                await websocket.send_text("pong")
    
    except WebSocketDisconnect:
        manager.disconnect(websocket, scan_id=scan_id, project_id=project_id)
        logger.info(f"WebSocket disconnected: scan={scan_id}, project={project_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket, scan_id=scan_id, project_id=project_id)


@router.websocket("/dashboard")
async def dashboard_websocket_endpoint(
    websocket: WebSocket,
):
    """
    WebSocket endpoint for dashboard-wide updates.
    
    Connect to receive updates for all scans (for dashboard page).
    """
    if not await _authenticate(websocket):
        return
    await manager.connect(websocket)
    
    try:
        while True:
            # Keep connection alive
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.info("Dashboard WebSocket disconnected")
    except Exception as e:
        logger.error(f"Dashboard WebSocket error: {e}")
        manager.disconnect(websocket)
