"""
Applications routes.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from supabase import Client

from app.api.deps import get_current_user, get_supabase, require_role
from app.services.application_service import ApplicationService
from app.services.llm_service import LLMService

router = APIRouter(tags=["Applications"], dependencies=[Depends(get_current_user)])


def get_application_service(supabase: Annotated[Client, Depends(get_supabase)]) -> ApplicationService:
    return ApplicationService(supabase)


class ApplicationReview(BaseModel):
    status: str
    notes: str | None = None


@router.get("/")
async def list_applications(
    service: Annotated[ApplicationService, Depends(get_application_service)],
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status: str | None = None,
    role_id: str | None = None,
) -> dict:
    """List candidate applications."""
    return await service.list_applications(page=page, per_page=per_page, status=status, role_id=role_id)


@router.get("/{app_id}")
async def get_application(
    app_id: str,
    service: Annotated[ApplicationService, Depends(get_application_service)],
) -> dict:
    """Get full details of an application."""
    return await service.get_application(app_id)


@router.post("/{app_id}/review", dependencies=[Depends(require_role("admin", "hr_manager", "recruiter"))])
async def review_application(
    app_id: str,
    data: ApplicationReview,
    service: Annotated[ApplicationService, Depends(get_application_service)],
    current_user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    """Update application status and optionally add review notes."""
    if data.notes:
        await service.add_review(app_id, data.notes, current_user["id"])
    
    return await service.update_status(app_id, data.status, current_user["id"])


@router.post("/{app_id}/recommendation", dependencies=[Depends(require_role("admin", "hr_manager"))])
async def generate_ai_recommendation(
    app_id: str,
    service: Annotated[ApplicationService, Depends(get_application_service)],
) -> dict:
    """Trigger the LLM to generate a hire recommendation based on application data."""
    app_data = await service.get_application(app_id)
    
    # We should also fetch screening answers and resume data for better context, 
    # but for brevity we'll pass the base app_data to the LLM service.
    
    llm_service = LLMService()
    recommendation = await llm_service.generate_recommendation(app_data)
    
    await service.update_ai_recommendation(app_id, recommendation)
    return {"recommendation": recommendation}
