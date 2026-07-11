# E2M Agentic Hiring Platform — Backend

FastAPI backend for the E2M Agentic Hiring Platform. It owns all business logic, data access
(Supabase/Postgres), LLM evaluation (Groq), the HR dashboard API, and the internal API the MCP
server uses to drive the candidate flow.

## Architecture

Layered:

- **Routers** (`app/api/v1/`) — HTTP endpoints, request validation, wiring.
- **Services** (`app/services/`) — business logic and Supabase access.
- **Core** (`app/core/`) — config, security, middleware, exceptions, logging, constants.
- **Entry point** (`app/main.py`) — app factory, middleware stack, CORS, WebSocket, health check.

Two authentication surfaces:

- **Public API** (dashboard) — Supabase JWT (`Authorization: Bearer <token>`), role-based access
  control (`admin` / `hr_manager` / `recruiter`).
- **Internal API** (`/api/v1/internal/*`, used only by the mcp-server) — shared secret header
  `X-Internal-Api-Key: <MCP_INTERNAL_API_KEY>`, enforced by middleware.

## The hiring flow (backend enforcement)

```
register → update_profile → submit_resume → check_eligibility
   → (eligible only) start_screening → get_next_question → submit_answer → submit_application → status
```

- **Eligibility** is deterministic, from HR-defined rules on the role (`screening_config.eligibility_rules`)
  and the candidate's structured profile — enforced at `start_screening` **and** `submit_application`.
- **Screening** delivers the role's questions (typically the "prompt" question). The prompt answer
  is scored for prompt quality and flagged if it looks AI-generated (`ai_flag`).
- **Applications** are unique per `(candidate, role)`. If auto-shortlisting is enabled, the app is
  set to `shortlisted`/`rejected` against the role's threshold on submit.

## Role configuration (`roles.screening_config` JSONB)

```json
{
  "eligibility_rules": {
    "min_experience_years": 1,
    "min_education": "master",           // any | high_school | associate | bachelor | master | phd
    "required_skills": ["Python", "LLMs"]
  },
  "prompt_question": "Build an X … paste the exact AI prompt you would use.",
  "scoring": { "auto_shortlist_enabled": true, "shortlist_threshold": 7.0 }
}
```

The `prompt_question` is also materialized as a `role_questions` row (`category='prompt'`) so it
flows through the normal screening machinery.

## Key services (`app/services/`)

| Service | Responsibility |
|---|---|
| `candidate_service.py` | Create/update/list candidates; profile completeness. |
| `eligibility_service.py` | Deterministic rule evaluation (experience/education/skills). |
| `resume_service.py` | base64 PDF decode + upload to Supabase Storage (`resumes`). |
| `storage_service.py` | Bucket management (auto-create), signed URLs. |
| `screening_service.py` | Sessions, questions, answers, scoring; eligibility gate. |
| `llm_service.py` | Groq calls: `evaluate_answer`, `evaluate_prompt` (+ AI flag), recommendation, résumé parse. |
| `application_service.py` | Submit (with dedup + eligibility + auto-status), review, AI recommendation. |
| `role_service.py` | Role CRUD, prompt-question sync, delete (blocked if applications exist). |
| `token_service.py` | Invite lifecycle: generate, validate, usage limits, revoke, delete. |
| `analytics_service.py` | Overview, pipeline, score distribution, activity. |

## API reference (selected)

### Internal API (mcp-server only — `X-Internal-Api-Key`)
| Method | Path | Purpose |
|---|---|---|
| POST | `/internal/candidates/register` | Register candidate from an invite token → returns role context. |
| GET | `/internal/roles/{role_id}` | Role details for the agent. |
| PUT | `/internal/candidates/{id}/profile` | Update profile. |
| POST | `/internal/candidates/{id}/resume` | Upload résumé (base64 PDF). |
| POST | `/internal/eligibility/check` | Evaluate eligibility. |
| POST | `/internal/screening/start` | Start screening (eligibility-gated). |
| POST | `/internal/screening/next-question` | Next question. |
| POST | `/internal/screening/submit-answer` | Submit + evaluate an answer. |
| POST | `/internal/applications/submit` | Submit application (auto-status). |
| GET | `/internal/applications/{candidate_id}/{role_id}/status` | Application status. |

### Public API (dashboard — Supabase JWT)
- `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`
- `GET/POST /roles/`, `GET/PATCH/DELETE /roles/{id}`, `POST /roles/{id}/toggle`,
  `GET/POST /roles/{id}/questions`, `DELETE /roles/questions/{id}`
- `GET /candidates/`, `GET /candidates/{id}`, `GET /candidates/{id}/screening|files|audit|conversations`
- `GET /applications/`, `GET /applications/{id}`, `POST /applications/{id}/review`, `POST /applications/{id}/recommendation`
- `GET/POST /invites/`, `GET /invites/stats`, `POST /invites/{id}/revoke`, `DELETE /invites/{id}`
- `GET /analytics/overview|pipeline|screening-scores|activity`
- `GET /health`, `GET /docs` (when `DEBUG=true`)

Full interactive docs are at `/docs` (Swagger) and `/redoc` when the server is running.

## Setup

**Prerequisites:** Python 3.10+, a Supabase project, a Groq API key. Redis optional.

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Environment variables (see `.env.example`):

- **Supabase:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (service-role key,
  required for admin access), `SUPABASE_JWT_SECRET`.
- **App:** `APP_NAME`, `API_VERSION`, `BACKEND_HOST`, `BACKEND_PORT`, `SECRET_KEY`, `CORS_ORIGINS`,
  `ENVIRONMENT`, `DEBUG`.
- **LLM:** `GROQ_API_KEY`, `GROQ_MODEL` (default `llama-3.3-70b-versatile`).
- **MCP:** `MCP_INTERNAL_API_KEY` (must match the mcp-server).
- **Redis / rate limit:** `REDIS_URL`, `RATE_LIMIT_PER_MINUTE`.
- **Email (optional):** `EMAILJS_*`.

Seed an HR user for dashboard login:
```bash
python seed_hr_user.py
```

## Running

```bash
python -m uvicorn app.main:app --host 0.0.0.0 --port 8010 --reload
```

- API: `http://localhost:8010` · Docs: `/docs` · Health: `/health`
- **Local port is 8010** (the frontend dev proxy targets it). `BACKEND_PORT=8000` is used by
  Docker/Railway, where the container runs on `$PORT`.

## Notes & behavior

- **No migration needed** for the current features — role config lives in `screening_config`
  (JSONB); the `resumes` Storage bucket is created automatically on first upload.
- **Redis-backed rate limiting** self-disables when `REDIS_URL` is the default
  `redis://localhost:6379/0`, so the backend runs without Redis in local dev.
- **Errors** map to structured JSON via custom exceptions (`400/403/404/409/422/429/500`), so MCP
  clients always get a clear message instead of a crash.

## Security

- Internal endpoints require the internal API key; public endpoints require a Supabase JWT + role.
- Invite tokens are SHA-256 hashed; lifecycle (expiry/limit/revoke) is enforced at registration.
- **Production:** rotate `MCP_INTERNAL_API_KEY` and `SECRET_KEY`; keep secrets out of source control.
- **Known limitation:** `SecurityService.verify_supabase_jwt` falls back to decoding ES256 tokens
  without signature verification when HS256 verification fails. Verifying ES256 via Supabase JWKS is
  the recommended next step (does not affect the internal/MCP flow).
