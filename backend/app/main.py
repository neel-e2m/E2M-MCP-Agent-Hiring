"""
FastAPI application entrypoint.

Wires up routers, middleware, exception handlers, and the WebSocket endpoint.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.v1.router import api_router
from app.config import get_settings
from app.core.exceptions import register_exception_handlers
from app.core.logging_config import get_logger, setup_logging
from app.core.middleware import (
    InternalApiKeyMiddleware,
    RateLimitMiddleware,
    RequestIdMiddleware,
    RequestLoggingMiddleware,
)
from app.services.websocket_service import websocket_manager

settings = get_settings()
logger = get_logger(__name__)


from app.core.scheduler import start_scheduler, shutdown_scheduler

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    setup_logging(settings.ENVIRONMENT)
    logger.info("startup", app_name=settings.APP_NAME, env=settings.ENVIRONMENT)
    
    start_scheduler()
    
    yield
    
    shutdown_scheduler()
    logger.info("shutdown")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.API_VERSION,
        lifespan=lifespan,
        docs_url="/docs" if settings.DEBUG else None,
        redoc_url="/redoc" if settings.DEBUG else None,
    )

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Add custom middlewares in reverse order (bottom one runs first)
    app.add_middleware(InternalApiKeyMiddleware)
    app.add_middleware(RateLimitMiddleware, redis_url=settings.REDIS_URL, limit=settings.RATE_LIMIT_PER_MINUTE)
    app.add_middleware(RequestLoggingMiddleware)
    app.add_middleware(RequestIdMiddleware)

    # Exception handlers
    register_exception_handlers(app)

    # API Routers
    app.include_router(api_router, prefix=f"/api/{settings.API_VERSION}")

    # Health check
    @app.get("/health", tags=["Health"])
    async def health_check() -> dict:
        return {"status": "ok", "environment": settings.ENVIRONMENT}

    # WebSocket for HR Dashboard real-time updates
    # Note: Authentication for WebSockets requires passing a token in query params
    # since JS WebSocket API doesn't support custom headers.
    @app.websocket("/ws")
    async def websocket_endpoint(websocket: WebSocket, token: str):
        # In a real app, verify the token and extract user_id here.
        # For brevity in this scaffold, we'll just accept it and use the token as a mock user_id if valid.
        from app.core.security import SecurityService
        try:
            payload = SecurityService.verify_supabase_jwt(token)
            user_id = payload.get("sub", "anonymous")
        except Exception:
            await websocket.close(code=1008)
            return

        await websocket_manager.connect(websocket, user_id)
        try:
            while True:
                # Keep connection alive, listen for any client messages
                data = await websocket.receive_text()
                logger.debug("ws_message_received", user_id=user_id, data=data)
        except WebSocketDisconnect:
            await websocket_manager.disconnect(websocket, user_id)

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.BACKEND_HOST,
        port=settings.BACKEND_PORT,
        reload=settings.DEBUG,
    )
