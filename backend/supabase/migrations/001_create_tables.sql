-- ==========================================
-- Supabase Schema for E2M Hiring MCP Agent
-- ==========================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- ENUMS
-- ==========================================

CREATE TYPE profile_status AS ENUM ('draft', 'complete');
CREATE TYPE application_status AS ENUM ('submitted', 'under_review', 'shortlisted', 'approved', 'rejected');
CREATE TYPE screening_status AS ENUM ('in_progress', 'completed', 'abandoned');
CREATE TYPE user_role AS ENUM ('admin', 'hr_manager', 'recruiter');

-- ==========================================
-- TABLES
-- ==========================================

-- HR Users (Dashboard Access)
CREATE TABLE hr_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'recruiter',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Roles (Job Positions)
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    requirements JSONB DEFAULT '[]'::jsonb,
    screening_config JSONB DEFAULT '{}'::jsonb,
    department TEXT,
    location TEXT,
    employment_type TEXT DEFAULT 'full_time',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES hr_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Role Screening Questions
CREATE TABLE role_questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    difficulty TEXT NOT NULL DEFAULT 'medium',
    order_index INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Candidates
CREATE TABLE candidates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    summary TEXT,
    skills JSONB DEFAULT '[]'::jsonb,
    experience JSONB DEFAULT '[]'::jsonb,
    education JSONB DEFAULT '[]'::jsonb,
    certifications JSONB DEFAULT '[]'::jsonb,
    social_links JSONB DEFAULT '{}'::jsonb,
    profile_status profile_status NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Access Tokens (Invites & Sessions)
CREATE TABLE access_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id UUID NOT NULL REFERENCES roles(id),
    candidate_id UUID REFERENCES candidates(id),
    token TEXT NOT NULL UNIQUE, -- SHA-256 hashed
    token_type TEXT NOT NULL, -- 'invite' or 'session'
    max_uses INT NOT NULL DEFAULT 1,
    use_count INT NOT NULL DEFAULT 0,
    is_used BOOLEAN NOT NULL DEFAULT false,
    is_revoked BOOLEAN NOT NULL DEFAULT false,
    expires_at TIMESTAMPTZ NOT NULL,
    created_by UUID REFERENCES hr_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Candidate Files (Resumes, Portfolios)
CREATE TABLE candidate_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    file_type TEXT NOT NULL, -- 'resume', 'portfolio'
    file_name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    mime_type TEXT,
    file_size INT,
    parsed_data JSONB DEFAULT '{}'::jsonb,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Screening Sessions
CREATE TABLE screening_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    status screening_status NOT NULL DEFAULT 'in_progress',
    total_score NUMERIC(4,2),
    total_questions INT NOT NULL DEFAULT 0,
    answered_questions INT NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    UNIQUE(candidate_id, role_id)
);

-- Screening Answers
CREATE TABLE screening_answers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES screening_sessions(id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    question_number INT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT,
    score NUMERIC(4,2),
    ai_feedback TEXT,
    evaluation_metadata JSONB DEFAULT '{}'::jsonb,
    answered_at TIMESTAMPTZ,
    UNIQUE(session_id, question_number)
);

-- Applications
CREATE TABLE applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    status application_status NOT NULL DEFAULT 'submitted',
    technical_score NUMERIC(4,2),
    profile_score NUMERIC(4,2),
    overall_score NUMERIC(4,2),
    ai_recommendation TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    reviewed_by UUID REFERENCES hr_users(id),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    UNIQUE(candidate_id, role_id)
);

-- Audit / Tool Logs
CREATE TABLE tool_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id UUID REFERENCES candidates(id) ON DELETE CASCADE,
    tool_name TEXT NOT NULL,
    request_payload JSONB,
    response_payload JSONB,
    status TEXT NOT NULL,
    duration_ms INT NOT NULL,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Conversations
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    speaker TEXT NOT NULL, -- 'ai' or 'candidate'
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Interviews
CREATE TABLE interviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    interviewer_id UUID NOT NULL REFERENCES hr_users(id),
    status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled, completed, cancelled
    scheduled_at TIMESTAMPTZ NOT NULL,
    meeting_link TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- ROW LEVEL SECURITY (RLS)
-- ==========================================
-- We will handle all DB operations through the backend using the service_role key.
-- Therefore, we don't strictly need complex RLS policies for external access.
-- However, we enable RLS and explicitly block public access for security.

ALTER TABLE hr_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE screening_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE screening_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;

-- Deny all access via the anonymous key
CREATE POLICY deny_all_anon ON hr_users FOR ALL TO anon USING (false);
-- (This can be repeated for all tables, or just rely on the fact that without policies, default is deny).
