"""
Role service — job position management.

Handles CRUD for roles (job positions) and their screening questions.
"""

from datetime import datetime, timezone

from supabase import Client

from app.core.exceptions import ConflictError, NotFoundError
from app.core.logging_config import get_logger

logger = get_logger(__name__)


class RoleService:
    """Business logic for roles and role questions."""

    def __init__(self, supabase: Client):
        self.supabase = supabase

    async def create_role(self, data: dict, created_by: str) -> dict:
        """Create a new job role.

        Args:
            data: Role fields (title, description, requirements, etc.).
            created_by: HR user UUID.
        """
        insert_data = {
            "title": data["title"],
            "description": data.get("description", ""),
            "requirements": data.get("requirements", []),
            "screening_config": data.get("screening_config") or {},
            "department": data.get("department", ""),
            "location": data.get("location", ""),
            "employment_type": data.get("employment_type", "full_time"),
            "is_active": True,
            "created_by": created_by,
        }
        result = self.supabase.table("roles").insert(insert_data).execute()
        role = result.data[0]
        await self.sync_prompt_question(role["id"], insert_data["screening_config"])
        logger.info("role_created", role_id=role["id"], title=data["title"])
        return role

    async def update_role(self, role_id: str, data: dict) -> dict:
        """Update an existing role."""
        data["updated_at"] = datetime.now(timezone.utc).isoformat()
        result = self.supabase.table("roles").update(data).eq("id", role_id).execute()
        if not result.data:
            raise NotFoundError(detail=f"Role {role_id} not found")
        if "screening_config" in data:
            await self.sync_prompt_question(role_id, data.get("screening_config") or {})
        logger.info("role_updated", role_id=role_id)
        return result.data[0]

    async def sync_prompt_question(self, role_id: str, screening_config: dict) -> None:
        """Keep the special ``category='prompt'`` screening question in sync with
        ``screening_config.prompt_question``.

        The prompt question is delivered to candidates through the normal screening
        flow, so it is materialised as a ``role_questions`` row (order 0). This
        creates / updates / deactivates it to match the role config.
        """
        prompt = (screening_config or {}).get("prompt_question")
        existing = (
            self.supabase.table("role_questions")
            .select("id")
            .eq("role_id", role_id)
            .eq("category", "prompt")
            .limit(1)
            .execute()
        )
        if prompt and str(prompt).strip():
            if existing.data:
                self.supabase.table("role_questions").update(
                    {"question": prompt, "is_active": True}
                ).eq("id", existing.data[0]["id"]).execute()
            else:
                self.supabase.table("role_questions").insert({
                    "role_id": role_id,
                    "question": prompt,
                    "category": "prompt",
                    "difficulty": "hard",
                    "order_index": 0,
                    "is_active": True,
                }).execute()
        elif existing.data:
            # Prompt removed from config → retire the question.
            self.supabase.table("role_questions").update(
                {"is_active": False}
            ).eq("id", existing.data[0]["id"]).execute()

    async def delete_role(self, role_id: str) -> None:
        """Hard-delete a role — only when it has no applications.

        Roles with applications must be deactivated (soft) instead, to avoid
        destroying candidate application history. ``access_tokens`` reference the
        role without ON DELETE CASCADE, so they are removed first; questions,
        screening sessions and answers cascade automatically.
        """
        apps = (
            self.supabase.table("applications").select("id").eq("role_id", role_id).limit(1).execute()
        )
        if apps.data:
            raise ConflictError(
                detail="This role has applications and cannot be deleted. Deactivate it instead."
            )

        self.supabase.table("access_tokens").delete().eq("role_id", role_id).execute()
        result = self.supabase.table("roles").delete().eq("id", role_id).execute()
        if not result.data:
            raise NotFoundError(detail=f"Role {role_id} not found")
        logger.info("role_deleted", role_id=role_id)

    async def list_active_roles(self) -> list[dict]:
        """List only active roles (for candidates via MCP)."""
        result = (
            self.supabase.table("roles")
            .select("id, title, description, department, location, employment_type")
            .eq("is_active", True)
            .order("created_at", desc=True)
            .execute()
        )
        return result.data or []

    async def list_all_roles(self, include_inactive: bool = False) -> list[dict]:
        """List all roles for the HR dashboard."""
        query = self.supabase.table("roles").select("*").order("created_at", desc=True)
        if not include_inactive:
            query = query.eq("is_active", True)
        result = query.execute()
        return result.data or []

    async def get_role(self, role_id: str) -> dict:
        """Fetch a single role by ID."""
        result = self.supabase.table("roles").select("*").eq("id", role_id).single().execute()
        if not result.data:
            raise NotFoundError(detail=f"Role {role_id} not found")
        return result.data

    async def toggle_status(self, role_id: str) -> dict:
        """Toggle a role's active status (soft delete / restore)."""
        role = await self.get_role(role_id)
        new_status = not role["is_active"]
        result = (
            self.supabase.table("roles")
            .update({"is_active": new_status, "updated_at": datetime.now(timezone.utc).isoformat()})
            .eq("id", role_id)
            .execute()
        )
        logger.info("role_status_toggled", role_id=role_id, is_active=new_status)
        return result.data[0]

    # ── Questions ──────────────────────────────────────────────────────

    async def add_question(self, role_id: str, question_data: dict) -> dict:
        """Add a screening question to a role."""
        # Get current max order_index
        existing = (
            self.supabase.table("role_questions")
            .select("order_index")
            .eq("role_id", role_id)
            .order("order_index", desc=True)
            .limit(1)
            .execute()
        )
        next_index = (existing.data[0]["order_index"] + 1) if existing.data else 0

        insert_data = {
            "role_id": role_id,
            "question": question_data["question"],
            "category": question_data.get("category", "general"),
            "difficulty": question_data.get("difficulty", "medium"),
            "order_index": next_index,
            "is_active": True,
        }
        result = self.supabase.table("role_questions").insert(insert_data).execute()
        return result.data[0]

    async def get_questions(self, role_id: str, active_only: bool = True) -> list[dict]:
        """List screening questions for a role."""
        query = (
            self.supabase.table("role_questions")
            .select("*")
            .eq("role_id", role_id)
            .order("order_index")
        )
        if active_only:
            query = query.eq("is_active", True)
        result = query.execute()
        return result.data or []

    async def update_question(self, question_id: str, data: dict) -> dict:
        """Update a screening question."""
        result = self.supabase.table("role_questions").update(data).eq("id", question_id).execute()
        if not result.data:
            raise NotFoundError(detail=f"Question {question_id} not found")
        return result.data[0]

    async def delete_question(self, question_id: str) -> None:
        """Soft-delete a screening question."""
        self.supabase.table("role_questions").update({"is_active": False}).eq("id", question_id).execute()
