-- Phase 1 foundation: users, RBAC, sessions, settings, audit, idempotency.
-- Single-gym app: no gym_id (REQUIREMENTS §25.3 — branch isolation deferred
-- until multi-branch is explicitly approved).
--
-- Migrates Phase 0 key-value `settings` rows into typed `gym_settings`
-- (safe pre-release: v0.0.1, no real user data) and drops the old table.

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL,
  email TEXT,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_login_at TEXT,
  created_by INTEGER REFERENCES users (id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE UNIQUE INDEX users_username_lower ON users (lower(username));
CREATE UNIQUE INDEX users_email_lower ON users (email) WHERE email IS NOT NULL;

CREATE TABLE roles (
  id INTEGER PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_system INTEGER NOT NULL DEFAULT 1 CHECK (is_system IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE permissions (
  id INTEGER PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE role_permissions (
  role_id INTEGER NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (role_id, permission_id)
) STRICT;

CREATE TABLE user_roles (
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, role_id)
) STRICT;

CREATE TABLE user_sessions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL,
  revoked_at TEXT
) STRICT;

CREATE INDEX user_sessions_user ON user_sessions (user_id);
CREATE INDEX user_sessions_expires ON user_sessions (expires_at);

CREATE TABLE gym_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  gym_name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  currency_code TEXT NOT NULL DEFAULT 'PKR',
  currency_minor_units INTEGER NOT NULL DEFAULT 2 CHECK (currency_minor_units BETWEEN 0 AND 4),
  timezone TEXT NOT NULL DEFAULT 'Asia/Karachi',
  date_boundary TEXT NOT NULL DEFAULT 'midnight',
  financial_year_start_month INTEGER NOT NULL DEFAULT 1 CHECK (financial_year_start_month BETWEEN 1 AND 12),
  receipt_prefix TEXT NOT NULL DEFAULT 'RC',
  receipt_header TEXT,
  receipt_footer TEXT,
  logo_path TEXT,
  expiry_reminder_days_1 INTEGER NOT NULL DEFAULT 7,
  expiry_reminder_days_2 INTEGER NOT NULL DEFAULT 1,
  duplicate_checkin_window_minutes INTEGER NOT NULL DEFAULT 5,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
  action_key TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  app_version TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX audit_logs_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX audit_logs_created ON audit_logs (created_at);
CREATE INDEX audit_logs_user ON audit_logs (user_id);
CREATE INDEX audit_logs_action ON audit_logs (action_key);

-- Append-only through the application (DESIGN B9, REQUIREMENTS §23).
CREATE TRIGGER audit_logs_no_update
BEFORE UPDATE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs is append-only');
END;

CREATE TRIGGER audit_logs_no_delete
BEFORE DELETE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs is append-only');
END;

CREATE TABLE idempotency_keys (
  key TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id),
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE INDEX idempotency_keys_created ON idempotency_keys (created_at);

-- ---------------------------------------------------------------------------
-- Settings migration: Phase 0 key-value rows -> typed gym_settings.
-- ---------------------------------------------------------------------------
INSERT INTO gym_settings (gym_name, address, currency_code)
SELECT
  COALESCE((SELECT value FROM settings WHERE key = 'gym_name'), 'Empire Fitness'),
  (SELECT value FROM settings WHERE key = 'gym_address'),
  COALESCE((SELECT value FROM settings WHERE key = 'currency'), 'PKR');

INSERT INTO app_settings (key, value) VALUES ('session_timeout_minutes', '480');

DROP TABLE settings;

-- ---------------------------------------------------------------------------
-- Roles (REQ §7.1)
-- ---------------------------------------------------------------------------
INSERT INTO roles (key, name, is_system) VALUES
  ('owner', 'Owner / Administrator', 1),
  ('manager', 'Manager', 1),
  ('receptionist', 'Receptionist', 1),
  ('accountant', 'Accountant / Finance staff', 1),
  ('trainer', 'Trainer', 1),
  ('auditor', 'Read-only / Auditor', 1);

-- ---------------------------------------------------------------------------
-- Permission catalog (keys used by src/server/policies)
-- ---------------------------------------------------------------------------
INSERT INTO permissions (key, description) VALUES
  ('dashboard.view', 'View dashboard'),
  ('members.view', 'View members'),
  ('members.create', 'Create members'),
  ('members.update', 'Update members'),
  ('members.archive', 'Archive members'),
  ('members.export', 'Export member directory'),
  ('members.view_health', 'View restricted health/injury notes'),
  ('plans.view', 'View membership plans'),
  ('plans.manage', 'Create, edit, and deactivate membership plans'),
  ('memberships.view', 'View memberships'),
  ('memberships.sell', 'Sell new memberships'),
  ('memberships.renew', 'Renew memberships'),
  ('memberships.freeze', 'Freeze and unfreeze memberships'),
  ('memberships.extend', 'Extend membership end dates'),
  ('memberships.cancel', 'Cancel memberships'),
  ('memberships.suspend', 'Suspend and reactivate memberships'),
  ('attendance.view', 'View attendance'),
  ('attendance.record', 'Record check-ins'),
  ('attendance.override', 'Override check-in denials with a reason'),
  ('payments.view', 'View payments and balances'),
  ('payments.record', 'Record payments'),
  ('payments.refund', 'Record refunds and reversals'),
  ('payments.adjust', 'Record payment adjustments and write-offs'),
  ('expenses.view', 'View expenses'),
  ('expenses.record', 'Record expenses'),
  ('expenses.approve', 'Approve expenses'),
  ('reports.operational', 'View operational reports'),
  ('reports.financial', 'View financial reports'),
  ('reports.training', 'View training reports'),
  ('audit.view', 'View the audit log'),
  ('audit.view_financial', 'View financial audit entries'),
  ('settings.gym.update', 'View and update gym settings'),
  ('settings.users.manage', 'Manage user accounts'),
  ('settings.roles.manage', 'Manage roles and permissions'),
  ('settings.app.update', 'Update application settings'),
  ('backup.create', 'Create backups'),
  ('backup.restore', 'Restore backups'),
  ('staff.view', 'View staff directory'),
  ('staff.self_update', 'Update own profile and password');

-- ---------------------------------------------------------------------------
-- Default role grants (REQ §7.2 permissions matrix)
-- ---------------------------------------------------------------------------
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p WHERE r.key = 'owner';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
WHERE r.key = 'manager' AND p.key IN (
  'dashboard.view',
  'members.view', 'members.create', 'members.update', 'members.archive', 'members.view_health',
  'plans.view', 'plans.manage',
  'memberships.view', 'memberships.sell', 'memberships.renew', 'memberships.freeze',
  'memberships.extend', 'memberships.cancel', 'memberships.suspend',
  'attendance.view', 'attendance.record', 'attendance.override',
  'payments.view', 'payments.record', 'payments.refund', 'payments.adjust',
  'expenses.view', 'expenses.record', 'expenses.approve',
  'reports.operational', 'reports.financial',
  'audit.view_financial',
  'backup.create',
  'staff.view', 'staff.self_update'
);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
WHERE r.key = 'receptionist' AND p.key IN (
  'dashboard.view',
  'members.view', 'members.create', 'members.update',
  'plans.view',
  'memberships.view', 'memberships.sell', 'memberships.renew',
  'attendance.view', 'attendance.record',
  'payments.view', 'payments.record',
  'reports.operational',
  'staff.self_update'
);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
WHERE r.key = 'accountant' AND p.key IN (
  'dashboard.view',
  'members.view',
  'plans.view',
  'memberships.view',
  'attendance.view',
  'payments.view', 'payments.record', 'payments.refund', 'payments.adjust',
  'expenses.view', 'expenses.record',
  'reports.financial',
  'audit.view_financial',
  'staff.self_update'
);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
WHERE r.key = 'trainer' AND p.key IN (
  'dashboard.view',
  'members.view',
  'attendance.view',
  'reports.training',
  'staff.self_update'
);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
WHERE r.key = 'auditor' AND p.key IN (
  'dashboard.view',
  'members.view',
  'plans.view',
  'memberships.view',
  'attendance.view',
  'payments.view',
  'expenses.view',
  'reports.operational', 'reports.financial',
  'audit.view',
  'staff.self_update'
);
