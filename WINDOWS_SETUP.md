# Windows Setup Guide: E2M Agentic Hiring Platform

Running the platform on Windows is fully supported. This guide provides step-by-step instructions for getting the Backend, Frontend, and MCP Server running on a Windows environment using Command Prompt (`cmd`) or PowerShell.

## Prerequisites

1. **Python 3.10+**: Download from [python.org](https://www.python.org/downloads/windows/). During installation, ensure you check the box **"Add Python to PATH"**.
2. **Node.js (v18+)**: Download the Windows Installer from [nodejs.org](https://nodejs.org/).
3. **Git**: (Optional but recommended) [git-scm.com](https://git-scm.com/download/win).
4. **Claude Desktop**: Installed on your Windows machine to test the MCP server.

---

## 1. Backend Setup (FastAPI)

1. Open PowerShell or Command Prompt.
2. Navigate to the backend directory:
   ```cmd
   cd path\to\E2M-MCP-Agent-Hiring\backend
   ```
3. Create a Python virtual environment:
   ```cmd
   python -m venv .venv
   ```
4. Activate the virtual environment:
   - **Command Prompt (`cmd`)**:
     ```cmd
     .venv\Scripts\activate.bat
     ```
   - **PowerShell**:
     ```powershell
     .venv\Scripts\Activate.ps1
     ```
     *(Note: If you get an Execution Policy error in PowerShell, run `Set-ExecutionPolicy Unrestricted -Scope CurrentUser` as administrator first).*
5. Install dependencies:
   ```cmd
   pip install -r requirements.txt
   ```
6. Setup Environment Variables:
   Create a file named `.env` in the `backend` folder and add your configuration:
   ```env
   # API Settings
   PROJECT_NAME="E2M Agentic Hiring"
   API_VERSION="v1"
   ENVIRONMENT="development"
   DEBUG=True

   # Supabase Settings
   SUPABASE_URL="your-supabase-project-url"
   SUPABASE_KEY="your-supabase-service-role-key" 
   SUPABASE_JWT_SECRET="your-supabase-jwt-secret"

   # Internal Security
   INTERNAL_API_KEY="your-secure-internal-key"

   # AI Integrations
   GROQ_API_KEY="your-groq-api-key"
   ```
7. Start the server:
   ```cmd
   python -m uvicorn app.main:app --host 0.0.0.0 --port 8010 --reload
   ```

---

## 2. Frontend Setup (React/Vite)

1. Open a **new** PowerShell or Command Prompt window.
2. Navigate to the frontend directory:
   ```cmd
   cd path\to\E2M-MCP-Agent-Hiring\frontend
   ```
3. Install Node modules:
   ```cmd
   npm install
   ```
4. Setup Environment Variables:
   Create a file named `.env` in the `frontend` folder:
   ```env
   VITE_API_URL="http://localhost:8010/api/v1"
   ```
5. Start the development server:
   ```cmd
   npm run dev
   ```
6. Open your browser to `http://localhost:3000`.

---

## 3. MCP Server Setup

1. Open a **new** PowerShell or Command Prompt window.
2. Navigate to the mcp-server directory:
   ```cmd
   cd path\to\E2M-MCP-Agent-Hiring\mcp-server
   ```
3. Create and activate a virtual environment:
   ```cmd
   python -m venv .venv
   .venv\Scripts\activate
   ```
4. Install dependencies:
   ```cmd
   pip install -r requirements.txt
   ```
5. Setup Environment Variables:
   Create a `.env` file in the `mcp-server` folder:
   ```env
   INTERNAL_API_KEY="your-secure-internal-key"
   BACKEND_API_URL="http://localhost:8010/api/v1"
   ```

### Connecting to Claude Desktop (Windows)

To integrate the MCP server with Claude Desktop on Windows, you need to modify the Claude configuration file.

1. Press `Win + R`, type `%APPDATA%\Claude` and hit Enter.
2. Look for a file named `claude_desktop_config.json`. If it doesn't exist, create it.
3. Open the file in a text editor (like Notepad or VS Code) and add the following configuration. 
   
   **IMPORTANT**: You must use double backslashes `\\` for file paths in JSON on Windows.

   ```json
   {
     "mcpServers": {
       "e2m_hiring": {
         "command": "C:\\path\\to\\E2M-MCP-Agent-Hiring\\mcp-server\\.venv\\Scripts\\python.exe",
         "args": ["C:\\path\\to\\E2M-MCP-Agent-Hiring\\mcp-server\\server.py"],
         "env": {
           "INTERNAL_API_KEY": "your-secure-internal-key",
           "BACKEND_API_URL": "http://localhost:8010/api/v1"
         }
       }
     }
   }
   ```
   *(Replace `C:\\path\\to\\...` with the actual absolute path where you cloned the project).*

4. Fully quit Claude Desktop (right-click the icon in the system tray and select Quit) and restart it.
5. In Claude, look for the little plug/hammer icon next to the text input box to confirm tools are loaded. You can now give Claude your invitation token and ask it to apply!
