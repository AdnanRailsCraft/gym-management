-- Migration: 0008_membership_reminders.sql
-- Expiry-reminder log (REQUIREMENTS 11: follow up before a subscription lapses).
-- Reminders are append-only: nothing is deleted, each entry records who sent
-- what and when, and the member page/reminders list can show the last contact.

CREATE TABLE membership_reminders (
  id INTEGER PRIMARY KEY,
  membership_id INTEGER NOT NULL REFERENCES memberships(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp','sms','call','in_person','other')),
  message TEXT NOT NULL,
  sent_by INTEGER REFERENCES users(id),
  sent_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE INDEX idx_reminders_membership ON membership_reminders(membership_id, sent_at);
CREATE INDEX idx_reminders_member ON membership_reminders(member_id, sent_at);
