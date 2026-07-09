"""
Candidates routes (HR Dashboard view).
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.api.deps import get_current_user, get_supabase
from app.services.audit_service import AuditService
from app.services.candidate_service import CandidateService
from app.services.resume_service import ResumeService
from app.services.screening_service import ScreeningService
from app.services.storage_service import StorageService

router = APIRouter(tags=["Candidates"], dependencies=[Depends(get_current_user)])


def get_candidate_service(supabase: Annotated[Client, Depends(get_supabase)]) -> CandidateService:
    return CandidateService(supabase)


@router.get("/")
async def list_candidates(
    service: Annotated[CandidateService, Depends(get_candidate_service)],
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status: str | None = None,
    search: str | None = None,
) -> dict:
    """List candidates with pagination and filters."""
    return await service.list_candidates(page=page, per_page=per_page, status=status, search=search)


@router.get("/{candidate_id}")
async def get_candidate(
    candidate_id: str,
    service: Annotated[CandidateService, Depends(get_candidate_service)],
) -> dict:
    """Get full details of a specific candidate."""
    return await service.get_candidate(candidate_id)


@router.get("/{candidate_id}/screening")
async def get_candidate_screening(
    candidate_id: str,
    supabase: Annotated[Client, Depends(get_supabase)],
) -> list:
    """Get all screening sessions for a candidate."""
    service = ScreeningService(supabase)
    return await service.list_sessions(candidate_id=candidate_id)


@router.get("/{candidate_id}/conversations")
async def get_candidate_conversations(
    candidate_id: str,
    supabase: Annotated[Client, Depends(get_supabase)],
) -> list:
    """Get conversation history for a candidate."""
    service = AuditService(supabase)
    return await service.get_conversations(candidate_id=candidate_id)


@router.get("/{candidate_id}/files")
async def get_candidate_files(
    candidate_id: str,
    supabase: Annotated[Client, Depends(get_supabase)],
) -> list:
    """Get a list of files uploaded by the candidate, with signed URLs."""
    result = supabase.table("candidate_files").select("*").eq("candidate_id", candidate_id).execute()
    files = result.data or []
    
    storage = StorageService(supabase)
    for f in files:
        bucket = "resumes" if f["file_type"] == "resume" else "portfolios"
        f["url"] = await storage.get_signed_url(bucket, f["storage_path"])
        
    return files


@router.get("/{candidate_id}/audit")
async def get_candidate_audit(
    candidate_id: str,
    supabase: Annotated[Client, Depends(get_supabase)],
) -> list:
    """Get the MCP tool call audit trail for a candidate."""
    service = AuditService(supabase)
    return await service.get_audit_trail(candidate_id=candidate_id)
