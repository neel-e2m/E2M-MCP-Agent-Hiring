"""
Interviews routes.

Simple CRUD for manual interview scheduling.
"""

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from supabase import Client

from app.api.deps import get_current_user, get_supabase, require_role
from app.core.exceptions import NotFoundError

router = APIRouter(tags=["Interviews"], dependencies=[Depends(get_current_user)])


class InterviewSchedule(BaseModel):
    application_id: str
    interviewer_id: str
    scheduled_at: str  # ISO 8601
    meeting_link: str | None = None
    notes: str | None = None


@router.get("/")
async def list_interviews(
    supabase: Annotated[Client, Depends(get_supabase)],
) -> list[dict]:
    """List scheduled interviews."""
    result = (
        supabase.table("interviews")
        .select("*, applications(candidate_id, role_id, candidates(name), roles(title))")
        .order("scheduled_at", desc=False)
        .execute()
    )
    return result.data or []


@router.post("/", dependencies=[Depends(require_role("admin", "hr_manager", "recruiter"))])
async def schedule_interview(
    data: InterviewSchedule,
    supabase: Annotated[Client, Depends(get_supabase)],
    current_user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    """Schedule a manual interview for a candidate."""
    insert_data = data.model_dump()
    insert_data["status"] = "scheduled"
    
    result = supabase.table("interviews").insert(insert_data).execute()
    return result.data[0]


@router.patch("/{interview_id}/status")
async def update_interview_status(
    interview_id: str,
    status: str,
    supabase: Annotated[Client, Depends(get_supabase)],
) -> dict:
    """Update interview status (completed, cancelled, etc.)."""
    result = (
        supabase.table("interviews")
        .update({"status": status, "updated_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", interview_id)
        .execute()
    )
    if not result.data:
        raise NotFoundError(detail="Interview not found")
    return result.data[0]
