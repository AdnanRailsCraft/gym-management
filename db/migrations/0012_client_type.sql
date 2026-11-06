-- Migration: 0012_client_type.sql
-- Add client type (regular or PT) to members

ALTER TABLE members ADD COLUMN client_type TEXT NOT NULL DEFAULT 'regular' CHECK (client_type IN ('regular', 'pt'));

CREATE INDEX IF NOT EXISTS idx_members_client_type ON members (client_type);