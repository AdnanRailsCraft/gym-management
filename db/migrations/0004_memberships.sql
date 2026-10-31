-- Migration: 0004_memberships.sql
-- Phase 2: real client management + membership subscriptions.
--
-- Replaces the placeholder design from 0003 where plan, dates, and fee lived
-- directly on the member row. Members become profile-only; plans and
-- memberships get their own tables so history, freezes, and lifecycle actions
-- are preserved and audited (REQUIREMENTS 10-11, DESIGN B5).
--
-- Legacy note: pre-0004 members.fee_amount was a whole-currency amount (the old
-- form defaulted to 3000). This migration assumes the default 2 minor units and
-- multiplies legacy values by 100 when backfilling memberships. Pre-0004 rows
-- carry no released data (version 0.0.1), so this only affects dev databases.

-- ---------------------------------------------------------------------------
-- 1. Capture legacy per-member subscription data before rebuilding members.
-- ---------------------------------------------------------------------------
CREATE TABLE _legacy_member_membership AS
SELECT id, plan_name, start_date, end_date, fee_amount, status
FROM members;

-- ---------------------------------------------------------------------------
-- 2. Rebuild members as profile-only. Member status is separate from the
--    computed membership state (REQUIREMENTS 10.3):
--    Active, Inactive, Suspended, Archived. 'expired' is no longer a member
--    status — it is a computed membership state.
-- ---------------------------------------------------------------------------
CREATE TABLE members_new (
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
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'suspended', 'archived')),
  notes TEXT,
  joined_on TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d', 'now')),
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

INSERT INTO members_new (
  id, member_number, full_name, phone, email, gender, date_of_birth, address,
  emergency_contact_name, emergency_contact_phone, status, notes, joined_on,
  archived_at, created_at, updated_at
)
SELECT
  id, member_number, full_name, phone, email, gender, date_of_birth, address,
  emergency_contact_name, emergency_contact_phone,
  CASE status
    WHEN 'inactive' THEN 'inactive'
    WHEN 'archived' THEN 'archived'
    ELSE 'active'
  END,
  notes,
  COALESCE(start_date, substr(created_at, 1, 10)),
  CASE WHEN status = 'archived' THEN updated_at ELSE NULL END,
  created_at, updated_at
FROM members;

DROP TABLE members;
ALTER TABLE members_new RENAME TO members;

CREATE INDEX idx_members_status ON members (status);
CREATE INDEX idx_members_phone ON members (phone);
CREATE INDEX idx_members_name ON members (lower(full_name));
CREATE INDEX idx_members_email ON members (lower(email));

-- ---------------------------------------------------------------------------
-- 3. Membership plans (REQUIREMENTS 11.1). All prices are integer minor units.
-- ---------------------------------------------------------------------------
CREATE TABLE membership_plans (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  duration_value INTEGER NOT NULL CHECK (duration_value > 0),
  duration_unit TEXT NOT NULL CHECK (duration_unit IN ('days', 'months')),
  price_minor INTEGER NOT NULL DEFAULT 0 CHECK (price_minor >= 0),
  joining_fee_minor INTEGER NOT NULL DEFAULT 0 CHECK (joining_fee_minor >= 0),
  grace_days INTEGER NOT NULL DEFAULT 0 CHECK (grace_days >= 0),
  freeze_allowed INTEGER NOT NULL DEFAULT 1 CHECK (freeze_allowed IN (0, 1)),
  max_freeze_days INTEGER
    CHECK (max_freeze_days IS NULL OR max_freeze_days >= 0),
  visit_limit INTEGER CHECK (visit_limit IS NULL OR visit_limit > 0),
  sellable_to_new_members INTEGER NOT NULL DEFAULT 1
    CHECK (sellable_to_new_members IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

-- Starter templates (REQUIREMENTS 11.1). Prices are editable placeholders and
-- must never be treated as fixed business rules.
INSERT OR IGNORE INTO membership_plans
  (name, description, duration_value, duration_unit, price_minor,
   joining_fee_minor, grace_days, freeze_allowed, max_freeze_days,
   sellable_to_new_members, is_active)
VALUES
  ('Daily', 'Single-day access', 1, 'days', 50000, 0, 0, 0, NULL, 1, 1),
  ('Weekly', 'Seven-day pass', 7, 'days', 150000, 0, 0, 0, NULL, 1, 1),
  ('Monthly', 'One calendar month', 1, 'months', 300000, 0, 3, 1, 30, 1, 1),
  ('Quarterly', 'Three calendar months', 3, 'months', 800000, 0, 3, 1, 60, 1, 1),
  ('Half-Yearly', 'Six calendar months', 6, 'months', 1500000, 0, 7, 1, 90, 1, 1),
  ('Annual', 'Twelve calendar months', 12, 'months', 2800000, 0, 7, 1, 120, 1, 1);

-- Legacy plan names that do not match a template get their own plan so the
-- backfilled memberships keep a real plan reference.
INSERT OR IGNORE INTO membership_plans
  (name, description, duration_value, duration_unit, price_minor, is_active)
SELECT DISTINCT
  plan_name,
  'Imported from pre-0004 member data',
  CASE lower(trim(plan_name))
    WHEN 'daily' THEN 1
    WHEN 'weekly' THEN 7
    WHEN 'monthly' THEN 1
    WHEN '3 months' THEN 3
    WHEN 'quarterly' THEN 3
    WHEN '6 months' THEN 6
    WHEN 'half-yearly' THEN 6
    WHEN 'annual' THEN 12
    WHEN 'annual (1 year)' THEN 12
    ELSE 1
  END,
  CASE lower(trim(plan_name))
    WHEN 'daily' THEN 'days'
    WHEN 'weekly' THEN 'days'
    ELSE 'months'
  END,
  0, 1
FROM _legacy_member_membership
WHERE plan_name IS NOT NULL AND trim(plan_name) <> '';

-- ---------------------------------------------------------------------------
-- 4. Memberships: subscription records with a lifecycle status. Expiry is
--    computed from dates at read time (DESIGN B5); never trust a stale column.
-- ---------------------------------------------------------------------------
CREATE TABLE memberships (
  id INTEGER PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members (id),
  plan_id INTEGER NOT NULL REFERENCES membership_plans (id),
  start_on TEXT NOT NULL
    CHECK (start_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  end_on TEXT NOT NULL
    CHECK (end_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  lifecycle_status TEXT NOT NULL DEFAULT 'active'
    CHECK (lifecycle_status IN ('scheduled', 'active', 'cancelled', 'suspended')),
  price_minor INTEGER NOT NULL DEFAULT 0 CHECK (price_minor >= 0),
  joining_fee_minor INTEGER NOT NULL DEFAULT 0 CHECK (joining_fee_minor >= 0),
  discount_minor INTEGER NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  discount_reason TEXT,
  notes TEXT,
  idempotency_key TEXT,
  created_by INTEGER REFERENCES users (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (end_on >= start_on)
) STRICT;

CREATE UNIQUE INDEX idx_memberships_idempotency
  ON memberships (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_memberships_member ON memberships (member_id);
CREATE INDEX idx_memberships_plan ON memberships (plan_id);
CREATE INDEX idx_memberships_end ON memberships (end_on);

-- Freeze periods. Freezing pushes end_on out by the frozen days; ending a
-- freeze early trims the unused days back off (see src/server/members).
CREATE TABLE membership_freezes (
  id INTEGER PRIMARY KEY,
  membership_id INTEGER NOT NULL REFERENCES memberships (id),
  from_on TEXT NOT NULL
    CHECK (from_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  to_on TEXT NOT NULL
    CHECK (to_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  days INTEGER NOT NULL CHECK (days > 0),
  reason TEXT NOT NULL,
  created_by INTEGER REFERENCES users (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (to_on >= from_on)
) STRICT;

CREATE INDEX idx_membership_freezes_membership
  ON membership_freezes (membership_id);

-- ---------------------------------------------------------------------------
-- 5. Backfill one membership per legacy member row.
-- ---------------------------------------------------------------------------
INSERT INTO memberships
  (member_id, plan_id, start_on, end_on, lifecycle_status, price_minor,
   joining_fee_minor, notes)
SELECT
  lmm.id,
  p.id,
  lmm.start_date,
  lmm.end_date,
  CASE lmm.status WHEN 'archived' THEN 'cancelled' ELSE 'active' END,
  COALESCE(lmm.fee_amount, 0) * 100,
  0,
  'Imported from pre-0004 member record'
FROM _legacy_member_membership lmm
JOIN membership_plans p ON p.name = lmm.plan_name
WHERE lmm.start_date IS NOT NULL AND lmm.end_date IS NOT NULL;

DROP TABLE _legacy_member_membership;
