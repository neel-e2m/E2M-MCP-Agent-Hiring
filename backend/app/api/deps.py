"""
FastAPI dependencies.

Provides reusable dependencies for routes, primarily around authentication
and role-based access control (RBAC).
"""

from typing import Annotated, Any

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase import Client

from app.core.exceptions import AuthenticationError, AuthorizationError
from app.services.auth_service import AuthService
from app.supabase_client import get_supabase

# We use HTTPBearer to extract the JWT from the Authorization header
security = HTTPBearer()


def get_auth_service(supabase: Annotated[Client, Depends(get_supabase)]) -> AuthService:
    """Dependency provider for AuthService."""
    return AuthService(supabase)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> dict[str, Any]:
    """
    Validate the JWT from the Authorization header and return the HR user profile.
    
    Raises:
        AuthenticationError: If token is missing or invalid.
    """
    try:
        token = credentials.credentials
        user = await auth_service.get_current_user(token)
        return user
    except Exception as exc:
        raise AuthenticationError(detail="Invalid or expired token") from exc


def require_role(*roles: str) -> Any:
    """
    Dependency factory for Role-Based Access Control.
    
    Usage:
        ``@router.get("/", dependencies=[Depends(require_role("admin", "hr_manager"))])``
    """
    async def role_checker(
        request: Request,
        current_user: Annotated[dict[str, Any], Depends(get_current_user)],
    ) -> dict[str, Any]:
        user_role = current_user.get("role")
        if user_role not in roles:
            raise AuthorizationError(
                detail=f"Operation requires one of the following roles: {', '.join(roles)}"
            )
        # Attach user to request state for downstream use if needed
        request.state.user = current_user
        return current_user

    return role_checker
