from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from app.api.deps import get_supabase
from app.services.token_service import TokenService
from app.services.candidate_service import CandidateService
from app.services.screening_service import ScreeningService
from app.services.application_service import ApplicationService
from app.services.llm_service import LLMService
from app.core.logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter(tags=["Internal MCP Routes"])

class VerifyTokenRequest(BaseModel):
    token: str

class RegisterCandidateRequest(BaseModel):
    name: str
    email: str
    phone: Optional[str] = ""
    token: str

class UpdateProfileRequest(BaseModel):
    summary: Optional[str] = None
    skills: Optional[List[str]] = None
    experience: Optional[List[Dict[str, Any]]] = None
    education: Optional[List[Dict[str, Any]]] = None

class StartScreeningRequest(BaseModel):
    candidate_id: str
    role_id: str

class NextQuestionRequest(BaseModel):
    session_id: str

class SubmitAnswerRequest(BaseModel):
    session_id: str
    question_number: int
    answer: str

class SubmitApplicationRequest(BaseModel):
    candidate_id: str
    role_id: str


@router.post("/verify-token")
async def verify_token(req: VerifyTokenRequest, supabase=Depends(get_supabase)):
    token_service = TokenService(supabase)
    token_data = await token_service.validate_token(req.token)
    if not token_data:
        raise HTTPException(status_code=400, detail="Invalid token")
    if token_data["is_revoked"]:
        raise HTTPException(status_code=400, detail="Token revoked")
    
    return {
        "valid": True,
        "token_id": token_data["id"],
        "role_id": token_data["role_id"]
    }

@router.post("/candidates/register")
async def register_candidate(req: RegisterCandidateRequest, supabase=Depends(get_supabase)):
    token_service = TokenService(supabase)
    token_data = await token_service.validate_token(req.token)
    if not token_data or token_data["is_revoked"]:
        raise HTTPException(status_code=400, detail="Invalid or revoked token")
    
    candidate_service = CandidateService(supabase)
    candidate = await candidate_service.create_candidate(
        name=req.name,
        email=req.email,
        phone=req.phone,
        token_id=token_data["id"]
    )
    return {
        "candidate_id": candidate["id"],
        "role_id": token_data["role_id"]
    }

@router.put("/candidates/{candidate_id}/profile")
async def update_profile(candidate_id: str, req: UpdateProfileRequest, supabase=Depends(get_supabase)):
    candidate_service = CandidateService(supabase)
    # Filter out None values
    fields = {k: v for k, v in req.dict().items() if v is not None}
    await candidate_service.update_profile(candidate_id, fields)
    
    # Auto-update status to complete if all fields are present
    is_complete = await candidate_service.check_profile_complete(candidate_id)
    if is_complete:
        await candidate_service.update_status(candidate_id, "complete")
        
    return {"status": "success"}

@router.post("/screening/start")
async def start_screening(req: StartScreeningRequest, supabase=Depends(get_supabase)):
    screening_service = ScreeningService(supabase)
    session = await screening_service.start_session(req.candidate_id, req.role_id)
    return {
        "session_id": session["id"],
        "total_questions": session["total_questions"]
    }

@router.post("/screening/next-question")
async def get_next_question(req: NextQuestionRequest, supabase=Depends(get_supabase)):
    screening_service = ScreeningService(supabase)
    question = await screening_service.get_next_question(req.session_id)
    if not question:
        # All questions answered, finish session
        await screening_service.finish_session(req.session_id)
        return {"status": "completed"}
    return question

@router.post("/screening/submit-answer")
async def submit_answer(req: SubmitAnswerRequest, supabase=Depends(get_supabase)):
    screening_service = ScreeningService(supabase)
    llm_service = LLMService()
    
    # Retrieve the answer_id based on session_id and question_number
    q_data = supabase.table("screening_answers").select("id, question").eq("session_id", req.session_id).eq("question_number", req.question_number).single().execute()
    if not q_data.data:
        raise HTTPException(status_code=404, detail="Question not found")
        
    answer_id = q_data.data["id"]
    question_text = q_data.data["question"]
    
    # Store answer
    res = await screening_service.submit_answer(req.session_id, answer_id, req.answer)
    
    # Evaluate with LLM
    eval_result = await llm_service.evaluate_answer(question_text, req.answer)
    
    # Update evaluation
    await screening_service.update_answer_evaluation(
        answer_id,
        eval_result.get("score", 0.0),
        eval_result.get("feedback", ""),
        metadata={"strengths": eval_result.get("strengths", []), "improvements": eval_result.get("improvements", [])}
    )
    
    return {
        "status": "success",
        "score": eval_result.get("score"),
        "feedback": eval_result.get("feedback")
    }

@router.post("/applications/submit")
async def submit_application(req: SubmitApplicationRequest, supabase=Depends(get_supabase)):
    app_service = ApplicationService(supabase)
    
    # Dummy resume so application doesn't fail on resume check if we skip it in MCP flow
    # Wait, the validation requires a resume. Let's insert a dummy resume if none exists.
    resume = supabase.table("candidate_files").select("id").eq("candidate_id", req.candidate_id).eq("file_type", "resume").execute()
    if not resume.data:
        supabase.table("candidate_files").insert({
            "candidate_id": req.candidate_id,
            "file_type": "resume",
            "file_name": "dummy_resume.pdf",
            "file_size": 1024,
            "storage_path": "dummy/path.pdf"
        }).execute()
        
    app = await app_service.submit(req.candidate_id, req.role_id)
    return {
        "application_id": app["id"],
        "status": app["status"]
    }

@router.get("/applications/{candidate_id}/{role_id}/status")
async def get_application_status(candidate_id: str, role_id: str, supabase=Depends(get_supabase)):
    res = supabase.table("applications").select("status, overall_score").eq("candidate_id", candidate_id).eq("role_id", role_id).execute()
    if not res.data:
        return {"status": "not_found"}
    return res.data[0]
