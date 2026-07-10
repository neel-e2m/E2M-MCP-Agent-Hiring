# E2M Agentic Hiring Platform

Welcome to the **E2M Agentic Hiring Platform**, a cutting-edge HR solution that leverages the Model Context Protocol (MCP) to conduct fully autonomous, agent-to-agent candidate screening and hiring.

Instead of candidates filling out tedious web forms and manually taking assessments, HR teams can generate a secure token and send it to the candidate. The candidate then hands the token to their personal AI agent (e.g., Claude Desktop). The AI agent connects to the platform, submits the candidate's profile, and autonomously engages in a technical or behavioral screening interview, evaluated in real-time by a backend LLM.

## Project Architecture

The platform is composed of three standalone modules, each with its own responsibilities:

1. **`backend/` (FastAPI & Supabase)**
   - The core REST API that handles data persistence, business logic, authentication, and LLM evaluations (via Groq).
   - Serves the frontend web app for HR users.
   - Provides internal secure endpoints for the MCP Server.
   - *See `backend/README.md` for details.*

2. **`frontend/` (React, Vite, TypeScript)**
   - A modern, glassmorphic web application for HR teams and recruiters.
   - Used to create roles, generate candidate invitation tokens, view real-time analytics, and review AI hiring recommendations.
   - *See `frontend/README.md` for details.*

3. **`mcp-server/` (Python FastMCP)**
   - The secure bridge between candidate AI agents (like Claude) and the backend.
   - Exposes standard MCP tools (`register_candidate`, `apply_for_role`, `submit_screening_answer`) that an AI agent can execute to navigate the application process.
   - *See `mcp-server/README.md` for details.*

## Workflow Overview

1. **Role Creation**: HR logs into the Frontend, creates a new "Software Engineer" role, and defines screening questions (e.g., "Explain few-shot prompting").
2. **Invitation**: HR generates an Invitation Token and sends it to the candidate.
3. **Agent Setup**: The candidate configures their local Claude Desktop with the `mcp-server` integration.
4. **Autonomous Application**: 
   - Candidate tells Claude: *"Apply for the job using this token: xyz123."*
   - Claude uses MCP tools to securely register the candidate, upload their resume/skills, and fetch open roles.
   - Claude applies for the "Software Engineer" role.
5. **Interactive Screening**: 
   - The Backend returns the first screening question.
   - Claude answers on behalf of the candidate based on context provided.
   - The Backend uses an LLM (Groq) to evaluate the answer in real-time, assigning a score and feedback.
   - The process repeats until all questions are answered.
6. **HR Review**: HR views the completed application in the Frontend, reviews the AI-generated scores, reads the AI Hiring Recommendation, and makes a final decision.

## Quick Start (Mac/Linux)

For Windows users, please refer to the dedicated [Windows Setup Guide](WINDOWS_SETUP.md).

### 1. Database & Environment Setup
Ensure you have a Supabase project created. You will need the URL, Service Role Key, and JWT Secret. You will also need a Groq API Key.

Create `.env` files in all three directories based on the instructions in their respective READMEs.

### 2. Run the Backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8010
```

### 3. Run the Frontend
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:3000` in your browser.

### 4. Setup the MCP Server
```bash
cd mcp-server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```
To connect it to Claude, edit your `claude_desktop_config.json` (usually located at `~/Library/Application Support/Claude/claude_desktop_config.json` on Mac) and add the server configuration as detailed in `mcp-server/README.md`.

## License
MIT License.
