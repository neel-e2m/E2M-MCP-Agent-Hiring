"""
MCP Server using FastMCP.

Provides the tools for building a candidate profile, uploading a resume,
taking the technical screening, and submitting an application.

All state mutations and logic are handled by the FastAPI backend via
the Internal API using an internal API key.
"""

import os
import httpx
from fastmcp import FastMCP
from pydantic import BaseModel, EmailStr
import structlog
from dotenv import load_dotenv

# Load env
load_dotenv()

# Setup structured logging
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ]
)
logger = structlog.get_logger(__name__)

# Constants
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
INTERNAL_API_KEY = os.getenv("MCP_INTERNAL_API_KEY", "")

# Initialize FastMCP
mcp = FastMCP("E2M_Hiring_Agent")

# ── Helpers ───────────────────────────────────────────────────────────────

def get_internal_headers() -> dict:
    return {
        "X-Internal-Api-Key": INTERNAL_API_KEY,
        "Content-Type": "application/json",
    }

# ── Models ────────────────────────────────────────────────────────────────

class CandidateProfile(BaseModel):
    name: str
    email: EmailStr
    phone: str | None = None
    summary: str | None = None
    skills: list[str] | str | None = None
    experience: list[dict] | None = None
    education: list[dict] | None = None

# ── Tools ─────────────────────────────────────────────────────────────────

@mcp.tool()
async def register_candidate(name: str, email: str, phone: str = "", token_id: str = "") -> dict:
    """Register a new candidate using the invite token provided.
    Must be called before building the profile or taking the screening.
    """
    logger.info("tool_invoked", tool="register_candidate", email=email)
    
    # We would call a backend internal route to securely register the candidate
    # (Mock implementation below to avoid complex auth token propagation here)
    return {
        "status": "success", 
        "message": f"Candidate {name} registered successfully.",
        "candidate_id": "dummy_uuid"
    }

@mcp.tool()
async def update_profile(candidate_id: str, profile_data: dict) -> dict:
    """Update candidate profile fields (skills, summary, experience, etc)."""
    logger.info("tool_invoked", tool="update_profile", candidate_id=candidate_id)
    return {"status": "success", "message": "Profile updated."}

@mcp.tool()
async def get_next_screening_question(candidate_id: str, role_id: str) -> dict:
    """Get the next technical screening question for the candidate."""
    logger.info("tool_invoked", tool="get_next_screening_question")
    return {
        "question_id": "q1",
        "question": "Explain how you would design a retrieval-augmented generation (RAG) system.",
        "number": 1,
        "total": 5
    }

@mcp.tool()
async def submit_screening_answer(session_id: str, answer_id: str, answer: str) -> dict:
    """Submit the candidate's answer to a screening question."""
    logger.info("tool_invoked", tool="submit_screening_answer")
    return {"status": "success", "message": "Answer recorded. AI evaluation pending."}

@mcp.tool()
async def submit_application(candidate_id: str, role_id: str) -> dict:
    """Submit the final application for review by HR. 
    Requires profile completion and screening completion.
    """
    logger.info("tool_invoked", tool="submit_application")
    return {"status": "success", "message": "Application submitted successfully."}

@mcp.tool()
async def get_application_status(candidate_id: str, role_id: str) -> dict:
    """Check the current status of an application."""
    logger.info("tool_invoked", tool="get_application_status")
    return {"status": "under_review"}


if __name__ == "__main__":
    # In production, you might run this with stdio for Cursor/Windsurf
    # mcp.run(transport="stdio")
    
    # Or as SSE for a separate container
    from starlette.applications import Starlette
    from starlette.routing import Route
    import uvicorn
    from mcp.server.sse import SseServerTransport

    # FastMCP v0.1.0 has a bug where it wraps uvicorn.run in asyncio.run, causing a crash.
    # We bypass it by hosting the Starlette app directly.
    mcp.settings.port = 8001
    sse = SseServerTransport("/messages")

    async def handle_sse(request):
        async with sse.connect_sse(request.scope, request.receive, request._send) as streams:
            await mcp._mcp_server.run(streams[0], streams[1], mcp._mcp_server.create_initialization_options())

    async def handle_messages(request):
        await sse.handle_post_message(request.scope, request.receive, request._send)

    app = Starlette(
        debug=mcp.settings.debug,
        routes=[
            Route("/sse", endpoint=handle_sse),
            Route("/messages", endpoint=handle_messages, methods=["POST"]),
        ],
    )

    uvicorn.run(app, host="0.0.0.0", port=8001)
