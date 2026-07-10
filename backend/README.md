# E2M Agentic Hiring Platform - Backend

This is the FastAPI backend for the E2M Agentic Hiring Platform. It provides a robust, asynchronous REST API for managing the entire hiring lifecycle, from role creation to AI-driven candidate screening.

## Architecture

The backend follows a layered architecture pattern:
- **Routers (`app/api/`)**: Handle HTTP requests, input validation, and routing.
- **Services (`app/services/`)**: Contain core business logic and database interactions.
- **Schemas (`app/schemas/`)**: Pydantic models for data validation and serialization.
- **Core (`app/core/`)**: Configuration, middleware, security, and logging.

The database used is **Supabase (PostgreSQL)**, accessed via the `supabase-py` client.

## Core Features

- **Role & Invitation Management**: Create hiring roles and generate secure, one-time or multi-use invitation tokens.
- **Agentic Interactions**: Endpoints specifically designed for the MCP (Model Context Protocol) server to register candidates, update profiles, and conduct screenings autonomously.
- **AI-Powered Screening**: Evaluates candidate answers using Groq's LLM API to provide real-time scoring and feedback during the interview.
- **Application Review**: Comprehensive endpoints for HR teams to review candidate applications, view screening scores, and generate AI hiring recommendations.
- **Analytics**: Real-time statistics on pipeline activity, scores, and active roles.

## Project Structure

```text
backend/
├── app/
│   ├── api/          # API endpoints (v1)
│   ├── core/         # Config, security, middleware
│   ├── schemas/      # Pydantic models
│   ├── services/     # Business logic
│   └── main.py       # FastAPI application entry point
├── requirements.txt  # Python dependencies
└── .env              # Environment variables
```

## Setup & Installation

### Prerequisites
- Python 3.10+
- A Supabase project
- A Groq API Key

### Installation

1. Navigate to the backend directory:
   ```bash
   cd backend
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
   Create a `.env` file in the `backend/` directory:
   ```env
   # API Settings
   PROJECT_NAME="E2M Agentic Hiring"
   API_VERSION="v1"
   ENVIRONMENT="development"
   DEBUG=True

   # Supabase Settings
   SUPABASE_URL="your-supabase-project-url"
   SUPABASE_KEY="your-supabase-service-role-key"  # Must be service_role key for admin access
   SUPABASE_JWT_SECRET="your-supabase-jwt-secret"

   # Internal Security
   INTERNAL_API_KEY="your-secure-internal-key"

   # AI Integrations
   GROQ_API_KEY="your-groq-api-key"
   ```

## Running the Server

Start the development server with Uvicorn:

```bash
python -m uvicorn app.main:app --host 0.0.0.0 --port 8010 --reload
```

The API will be available at `http://localhost:8010`.

## API Documentation

FastAPI automatically generates interactive API documentation. Once the server is running, you can access:
- **Swagger UI**: `http://localhost:8010/docs`
- **ReDoc**: `http://localhost:8010/redoc`

## Security

- **Public Endpoints**: Uses JWT Bearer token authentication validated against Supabase.
- **Internal Endpoints** (`/api/v1/internal/*`): Protected by the `INTERNAL_API_KEY`. These endpoints are used exclusively by the MCP server for agentic operations.
