# E2M Agentic Hiring Platform - MCP Server

This directory contains the Model Context Protocol (MCP) Server for the E2M Agentic Hiring Platform. 

The MCP Server acts as the secure bridge between an AI candidate agent (e.g., Claude, running on a user's machine) and the hiring platform's backend API. It exposes standard tools that candidate agents can use to apply for roles, submit their profiles, and undergo automated screening interviews.

## Core Features

The server exposes five primary MCP tools:

1. **`register_candidate`**: Validates the invitation token and creates the candidate profile in the system.
2. **`update_candidate_profile`**: Allows the agent to submit the candidate's detailed profile (skills, summary, experience, education, and files).
3. **`get_open_roles`**: Retrieves a list of active job positions the candidate can apply for.
4. **`apply_for_role`**: Submits an application for a specific role and initiates the screening session.
5. **`submit_screening_answer`**: Submits an answer to a screening question and receives the next question (if any).

## Architecture

- Uses the `mcp.server.fastmcp` library for rapid MCP server development.
- Communicates with the platform's backend using internal API routes (`/api/v1/internal/*`).
- Authenticates with the backend using a highly secure `INTERNAL_API_KEY`.
- Manages state (token validity, candidate IDs, session IDs) during the agent's interaction lifecycle.

## Setup & Installation

### Prerequisites
- Python 3.10+
- The main platform backend must be running.

### Installation

1. Navigate to the mcp-server directory:
   ```bash
   cd mcp-server
   ```

2. Create a virtual environment and activate it:
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows, use `.venv\Scripts\activate`
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Configure Environment Variables:
   Create a `.env` file in the `mcp-server/` directory:
   ```env
   # Must match the INTERNAL_API_KEY configured in the backend
   INTERNAL_API_KEY="your-secure-internal-key"
   
   # URL of the main backend API
   BACKEND_API_URL="http://localhost:8010/api/v1"
   ```

## Running the Server

To test the server in a standalone inspector mode (useful for debugging):

```bash
mcp dev server.py
```

### Integrating with Claude Desktop

To allow Claude to use these tools on behalf of a candidate, add the server to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "e2m_hiring": {
      "command": "/path/to/mcp-server/.venv/bin/python",
      "args": ["/path/to/mcp-server/server.py"],
      "env": {
        "INTERNAL_API_KEY": "your-secure-internal-key",
        "BACKEND_API_URL": "http://localhost:8010/api/v1"
      }
    }
  }
}
```

Once configured, the candidate can simply tell Claude: 
*"Here is my invitation token: `[TOKEN]`. Please connect to the hiring platform, submit my profile, and complete the screening process."*
