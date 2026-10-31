-- Migration: 0007_attendance.sql
-- Attendance/check-in (REQUIREMENTS 12).

CREATE TABLE attendance (
  id INTEGER PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id),
  checked_in_at TEXT NOT NULL,
  checked_out_at TEXT,
  method TEXT NOT NULL DEFAULT 'manual' CHECK (method IN ('manual','qr','other')),
  status TEXT NOT NULL DEFAULT 'allowed' CHECK (status IN ('allowed','overridden')),
  override_reason TEXT,
  notes TEXT,
  recorded_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE INDEX idx_attendance_member ON attendance(member_id);
CREATE INDEX idx_attendance_checked_in ON attendance(checked_in_at);
CREATE INDEX idx_attendance_member_checked_in ON attendance(member_id, checked_in_at);
