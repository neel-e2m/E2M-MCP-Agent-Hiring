"""
Audit service — tracking and logging.

Records all MCP tool invocations and conversation turns to provide an
audit trail and context history for the HR dashboard.
"""

from typing import Any

from supabase import Client

from app.core.logging_config import get_logger

logger = get_logger(__name__)


class AuditService:
    """Audit logging operations."""

    def __init__(self, supabase: Client):
        self.supabase = supabase

    async def log_tool_call(
        self,
        candidate_id: str | None,
        tool_name: str,
        request_payload: dict[str, Any] | None,
        response_payload: dict[str, Any] | None,
        status: str,
        duration_ms: int,
        ip_address: str | None = None,
    ) -> None:
        """Log an MCP tool invocation."""
        try:
            self.supabase.table("tool_logs").insert({
                "candidate_id": candidate_id,
                "tool_name": tool_name,
                "request_payload": request_payload,
                "response_payload": response_payload,
                "status": status,
                "duration_ms": duration_ms,
                "ip_address": ip_address,
            }).execute()
        except Exception as exc:
            logger.error(
                "failed_to_log_tool_call",
                tool_name=tool_name,
                candidate_id=candidate_id,
                error=str(exc),
            )

    async def log_conversation(
        self,
        candidate_id: str,
        message: str,
        speaker: str,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Log a conversation message (AI or candidate)."""
        try:
            self.supabase.table("conversations").insert({
                "candidate_id": candidate_id,
                "message": message,
                "speaker": speaker,
                "metadata": metadata or {},
            }).execute()
        except Exception as exc:
            logger.error(
                "failed_to_log_conversation",
                candidate_id=candidate_id,
                speaker=speaker,
                error=str(exc),
            )

    async def get_audit_trail(self, candidate_id: str, limit: int = 50) -> list[dict]:
        """Fetch recent tool calls for a candidate."""
        result = (
            self.supabase.table("tool_logs")
            .select("*")
            .eq("candidate_id", candidate_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []

    async def get_conversations(self, candidate_id: str, limit: int = 100) -> list[dict]:
        """Fetch the conversation history for a candidate."""
        result = (
            self.supabase.table("conversations")
            .select("*")
            .eq("candidate_id", candidate_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []
