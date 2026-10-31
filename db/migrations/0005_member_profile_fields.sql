-- Migration: 0005_member_profile_fields.sql
-- Phase 2 addendum: optional registration fields listed in REQUIREMENTS 10.1
-- that are safe to store without special handling.
--
-- Deliberately NOT included: injury/health notes. Those require restricted
-- access, explicit consent, and a visible privacy warning, so they belong in a
-- dedicated change rather than being tacked onto the profile form. Member
-- photos also stay out until attachment storage exists.

ALTER TABLE members ADD COLUMN referral_source TEXT;
ALTER TABLE members ADD COLUMN fitness_goals TEXT;
ALTER TABLE members ADD COLUMN marketing_consent INTEGER NOT NULL DEFAULT 0
  CHECK (marketing_consent IN (0, 1));
