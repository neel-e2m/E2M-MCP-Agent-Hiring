from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from app.api.deps import get_supabase
from app.services.token_service import TokenService
from app.services.candidate_service import CandidateService
from app.services.screening_service import ScreeningService
from app.services.application_service import ApplicationService
from app.services.eligibility_service import EligibilityService
from app.services.resume_service import ResumeService
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


class ResumeUploadRequest(BaseModel):
    file_base64: str
    filename: str = "resume.pdf"

class ResumeUrlUploadRequest(BaseModel):
    url: str


class EligibilityCheckRequest(BaseModel):
    candidate_id: str
    role_id: str


@router.get("/roles/{role_id}/faqs")
async def get_role_faqs(
    role_id: str,
    supabase=Depends(get_supabase)
) -> dict:
    """Get FAQs for a specific role."""
    result = supabase.table("roles").select("faqs, title").eq("id", role_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Role not found")
    
    role = result.data[0]
    return {
        "role_title": role.get("title"),
        "faqs": role.get("faqs") or []
    }

@router.post("/verify-token")
async def verify_token(req: VerifyTokenRequest, supabase=Depends(get_supabase)):
    token_service = TokenService(supabase)
    token_data = await token_service.validate_token(req.token)
    if not token_data:
        raise HTTPException(status_code=400, detail="Invalid token. Please tell the candidate: 'The invite token you provided is invalid. Could you please double-check it?'")
    if token_data["is_revoked"]:
        raise HTTPException(status_code=400, detail="Token revoked. Please tell the candidate: 'Your invite token has been revoked by HR. Please contact them for a new one.'")
    
    return {
        "valid": True,
        "token_id": token_data["id"],
        "role_id": token_data["role_id"]
    }

@router.post("/candidates/register")
async def register_candidate(req: RegisterCandidateRequest, supabase=Depends(get_supabase)):
    token_service = TokenService(supabase)
    token_data = await token_service.validate_token(req.token)
    if not token_data:
        raise HTTPException(status_code=400, detail="Please tell the candidate: 'The invite token you provided is invalid or unrecognized.'")

    # Returning candidate (same email) vs brand-new one.
    existing = supabase.table("candidates").select("id").eq("email", req.email).execute()
    is_new = not existing.data
    
    existing_candidate_id = existing.data[0]["id"] if not is_new else None
    
    if not is_new:
        app_check = supabase.table("applications").select("id").eq("candidate_id", existing_candidate_id).eq("role_id", token_data["role_id"]).execute()
        if app_check.data:
            raise HTTPException(status_code=400, detail="Please tell the candidate: 'It looks like you have already applied for this role! You cannot apply multiple times for the same role using the same email address.'")

    # Check if they already started an application for THIS role recently (resuming).
    # We consider them resuming if they have a screening session or resume for this role/candidate.
    is_resuming = False
    if not is_new:
        resume_check = supabase.table("candidate_files").select("id").eq("candidate_id", existing_candidate_id).eq("file_type", "resume").execute()
        if resume_check.data:
            is_resuming = True

    # Enforce the invite lifecycle limit. If they are just resuming an incomplete application, we don't block them.
    reason = TokenService.usable_reason(token_data, check_limit=not is_resuming)
    if reason:
        # reason is something like "This invite has reached its usage limit."
        raise HTTPException(status_code=400, detail=f"Please tell the candidate: '{reason} Please request a new invite link from HR.'")

    # The invite is bound to exactly one role; make sure it still accepts applicants.
    role = (
        supabase.table("roles")
        .select("id, title, description, requirements, is_active, screening_config")
        .eq("id", token_data["role_id"])
        .single()
        .execute()
    ).data
    if not role or not role.get("is_active"):
        raise HTTPException(status_code=400, detail="This role is no longer accepting applications.")

    candidate_service = CandidateService(supabase)
    candidate = await candidate_service.create_candidate(
        name=req.name,
        email=req.email,
        phone=req.phone,
        token_id=token_data["id"] if not is_resuming else None,
    )
    
    if not is_resuming:
        await token_service.consume_use(token_data["id"])

    sc = role.get("screening_config") or {}
    return {
        "candidate_id": candidate["id"],
        "role_id": token_data["role_id"],
        "role": {
            "title": role.get("title"),
            "description": role.get("description"),
            "requirements": role.get("requirements") or [],
            "eligibility_rules": sc.get("eligibility_rules") or {},
            "has_prompt_question": bool(sc.get("prompt_question")),
        },
    }


@router.get("/roles/{role_id}")
async def internal_get_role(role_id: str, supabase=Depends(get_supabase)):
    """Public-safe role details for the candidate's agent (what they're applying to)."""
    r = (
        supabase.table("roles")
        .select("id, title, description, requirements, department, location, employment_type, is_active, screening_config")
        .eq("id", role_id)
        .single()
        .execute()
    ).data
    if not r:
        raise HTTPException(status_code=404, detail="Role not found")
    sc = r.get("screening_config") or {}
    return {
        "id": r["id"],
        "title": r.get("title"),
        "description": r.get("description"),
        "requirements": r.get("requirements") or [],
        "department": r.get("department"),
        "location": r.get("location"),
        "employment_type": r.get("employment_type"),
        "is_active": r.get("is_active"),
        "eligibility_rules": sc.get("eligibility_rules") or {},
        "has_prompt_question": bool(sc.get("prompt_question")),
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

@router.post("/candidates/{candidate_id}/resume")
async def submit_resume(candidate_id: str, req: ResumeUploadRequest, supabase=Depends(get_supabase)):
    """Store a candidate's resume PDF (sent as base64 by the agent)."""
    resume_service = ResumeService(supabase)
    record = await resume_service.upload_base64(candidate_id, req.file_base64, req.filename)
    return {
        "status": "success",
        "file_id": record["id"],
        "file_name": record["file_name"],
    }

@router.post("/candidates/{candidate_id}/resume-url")
async def submit_resume_url(candidate_id: str, req: ResumeUrlUploadRequest, supabase=Depends(get_supabase)):
    """Download and store a candidate's resume PDF from a public URL."""
    resume_service = ResumeService(supabase)
    record = await resume_service.upload_url(candidate_id, req.url)
    return {
        "status": "success",
        "file_id": record["id"],
        "file_name": record["file_name"],
    }

@router.post("/eligibility/check")
async def check_eligibility(req: EligibilityCheckRequest, supabase=Depends(get_supabase)):
    """Evaluate a candidate against the role's HR-defined eligibility rules."""
    resume_check = supabase.table("candidate_files").select("id").eq("candidate_id", req.candidate_id).eq("file_type", "resume").execute()
    if not resume_check.data:
        raise HTTPException(status_code=400, detail="State Error: You must upload a resume before checking eligibility. Please tell the candidate: 'Could you please provide a public link to your resume PDF first? I need it before I can check your eligibility.'")
        
    service = EligibilityService(supabase)
    return await service.evaluate(req.candidate_id, req.role_id)

@router.post("/screening/start")
async def start_screening(req: StartScreeningRequest, supabase=Depends(get_supabase)):
    resume_check = supabase.table("candidate_files").select("id").eq("candidate_id", req.candidate_id).eq("file_type", "resume").execute()
    if not resume_check.data:
        raise HTTPException(status_code=400, detail="State Error: You must upload a resume before starting the screening. Please tell the candidate: 'Please share a link to your resume PDF so we can proceed.'")
        
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
    
    # Retrieve the answer slot (with its category) for this question
    q_data = supabase.table("screening_answers").select("id, question, evaluation_metadata").eq("session_id", req.session_id).eq("question_number", req.question_number).single().execute()
    if not q_data.data:
        raise HTTPException(status_code=404, detail="Question not found")

    answer_id = q_data.data["id"]
    question_text = q_data.data["question"]
    category = (q_data.data.get("evaluation_metadata") or {}).get("category", "general")

    # Store answer
    await screening_service.submit_answer(req.session_id, answer_id, req.answer)

    # Evaluate with the LLM — the 'prompt' question uses prompt-quality scoring
    # plus an AI-generated flag; all others use the standard evaluator.
    if category == "prompt":
        eval_result = await llm_service.evaluate_prompt(question_text, req.answer)
        metadata = {
            "category": "prompt",
            "strengths": eval_result.get("strengths", []),
            "improvements": eval_result.get("improvements", []),
            "ai_generated_likelihood": eval_result.get("ai_generated_likelihood", 0.0),
            "ai_flag": eval_result.get("ai_flag", False),
        }
    else:
        eval_result = await llm_service.evaluate_answer(question_text, req.answer)
        metadata = {
            "category": category,
            "strengths": eval_result.get("strengths", []),
            "improvements": eval_result.get("improvements", []),
        }

    await screening_service.update_answer_evaluation(
        answer_id,
        eval_result.get("score", 0.0),
        eval_result.get("feedback", ""),
        metadata=metadata,
    )

    return {
        "status": "success",
        "score": eval_result.get("score"),
        "feedback": eval_result.get("feedback"),
        "ai_flag": metadata.get("ai_flag", False),
    }

@router.post("/applications/submit")
async def submit_application(req: SubmitApplicationRequest, supabase=Depends(get_supabase)):
    app_service = ApplicationService(supabase)
    # A real resume is now required (uploaded via submit_resume) — no dummy fallback.
    app = await app_service.submit(req.candidate_id, req.role_id)
    
    try:
        from app.services.email_service import EmailService
        candidate = supabase.table("candidates").select("name, email").eq("id", req.candidate_id).single().execute().data
        role = supabase.table("roles").select("title").eq("id", req.role_id).single().execute().data
        if candidate and role:
            await EmailService().send_application_submitted(
                to_email=candidate["email"],
                candidate_name=candidate["name"],
                role_title=role["title"],
                status=app["status"]
            )
    except Exception as e:
        logger.error(f"Failed to send submission email: {e}")

    return {
        "application_id": app["id"],
        "status": app["status"],
    }

@router.get("/applications/{candidate_id}/{role_id}/status")
async def get_application_status(candidate_id: str, role_id: str, supabase=Depends(get_supabase)):
    res = supabase.table("applications").select("status, overall_score").eq("candidate_id", candidate_id).eq("role_id", role_id).execute()
    if not res.data:
        return {"status": "not_found"}
    return res.data[0]
