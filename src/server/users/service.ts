import "server-only";
import type { Db } from "@/server/db/index";
import type { AuthzUser } from "@/server/policies/authorize";
import { hashPassword } from "@/server/auth/password";
import { revokeAllUserSessions } from "@/server/auth/sessions";
import { writeAudit } from "@/server/audit";
import { ROLE_KEYS, type RoleKey } from "@/server/policies/permissions";

export interface GymSettingsRow {
  id: number;
  gym_name: string;
  address: string | null;
  phone: string | null;
  currency_code: string;
  currency_minor_units: number;
  timezone: string;
  date_boundary: string;
  financial_year_start_month: number;
  receipt_prefix: string;
  receipt_header: string | null;
  receipt_footer: string | null;
  logo_path: string | null;
  expiry_reminder_days_1: number;
  expiry_reminder_days_2: number;
  duplicate_checkin_window_minutes: number;
  created_at: string;
  updated_at: string;
}

export function getGymSettings(db: Db): GymSettingsRow {
  const row = db.prepare("SELECT * FROM gym_settings WHERE id = 1").get() as
    | GymSettingsRow
    | undefined;
  if (!row) throw new Error("gym_settings row missing — run migrations");
  return row;
}

export interface GymSettingsInput {
  gymName: string;
  address: string | null;
  phone: string | null;
  currencyCode: string;
  timezone: string;
  receiptHeader: string | null;
  receiptFooter: string | null;
}

function publicSettings(row: GymSettingsRow) {
  return {
    gym_name: row.gym_name,
    address: row.address,
    phone: row.phone,
    currency_code: row.currency_code,
    timezone: row.timezone,
    receipt_header: row.receipt_header,
    receipt_footer: row.receipt_footer,
  };
}

export function updateGymSettings(
  db: Db,
  actor: AuthzUser,
  input: GymSettingsInput,
): GymSettingsRow {
  const before = getGymSettings(db);
  const now = new Date().toISOString();
  return db.transaction(() => {
    db.prepare(
      `UPDATE gym_settings SET gym_name = ?, address = ?, phone = ?,
         currency_code = ?, timezone = ?, receipt_header = ?, receipt_footer = ?,
         updated_at = ? WHERE id = 1`,
    ).run(
      input.gymName,
      input.address,
      input.phone,
      input.currencyCode,
      input.timezone,
      input.receiptHeader,
      input.receiptFooter,
      now,
    );
    const after = getGymSettings(db);
    writeAudit(db, {
      userId: actor.id,
      actionKey: "settings.gym.update",
      entityType: "gym_settings",
      entityId: 1,
      before: publicSettings(before),
      after: publicSettings(after),
    });
    return after;
  })();
}

export interface CreateUserInput {
  username: string;
  fullName: string;
  password: string;
  email: string | null;
  roleKeys: RoleKey[];
}

export interface UserListItem {
  id: number;
  username: string;
  fullName: string;
  email: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  roles: string[];
}

export function isRoleKey(value: string): value is RoleKey {
  return (ROLE_KEYS as readonly string[]).includes(value);
}

function assertRoleKeys(roleKeys: string[]): RoleKey[] {
  for (const key of roleKeys) {
    if (!isRoleKey(key)) throw new Error(`Unknown role: ${key}`);
  }
  return roleKeys as RoleKey[];
}

export function listUsers(db: Db): UserListItem[] {
  const rows = db
    .prepare(
      `SELECT id, username, full_name, email, is_active, last_login_at
       FROM users ORDER BY lower(username)`,
    )
    .all() as {
    id: number;
    username: string;
    full_name: string;
    email: string | null;
    is_active: number;
    last_login_at: string | null;
  }[];
  const roleStmt = db.prepare(
    `SELECT r.key FROM user_roles ur JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = ? ORDER BY r.key`,
  );
  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    fullName: r.full_name,
    email: r.email,
    isActive: r.is_active === 1,
    lastLoginAt: r.last_login_at,
    roles: (roleStmt.all(r.id) as { key: string }[]).map((x) => x.key),
  }));
}

export function userCount(db: Db): number {
  return (db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number }).c;
}

export function ownerExists(db: Db): boolean {
  const row = db
    .prepare(
      `SELECT 1 AS ok FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE r.key = 'owner' AND u.is_active = 1 LIMIT 1`,
    )
    .get();
  return row !== undefined;
}

// Password hashing is async (promisified scrypt), so hash first, then open
// one short synchronous transaction for the row writes (DESIGN B4).
export async function createUser(
  db: Db,
  actor: AuthzUser | null,
  input: CreateUserInput,
): Promise<number> {
  const passwordHash = await hashPassword(input.password);
  const roleKeys = assertRoleKeys(input.roleKeys);
  const now = new Date().toISOString();
  const userId = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO users (username, email, full_name, password_hash, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.username.trim(),
        input.email,
        input.fullName.trim(),
        passwordHash,
        actor?.id ?? null,
        now,
        now,
      );
    const id = Number(result.lastInsertRowid);
    assignRoles(db, id, roleKeys);
    writeAudit(db, {
      userId: actor?.id ?? null,
      actionKey: "user.create",
      entityType: "user",
      entityId: id,
      after: { username: input.username.trim(), full_name: input.fullName.trim(), email: input.email, roles: roleKeys },
    });
    return id;
  })();
  return userId;
}

export function assignRoles(db: Db, userId: number, roleKeys: RoleKey[]): void {
  const roleIds = db
    .prepare(
      `SELECT id, key FROM roles WHERE key IN (${roleKeys.map(() => "?").join(",")})`,
    )
    .all(...roleKeys) as { id: number; key: string }[];
  if (roleIds.length !== new Set(roleKeys).size) {
    throw new Error("One or more roles do not exist");
  }
  const insert = db.prepare(
    "INSERT INTO user_roles (user_id, role_id, created_at) VALUES (?, ?, ?)",
  );
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare("DELETE FROM user_roles WHERE user_id = ?").run(userId);
    for (const role of roleIds) insert.run(userId, role.id, now);
  })();
}

function activeOwnerCountExcept(db: Db, excludeUserId: number): number {
  return (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON r.id = ur.role_id
         WHERE r.key = 'owner' AND u.is_active = 1 AND u.id != ?`,
      )
      .get(excludeUserId) as { c: number }
  ).c;
}

export function setUserActive(
  db: Db,
  actor: AuthzUser,
  userId: number,
  isActive: boolean,
): void {
  if (userId === actor.id) throw new Error("Cannot deactivate your own account");
  const before = db
    .prepare("SELECT id, is_active FROM users WHERE id = ?")
    .get(userId) as { id: number; is_active: number } | undefined;
  if (!before) throw new Error("User not found");
  if (!isActive) {
    const hasOwner = db
      .prepare(
        `SELECT 1 AS ok FROM user_roles ur JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = ? AND r.key = 'owner' LIMIT 1`,
      )
      .get(userId);
    if (hasOwner && activeOwnerCountExcept(db, userId) === 0) {
      throw new Error("Cannot deactivate the last active owner");
    }
  }
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare("UPDATE users SET is_active = ?, updated_at = ? WHERE id = ?").run(
      isActive ? 1 : 0,
      now,
      userId,
    );
    if (!isActive) revokeAllUserSessions(db, userId);
    writeAudit(db, {
      userId: actor.id,
      actionKey: isActive ? "user.reactivate" : "user.deactivate",
      entityType: "user",
      entityId: userId,
      before: { is_active: before.is_active === 1 },
      after: { is_active: isActive },
    });
  })();
}

export async function resetUserPassword(
  db: Db,
  actor: AuthzUser,
  userId: number,
  newPassword: string,
): Promise<void> {
  const passwordHash = await hashPassword(newPassword);
  const now = new Date().toISOString();
  db.transaction(() => {
    const result = db
      .prepare(
        `UPDATE users SET password_hash = ?, failed_login_count = 0,
           locked_until = NULL, updated_at = ? WHERE id = ?`,
      )
      .run(passwordHash, now, userId);
    if (result.changes === 0) throw new Error("User not found");
    revokeAllUserSessions(db, userId);
    writeAudit(db, {
      userId: actor.id,
      actionKey: "user.password_reset",
      entityType: "user",
      entityId: userId,
    });
  })();
}

export function updateUserRoles(
  db: Db,
  actor: AuthzUser,
  userId: number,
  roleKeys: string[],
): void {
  const keys = assertRoleKeys(roleKeys);
  if (keys.length === 0) throw new Error("At least one role is required");
  const before = db
    .prepare(
      `SELECT r.key FROM user_roles ur JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = ? ORDER BY r.key`,
    )
    .all(userId) as { key: string }[];
  const hadOwner = before.some((r) => r.key === "owner");
  if (hadOwner && !keys.includes("owner")) {
    if (activeOwnerCountExcept(db, userId) === 0) {
      throw new Error("Cannot remove the last active owner role");
    }
  }
  db.transaction(() => {
    assignRoles(db, userId, keys);
    writeAudit(db, {
      userId: actor.id,
      actionKey: "user.roles_update",
      entityType: "user",
      entityId: userId,
      before: { roles: before.map((r) => r.key) },
      after: { roles: keys },
    });
  })();
}
