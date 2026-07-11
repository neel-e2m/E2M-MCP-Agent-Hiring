"""
Application service — job application management.

Handles candidate application submission, HR reviews, and status updates.
"""

from datetime import datetime, timezone

from supabase import Client

from app.core.constants import ApplicationStatus, ProfileStatus, ScreeningStatus
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.core.logging_config import get_logger
from app.services.eligibility_service import EligibilityService

logger = get_logger(__name__)


class ApplicationService:
    """Application submission and review logic."""

    def __init__(self, supabase: Client):
        self.supabase = supabase

    async def submit(self, candidate_id: str, role_id: str) -> dict:
        """Submit a candidate application.

        Validates:
        1. Profile is complete.
        2. Resume is uploaded.
        3. Screening is completed.
        4. No duplicate application exists.

        Raises:
            ValidationError: If prerequisites are not met.
            ConflictError: If application already exists.
        """
        # 1. Check for duplicate
        existing = (
            self.supabase.table("applications")
            .select("id")
            .eq("candidate_id", candidate_id)
            .eq("role_id", role_id)
            .execute()
        )
        if existing.data:
            raise ConflictError(detail="You have already applied for this role")

        # 2. Check profile completeness
        candidate = (
            self.supabase.table("candidates")
            .select("profile_status")
            .eq("id", candidate_id)
            .single()
            .execute()
        )
        if not candidate.data or candidate.data.get("profile_status") != ProfileStatus.COMPLETE:
            raise ValidationError(detail="Your profile must be complete before applying")

        # 3. Check resume upload
        resume = (
            self.supabase.table("candidate_files")
            .select("id")
            .eq("candidate_id", candidate_id)
            .eq("file_type", "resume")
            .execute()
        )
        if not resume.data:
            raise ValidationError(detail="You must upload a resume before applying")

        # 4. Check screening completion and get technical score
        screening = (
            self.supabase.table("screening_sessions")
            .select("status, total_score")
            .eq("candidate_id", candidate_id)
            .eq("role_id", role_id)
            .execute()
        )
        if not screening.data or screening.data[0].get("status") != ScreeningStatus.COMPLETED:
            raise ValidationError(detail="You must complete the technical screening before applying")

        technical_score = screening.data[0].get("total_score", 0.0) or 0.0

        # 5. Eligibility re-check (defense in depth — also enforced at screening start).
        eligibility = await EligibilityService(self.supabase).evaluate(candidate_id, role_id)
        if not eligibility["eligible"]:
            raise ValidationError(
                detail="Not eligible for this role: " + "; ".join(eligibility["reasons"])
            )

        # 6. Overall score (equals the prompt score when it is the only question).
        profile_score = 0.0
        overall_score = technical_score

        # 7. Auto shortlist / reject from the role's configurable threshold (toggleable).
        role = (
            self.supabase.table("roles").select("screening_config").eq("id", role_id).single().execute().data
        )
        scoring = ((role or {}).get("screening_config") or {}).get("scoring") or {}
        status = ApplicationStatus.SUBMITTED.value
        metadata: dict = {"eligibility": eligibility}
        if scoring.get("auto_shortlist_enabled"):
            try:
                threshold = float(scoring.get("shortlist_threshold", 7.0) or 0.0)
            except (TypeError, ValueError):
                threshold = 7.0
            if float(overall_score) >= threshold:
                status = ApplicationStatus.SHORTLISTED.value
                metadata["auto_status_reason"] = f"Auto-shortlisted: score {overall_score} ≥ threshold {threshold}"
            else:
                status = ApplicationStatus.REJECTED.value
                metadata["auto_status_reason"] = f"Auto-rejected: score {overall_score} < threshold {threshold}"

        # 8. Submit application
        result = self.supabase.table("applications").insert({
            "candidate_id": candidate_id,
            "role_id": role_id,
            "technical_score": technical_score,
            "profile_score": profile_score,
            "overall_score": overall_score,
            "status": status,
            "metadata": metadata,
        }).execute()

        app_data = result.data[0]
        logger.info("application_submitted", application_id=app_data["id"], candidate_id=candidate_id, status=status)
        
        # Trigger WebSocket broadcast would happen here or in the router layer
        return app_data

    async def list_applications(
        self,
        page: int = 1,
        per_page: int = 20,
        status: str | None = None,
        role_id: str | None = None,
    ) -> dict:
        """List applications with pagination and filters."""
        query = (
            self.supabase.table("applications")
            .select("*, candidates(name, email), roles(title)", count="exact")
        )

        if status:
            query = query.eq("status", status)
        if role_id:
            query = query.eq("role_id", role_id)

        offset = (page - 1) * per_page
        query = query.order("submitted_at", desc=True).range(offset, offset + per_page - 1)
        result = query.execute()

        return {
            "applications": result.data or [],
            "total": result.count or 0,
            "page": page,
            "per_page": per_page,
        }

    async def get_application(self, app_id: str) -> dict:
        """Fetch full details for an application."""
        result = (
            self.supabase.table("applications")
            .select("*, candidates(*), roles(*)")
            .eq("id", app_id)
            .single()
            .execute()
        )
        if not result.data:
            raise NotFoundError(detail=f"Application {app_id} not found")
        return result.data

    async def update_status(self, app_id: str, status: str, reviewed_by: str) -> dict:
        """Update the status of an application."""
        result = (
            self.supabase.table("applications")
            .update({
                "status": status,
                "reviewed_at": datetime.now(timezone.utc).isoformat(),
                "reviewed_by": reviewed_by,
            })
            .eq("id", app_id)
            .execute()
        )
        if not result.data:
            raise NotFoundError(detail=f"Application {app_id} not found")
        
        logger.info("application_status_updated", application_id=app_id, status=status)
        return result.data[0]

    async def add_review(self, app_id: str, notes: str, reviewed_by: str) -> dict:
        """Add HR review notes to an application."""
        app = await self.get_application(app_id)
        metadata = app.get("metadata") or {}
        reviews = metadata.get("reviews", [])
        reviews.append({
            "notes": notes,
            "reviewed_by": reviewed_by,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        metadata["reviews"] = reviews

        result = (
            self.supabase.table("applications")
            .update({"metadata": metadata})
            .eq("id", app_id)
            .execute()
        )
        return result.data[0]

    async def update_ai_recommendation(self, app_id: str, recommendation: str) -> None:
        """Store the AI-generated recommendation for an application."""
        self.supabase.table("applications").update(
            {"ai_recommendation": recommendation}
        ).eq("id", app_id).execute()
