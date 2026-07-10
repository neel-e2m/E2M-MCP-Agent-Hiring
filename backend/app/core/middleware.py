"""
FastAPI middleware stack.

* **RequestIdMiddleware** — injects a unique request ID.
* **RequestLoggingMiddleware** — logs every request with duration.
* **RateLimitMiddleware** — Redis-based per-IP rate limiting.
* **InternalApiKeyMiddleware** — protects ``/internal/`` routes.
"""

import time
import uuid

import redis.asyncio as aioredis
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse

import structlog

from app.config import get_settings

settings = get_settings()
logger = structlog.get_logger(__name__)


# ── Request ID ────────────────────────────────────────────────────────────

class RequestIdMiddleware(BaseHTTPMiddleware):
    """Attach a unique ``X-Request-ID`` to every request and response."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


# ── Request Logging ───────────────────────────────────────────────────────

class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log method, path, status code and duration for every request."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start) * 1000, 2)
        logger.info(
            "http_request",
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            duration_ms=duration_ms,
        )
        return response


# ── Rate Limiting ─────────────────────────────────────────────────────────

class RateLimitMiddleware(BaseHTTPMiddleware):
    """Simple sliding-window rate limiter backed by Redis."""

    def __init__(self, app, redis_url: str = "", limit: int = 60):  # noqa: ANN001
        super().__init__(app)
        self.limit = limit
        self.redis_url = redis_url
        self._redis: aioredis.Redis | None = None

    async def _get_redis(self) -> aioredis.Redis | None:
        if self._redis is None and self.redis_url:
            try:
                self._redis = aioredis.from_url(self.redis_url, decode_responses=True)
            except Exception:
                logger.warning("rate_limit_redis_unavailable")
                return None
        return self._redis

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Skip rate limiting for health checks
        if request.url.path in ("/health", "/docs", "/redoc", "/openapi.json"):
            return await call_next(request)

        r = await self._get_redis()
        if r is None:
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        key = f"rate_limit:{client_ip}"

        try:
            current = await r.incr(key)
            if current == 1:
                await r.expire(key, 60)
            if current > self.limit:
                return JSONResponse(
                    status_code=429,
                    content={"error": "RATE_LIMIT_EXCEEDED", "detail": "Too many requests. Please try again later."},
                )
        except Exception:
            logger.warning("rate_limit_check_failed", client_ip=client_ip)

        return await call_next(request)


# ── Internal API Key ──────────────────────────────────────────────────────

class InternalApiKeyMiddleware(BaseHTTPMiddleware):
    """Reject requests to ``/internal/`` that lack a valid API key header."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if "/internal/" in request.url.path:
            api_key = request.headers.get("X-Internal-Api-Key", "")
            if api_key != settings.MCP_INTERNAL_API_KEY:
                return JSONResponse(
                    status_code=403,
                    content={"error": "FORBIDDEN", "detail": "Invalid internal API key"},
                )
        return await call_next(request)
