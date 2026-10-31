import { afterEach, describe, expect, it } from "vitest";
import { cleanupTestDbs, makeTestDb } from "./helpers/db";
import {
  createSession,
  revokeAllUserSessions,
  revokeSession,
  validateSession,
} from "@/server/auth/sessions";

afterEach(cleanupTestDbs);

async function seedUser(db: ReturnType<typeof import("@/server/db").openDb>, active = 1) {
  const result = db
    .prepare(
      `INSERT INTO users (username, full_name, password_hash, is_active)
       VALUES ('alice', 'Alice', 'x', ?)`,
    )
    .run(active);
  return Number(result.lastInsertRowid);
}

describe("sessions", () => {
  it("creates and validates a session", async () => {
    const { db } = await makeTestDb();
    const userId = await seedUser(db);
    const { token } = createSession(db, userId);
    const session = validateSession(db, token);
    expect(session).not.toBeNull();
    expect(session?.userId).toBe(userId);
  });

  it("rejects unknown or short tokens", async () => {
    const { db } = await makeTestDb();
    await seedUser(db);
    expect(validateSession(db, null)).toBeNull();
    expect(validateSession(db, "short")).toBeNull();
    expect(validateSession(db, "f".repeat(64))).toBeNull();
  });

  it("rejects revoked sessions", async () => {
    const { db } = await makeTestDb();
    const userId = await seedUser(db);
    const { token } = createSession(db, userId);
    expect(revokeSession(db, token)).toBe(true);
    expect(validateSession(db, token)).toBeNull();
    expect(revokeSession(db, token)).toBe(false);
  });

  it("rejects expired sessions", async () => {
    const { db } = await makeTestDb();
    const userId = await seedUser(db);
    const { token } = createSession(db, userId);
    db.prepare("UPDATE user_sessions SET expires_at = '2000-01-01T00:00:00.000Z'").run();
    expect(validateSession(db, token)).toBeNull();
  });

  it("rejects sessions of deactivated users", async () => {
    const { db } = await makeTestDb();
    const userId = await seedUser(db);
    const { token } = createSession(db, userId);
    db.prepare("UPDATE users SET is_active = 0 WHERE id = ?").run(userId);
    expect(validateSession(db, token)).toBeNull();
  });

  it("revokes every session for a user", async () => {
    const { db } = await makeTestDb();
    const userId = await seedUser(db);
    const a = createSession(db, userId);
    const b = createSession(db, userId);
    expect(revokeAllUserSessions(db, userId)).toBe(2);
    expect(validateSession(db, a.token)).toBeNull();
    expect(validateSession(db, b.token)).toBeNull();
  });
});
