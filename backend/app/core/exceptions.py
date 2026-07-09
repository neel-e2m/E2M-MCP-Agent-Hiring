"""
Custom exception classes and FastAPI exception handlers.

Each exception maps to an HTTP status code.  Call
``register_exception_handlers(app)`` during startup to wire them into
FastAPI's error-handling pipeline.
"""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.core.logging_config import get_logger

logger = get_logger(__name__)


# ── Base Exception ────────────────────────────────────────────────────────

class AppException(Exception):
    """Base application exception with HTTP status code mapping."""

    def __init__(
        self,
        detail: str = "An error occurred",
        status_code: int = 500,
        error_code: str = "INTERNAL_ERROR",
    ):
        self.detail = detail
        self.status_code = status_code
        self.error_code = error_code
        super().__init__(detail)


# ── Authentication / Authorisation ────────────────────────────────────────

class AuthenticationError(AppException):
    def __init__(self, detail: str = "Authentication required"):
        super().__init__(detail=detail, status_code=401, error_code="AUTHENTICATION_ERROR")


class AuthorizationError(AppException):
    def __init__(self, detail: str = "Insufficient permissions"):
        super().__init__(detail=detail, status_code=403, error_code="AUTHORIZATION_ERROR")


class TokenExpiredError(AppException):
    def __init__(self, detail: str = "Token has expired"):
        super().__init__(detail=detail, status_code=401, error_code="TOKEN_EXPIRED")


class TokenInvalidError(AppException):
    def __init__(self, detail: str = "Invalid token"):
        super().__init__(detail=detail, status_code=401, error_code="TOKEN_INVALID")


# ── Resource Errors ───────────────────────────────────────────────────────

class NotFoundError(AppException):
    def __init__(self, detail: str = "Resource not found"):
        super().__init__(detail=detail, status_code=404, error_code="NOT_FOUND")


class ConflictError(AppException):
    def __init__(self, detail: str = "Resource already exists"):
        super().__init__(detail=detail, status_code=409, error_code="CONFLICT")


class ValidationError(AppException):
    def __init__(self, detail: str = "Validation failed"):
        super().__init__(detail=detail, status_code=422, error_code="VALIDATION_ERROR")


# ── Rate Limiting ─────────────────────────────────────────────────────────

class RateLimitExceededError(AppException):
    def __init__(self, detail: str = "Rate limit exceeded. Please try again later."):
        super().__init__(detail=detail, status_code=429, error_code="RATE_LIMIT_EXCEEDED")


# ── Server Errors ─────────────────────────────────────────────────────────

class InternalServerError(AppException):
    def __init__(self, detail: str = "Internal server error"):
        super().__init__(detail=detail, status_code=500, error_code="INTERNAL_SERVER_ERROR")


# ── Handler Registration ─────────────────────────────────────────────────

def register_exception_handlers(app: FastAPI) -> None:
    """Register global exception handlers on the FastAPI application."""

    @app.exception_handler(AppException)
    async def app_exception_handler(_request: Request, exc: AppException) -> JSONResponse:
        logger.warning(
            "app_exception",
            error_code=exc.error_code,
            detail=exc.detail,
            status_code=exc.status_code,
        )
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": exc.error_code,
                "detail": exc.detail,
            },
        )

    @app.exception_handler(Exception)
    async def generic_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
        logger.error("unhandled_exception", error=str(exc), exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "error": "INTERNAL_SERVER_ERROR",
                "detail": "An unexpected error occurred",
            },
        )
