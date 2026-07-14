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
from app.core.exceptions import NotFoundError, ValidationError, ConflictError

router = APIRouter(tags=["Interviews"], dependencies=[Depends(get_current_user)])


class InterviewSchedule(BaseModel):
    application_id: str
    interviewer_id: str
    scheduled_at: str  # ISO 8601
    duration: int = 30 # minutes
    meeting_link: str | None = None
    notes: str | None = None


@router.get("/")
async def list_interviews(
    supabase: Annotated[Client, Depends(get_supabase)],
) -> list[dict]:
    """List scheduled interviews."""
    result = (
        supabase.table("interviews")
        .select("*, applications(candidate_id, role_id, candidates(name, email), roles(title)), interviewers!interviewer_id(name)")
        .order("scheduled_at", desc=False)
        .execute()
    )
    return result.data or []


from app.services.email_service import EmailService
from app.core.scheduler import scheduler

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
        
    new_start = dt_obj
    new_end = new_start + dt.timedelta(minutes=data.duration)

    # Check for interviewer schedule conflicts on the same day
    # Get interviews for this interviewer that are not cancelled
    start_of_day = new_start.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    end_of_day = new_start.replace(hour=23, minute=59, second=59, microsecond=999999).isoformat()
    
    existing_interviews = (
        supabase.table("interviews")
        .select("scheduled_at, duration")
        .eq("interviewer_id", data.interviewer_id)
        .neq("status", "cancelled")
        .gte("scheduled_at", start_of_day)
        .lte("scheduled_at", end_of_day)
        .execute()
    )

    for ex in (existing_interviews.data or []):
        try:
            ex_start = dt.datetime.fromisoformat(ex["scheduled_at"].replace("Z", "+00:00"))
            ex_dur = ex.get("duration") or 30
            ex_end = ex_start + dt.timedelta(minutes=ex_dur)
            
            # Check overlap: (StartA < EndB) and (EndA > StartB)
            if new_start < ex_end and new_end > ex_start:
                raise ConflictError(detail="The selected interviewer is already booked during this time.")
        except ValueError:
            pass

    insert_data = data.model_dump()
    insert_data["status"] = "scheduled"
    
    if not insert_data.get("meeting_link"):
        # Generate real Jitsi link
        meet_id = f"e2m-interview-{uuid.uuid4().hex[:8]}"
        insert_data["meeting_link"] = f"https://meet.jit.si/{meet_id}"
    
    result = supabase.table("interviews").insert(insert_data).execute()
    
    # Auto-update the application status to 'interviewing'
    supabase.table("applications").update({"status": "interviewing"}).eq("id", data.application_id).execute()
    
    # Fetch details for emails
    new_interview = supabase.table("interviews").select("*, applications(candidate_id, role_id, candidates(name, email), roles(title)), interviewers!interviewer_id(name, email)").eq("id", result.data[0]["id"]).execute()
    
    if new_interview.data:
        inv_data = new_interview.data[0]
        c_name = inv_data["applications"]["candidates"]["name"]
        c_email = inv_data["applications"]["candidates"]["email"]
        r_title = inv_data["applications"]["roles"]["title"]
        i_name = inv_data["interviewers"]["name"] if inv_data.get("interviewers") else "Our Team"
        i_email = inv_data["interviewers"]["email"] if inv_data.get("interviewers") else ""
        s_time_dt = dt.datetime.fromisoformat(inv_data["scheduled_at"].replace("Z", "+00:00"))
        s_time_str = s_time_dt.strftime("%A, %B %d, %Y at %I:%M %p UTC")
        m_link = inv_data.get("meeting_link", "")
        
        email_service = EmailService()
        
        # Send initial emails
        await email_service.send_interview_to_candidate(c_email, c_name, r_title, i_name, s_time_str, m_link)
        if i_email:
            await email_service.send_interview_to_interviewer(i_email, i_name, c_name, r_title, s_time_str, m_link)
            
        # Schedule reminders 15 mins before
        reminder_time = s_time_dt - dt.timedelta(minutes=15)
        now = dt.datetime.now(timezone.utc)
        
        if reminder_time > now:
            scheduler.add_job(
                email_service.send_interview_reminder,
                'date',
                run_date=reminder_time,
                args=[c_email, c_name, r_title, s_time_str, m_link, True]
            )
            if i_email:
                scheduler.add_job(
                    email_service.send_interview_reminder,
                    'date',
                    run_date=reminder_time,
                    args=[i_email, i_name, r_title, s_time_str, m_link, False]
                )
    
    return result.data[0]


@router.get("/{interview_id}/email_template")
async def get_email_template(
    interview_id: str,
    supabase: Annotated[Client, Depends(get_supabase)],
) -> dict:
    """Generate an email template for the interview."""
    result = (
        supabase.table("interviews")
        .select("*, applications(candidate_id, role_id, candidates(name, email), roles(title)), interviewers!interviewer_id(name)")
        .eq("id", interview_id)
        .execute()
    )
    if not result.data:
        raise NotFoundError(detail="Interview not found")
        
    interview = result.data[0]
    candidate_name = interview["applications"]["candidates"]["name"]
    role_title = interview["applications"]["roles"]["title"]
    interviewer_name = interview["interviewers"]["name"] if interview.get("interviewers") else "Our Team"
    
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
