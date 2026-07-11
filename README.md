# E2M Agentic Hiring Platform

**E2M** is an agent-to-agent hiring platform built on the **Model Context Protocol (MCP)**.
Instead of filling out web forms, a candidate hands an invite token to their own AI agent
(Claude Desktop, Cursor, etc.). The agent connects to the platform, submits the candidate's
profile and résumé, checks eligibility, completes an AI-graded screening, and files the
application — all driven by the candidate. HR reviews everything from a clean web dashboard.

---

## Table of Contents
- [How it works](#how-it-works)
- [The candidate flow](#the-candidate-flow-mcp)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Feature highlights](#feature-highlights)
- [MCP tools](#mcp-tools)
- [Quick start (local)](#quick-start-local)
- [Environment variables](#environment-variables)
- [Connect an AI agent (Cursor / Claude Desktop)](#connect-an-ai-agent-cursor--claude-desktop)
- [Testing with the MCP Inspector](#testing-with-the-mcp-inspector)
- [Deployment](#deployment)
- [Security notes](#security-notes)
- [Project structure](#project-structure)

---

## How it works

1. **HR creates a role** in the dashboard — job details, **eligibility rules** (min experience,
   min education, required skills), a **screening prompt question**, and an optional
   **auto‑shortlist score threshold**.
2. **HR generates an invite token** for that role (unlimited or a limited number of candidates,
   with an expiry) and sends it to the candidate.
3. **The candidate gives the token to their AI agent.** The agent uses the MCP tools to register,
   submit the profile + résumé, and — only if the candidate passes the eligibility rules —
   completes the screening and submits the application.
4. **The screening** asks the candidate to paste the exact AI prompt they would use to build a
   described project. A backend LLM (Groq) scores the prompt's quality and **flags submissions
   that look AI‑generated** (advisory only).
5. **HR reviews** the application, résumé PDF, screening submission, scores, and an optional
   AI hiring recommendation, then makes the final decision. If auto‑shortlisting is on,
   applications are automatically **shortlisted or rejected** against the threshold.

---

## The candidate flow (MCP)

```
register_candidate → update_profile → submit_resume → check_eligibility
   ├─ ineligible → STOP (no screening, no application)
   └─ eligible   → start_screening → get_next_question → submit_answer(prompt) → …
                    → submit_application → get_application_status
```

Eligibility is enforced **server-side** (at `start_screening` and `submit_application`), so an
agent cannot skip it. One candidate can apply to many roles, but **only once per role**.

---

## Architecture

Three standalone modules:

| Module | Stack | Local port | Role |
|---|---|---|---|
| **`backend/`** | FastAPI · Supabase (Postgres) · Groq | `8010` | REST API, business logic, LLM evaluation, HR dashboard API, internal MCP API |
| **`frontend/`** | React 19 · Vite · TypeScript | `3000` | HR dashboard (roles, invites, candidates, applications, analytics) |
| **`mcp-server/`** | Python · FastMCP | `8001` (SSE) | Bridge exposing MCP tools to candidate AI agents |

```
Candidate's AI agent ──MCP──▶ mcp-server ──internal API (X-Internal-Api-Key)──▶ backend ──▶ Supabase
                                                                                   │
HR browser ──────────────────── frontend ──public API (Supabase JWT)──────────────┘         Groq (LLM)
```

- The **frontend** talks to the backend's public API using a Supabase JWT (obtained at login).
- The **mcp-server** talks to the backend's `/api/v1/internal/*` API using a shared internal API key.
- Each backend request is logged; sensitive candidate data lives only in the backend/Supabase.

---

## Tech stack

- **Backend:** FastAPI, `supabase-py`, Groq (`llama-3.3-70b-versatile`), `python-jose`, `structlog`, Pydantic v2. Optional Redis for rate limiting.
- **Frontend:** React 19, Vite, TypeScript, React Router, Zustand, Axios (+ cache interceptor), Recharts, Lucide icons. Custom **light, Apple-style** design system (white/black, glass-free).
- **MCP server:** FastMCP (stdio + SSE transports), httpx.
- **Data:** Supabase Postgres + Supabase Storage (`resumes` bucket, auto-created on first upload).

---

## Feature highlights

- **HR-defined eligibility gate** — deterministic checks (min experience computed from the
  candidate's structured experience, min education, required skills). No AI, fully transparent
  (each check reports required vs actual).
- **Prompt-based screening** — a "paste your AI prompt" exercise scored for prompt-engineering
  quality, with an **AI-generated flag** that lowers the score and is surfaced to HR (never
  auto-rejects — HR decides).
- **Auto shortlist / reject** — per-role score threshold with an on/off toggle.
- **Résumé upload → PDF viewer** — the agent submits the résumé as a base64 PDF; HR views it
  inline on the dashboard.
- **Invite tokens** — per role, **unlimited or limited** candidates, expiry, revoke, and delete
  (only revoked/expired/used invites can be deleted; active ones must be revoked first). Expiry,
  usage limits, and revocation are enforced at registration.
- **Roles** — full CRUD, screening questions, activate/deactivate, and hard-delete (blocked when
  the role has applications).
- **Dashboard** — real-time overview, pipeline + score-distribution charts, activity feed, a
  dedicated Analytics page, candidate profiles (profile/screening/files/activity), and an
  application review workflow with AI recommendation.

---

## MCP tools

| Tool | Purpose |
|---|---|
| `register_candidate(name, email, phone, invite_token)` | Register the candidate; returns `candidate_id`, `role_id`, and the **role** they're applying to. Must be called first. |
| `get_role_details(role_id)` | Role title, description, requirements, and eligibility rules. |
| `update_profile(candidate_id, summary, skills, experience, education)` | Fill in the candidate's details. |
| `submit_resume(candidate_id, file_base64, filename)` | Upload the résumé as a base64 PDF (≤ 5 MB). |
| `check_eligibility(candidate_id, role_id)` | Evaluate the profile against the role's rules → `eligible`, `reasons`, `checks`. |
| `start_screening(candidate_id, role_id)` | Start screening (blocked if ineligible). |
| `get_next_question(session_id)` | Fetch the next screening question. |
| `submit_answer(session_id, question_number, answer)` | Submit an answer; returns `score`, `feedback`, `ai_flag`. |
| `submit_application(candidate_id, role_id)` | File the application (auto shortlist/reject if enabled). |
| `get_application_status(candidate_id, role_id)` | Current status + overall score. |

The MCP server also ships **agent instructions**: everything is candidate-driven — the agent must
**not** scan the user's files or system, and must use only information the candidate explicitly
provides.

---

## Quick start (local)

**Prerequisites:** Python 3.10+, Node.js 18+, a Supabase project, and a Groq API key.
Redis is optional (rate limiting auto-disables without it). Windows users: see
[WINDOWS_SETUP.md](WINDOWS_SETUP.md).

Each module already contains a `.env` (or copy its `.env.example` and fill it in).

### 1. Backend → http://localhost:8010
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8010 --reload
```
API docs: http://localhost:8010/docs · Health: http://localhost:8010/health

> **Port note:** locally the backend runs on **8010** (the Vite dev proxy points there). The
> `BACKEND_PORT=8000` in `.env` is used by Docker/Railway.

### 2. Frontend → http://localhost:3000
```bash
cd frontend
npm install
npm run dev
```
Log in with your seeded HR user (see `backend/seed_hr_user.py`).

### 3. MCP server
Run it directly for an agent, or via the Inspector for testing (see below).
```bash
cd mcp-server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# SSE mode (for Cursor / remote clients) on http://localhost:8001/sse
MCP_TRANSPORT=sse PORT=8001 BACKEND_URL=http://localhost:8010 python server.py
```

---

## Environment variables

> These are described for reference — the repo already ships working `.env` files.

**`backend/.env`** — Supabase (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_JWT_SECRET`), `GROQ_API_KEY`, `GROQ_MODEL`, `MCP_INTERNAL_API_KEY`, `SECRET_KEY`,
`CORS_ORIGINS`, `REDIS_URL`, `RATE_LIMIT_PER_MINUTE`, `BACKEND_PORT`, `EMAILJS_*`.

**`mcp-server/.env`** — `BACKEND_URL` (the backend base URL, e.g. `http://localhost:8010` locally
or the deployed backend), `MCP_INTERNAL_API_KEY` (**must match** the backend), and optionally
`MCP_TRANSPORT` (`stdio` | `sse`), `PORT`, `HOST`.

**`frontend`** — optional `VITE_API_URL` (defaults to `/api/v1`, proxied to `localhost:8010` in dev).

---

## Connect an AI agent (Cursor / Claude Desktop)

The mcp-server supports two transports:

- **stdio** (default) — the client launches `server.py` itself. Simplest and most reliable.
- **SSE** — run `server.py` with `MCP_TRANSPORT=sse` (serves `http://<host>:<PORT>/sse`); the
  client connects by URL.

### Cursor
Edit `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project):

**stdio (recommended):**
```json
{
  "mcpServers": {
    "E2M-Hiring-Agent": {
      "command": "/absolute/path/to/mcp-server/.venv/bin/python",
      "args": ["/absolute/path/to/mcp-server/server.py"],
      "env": {
        "BACKEND_URL": "http://localhost:8010",
        "MCP_INTERNAL_API_KEY": "<your internal key>"
      }
    }
  }
}
```

**SSE** (run the server first: `MCP_TRANSPORT=sse PORT=8001 BACKEND_URL=http://localhost:8010 python server.py`):
```json
{
  "mcpServers": {
    "E2M-Hiring-Agent": { "type": "sse", "url": "http://localhost:8001/sse" }
  }
}
```

### Claude Desktop
Add the same **stdio** block to `claude_desktop_config.json`
(`~/Library/Application Support/Claude/` on macOS), then fully restart Claude Desktop.

> The `env` you set here overrides the server's `.env`, so you can point a local agent at your
> local backend without editing files.

Once connected, the candidate simply says:
> *"Here's my invite token: `<TOKEN>`. Please apply for me — I'll give you my details."*

---

## Testing with the MCP Inspector

A Node-based GUI to exercise the tools directly (no agent needed):
```bash
cd mcp-server
BACKEND_URL=http://localhost:8010 MCP_INTERNAL_API_KEY="<your key>" \
  npx @modelcontextprotocol/inspector .venv/bin/python server.py
```
Open the printed `http://localhost:6274/?MCP_PROXY_AUTH_TOKEN=…` URL and call the tools in order.

---

## Deployment

- **Frontend → Vercel.** SPA rewrites are configured in `frontend/vercel.json`. Set `VITE_API_URL`
  to your deployed backend's `/api/v1` if you're not using same-origin rewrites.
- **Backend → Railway (or any container host).** `backend/Dockerfile` runs
  `uvicorn app.main:app` on `$PORT`. Provide the backend env vars in the host's dashboard.
- **MCP server → Railway/Render.** `mcp-server/Dockerfile` sets `MCP_TRANSPORT=sse` and runs
  `server.py`; point `BACKEND_URL` at the deployed backend and reuse the same `MCP_INTERNAL_API_KEY`.
- **`docker-compose.yml`** brings up backend + mcp-server + redis + frontend for local containers.

No database migration is required for the current feature set — role configuration lives in the
existing `roles.screening_config` JSONB, and the `resumes` storage bucket is created automatically
on first upload.

---

## Security notes

- **Internal API** (`/api/v1/internal/*`) is protected by `MCP_INTERNAL_API_KEY`; only the
  mcp-server should hold it.
- **Invite tokens** are stored as SHA-256 hashes; expiry, usage limits, and revocation are enforced
  on registration.
- **Rate limiting** is Redis-backed and enabled when `REDIS_URL` points at a real Redis instance.
- **For production:** rotate `MCP_INTERNAL_API_KEY` and `SECRET_KEY` to strong random values and
  keep real secrets out of source control.
- **Known follow-up:** HR-dashboard Supabase JWTs currently fall back to unverified decoding when
  the (ES256) signature can't be checked with the configured secret. The candidate/MCP flow is
  unaffected (it uses the internal API key). Verifying ES256 via Supabase JWKS is the recommended
  next hardening step.

---

## Project structure

```
E2M-MCP-Agent-Hiring/
├── backend/       # FastAPI API, services, Supabase access, LLM  → see backend/README.md
├── frontend/      # React + Vite HR dashboard                    → see frontend/README.md
├── mcp-server/    # FastMCP server exposing candidate tools      → see mcp-server/README.md
├── docker-compose.yml
├── WINDOWS_SETUP.md
└── README.md
```

## License
MIT License.
