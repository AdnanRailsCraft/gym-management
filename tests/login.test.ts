import { afterEach, describe, expect, it } from "vitest";
import { cleanupTestDbs, makeTestDb } from "./helpers/db";
import {
  attemptLogin,
  LOCK_MINUTES,
  MAX_FAILED_LOGINS,
} from "@/server/auth/login";
import { hashPassword } from "@/server/auth/password";
import type { Db } from "@/server/db";

afterEach(cleanupTestDbs);

async function seedUser(
  db: Db,
  opts: { username?: string; password?: string; active?: boolean } = {},
) {
  const password = opts.password ?? "hunter2hunter2";
  const hash = await hashPassword(password);
  const result = db
    .prepare(
      `INSERT INTO users (username, full_name, password_hash, is_active)
       VALUES (?, 'Alice', ?, ?)`,
    )
    .run(opts.username ?? "alice", hash, opts.active === false ? 0 : 1);
  return { id: Number(result.lastInsertRowid), password };
}

describe("attemptLogin", () => {
  it("logs in with correct credentials and creates a session", async () => {
    const { db } = await makeTestDb();
    const { id, password } = await seedUser(db);
    const result = await attemptLogin(db, "alice", password);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.userId).toBe(id);
      expect(result.session.token).toHaveLength(64);
    }
    const sessions = db.prepare("SELECT COUNT(*) AS c FROM user_sessions").get() as {
      c: number;
    };
    expect(sessions.c).toBe(1);
  });

  it("is case-insensitive on username", async () => {
    const { db } = await makeTestDb();
    const { password } = await seedUser(db, { username: "Alice" });
    const result = await attemptLogin(db, "ALICE", password);
    expect(result.ok).toBe(true);
  });

  it("rejects unknown users and wrong passwords as invalid_credentials", async () => {
    const { db } = await makeTestDb();
    await seedUser(db, { password: "correct horse battery" });
    const unknown = await attemptLogin(db, "nobody", "correct horse battery");
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.reason).toBe("invalid_credentials");
    const wrong = await attemptLogin(db, "alice", "not the password");
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.reason).toBe("invalid_credentials");
  });

  it(`locks after ${MAX_FAILED_LOGINS} consecutive failures for ${LOCK_MINUTES} minutes`, async () => {
    const { db } = await makeTestDb();
    await seedUser(db, { password: "correct horse battery" });
    for (let i = 0; i < MAX_FAILED_LOGINS - 1; i++) {
      const r = await attemptLogin(db, "alice", "wrong password!");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("invalid_credentials");
    }
    const lockAttempt = await attemptLogin(db, "alice", "wrong password!");
    expect(lockAttempt.ok).toBe(false);
    if (!lockAttempt.ok) expect(lockAttempt.reason).toBe("locked");

    // Even the correct password is refused while locked.
    const correct = await attemptLogin(db, "alice", "correct horse battery");
    expect(correct.ok).toBe(false);
    if (!correct.ok) expect(correct.reason).toBe("locked");

    const row = db.prepare("SELECT locked_until FROM users WHERE username = 'alice'").get() as {
      locked_until: string | null;
    };
    expect(row.locked_until).not.toBeNull();
    const remaining = Date.parse(row.locked_until!) - Date.now();
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(LOCK_MINUTES * 60_000 + 5_000);
  });

  it("rejects deactivated users after a successful password check", async () => {
    const { db } = await makeTestDb();
    await seedUser(db, { password: "correct horse battery", active: false });
    const result = await attemptLogin(db, "alice", "correct horse battery");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("disabled");
  });

  it("resets the failure counter on success", async () => {
    const { db } = await makeTestDb();
    await seedUser(db, { password: "correct horse battery" });
    await attemptLogin(db, "alice", "wrong password!");
    await attemptLogin(db, "alice", "correct horse battery");
    const row = db
      .prepare("SELECT failed_login_count, locked_until FROM users WHERE username = 'alice'")
      .get() as { failed_login_count: number; locked_until: string | null };
    expect(row.failed_login_count).toBe(0);
    expect(row.locked_until).toBeNull();
  });
});
