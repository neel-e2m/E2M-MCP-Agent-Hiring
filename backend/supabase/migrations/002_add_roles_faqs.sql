-- Add FAQs JSONB column used by the HR dashboard and MCP get_role_faqs tool.
-- Safe to run on existing production DBs (IF NOT EXISTS).

ALTER TABLE roles
ADD COLUMN IF NOT EXISTS faqs JSONB NOT NULL DEFAULT '[]'::jsonb;
