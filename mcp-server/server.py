"""
MCP Server for E2M Hiring Agent.

Provides tools for AI agents (Claude Desktop, Cursor, etc.) to manage
the candidate hiring workflow: registration, profile building, technical
screening, application submission, and status checking.

All state mutations and logic are handled by the FastAPI backend via
the Internal API, authenticated with an internal API key.

Transport: streamable-http on port 8001.
"""

import os
import httpx
from fastmcp import FastMCP
import structlog
from dotenv import load_dotenv

# ── Configuration ─────────────────────────────────────────────────────────

load_dotenv()

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8010")
INTERNAL_API_KEY = os.getenv("MCP_INTERNAL_API_KEY", "")
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8001"))

# ── Structured Logging ───────────────────────────────────────────────────

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.dev.ConsoleRenderer(),
    ]
)
logger = structlog.get_logger("mcp_server")

# ── FastMCP Instance ─────────────────────────────────────────────────────

mcp = FastMCP("E2M_Hiring_Agent")

# ── HTTP Helpers ─────────────────────────────────────────────────────────


def _headers() -> dict:
    """Return the standard headers for internal API calls."""
    return {
        "X-Internal-Api-Key": INTERNAL_API_KEY,
        "Content-Type": "application/json",
    }


async def _post(path: str, payload: dict) -> dict:
    """Make an async POST request to the backend internal API."""
    url = f"{BACKEND_URL}{path}"
    logger.info("backend_request", method="POST", url=url)
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, json=payload, headers=_headers())
    if resp.status_code >= 400:
        logger.error("backend_error", status=resp.status_code, body=resp.text)
        return {"error": True, "status_code": resp.status_code, "detail": resp.text}
    return resp.json()


async def _put(path: str, payload: dict) -> dict:
    """Make an async PUT request to the backend internal API."""
    url = f"{BACKEND_URL}{path}"
    logger.info("backend_request", method="PUT", url=url)
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.put(url, json=payload, headers=_headers())
    if resp.status_code >= 400:
        logger.error("backend_error", status=resp.status_code, body=resp.text)
        return {"error": True, "status_code": resp.status_code, "detail": resp.text}
    return resp.json()


async def _get(path: str) -> dict:
    """Make an async GET request to the backend internal API."""
    url = f"{BACKEND_URL}{path}"
    logger.info("backend_request", method="GET", url=url)
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(url, headers=_headers())
    if resp.status_code >= 400:
        logger.error("backend_error", status=resp.status_code, body=resp.text)
        return {"error": True, "status_code": resp.status_code, "detail": resp.text}
    return resp.json()


# ── MCP Tools ────────────────────────────────────────────────────────────


@mcp.tool()
async def register_candidate(
    name: str, email: str, phone: str = "", invite_token: str = ""
) -> dict:
    """Register a new candidate using their invite token.

    This must be called first before any other tool. The invite_token is the
    raw token string the candidate received (e.g. from a URL or email).

    Args:
        name: Full name of the candidate.
        email: Email address of the candidate.
        phone: Phone number (optional).
        invite_token: The raw invite token string provided to the candidate.

    Returns:
        dict with candidate_id and role_id on success.
    """
    logger.info("tool_invoked", tool="register_candidate", email=email)
    return await _post(
        "/api/v1/internal/candidates/register",
        {"name": name, "email": email, "phone": phone, "token": invite_token},
    )


@mcp.tool()
async def update_profile(
    candidate_id: str,
    summary: str = "",
    skills: list[str] = [],
    experience: list[dict] = [],
    education: list[dict] = [],
) -> dict:
    """Update the candidate's profile with their information.

    Call this after register_candidate to fill in the candidate's details.

    Args:
        candidate_id: The candidate's UUID returned from register_candidate.
        summary: A short professional summary / bio.
        skills: List of skill strings, e.g. ["Python", "FastAPI", "LLMs"].
        experience: List of experience dicts, each with keys like
                    "company", "title", "start_date", "end_date", "description".
        education: List of education dicts, each with keys like
                   "institution", "degree", "field", "year".

    Returns:
        dict with status on success.
    """
    logger.info("tool_invoked", tool="update_profile", candidate_id=candidate_id)
    return await _put(
        f"/api/v1/internal/candidates/{candidate_id}/profile",
        {
            "summary": summary,
            "skills": skills,
            "experience": experience,
            "education": education,
        },
    )


@mcp.tool()
async def start_screening(candidate_id: str, role_id: str) -> dict:
    """Start the technical screening session for the candidate.

    Must be called before get_next_question. Initialises a screening session
    with a fixed number of questions.

    Args:
        candidate_id: The candidate's UUID.
        role_id: The role UUID (returned from register_candidate).

    Returns:
        dict with session_id and total_questions.
    """
    logger.info(
        "tool_invoked",
        tool="start_screening",
        candidate_id=candidate_id,
        role_id=role_id,
    )
    return await _post(
        "/api/v1/internal/screening/start",
        {"candidate_id": candidate_id, "role_id": role_id},
    )


@mcp.tool()
async def get_next_question(session_id: str) -> dict:
    """Get the next screening question.

    Call this repeatedly to fetch each question in the screening session.

    Args:
        session_id: The session UUID returned from start_screening.

    Returns:
        dict with question_id, question text, number, and total.
    """
    logger.info("tool_invoked", tool="get_next_question", session_id=session_id)
    return await _post(
        "/api/v1/internal/screening/next-question",
        {"session_id": session_id},
    )


@mcp.tool()
async def submit_answer(session_id: str, question_number: int, answer: str) -> dict:
    """Submit the candidate's answer to a screening question.

    Args:
        session_id: The session UUID.
        question_number: The 1-based question number being answered.
        answer: The candidate's full answer text.

    Returns:
        dict with status, score, and feedback from the AI evaluator.
    """
    logger.info(
        "tool_invoked",
        tool="submit_answer",
        session_id=session_id,
        question_number=question_number,
    )
    return await _post(
        "/api/v1/internal/screening/submit-answer",
        {
            "session_id": session_id,
            "question_number": question_number,
            "answer": answer,
        },
    )


@mcp.tool()
async def submit_application(candidate_id: str, role_id: str) -> dict:
    """Submit the final application for review by HR.

    This should be called after the candidate has completed their profile
    and finished the screening session.

    Args:
        candidate_id: The candidate's UUID.
        role_id: The role UUID.

    Returns:
        dict with application_id and status.
    """
    logger.info(
        "tool_invoked",
        tool="submit_application",
        candidate_id=candidate_id,
        role_id=role_id,
    )
    return await _post(
        "/api/v1/internal/applications/submit",
        {"candidate_id": candidate_id, "role_id": role_id},
    )


@mcp.tool()
async def get_application_status(candidate_id: str, role_id: str) -> dict:
    """Check the current status of an application.

    Args:
        candidate_id: The candidate's UUID.
        role_id: The role UUID.

    Returns:
        dict with status and overall_score.
    """
    logger.info(
        "tool_invoked",
        tool="get_application_status",
        candidate_id=candidate_id,
        role_id=role_id,
    )
    return await _get(
        f"/api/v1/internal/applications/{candidate_id}/{role_id}/status"
    )


# ── Entrypoint ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    logger.info(
        "starting_mcp_server",
        host=HOST,
        port=PORT,
        backend=BACKEND_URL,
        transport="streamable-http",
    )
    mcp.run(transport="streamable-http", host=HOST, port=PORT)
