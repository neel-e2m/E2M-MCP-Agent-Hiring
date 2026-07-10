"""
Screening service — technical screening session management.

Manages the lifecycle of a screening session: start → answer questions →
finish.  Integrates with the LLM service for AI-based evaluation.
"""

from datetime import datetime, timezone

from supabase import Client

from app.core.constants import ScreeningStatus
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.core.logging_config import get_logger

logger = get_logger(__name__)


class ScreeningService:
    """Screening session lifecycle and answer management."""

    def __init__(self, supabase: Client):
        self.supabase = supabase

    async def start_session(self, candidate_id: str, role_id: str) -> dict:
        """Create a new screening session for a candidate and role.

        Raises:
            ConflictError: If an active session already exists.
        """
        # Check for existing active session
        existing = (
            self.supabase.table("screening_sessions")
            .select("id, status")
            .eq("candidate_id", candidate_id)
            .eq("role_id", role_id)
            .eq("status", ScreeningStatus.IN_PROGRESS.value)
            .execute()
        )
        if existing.data:
            return existing.data[0]

        # Load questions for this role
        questions = (
            self.supabase.table("role_questions")
            .select("*")
            .eq("role_id", role_id)
            .eq("is_active", True)
            .order("order_index")
            .execute()
        )

        total_questions = len(questions.data) if questions.data else 0
        if total_questions == 0:
            raise ValidationError(detail="No screening questions configured for this role")

        result = self.supabase.table("screening_sessions").insert({
            "candidate_id": candidate_id,
            "role_id": role_id,
            "status": ScreeningStatus.IN_PROGRESS.value,
            "total_questions": total_questions,
            "answered_questions": 0,
            "total_score": 0,
        }).execute()

        session = result.data[0]

        # Pre-create answer slots
        for idx, q in enumerate(questions.data):
            self.supabase.table("screening_answers").insert({
                "session_id": session["id"],
                "candidate_id": candidate_id,
                "question_number": idx + 1,
                "question": q["question"],
            }).execute()

        logger.info("screening_session_started", session_id=session["id"], total_questions=total_questions)
        return session

    async def get_next_question(self, session_id: str) -> dict | None:
        """Return the next unanswered question, or None if all answered."""
        result = (
            self.supabase.table("screening_answers")
            .select("*")
            .eq("session_id", session_id)
            .is_("answer", "null")
            .order("question_number")
            .limit(1)
            .execute()
        )
        if not result.data:
            return None

        q = result.data[0]
        return {
            "answer_id": q["id"],
            "question_number": q["question_number"],
            "question": q["question"],
            "total_questions": await self._get_total_questions(session_id),
        }

    async def submit_answer(self, session_id: str, answer_id: str, answer: str) -> dict:
        """Store a candidate's answer.  LLM evaluation is triggered separately.

        Returns:
            dict with ``answer_id``, ``question_number``, ``status``.
        """
        # Update the answer record
        result = (
            self.supabase.table("screening_answers")
            .update({
                "answer": answer,
                "answered_at": datetime.now(timezone.utc).isoformat(),
            })
            .eq("id", answer_id)
            .execute()
        )

        if not result.data:
            raise NotFoundError(detail=f"Answer {answer_id} not found")

        # Increment answered_questions on the session
        session = (
            self.supabase.table("screening_sessions")
            .select("answered_questions")
            .eq("id", session_id)
            .single()
            .execute()
        )
        new_count = (session.data["answered_questions"] or 0) + 1
        self.supabase.table("screening_sessions").update(
            {"answered_questions": new_count}
        ).eq("id", session_id).execute()

        logger.info("screening_answer_submitted", session_id=session_id, answer_id=answer_id)
        return {
            "answer_id": answer_id,
            "question_number": result.data[0]["question_number"],
            "status": "submitted",
        }

    async def update_answer_evaluation(
        self, answer_id: str, score: float, feedback: str, metadata: dict | None = None
    ) -> None:
        """Store the LLM evaluation results for an answer."""
        self.supabase.table("screening_answers").update({
            "score": score,
            "ai_feedback": feedback,
            "evaluation_metadata": metadata or {},
        }).eq("id", answer_id).execute()

    async def finish_session(self, session_id: str) -> dict:
        """Mark a screening session as completed and calculate totals.

        Returns:
            dict with ``session_id``, ``total_score``, ``status``.
        """
        # Fetch all answers with scores
        answers = (
            self.supabase.table("screening_answers")
            .select("score")
            .eq("session_id", session_id)
            .not_.is_("score", "null")
            .execute()
        )

        scores = [a["score"] for a in (answers.data or []) if a["score"] is not None]
        total_score = round(sum(scores) / len(scores), 2) if scores else 0

        result = self.supabase.table("screening_sessions").update({
            "status": ScreeningStatus.COMPLETED.value,
            "total_score": total_score,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", session_id).execute()

        logger.info("screening_session_completed", session_id=session_id, total_score=total_score)
        return {
            "session_id": session_id,
            "total_score": total_score,
            "status": "completed",
            "answers_evaluated": len(scores),
        }

    async def get_session_results(self, session_id: str) -> dict:
        """Fetch full results for a screening session including all answers."""
        session = (
            self.supabase.table("screening_sessions")
            .select("*")
            .eq("id", session_id)
            .single()
            .execute()
        )
        if not session.data:
            raise NotFoundError(detail=f"Screening session {session_id} not found")

        answers = (
            self.supabase.table("screening_answers")
            .select("*")
            .eq("session_id", session_id)
            .order("question_number")
            .execute()
        )

        return {
            "session": session.data,
            "answers": answers.data or [],
        }

    async def list_sessions(self, candidate_id: str | None = None) -> list[dict]:
        """List screening sessions, optionally filtered by candidate."""
        query = (
            self.supabase.table("screening_sessions")
            .select("*, candidates(name, email)")
            .order("started_at", desc=True)
        )
        if candidate_id:
            query = query.eq("candidate_id", candidate_id)
        result = query.execute()
        return result.data or []

    async def _get_total_questions(self, session_id: str) -> int:
        session = (
            self.supabase.table("screening_sessions")
            .select("total_questions")
            .eq("id", session_id)
            .single()
            .execute()
        )
        return session.data["total_questions"] if session.data else 0
