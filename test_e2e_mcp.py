import asyncio
import os
import sys

# Add mcp-server to path to import its tools
import httpx
from dotenv import load_dotenv

load_dotenv("mcp-server/.env")
INTERNAL_API_KEY = os.getenv("MCP_INTERNAL_API_KEY", "")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8010")

def _headers():
    return {"X-Internal-Api-Key": INTERNAL_API_KEY, "Content-Type": "application/json"}

async def register_candidate(name, email, phone, invite_token):
    async with httpx.AsyncClient() as client:
        r = await client.post(f"{BACKEND_URL}/api/v1/internal/candidates/register", json={"name": name, "email": email, "phone": phone, "token": invite_token}, headers=_headers())
        return r.json()

async def update_profile(candidate_id, summary, skills, experience, education):
    async with httpx.AsyncClient() as client:
        r = await client.put(f"{BACKEND_URL}/api/v1/internal/candidates/{candidate_id}/profile", json={"summary": summary, "skills": skills, "experience": experience, "education": education}, headers=_headers())
        return r.json()

async def start_screening(candidate_id, role_id):
    async with httpx.AsyncClient() as client:
        r = await client.post(f"{BACKEND_URL}/api/v1/internal/screening/start", json={"candidate_id": candidate_id, "role_id": role_id}, headers=_headers())
        return r.json()

async def get_next_question(session_id):
    async with httpx.AsyncClient() as client:
        r = await client.post(f"{BACKEND_URL}/api/v1/internal/screening/next-question", json={"session_id": session_id}, headers=_headers())
        return r.json()

async def submit_answer(session_id, question_number, answer):
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.post(f"{BACKEND_URL}/api/v1/internal/screening/submit-answer", json={"session_id": session_id, "question_number": question_number, "answer": answer}, headers=_headers())
        return r.json()

async def submit_application(candidate_id, role_id):
    async with httpx.AsyncClient() as client:
        r = await client.post(f"{BACKEND_URL}/api/v1/internal/applications/submit", json={"candidate_id": candidate_id, "role_id": role_id}, headers=_headers())
        return r.json()

async def get_application_status(candidate_id, role_id):
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{BACKEND_URL}/api/v1/internal/applications/{candidate_id}/{role_id}/status", headers=_headers())
        return r.json()
load_dotenv("backend/.env")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
from supabase import create_client

async def run_e2e_test():
    print("=== E2E Test Started ===")
    
    # 1. Setup HR Admin Data (Role & Invite) via Supabase Service Role
    print("\n[Dashboard Simulation] Creating Role & Invite...")
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    
    # Fetch HR user
    hr_user_res = supabase.table("hr_users").select("id").eq("email", "admin@e2m.com").execute()
    if not hr_user_res.data:
        print("ERROR: HR user not found.")
        return
    hr_user_id = hr_user_res.data[0]["id"]
    
    # Create Role
    role_res = supabase.table("roles").insert({
        "title": "Senior AI Agent Engineer",
        "description": "An engineer who builds autonomous agents.",
        "department": "Engineering",
        "location": "Remote",
        "employment_type": "full_time",
        "created_by": hr_user_id,
        "is_active": True
    }).execute()
    role_id = role_res.data[0]["id"]
    print(f"-> Created Role: {role_id}")
    
    # Create Screening Questions
    supabase.table("role_questions").insert([
        {
            "role_id": role_id,
            "question": "How do you handle tool execution failures in agentic systems?",
            "category": "technical",
            "difficulty": "hard",
            "order_index": 1
        },
        {
            "role_id": role_id,
            "question": "Explain the difference between zero-shot and few-shot prompting.",
            "category": "ai",
            "difficulty": "medium",
            "order_index": 2
        }
    ]).execute()
    print("-> Added Screening Questions")
    
    # Generate Invite
    import uuid
    raw_token = str(uuid.uuid4())
    import hashlib
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    
    res = supabase.table("access_tokens").insert({
        "role_id": role_id,
        "token": token_hash,
        "token_type": "invite",
        "created_by": hr_user_id,
        "max_uses": 1,
        "expires_at": "2030-01-01T00:00:00Z"
    }).execute()
    print("Inserted token ID:", res.data[0]['id'])
    
    verify_res = supabase.table("access_tokens").select("*").eq("token", token_hash).execute()
    print("Verification rows:", len(verify_res.data))
    print("Hash being queried:", token_hash)
    print(f"-> Generated Invite Token: {raw_token}")
    
    print("\n[MCP Agent Simulation] Starting Candidate Journey...")
    
    # 2. Register Candidate via MCP
    print("-> 2. Registering Candidate...")
    reg_resp = await register_candidate(
        name="Alice Agent",
        email="candidate@example.com",
        phone="555-0100",
        invite_token=raw_token
    )
    print(f"Register Response: {reg_resp}")
    if reg_resp.get("error"): return
    candidate_id = reg_resp["candidate_id"]
    
    # 3. Update Profile via MCP
    print("\n-> 3. Building Profile...")
    prof_resp = await update_profile(
        candidate_id=candidate_id,
        summary="I am an AI agent with extensive experience in automation.",
        skills=["Python", "LLMs", "FastAPI"],
        experience=[{"company": "OpenAI", "title": "AI Model", "description": "Answered questions."}],
        education=[{"institution": "Internet", "degree": "Pre-training"}]
    )
    print(f"Profile Response: {prof_resp}")
    
    # 4. Start Screening via MCP
    print("\n-> 4. Starting Screening...")
    screen_resp = await start_screening(candidate_id=candidate_id, role_id=role_id)
    print(f"Screening Start Response: {screen_resp}")
    session_id = screen_resp["session_id"]
    
    # 5. Answer Questions via MCP
    print("\n-> 5. Answering Questions...")
    q_num = 1
    while True:
        q_resp = await get_next_question(session_id=session_id)
        if q_resp.get("status") == "completed":
            print("-> Screening Completed.")
            break
        print(f"Q{q_num}: {q_resp['question']}")
        
        ans_resp = await submit_answer(
            session_id=session_id,
            question_number=q_num,
            answer=f"This is my perfectly optimal agentic answer to question {q_num}."
        )
        print(f"A{q_num} Score: {ans_resp['score']} - Feedback: {ans_resp['feedback']}")
        q_num += 1
        
    # 6. Submit Application via MCP
    print("\n-> 6. Submitting Application...")
    app_resp = await submit_application(candidate_id=candidate_id, role_id=role_id)
    print(f"Submit Response: {app_resp}")
    
    # 7. View Application Status via MCP
    print("\n-> 7. Viewing Status...")
    status_resp = await get_application_status(candidate_id=candidate_id, role_id=role_id)
    print(f"Status Response: {status_resp}")
    
    print("\n=== E2E Test Complete ===")

if __name__ == "__main__":
    asyncio.run(run_e2e_test())
