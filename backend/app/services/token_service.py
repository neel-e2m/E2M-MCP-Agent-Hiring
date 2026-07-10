"""
Token service — invite token lifecycle management.

Handles generation, validation, revocation, and listing of invite tokens
that HR sends to candidates for MCP-based applications.
"""

from datetime import datetime, timedelta, timezone

from supabase import Client

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

    async def revoke_token(self, token_id: str) -> None:
        """Revoke an invite token by ID."""
        self.supabase.table("access_tokens").update(
            {"is_revoked": True}
        ).eq("id", token_id).execute()
        logger.info("token_revoked", token_id=token_id)

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
        """Aggregate stats about invite tokens."""
        all_tokens = (
            self.supabase.table("access_tokens")
            .select("id, is_used, is_revoked, expires_at")
            .eq("token_type", "invite")
            .execute()
        )
        tokens = all_tokens.data or []
        now = datetime.now(timezone.utc)
        active = [
            t for t in tokens
            if not t["is_revoked"]
            and datetime.fromisoformat(t["expires_at"].replace("Z", "+00:00")) > now
        ]
        return {
            "total": len(tokens),
            "active": len(active),
            "used": sum(1 for t in tokens if t["is_used"]),
            "revoked": sum(1 for t in tokens if t["is_revoked"]),
        }
