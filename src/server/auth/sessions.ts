import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { Db } from "@/server/db/index";

export const SESSION_COOKIE = "gms_session";
export const DEFAULT_TIMEOUT_MINUTES = 480;
// Skip the sliding-expiry write when the session was touched in the last
// minute, so static asset requests do not turn into SQLite writes.
const SLIDE_WRITE_INTERVAL_MS = 60_000;

function nowIso(): string {
  return new Date().toISOString();
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionTimeoutMinutes(db: Db): number {
  const row = db
    .prepare("SELECT value FROM app_settings WHERE key = 'session_timeout_minutes'")
    .get() as { value: string } | undefined;
  const n = row ? Number(row.value) : NaN;
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_TIMEOUT_MINUTES;
}

export interface CreatedSession {
  token: string;
  expiresAt: string;
}

export function createSession(db: Db, userId: number): CreatedSession {
  const token = randomBytes(32).toString("hex");
  const minutes = sessionTimeoutMinutes(db);
  const expiresAt = new Date(Date.now() + minutes * 60_000).toISOString();
  db.prepare(
    `INSERT INTO user_sessions (user_id, token_hash, expires_at)
     VALUES (?, ?, ?)`,
  ).run(userId, hashSessionToken(token), expiresAt);
  return { token, expiresAt };
}

export interface SessionRow {
  sessionId: number;
  userId: number;
}

/**
 * Validates a session token: not revoked, not expired, owner still active.
 * Slides the idle expiry forward (throttled) on every successful check.
 */
export function validateSession(db: Db, token: string | null): SessionRow | null {
  if (!token || token.length < 32) return null;
  const hash = hashSessionToken(token);
  const now = nowIso();
  const row = db
    .prepare(
      `SELECT s.id AS sessionId, s.user_id AS userId, s.expires_at AS expiresAt,
              s.last_seen_at AS lastSeenAt
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.revoked_at IS NULL AND u.is_active = 1`,
    )
    .get(hash) as
    | { sessionId: number; userId: number; expiresAt: string; lastSeenAt: string }
    | undefined;
  if (!row) return null;
  if (row.expiresAt <= now) return null;

  const lastSeen = Date.parse(row.lastSeenAt);
  if (!Number.isFinite(lastSeen) || Date.now() - lastSeen >= SLIDE_WRITE_INTERVAL_MS) {
    const minutes = sessionTimeoutMinutes(db);
    const nextExpiry = new Date(Date.now() + minutes * 60_000).toISOString();
    db.prepare(
      `UPDATE user_sessions
       SET last_seen_at = ?, expires_at = ?
       WHERE id = ? AND revoked_at IS NULL`,
    ).run(now, nextExpiry, row.sessionId);
  }
  return { sessionId: row.sessionId, userId: row.userId };
}

export function revokeSession(db: Db, token: string | null): boolean {
  if (!token) return false;
  const result = db
    .prepare(
      `UPDATE user_sessions SET revoked_at = ?
       WHERE token_hash = ? AND revoked_at IS NULL`,
    )
    .run(nowIso(), hashSessionToken(token));
  return result.changes > 0;
}

export function revokeAllUserSessions(db: Db, userId: number): number {
  const result = db
    .prepare(
      `UPDATE user_sessions SET revoked_at = ?
       WHERE user_id = ? AND revoked_at IS NULL`,
    )
    .run(nowIso(), userId);
  return result.changes;
}
