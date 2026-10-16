import "server-only";
import type { Db } from "@/server/db/index";
import { verifyPassword, verifyPasswordDummy } from "./password";
import { createSession, type CreatedSession } from "./sessions";

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

export type LoginOutcome =
  | { ok: true; userId: number; username: string; fullName: string; session: CreatedSession }
  | { ok: false; reason: "invalid_credentials" | "locked" | "disabled" };

interface UserAuthRow {
  id: number;
  username: string;
  full_name: string;
  password_hash: string;
  is_active: number;
  failed_login_count: number;
  locked_until: string | null;
}

function lockMinutesRemaining(lockedUntil: string): number {
  const ms = Date.parse(lockedUntil) - Date.now();
  return ms > 0 ? Math.ceil(ms / 60_000) : 0;
}

/**
 * Username + password login. Locks the account for 15 minutes after 5
 * consecutive failures (REQUIREMENTS §7.3). Creates a session on success.
 */
export async function attemptLogin(
  db: Db,
  username: string,
  password: string,
): Promise<LoginOutcome> {
  const user = db
    .prepare(
      `SELECT id, username, full_name, password_hash, is_active,
              failed_login_count, locked_until
       FROM users WHERE lower(username) = lower(?)`,
    )
    .get(username.trim()) as UserAuthRow | undefined;

  if (!user) {
    await verifyPasswordDummy(password);
    return { ok: false, reason: "invalid_credentials" };
  }

  const now = new Date().toISOString();
  if (user.locked_until && lockMinutesRemaining(user.locked_until) > 0) {
    return { ok: false, reason: "locked" };
  }

  const passwordOk = await verifyPassword(password, user.password_hash);
  if (!passwordOk) {
    const count = user.failed_login_count + 1;
    const lockedUntil =
      count >= MAX_FAILED_LOGINS
        ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString()
        : null;
    db.prepare(
      `UPDATE users SET failed_login_count = ?, locked_until = ?, updated_at = ?
       WHERE id = ?`,
    ).run(lockedUntil ? 0 : count, lockedUntil, now, user.id);
    if (lockedUntil) return { ok: false, reason: "locked" };
    return { ok: false, reason: "invalid_credentials" };
  }

  if (user.is_active !== 1) {
    // Password was correct — clear any failure counter before refusing.
    db.prepare(
      `UPDATE users SET failed_login_count = 0, locked_until = NULL, updated_at = ?
       WHERE id = ?`,
    ).run(now, user.id);
    return { ok: false, reason: "disabled" };
  }

  db.prepare(
    `UPDATE users SET failed_login_count = 0, locked_until = NULL,
       last_login_at = ?, updated_at = ? WHERE id = ?`,
  ).run(now, now, user.id);

  const session = createSession(db, user.id);
  return {
    ok: true,
    userId: user.id,
    username: user.username,
    fullName: user.full_name,
    session,
  };
}
