"""
Internal Screening logic trigger route.

Allows internal MCP backend logic to trigger evaluation (e.g. background job mock).
"""

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from supabase import Client

from app.api.deps import get_current_user, get_supabase
from app.services.llm_service import LLMService
from app.services.screening_service import ScreeningService

router = APIRouter(tags=["Screening"], dependencies=[Depends(get_current_user)])


class EvaluateAnswerRequest(BaseModel):
    session_id: str
    answer_id: str


@router.post("/evaluate-answer")
async def trigger_evaluation(
    data: EvaluateAnswerRequest,
    supabase: Annotated[Client, Depends(get_supabase)],
) -> dict:
    """Manually trigger the LLM evaluation of an answer.
    
    Normally this would be handled by a Celery background task when the 
    candidate submits the answer, but exposing an endpoint is useful for testing.
    """
    service = ScreeningService(supabase)
    llm = LLMService()
    
    # Get the answer
    answer_res = supabase.table("screening_answers").select("*").eq("id", data.answer_id).single().execute()
    if not answer_res.data:
        return {"error": "Answer not found"}
        
    answer_text = answer_res.data.get("answer")
    question_text = answer_res.data.get("question")
    
    # Get role context
    session = supabase.table("screening_sessions").select("role_id").eq("id", data.session_id).single().execute()
    role_res = supabase.table("roles").select("title, description").eq("id", session.data["role_id"]).single().execute()
    role_context = f"{role_res.data['title']} - {role_res.data['description']}"
    
    # Evaluate
    evaluation = await llm.evaluate_answer(question_text, answer_text, role_context)
    
    # Save
    await service.update_answer_evaluation(
        data.answer_id,
        score=evaluation.get("score", 0),
        feedback=evaluation.get("feedback", ""),
        metadata={"strengths": evaluation.get("strengths", []), "improvements": evaluation.get("improvements", [])}
    )
    
    return {"message": "Evaluation completed", "evaluation": evaluation}
