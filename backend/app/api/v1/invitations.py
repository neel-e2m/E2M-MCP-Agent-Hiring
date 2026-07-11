"""
Invitations routes.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from supabase import Client

from app.api.deps import get_current_user, get_supabase, require_role
from app.services.email_service import EmailService
from app.services.role_service import RoleService
from app.services.token_service import TokenService

router = APIRouter(tags=["Invitations"], dependencies=[Depends(get_current_user)])


def get_token_service(supabase: Annotated[Client, Depends(get_supabase)]) -> TokenService:
    return TokenService(supabase)


class InviteCreate(BaseModel):
    role_id: str
    candidate_email: EmailStr | None = None
    candidate_name: str | None = None
    max_uses: int = 1
    expires_hours: int = 72
    send_email: bool = True


@router.post("/", dependencies=[Depends(require_role("admin", "hr_manager", "recruiter"))])
async def create_invite(
    data: InviteCreate,
    service: Annotated[TokenService, Depends(get_token_service)],
    supabase: Annotated[Client, Depends(get_supabase)],
    current_user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    """Generate a new invite token and optionally email it."""
    # Ensure role exists
    role_service = RoleService(supabase)
    role = await role_service.get_role(data.role_id)
    
    result = await service.generate_invite(
        role_id=data.role_id,
        created_by=current_user["id"],
        max_uses=data.max_uses,
        expires_hours=data.expires_hours,
        candidate_email=data.candidate_email,
    )
    
    # Send email if requested
    if data.send_email and data.candidate_email:
        email_service = EmailService()
        # In a real app, mcp_server_url would come from config or frontend URL params
        mcp_server_url = "http://localhost:5173/connect" 
        
        sent = await email_service.send_invite(
            to_email=data.candidate_email,
            candidate_name=data.candidate_name or "Candidate",
            role_title=role["title"],
            token=result["token"],
            mcp_server_url=mcp_server_url,
        )
        result["email_sent"] = sent
        
    return result


@router.get("/")
async def list_invites(
    service: Annotated[TokenService, Depends(get_token_service)],
    role_id: str | None = None,
    include_expired: bool = False,
) -> list[dict]:
    """List invite tokens."""
    return await service.list_tokens(role_id=role_id, include_expired=include_expired)


@router.get("/stats")
async def get_invite_stats(
    service: Annotated[TokenService, Depends(get_token_service)],
) -> dict:
    """Get aggregated stats for invites."""
    return await service.get_token_stats()


@router.post("/{token_id}/revoke", dependencies=[Depends(require_role("admin", "hr_manager"))])
async def revoke_invite(
    token_id: str,
    service: Annotated[TokenService, Depends(get_token_service)],
) -> dict:
    """Revoke an active invite token."""
    await service.revoke_token(token_id)
    return {"message": "Token revoked successfully"}


@router.delete("/{token_id}", dependencies=[Depends(require_role("admin", "hr_manager"))])
async def delete_invite(
    token_id: str,
    service: Annotated[TokenService, Depends(get_token_service)],
) -> dict:
    """Delete an invite. Blocked (409) if the invite is still active — revoke first."""
    await service.delete_token(token_id)
    return {"message": "Invite deleted"}
