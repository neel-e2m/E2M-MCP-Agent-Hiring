# E2M Agentic Hiring Platform - Frontend

This is the React frontend for the E2M Agentic Hiring Platform. It provides a rich, modern, glassmorphic UI for HR teams and recruiters to manage roles, invite candidates, review AI-screened applications, and monitor their hiring pipeline.

## Tech Stack

- **Framework**: React 18 with Vite
- **Language**: TypeScript
- **Styling**: Vanilla CSS Modules with a custom Glassmorphism design system
- **Routing**: React Router DOM
- **State Management**: Zustand
- **HTTP Client**: Axios (configured with interceptors for auth)
- **Icons**: Lucide React

## Core Features

- **Dashboard**: Real-time analytics, pipeline funnel visualization, and recent activity feed.
- **Roles Management**: Full CRUD operations for open positions, including managing role-specific screening questions.
- **Invitations System**: Generate secure, single-use or multi-use tokens for candidates to use with their AI agents. Includes token revocation capabilities.
- **Application Review**: Comprehensive review workflow for applications submitted by AI agents. Includes automated AI hiring recommendations based on candidate profiles and screening scores.
- **Candidate Profiles**: Detailed views of candidate summaries, skills, experience, and full audit logs of their AI screening interviews.

## Project Structure

```text
frontend/
├── src/
│   ├── components/
│   │   ├── layout/    # Sidebar, Topbar, Layout wrappers
│   │   └── ui/        # Reusable design system components (Modal, Button, Card, etc.)
│   ├── lib/           # Utilities and API client configuration
│   ├── pages/         # Main route components (Dashboard, Roles, etc.)
│   ├── store/         # Zustand global state (authStore)
│   ├── App.tsx        # Main application router
│   └── main.tsx       # React DOM entry point
├── package.json
└── vite.config.ts
```

## Setup & Installation

### Prerequisites
- Node.js (v18+)
- npm or yarn

### Installation

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure Environment Variables:
   Create a `.env` file in the `frontend/` directory:
   ```env
   VITE_API_URL="http://localhost:8010/api/v1"
   ```

## Running the Application

Start the Vite development server:

```bash
npm run dev
```

The application will be available at `http://localhost:3000`.

## Design System

The application utilizes a custom-built glassmorphism design system. 
- **Global Tokens**: Defined in `index.css` (e.g., `--glass-bg`, `--accent-primary`).
- **CSS Modules**: Each component and page has its own scoped `.module.css` file to prevent style leakage.
- **UI Components**: Available in `src/components/ui/`. When building new features, always prefer reusing existing components like `Card`, `Modal`, `Button`, `Input`, and `Tabs`.
