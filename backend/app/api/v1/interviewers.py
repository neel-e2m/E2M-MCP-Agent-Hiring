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
    name: str
    email: EmailStr
    department: str | None = None


@router.get("/")
async def list_interviewers(
    supabase: Annotated[Client, Depends(get_supabase)],
) -> list[dict]:
    """List all interviewers."""
    result = (
        supabase.table("interviewers")
        .select("*")
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


@router.post("/", dependencies=[Depends(require_role("admin", "hr_manager"))])
async def create_interviewer(
    data: InterviewerCreate,
    supabase: Annotated[Client, Depends(get_supabase)],
) -> dict:
    """Create a new interviewer profile."""
    # Check if exists
    existing = supabase.table("interviewers").select("id").eq("email", data.email).execute()
    if existing.data:
        raise ConflictError(detail="An interviewer with this email already exists")

    new_id = str(uuid.uuid4())
    result = supabase.table("interviewers").insert({
        "id": new_id,
        "email": data.email,
        "name": data.name,
        "department": data.department
    }).execute()
    
    return result.data[0]


@router.delete("/{interviewer_id}", dependencies=[Depends(require_role("admin", "hr_manager"))])
async def delete_interviewer(
    interviewer_id: str,
    supabase: Annotated[Client, Depends(get_supabase)],
) -> dict:
    """Delete an interviewer profile."""
    supabase.table("interviewers").delete().eq("id", interviewer_id).execute()
    return {"status": "deleted"}
