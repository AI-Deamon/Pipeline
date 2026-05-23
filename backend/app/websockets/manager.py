"""
WebSocket Manager for real-time scan status updates
Manages client connections and broadcasts scan state changes
"""
import logging
from typing import Dict, Set
from fastapi import WebSocket

logger = logging.getLogger(__name__)


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
        for connection in self.scan_connections[scan_id]:
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
        for connection in self.project_connections[project_id]:
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
        for connection in self.global_connections:
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
        
        # Send to all relevant subscribers
        await self.broadcast_to_scan(scan_id, message)
        await self.broadcast_to_project(project_id, message)
        await self.broadcast_global(message)


# Global connection manager instance
manager = ConnectionManager()
