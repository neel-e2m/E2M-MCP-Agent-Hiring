"""
Analytics routes.
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from supabase import Client

from app.api.deps import get_current_user, get_supabase
from app.services.analytics_service import AnalyticsService

router = APIRouter(tags=["Analytics"], dependencies=[Depends(get_current_user)])


def get_analytics_service(supabase: Annotated[Client, Depends(get_supabase)]) -> AnalyticsService:
    return AnalyticsService(supabase)


@router.get("/overview")
async def get_overview(
    service: Annotated[AnalyticsService, Depends(get_analytics_service)],
) -> dict:
    """Get high-level dashboard metrics."""
    return await service.get_overview()


@router.get("/pipeline")
async def get_pipeline(
    service: Annotated[AnalyticsService, Depends(get_analytics_service)],
) -> dict:
    """Get application counts by status."""
    return await service.get_pipeline()


@router.get("/screening-scores")
async def get_screening_scores(
    service: Annotated[AnalyticsService, Depends(get_analytics_service)],
) -> dict:
    """Get screening score distribution."""
    return await service.get_screening_scores()


@router.get("/activity")
async def get_recent_activity(
    service: Annotated[AnalyticsService, Depends(get_analytics_service)],
) -> list[dict]:
    """Get recent timeline activity."""
    return await service.get_recent_activity()
