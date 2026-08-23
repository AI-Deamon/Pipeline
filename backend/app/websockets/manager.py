"""
WebSocket Manager for real-time scan status updates
Manages client connections and broadcasts scan state changes
"""
import asyncio
import logging
from typing import Dict, Set
from fastapi import WebSocket

logger = logging.getLogger(__name__)


def safe_broadcast(event: str, data: dict) -> None:
    """Broadcast a WebSocket event, logging failures instead of swallowing them.

    Every caller is sync code with no running event loop (FastAPI `def` route
    handlers run in a threadpool; Celery tasks are plain sync) — `broadcast_event`
    is `async def`, so calling it directly here previously just created a coroutine
    object that was never awaited and silently discarded (finding #90; surfaced as
    `RuntimeWarning: coroutine 'ConnectionManager.broadcast_event' was never
    awaited`). `asyncio.run()` actually executes it, which is safe specifically
    because there is no already-running loop in these call sites to conflict with.
    """
    try:
        from app.websockets.manager import manager
        asyncio.run(manager.broadcast_event(event, data))
    except Exception as exc:
        logger.warning("WebSocket broadcast failed for %s: %s", event, exc)


class ConnectionManager:
    """Manages WebSocket connections for real-time updates"""
    
    def __init__(self):
        # Map of scan_id -> set of WebSocket connections
        self.scan_connections: Dict[str, Set[WebSocket]] = {}
        # Map of project_id -> set of WebSocket connections
        self.project_connections: Dict[str, Set[WebSocket]] = {}
        # Global connections (for dashboard)
        self.global_connections: Set[WebSocket] = set()
    
    async def connect(self, websocket: WebSocket, scan_id: str = None, project_id: str = None):
        """Accept WebSocket connection and register for updates"""
        await websocket.accept()
        
        if scan_id:
            if scan_id not in self.scan_connections:
                self.scan_connections[scan_id] = set()
            self.scan_connections[scan_id].add(websocket)
            logger.info(f"WebSocket connected for scan {scan_id}")
        
        if project_id:
            if project_id not in self.project_connections:
                self.project_connections[project_id] = set()
            self.project_connections[project_id].add(websocket)
            logger.info(f"WebSocket connected for project {project_id}")
        
        if not scan_id and not project_id:
            self.global_connections.add(websocket)
            logger.info("WebSocket connected for global updates")
    
    def disconnect(self, websocket: WebSocket, scan_id: str = None, project_id: str = None):
        """Remove WebSocket connection"""
        if scan_id and scan_id in self.scan_connections:
            self.scan_connections[scan_id].discard(websocket)
            if not self.scan_connections[scan_id]:
                del self.scan_connections[scan_id]
        
        if project_id and project_id in self.project_connections:
            self.project_connections[project_id].discard(websocket)
            if not self.project_connections[project_id]:
                del self.project_connections[project_id]
        
        self.global_connections.discard(websocket)
        logger.info("WebSocket disconnected")
    
    async def broadcast_to_scan(self, scan_id: str, message: dict):
        """Send message to all clients subscribed to a specific scan"""
        if scan_id not in self.scan_connections:
            return

        disconnected = set()
        # Finding #98: iterate a snapshot, not the live set. A client disconnecting
        # mid-broadcast (suspended at `await connection.send_json(...)`) calls
        # disconnect(), which mutates this same set concurrently — iterating it
        # directly raises `RuntimeError: Set changed size during iteration` on resume.
        for connection in list(self.scan_connections[scan_id]):
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error sending to WebSocket: {e}")
                disconnected.add(connection)

        # Clean up disconnected clients
        for conn in disconnected:
            self.scan_connections[scan_id].discard(conn)

    async def broadcast_to_project(self, project_id: str, message: dict):
        """Send message to all clients subscribed to a specific project"""
        if project_id not in self.project_connections:
            return

        disconnected = set()
        for connection in list(self.project_connections[project_id]):
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error sending to WebSocket: {e}")
                disconnected.add(connection)

        # Clean up disconnected clients
        for conn in disconnected:
            self.project_connections[project_id].discard(conn)

    async def broadcast_global(self, message: dict):
        """Send message to all connected clients"""
        disconnected = set()
        for connection in list(self.global_connections):
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error sending to WebSocket: {e}")
                disconnected.add(connection)

        # Clean up disconnected clients
        for conn in disconnected:
            self.global_connections.discard(conn)
    
    async def send_scan_update(self, scan_id: str, project_id: str, data: dict):
        """Broadcast scan update to scan-specific, project-specific, and global clients"""
        message = {
            "event": "scan.state_changed",
            "scan_id": scan_id,
            "project_id": project_id,
            "data": data
        }
        
        # Finding #98: each tier is independent — an exception from one (e.g. a
        # future bug in a single connection's send) must not skip delivery to the
        # others, since this is fired via background_tasks.add_task with nothing
        # downstream to retry a partial failure.
        for coro in (
            self.broadcast_to_scan(scan_id, message),
            self.broadcast_to_project(project_id, message),
            self.broadcast_global(message),
        ):
            try:
                await coro
            except Exception as e:
                logger.error(f"Error broadcasting scan update: {e}")

    async def broadcast_issue_event(self, event_type: str, issue_id: int, project_id: str, data: dict):
        """Broadcast issue-related events to project and global subscribers."""
        message = {
            "event": event_type,
            "issue_id": issue_id,
            "project_id": project_id,
            "data": data,
        }
        await self.broadcast_to_project(project_id, message)
        await self.broadcast_global(message)

    async def broadcast_event(self, event_type: str, data: dict):
        """Broadcast a generic event to all connected clients."""
        message = {
            "event": event_type,
            "data": data,
        }
        await self.broadcast_global(message)


# Global connection manager instance
manager = ConnectionManager()
