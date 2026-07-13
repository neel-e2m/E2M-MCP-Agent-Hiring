"""
Roles routes.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from supabase import Client

from app.api.deps import get_current_user, get_supabase, require_role
from app.services.role_service import RoleService

router = APIRouter(tags=["Roles"], dependencies=[Depends(get_current_user)])


def get_role_service(supabase: Annotated[Client, Depends(get_supabase)]) -> RoleService:
    return RoleService(supabase)


class RoleCreate(BaseModel):
    title: str
    description: str | None = None
    requirements: list[str] = []
    department: str | None = None
    location: str | None = None
    employment_type: str = "full_time"
    screening_config: dict | None = None
    faqs: list[dict] = []


class RoleUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    requirements: list[str] | None = None
    department: str | None = None
    location: str | None = None
    employment_type: str | None = None
    screening_config: dict | None = None
    faqs: list[dict] | None = None


class QuestionCreate(BaseModel):
    question: str
    category: str = "general"
    difficulty: str = "medium"


@router.get("/")
async def list_roles(
    service: Annotated[RoleService, Depends(get_role_service)],
    include_inactive: bool = False,
) -> list[dict]:
    """List all roles."""
    return await service.list_all_roles(include_inactive=include_inactive)


@router.post("/", dependencies=[Depends(require_role("admin", "hr_manager"))])
async def create_role(
    data: RoleCreate,
    service: Annotated[RoleService, Depends(get_role_service)],
    current_user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    """Create a new role."""
    return await service.create_role(data.model_dump(), current_user["id"])


@router.get("/{role_id}")
async def get_role(
    role_id: str,
    service: Annotated[RoleService, Depends(get_role_service)],
) -> dict:
    """Get details of a specific role."""
    return await service.get_role(role_id)


@router.patch("/{role_id}", dependencies=[Depends(require_role("admin", "hr_manager"))])
async def update_role(
    role_id: str,
    data: RoleUpdate,
    service: Annotated[RoleService, Depends(get_role_service)],
) -> dict:
    """Update a role."""
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    return await service.update_role(role_id, update_data)


@router.post("/{role_id}/toggle", dependencies=[Depends(require_role("admin", "hr_manager"))])
async def toggle_role_status(
    role_id: str,
    service: Annotated[RoleService, Depends(get_role_service)],
) -> dict:
    """Toggle a role's active status."""
    return await service.toggle_status(role_id)


@router.delete("/{role_id}", dependencies=[Depends(require_role("admin", "hr_manager"))])
async def delete_role(
    role_id: str,
    service: Annotated[RoleService, Depends(get_role_service)],
) -> dict:
    """Permanently delete a role. Blocked (409) if it has applications."""
    await service.delete_role(role_id)
    return {"message": "Role deleted"}


# ── Questions ─────────────────────────────────────────────────────────────

@router.get("/{role_id}/questions")
async def list_questions(
    role_id: str,
    service: Annotated[RoleService, Depends(get_role_service)],
    active_only: bool = True,
) -> list[dict]:
    """List screening questions for a role."""
    return await service.get_questions(role_id, active_only)


@router.post("/{role_id}/questions", dependencies=[Depends(require_role("admin", "hr_manager"))])
async def add_question(
    role_id: str,
    data: QuestionCreate,
    service: Annotated[RoleService, Depends(get_role_service)],
) -> dict:
    """Add a screening question to a role."""
    return await service.add_question(role_id, data.model_dump())


@router.delete("/questions/{question_id}", dependencies=[Depends(require_role("admin", "hr_manager"))])
async def delete_question(
    question_id: str,
    service: Annotated[RoleService, Depends(get_role_service)],
) -> dict:
    """Soft-delete a screening question."""
    await service.delete_question(question_id)
    return {"message": "Question deleted"}


@router.get("/{role_id}/candidates")
async def get_role_candidates(
    role_id: str,
    supabase: Annotated[Client, Depends(get_supabase)],
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status: str | None = None,
) -> dict:
    """Get all candidates associated with a role via invites or applications."""
    from app.services.candidate_service import CandidateService
    service = CandidateService(supabase)
    return await service.list_candidates_by_role(role_id=role_id, page=page, per_page=per_page, status=status)
