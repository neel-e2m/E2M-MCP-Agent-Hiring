"""
Candidate service — profile management.

Handles candidate creation (from MCP), profile updates, listing, and
retrieval for both the MCP server and HR dashboard.
"""

from datetime import datetime, timezone

from supabase import Client

from app.core.constants import ProfileStatus
from app.core.exceptions import ConflictError, NotFoundError
from app.core.logging_config import get_logger

logger = get_logger(__name__)


class CandidateService:
    """CRUD and business logic for candidate profiles."""

    def __init__(self, supabase: Client):
        self.supabase = supabase

    async def create_candidate(self, name: str, email: str, phone: str = "", token_id: str | None = None) -> dict:
        """Register a new candidate.

        Args:
            name: Full name.
            email: Email address (unique).
            phone: Optional phone number.
            token_id: The invite token that was used (links candidate to token).

        Returns:
            The created candidate record.

        Raises:
            ConflictError: If email already exists.
        """
        # Check for existing candidate with same email
        existing = (
            self.supabase.table("candidates")
            .select("id")
            .eq("email", email)
            .execute()
        )
        if existing.data:
            # Return existing candidate instead of error (idempotent)
            logger.info("candidate_already_exists", email=email)
            return await self.get_candidate(existing.data[0]["id"])

        result = self.supabase.table("candidates").insert({
            "name": name,
            "email": email,
            "phone": phone or None,
            "profile_status": ProfileStatus.DRAFT,
        }).execute()

        candidate = result.data[0]

        # Link token to candidate
        if token_id:
            self.supabase.table("access_tokens").update(
                {"candidate_id": candidate["id"]}
            ).eq("id", token_id).execute()

        logger.info("candidate_created", candidate_id=candidate["id"], email=email)
        return candidate

    async def update_profile(self, candidate_id: str, fields: dict) -> dict:
        """Update one or more profile fields for a candidate.

        Args:
            candidate_id: UUID of the candidate.
            fields: Dict of fields to update (only non-empty values).

        Returns:
            Updated candidate record.
        """
        # Filter out empty values
        update_data = {k: v for k, v in fields.items() if v is not None and v != ""}
        if not update_data:
            return await self.get_candidate(candidate_id)

        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

        # Handle skills as JSON array if passed as comma-separated string
        if "skills" in update_data and isinstance(update_data["skills"], str):
            update_data["skills"] = [s.strip() for s in update_data["skills"].split(",") if s.strip()]

        # Automatically advance draft to in_progress upon profile update
        candidate = await self.get_candidate(candidate_id)
        if candidate.get("profile_status") == ProfileStatus.DRAFT:
            update_data["profile_status"] = ProfileStatus.IN_PROGRESS

        result = (
            self.supabase.table("candidates")
            .update(update_data)
            .eq("id", candidate_id)
            .execute()
        )

        if not result.data:
            raise NotFoundError(detail=f"Candidate {candidate_id} not found")

        logger.info("candidate_profile_updated", candidate_id=candidate_id, fields=list(update_data.keys()))
        return result.data[0]

    async def get_candidate(self, candidate_id: str) -> dict:
        """Fetch the full profile for a candidate.

        Raises:
            NotFoundError: If candidate does not exist.
        """
        result = (
            self.supabase.table("candidates")
            .select("*")
            .eq("id", candidate_id)
            .single()
            .execute()
        )
        if not result.data:
            raise NotFoundError(detail=f"Candidate {candidate_id} not found")
        return result.data

    async def list_candidates(
        self,
        page: int = 1,
        per_page: int = 20,
        status: str | None = None,
        search: str | None = None,
    ) -> dict:
        """List candidates with pagination and optional filters.

        Returns:
            dict with ``candidates`` list, ``total``, ``page``, ``per_page``.
        """
        query = self.supabase.table("candidates").select("*", count="exact")

        if status:
            query = query.eq("profile_status", status)

        if search:
            query = query.or_(f"name.ilike.%{search}%,email.ilike.%{search}%")

        offset = (page - 1) * per_page
        query = query.order("created_at", desc=True).range(offset, offset + per_page - 1)

        result = query.execute()

        candidates = result.data or []

        # Dynamically compute the global highest status for each candidate
        # A candidate is 'complete' if they have any applications.
        # A candidate is 'in_progress' if they have any screening sessions but no applications.
        if candidates:
            candidate_ids = [c["id"] for c in candidates]
            
            # Fetch sessions and apps for these candidates
            sessions = self.supabase.table("screening_sessions").select("candidate_id").in_("candidate_id", candidate_ids).execute()
            apps = self.supabase.table("applications").select("candidate_id").in_("candidate_id", candidate_ids).execute()
            
            complete_ids = {a["candidate_id"] for a in (apps.data or []) if a.get("candidate_id")}
            in_progress_ids = {s["candidate_id"] for s in (sessions.data or []) if s.get("candidate_id")}
            
            for c in candidates:
                cid = c["id"]
                if cid in complete_ids:
                    c["profile_status"] = "complete"
                elif cid in in_progress_ids:
                    c["profile_status"] = "in_progress"

        return {
            "candidates": candidates,
            "total": result.count or 0,
            "page": page,
            "per_page": per_page,
        }

    async def list_candidates_by_role(
        self,
        role_id: str,
        page: int = 1,
        per_page: int = 20,
        status: str | None = None,
    ) -> dict:
        """List candidates associated with a specific role, computing their role-specific status."""
        
        # 1. Get candidates with invites for this role (draft baseline)
        tokens = self.supabase.table("access_tokens").select("candidate_id").eq("role_id", role_id).not_.is_("candidate_id", "null").execute()
        
        # 2. Get candidates with screening sessions for this role (in_progress baseline)
        sessions = self.supabase.table("screening_sessions").select("candidate_id").eq("role_id", role_id).execute()
        
        # 3. Get candidates with applications for this role (complete baseline)
        apps = self.supabase.table("applications").select("candidate_id").eq("role_id", role_id).execute()
        
        draft_ids = set()
        in_progress_ids = set()
        complete_ids = set()
        
        if apps.data:
            for a in apps.data:
                if a.get("candidate_id"):
                    complete_ids.add(a["candidate_id"])
                    
        if sessions.data:
            for s in sessions.data:
                cid = s.get("candidate_id")
                if cid and cid not in complete_ids:
                    in_progress_ids.add(cid)
                    
        if tokens.data:
            for t in tokens.data:
                cid = t.get("candidate_id")
                if cid and cid not in complete_ids and cid not in in_progress_ids:
                    draft_ids.add(cid)
                    
        # Filter by status if provided
        target_ids = set()
        if status == "complete":
            target_ids = complete_ids
        elif status == "in_progress":
            target_ids = in_progress_ids
        elif status == "draft":
            target_ids = draft_ids
        else:
            target_ids = draft_ids.union(in_progress_ids).union(complete_ids)
            
        if not target_ids:
            return {
                "candidates": [],
                "total": 0,
                "page": page,
                "per_page": per_page,
            }

        # Fetch candidates
        query = self.supabase.table("candidates").select("*", count="exact").in_("id", list(target_ids))
        
        offset = (page - 1) * per_page
        query = query.order("created_at", desc=True).range(offset, offset + per_page - 1)
        
        result = query.execute()

        return {
            "candidates": result.data or [],
            "total": result.count or 0,
            "page": page,
            "per_page": per_page,
        }

    async def update_status(self, candidate_id: str, status: str) -> None:
        """Update the profile status of a candidate."""
        self.supabase.table("candidates").update(
            {"profile_status": status, "updated_at": datetime.now(timezone.utc).isoformat()}
        ).eq("id", candidate_id).execute()
        logger.info("candidate_status_updated", candidate_id=candidate_id, status=status)

    async def check_profile_complete(self, candidate_id: str) -> bool:
        """Check if a candidate's profile has all required fields filled."""
        candidate = await self.get_candidate(candidate_id)
        required = ["name", "email", "summary", "skills"]
        return all(candidate.get(f) for f in required)
