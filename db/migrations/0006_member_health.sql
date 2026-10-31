-- Migration: 0006_member_health.sql
-- Restricted injury/health notes (REQUIREMENTS 10.1, 10.4).
--
-- Health notes are sensitive: they are only visible and editable with the
-- `members.view_health` permission (Owner + Manager by default), are captured
-- together with an explicit consent flag, and are never included in list or
-- export payloads.

ALTER TABLE members ADD COLUMN health_notes TEXT;
ALTER TABLE members ADD COLUMN health_consent INTEGER NOT NULL DEFAULT 0
  CHECK (health_consent IN (0, 1));
