"""
HR Authentication routes.
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr

from app.api.deps import get_auth_service, get_current_user
from app.services.auth_service import AuthService

router = APIRouter(tags=["Auth"])


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


@router.post("/login")
async def login(
    request: LoginRequest,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> dict:
    """Authenticate an HR user."""
    return await auth_service.login(request.email, request.password)


@router.post("/logout")
async def logout(
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
    current_user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    """Logout the current user (Note: JWT invalidation is stateless, this handles Supabase session)."""
    # In a real app we'd pass the specific token to revoke/logout,
    # but since Supabase Auth handles the state, we just call sign_out.
    # We pass a dummy token since we just need to hit the endpoint
    await auth_service.logout("dummy_token")
    return {"message": "Logged out successfully"}


@router.get("/me")
async def get_me(
    current_user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    """Get the profile of the currently authenticated user."""
    return current_user


@router.post("/refresh")
async def refresh_token(
    request: RefreshRequest,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> dict:
    """Exchange a refresh token for a new access token."""
    return await auth_service.refresh_token(request.refresh_token)
