"""
Main API v1 router.

Aggregates all v1 endpoints under ``/api/v1``.
"""

from fastapi import APIRouter

from app.api.v1 import (
    analytics,
    applications,
    auth,
    candidates,
    interviews,
    invitations,
    roles,
    screening,
)

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth")
api_router.include_router(analytics.router, prefix="/analytics")
api_router.include_router(candidates.router, prefix="/candidates")
api_router.include_router(roles.router, prefix="/roles")
api_router.include_router(applications.router, prefix="/applications")
api_router.include_router(invitations.router, prefix="/invites")
api_router.include_router(interviews.router, prefix="/interviews")
api_router.include_router(screening.router, prefix="/screening")
