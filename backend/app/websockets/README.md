# WebSocket Manager

Handles real-time bidirectional communication with frontend clients.

## Connection Manager
- **`manager.py`** - WebSocketConnectionManager class
- Manages active WebSocket connections
- Broadcasts messages to interested subscribers

## Endpoints
- **`/api/v1/ws/scans?scan_id={id}`** - Subscribe to specific scan updates
- **`/api/v1/ws/dashboard`** - Subscribe to ALL scan updates (dashboard view)

## Features
- Auto-reconnect support (handled by frontend)
- Ping/pong keepalive
- Connection tracking by scan_id
- JSON message format

## Message Format
```json
{
  "type": "scan_update",
  "scan_id": "uuid",
  "project_id": "uuid", 
  "data": { /* ScanResponse object */ }
}
```

## Connection to Other Modules
- Called by `app.api.*` after scan state changes
- Used by frontend `useScanWebSocket` hook
- Receives updates from Jenkins callback endpoint
