"""
WebSocket manager.

Manages active WebSocket connections for the HR dashboard, allowing
real-time push notifications.
"""

from fastapi import WebSocket
from starlette.websockets import WebSocketState

from app.core.logging_config import get_logger

logger = get_logger(__name__)


class _WebSocketManager:
    """Manages active WebSocket connections."""

    def __init__(self):
        # Maps user_id -> list of WebSocket connections
        self.active_connections: dict[str, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: str) -> None:
        """Accept a connection and store it."""
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)
        logger.info("websocket_connected", user_id=user_id)

    async def disconnect(self, websocket: WebSocket, user_id: str) -> None:
        """Remove a connection."""
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
        logger.info("websocket_disconnected", user_id=user_id)

    async def broadcast(self, event_type: str, data: dict) -> None:
        """Send a message to all connected clients."""
        payload = {"type": event_type, "data": data}
        
        for user_id, connections in list(self.active_connections.items()):
            for connection in list(connections):
                try:
                    if connection.client_state == WebSocketState.CONNECTED:
                        await connection.send_json(payload)
                    else:
                        await self.disconnect(connection, user_id)
                except Exception as exc:
                    logger.warning("websocket_broadcast_failed", user_id=user_id, error=str(exc))
                    await self.disconnect(connection, user_id)

    async def send_personal(self, user_id: str, event_type: str, data: dict) -> None:
        """Send a message to a specific user."""
        if user_id not in self.active_connections:
            return
            
        payload = {"type": event_type, "data": data}
        
        for connection in list(self.active_connections[user_id]):
            try:
                if connection.client_state == WebSocketState.CONNECTED:
                    await connection.send_json(payload)
                else:
                    await self.disconnect(connection, user_id)
            except Exception as exc:
                logger.warning("websocket_personal_failed", user_id=user_id, error=str(exc))
                await self.disconnect(connection, user_id)


# Singleton instance
websocket_manager = _WebSocketManager()
