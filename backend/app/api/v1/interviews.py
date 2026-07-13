"""
Interviews routes.

Simple CRUD for manual interview scheduling.
"""

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from supabase import Client
import uuid
import datetime as dt

from app.api.deps import get_current_user, get_supabase, require_role
from app.core.exceptions import NotFoundError, ValidationError

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
        .select("*, applications(candidate_id, role_id, candidates(name, email), roles(title)), hr_users!interviewer_id(name)")
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
    # Validate scheduled_at
    try:
        dt_obj = dt.datetime.fromisoformat(data.scheduled_at.replace("Z", "+00:00"))
    except ValueError:
        raise ValidationError(detail="Invalid date format for scheduled_at")
    
    # Check weekday (0=Mon, 4=Fri)
    if dt_obj.weekday() > 4:
        raise ValidationError(detail="Interviews can only be scheduled Monday through Friday")
        
    # Check hours (10 AM to 6 PM) local time of the dt_obj
    if dt_obj.hour < 10 or dt_obj.hour >= 18:
        raise ValidationError(detail="Interviews can only be scheduled between 10:00 AM and 6:00 PM")

    insert_data = data.model_dump()
    insert_data["status"] = "scheduled"
    
    if not insert_data.get("meeting_link"):
        # Generate dummy meet link
        meet_id = f"{uuid.uuid4().hex[:3]}-{uuid.uuid4().hex[:4]}-{uuid.uuid4().hex[:3]}"
        insert_data["meeting_link"] = f"https://meet.google.com/{meet_id}"
    
    result = supabase.table("interviews").insert(insert_data).execute()
    
    # Auto-update the application status to 'interviewing'
    supabase.table("applications").update({"status": "interviewing"}).eq("id", data.application_id).execute()
    
    return result.data[0]


@router.get("/{interview_id}/email_template")
async def get_email_template(
    interview_id: str,
    supabase: Annotated[Client, Depends(get_supabase)],
) -> dict:
    """Generate an email template for the interview."""
    result = (
        supabase.table("interviews")
        .select("*, applications(candidate_id, role_id, candidates(name, email), roles(title)), hr_users!interviewer_id(name)")
        .eq("id", interview_id)
        .execute()
    )
    if not result.data:
        raise NotFoundError(detail="Interview not found")
        
    interview = result.data[0]
    candidate_name = interview["applications"]["candidates"]["name"]
    role_title = interview["applications"]["roles"]["title"]
    interviewer_name = interview["hr_users"]["name"] if interview.get("hr_users") else "Our Team"
    
    dt_obj = dt.datetime.fromisoformat(interview["scheduled_at"].replace("Z", "+00:00"))
    formatted_date = dt_obj.strftime("%A, %B %d, %Y at %I:%M %p UTC")
    
    subject = f"Interview Invitation: {role_title} at E2M"
    body = f"""Hi {candidate_name},

Congratulations! Your application for the {role_title} position has been shortlisted, and we would love to invite you to an interview.

You will be meeting with {interviewer_name}.

**Interview Details:**
- **Date & Time:** {formatted_date}
- **Meeting Link:** {interview.get("meeting_link", "TBA")}

Please let us know if you need to reschedule or if you have any questions before the interview.

Best regards,
E2M Hiring Team
"""
    return {"subject": subject, "body": body}


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
