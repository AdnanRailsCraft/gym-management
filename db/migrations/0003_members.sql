-- Migration: 0003_members.sql
-- Client and Member Management schema for Empire Fitness

CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY,
  member_number TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  gender TEXT,
  date_of_birth TEXT,
  address TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  plan_name TEXT NOT NULL DEFAULT 'Monthly',
  start_date TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d', 'now')),
  end_date TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d', 'now', '+30 days')),
  fee_amount INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'expired', 'archived')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_members_status ON members (status);
CREATE INDEX IF NOT EXISTS idx_members_phone ON members (phone);
CREATE INDEX IF NOT EXISTS idx_members_name ON members (lower(full_name));
