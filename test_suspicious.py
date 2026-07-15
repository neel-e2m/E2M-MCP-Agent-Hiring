import asyncio
import os
import httpx
from dotenv import load_dotenv

load_dotenv("backend/.env")
load_dotenv("mcp-server/.env")
INTERNAL_API_KEY = os.getenv("MCP_INTERNAL_API_KEY", "")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8010")

def _headers():
    return {"X-Internal-Api-Key": INTERNAL_API_KEY, "Content-Type": "application/json"}

async def run_test():
    async with httpx.AsyncClient() as client:
        # We need a token or candidate id
        # Let's hit a real DB
        SUPABASE_URL = os.getenv("SUPABASE_URL")
        SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        from supabase import create_client
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        
        # Get any candidate
        res = supabase.table("candidates").select("id").limit(1).execute()
        if not res.data:
            print("No candidates found")
            return
            
        candidate_id = res.data[0]["id"]
        
        print(f"Testing suspicious flag for candidate {candidate_id}")
        
        for i in range(4):
            print(f"Updating profile... attempt {i+1}")
            resp = await client.put(
                f"{BACKEND_URL}/api/v1/internal/candidates/{candidate_id}/profile",
                json={"summary": f"Test {i}"},
                headers=_headers()
            )
            print(resp.status_code, resp.json())
        
        # Verify tool logs
        logs = supabase.table("tool_logs").select("*").eq("candidate_id", candidate_id).order("created_at", desc=True).limit(5).execute()
        print("Recent logs:")
        for log in logs.data:
            print(f"[{log['tool_name']}]")

if __name__ == "__main__":
    asyncio.run(run_test())
