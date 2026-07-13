"""
Interviewers routes.

CRUD for managing HR users with the role 'interviewer'.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr
from supabase import Client

from app.api.deps import get_current_user, get_supabase, require_role
from app.core.exceptions import ConflictError

router = APIRouter(tags=["Interviewers"], dependencies=[Depends(get_current_user)])


class InterviewerCreate(BaseModel):
    full_name: str
    email: EmailStr


@router.get("/")
async def list_interviewers(
    supabase: Annotated[Client, Depends(get_supabase)],
) -> list[dict]:
    """List all interviewers (all HR users can be interviewers)."""
    result = (
        supabase.table("hr_users")
        .select("*")
        .order("created_at", desc=True)
        .execute()
    )
    
    users = result.data or []
    for u in users:
        u["full_name"] = u.get("name")
    return users


@router.post("/", dependencies=[Depends(require_role("admin", "hr_manager"))])
async def create_interviewer(
    data: InterviewerCreate,
    supabase: Annotated[Client, Depends(get_supabase)],
) -> dict:
    """Create a new interviewer profile (HR User)."""
    # Check if exists
    existing = supabase.table("hr_users").select("id").eq("email", data.email).execute()
    if existing.data:
        raise ConflictError(detail="An HR user with this email already exists")

    try:
        auth_response = supabase.auth.admin.create_user({
            "email": data.email,
            "password": "TempPassword123!",
            "email_confirm": True,
            "user_metadata": {"name": data.full_name}
        })
        auth_user_id = auth_response.user.id
    except Exception as e:
        raise ConflictError(detail=f"Failed to create auth user: {str(e)}")

    new_id = str(uuid.uuid4())
    result = supabase.table("hr_users").insert({
        "id": new_id,
        "auth_user_id": auth_user_id,
        "email": data.email,
        "name": data.full_name,
        "role": "recruiter"
    }).execute()
    
    user_data = result.data[0]
    user_data["full_name"] = user_data.get("name")
    return user_data


@router.delete("/{interviewer_id}", dependencies=[Depends(require_role("admin", "hr_manager"))])
async def delete_interviewer(
    interviewer_id: str,
    supabase: Annotated[Client, Depends(get_supabase)],
) -> dict:
    """Delete an interviewer profile."""
    supabase.table("hr_users").delete().eq("id", interviewer_id).execute()
    return {"status": "deleted"}
