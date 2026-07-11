"""
Token service — invite token lifecycle management.

Handles generation, validation, revocation, and listing of invite tokens
that HR sends to candidates for MCP-based applications.
"""

from datetime import datetime, timedelta, timezone

from supabase import Client

from app.core.exceptions import ConflictError, NotFoundError
from app.core.logging_config import get_logger
from app.core.security import SecurityService

logger = get_logger(__name__)


class TokenService:
    """Invite token CRUD and lifecycle operations."""

    def __init__(self, supabase: Client):
        self.supabase = supabase

    async def generate_invite(
        self,
        role_id: str,
        created_by: str,
        max_uses: int = 1,
        expires_hours: int = 72,
        candidate_email: str | None = None,
    ) -> dict:
        """Generate a new invite token for a role.

        Args:
            role_id: Target role UUID.
            created_by: HR user UUID who creates the invite.
            max_uses: How many times the token can be used.
            expires_hours: Hours until expiry.
            candidate_email: Optional pre-assigned email.

        Returns:
            dict with ``token`` (plain text — shown once), ``token_id``, ``expires_at``.
        """
        raw_token = SecurityService.generate_invite_token()
        token_hash = SecurityService.hash_token(raw_token)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=expires_hours)

        result = self.supabase.table("access_tokens").insert({
            "role_id": role_id,
            "token": token_hash,
            "token_type": "invite",
            "max_uses": max_uses,
            "expires_at": expires_at.isoformat(),
            "created_by": created_by,
        }).execute()

        logger.info("invite_token_generated", role_id=role_id, created_by=created_by)

        return {
            "token": raw_token,  # Only returned once — not stored in plain text
            "token_id": result.data[0]["id"],
            "role_id": role_id,
            "max_uses": max_uses,
            "expires_at": expires_at.isoformat(),
        }

    async def validate_token(self, token: str) -> dict | None:
        """Validate a raw token string (or hash). Returns token record if valid."""
        token_hash = SecurityService.hash_token(token)
        try:
            # First, try to match the hash (if user passed raw token)
            result = (
                self.supabase.table("access_tokens")
                .select("*")
                .eq("token", token_hash)
                .limit(1)
                .execute()
            )
            if result.data:
                return result.data[0]
                
            # Fallback: try to match the string directly (if user copied the hash from the table)
            result = (
                self.supabase.table("access_tokens")
                .select("*")
                .eq("token", token)
                .limit(1)
                .execute()
            )
            if result.data:
                return result.data[0]
                
            return None
        except Exception as e:
            logger.error("token_validation_error", error=str(e))
            return None

    @staticmethod
    def usable_reason(token: dict, check_limit: bool = True) -> str | None:
        """Return a human message if the token is NOT usable, else ``None``.

        A token is usable when it is not revoked, not expired, and (when
        ``check_limit``) still has uses left. ``max_uses < 0`` means unlimited.
        """
        if token.get("is_revoked"):
            return "This invite has been revoked."
        try:
            expires_at = datetime.fromisoformat(str(token["expires_at"]).replace("Z", "+00:00"))
            if datetime.now(timezone.utc) > expires_at:
                return "This invite has expired."
        except (KeyError, ValueError):
            pass
        if check_limit:
            max_uses = token.get("max_uses", 1)
            if max_uses is not None and max_uses >= 0 and (token.get("use_count") or 0) >= max_uses:
                return "This invite has reached its usage limit."
        return None

    async def consume_use(self, token_id: str) -> None:
        """Increment a token's use count, marking it used when the limit is hit."""
        t = (
            self.supabase.table("access_tokens")
            .select("use_count, max_uses")
            .eq("id", token_id)
            .single()
            .execute()
        ).data or {}
        new_count = (t.get("use_count") or 0) + 1
        max_uses = t.get("max_uses", 1)
        is_used = max_uses is not None and max_uses >= 0 and new_count >= max_uses
        self.supabase.table("access_tokens").update(
            {"use_count": new_count, "is_used": is_used}
        ).eq("id", token_id).execute()

    async def revoke_token(self, token_id: str) -> None:
        """Revoke an invite token by ID."""
        self.supabase.table("access_tokens").update(
            {"is_revoked": True}
        ).eq("id", token_id).execute()
        logger.info("token_revoked", token_id=token_id)

    async def delete_token(self, token_id: str) -> None:
        """Delete an invite token — only allowed when it is NOT active.

        Active (still-usable) invites must be revoked first, so a live invite is
        never silently removed from under a candidate.
        """
        t = (
            self.supabase.table("access_tokens").select("*").eq("id", token_id).single().execute()
        ).data
        if not t:
            raise NotFoundError(detail="Invite not found")
        if self.usable_reason(t) is None:
            raise ConflictError(detail="Active invites can't be deleted. Revoke it first.")
        self.supabase.table("access_tokens").delete().eq("id", token_id).execute()
        logger.info("token_deleted", token_id=token_id)

    async def list_tokens(
        self,
        role_id: str | None = None,
        include_expired: bool = False,
    ) -> list[dict]:
        """List invite tokens, optionally filtered by role."""
        query = (
            self.supabase.table("access_tokens")
            .select("*, roles(title)")
            .eq("token_type", "invite")
            .order("created_at", desc=True)
        )

        if role_id:
            query = query.eq("role_id", role_id)

        if not include_expired:
            query = query.gte("expires_at", datetime.now(timezone.utc).isoformat())

        result = query.execute()
        return result.data or []

    async def get_token_details(self, token_id: str) -> dict | None:
        """Fetch full details for a single token."""
        result = (
            self.supabase.table("access_tokens")
            .select("*, roles(title, department)")
            .eq("id", token_id)
            .single()
            .execute()
        )
        return result.data

    async def get_token_stats(self) -> dict:
        """Aggregate stats about invite tokens (unlimited-aware)."""
        all_tokens = (
            self.supabase.table("access_tokens")
            .select("id, is_revoked, use_count, max_uses, expires_at")
            .eq("token_type", "invite")
            .execute()
        )
        tokens = all_tokens.data or []

        def is_maxed(t: dict) -> bool:
            mu = t.get("max_uses", 1)
            return mu is not None and mu >= 0 and (t.get("use_count") or 0) >= mu

        revoked = sum(1 for t in tokens if t.get("is_revoked"))
        active = sum(1 for t in tokens if self.usable_reason(t) is None)
        used = sum(1 for t in tokens if not t.get("is_revoked") and is_maxed(t))
        return {
            "total": len(tokens),
            "active": active,
            "used": used,
            "revoked": revoked,
        }
