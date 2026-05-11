"""
WebSocket API endpoints for real-time scan updates
"""
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from .manager import manager

logger = logging.getLogger(__name__)

router = APIRouter()


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
