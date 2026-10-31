"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getDb } from "@/server/db/connection";
import { hashPassword } from "@/server/auth/password";
import { createSession, revokeAllUserSessions, SESSION_COOKIE } from "@/server/auth/sessions";
import { listUsers, ownerExists } from "@/server/users/service";
import { DEV_TOOLS_DISABLED, devToolsEnabled } from "./guard";

export interface DevUserInfo {
  id: number;
  username: string;
  fullName: string;
  email: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  roles: string[];
}

export interface DevStatus {
  users: DevUserInfo[];
  ownerExists: boolean;
  activeSessionsCount: number;
}

export async function getDevStatusAction(): Promise<DevStatus> {
  if (!devToolsEnabled()) throw new Error(DEV_TOOLS_DISABLED);
  const db = getDb();
  const users = listUsers(db);
  const hasOwner = ownerExists(db);
  const sessionRow = db
    .prepare("SELECT count(*) as c FROM user_sessions WHERE revoked_at IS NULL")
    .get() as { c: number } | undefined;

  return {
    users,
    ownerExists: hasOwner,
    activeSessionsCount: sessionRow?.c ?? 0,
  };
}

export async function createDevAdminAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  if (!devToolsEnabled()) return { ok: false, error: DEV_TOOLS_DISABLED };
  try {
    const username = ((formData.get("username") as string) || "").trim();
    const fullName = ((formData.get("fullName") as string) || "").trim();
    const password = ((formData.get("password") as string) || "").trim();
    const role = ((formData.get("role") as string) || "owner").trim();

    if (!username || username.length < 3) {
      return { ok: false, error: "Username must be at least 3 characters" };
    }
    if (!fullName) {
      return { ok: false, error: "Full name is required" };
    }
    if (!password || password.length < 10) {
      return { ok: false, error: "Password must be at least 10 characters" };
    }

    const db = getDb();
    const existing = db.prepare("SELECT id FROM users WHERE lower(username) = lower(?)").get(username);
    if (existing) {
      return { ok: false, error: `User '${username}' already exists` };
    }

    const passwordHash = await hashPassword(password);
    const now = new Date().toISOString();

    db.transaction(() => {
      const res = db
        .prepare(
          "INSERT INTO users (username, full_name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run(username, fullName, passwordHash, now, now);

      const userId = Number(res.lastInsertRowid);
      const roleRow = db.prepare("SELECT id FROM roles WHERE key = ?").get(role) as
        | { id: number }
        | undefined;
      if (roleRow) {
        db.prepare("INSERT INTO user_roles (user_id, role_id, created_at) VALUES (?, ?, ?)").run(
          userId,
          roleRow.id,
          now,
        );
      }
    })();

    revalidatePath("/dev");
    revalidatePath("/login");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to create user" };
  }
}

export async function createDefaultAdminAction(): Promise<{ ok: boolean; message: string; error?: string }> {
  if (!devToolsEnabled()) return { ok: false, message: "", error: DEV_TOOLS_DISABLED };
  try {
    const db = getDb();
    const username = "admin";
    const password = "Admin123456!";
    const passwordHash = await hashPassword(password);
    const now = new Date().toISOString();

    const existing = db
      .prepare("SELECT id FROM users WHERE lower(username) = ?")
      .get(username) as { id: number } | undefined;

    db.transaction(() => {
      let userId: number;
      if (existing) {
        userId = existing.id;
        db.prepare(
          "UPDATE users SET password_hash = ?, is_active = 1, failed_login_count = 0, locked_until = NULL, updated_at = ? WHERE id = ?",
        ).run(passwordHash, now, userId);
      } else {
        const res = db
          .prepare(
            "INSERT INTO users (username, full_name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
          )
          .run(username, "System Administrator", passwordHash, now, now);
        userId = Number(res.lastInsertRowid);
      }

      const ownerRole = db.prepare("SELECT id FROM roles WHERE key = 'owner'").get() as
        | { id: number }
        | undefined;
      if (ownerRole) {
        db.prepare("INSERT OR IGNORE INTO user_roles (user_id, role_id, created_at) VALUES (?, ?, ?)").run(
          userId,
          ownerRole.id,
          now,
        );
      }
    })();

    revalidatePath("/dev");
    revalidatePath("/login");
    return { ok: true, message: "Admin ready: username 'admin', password 'Admin123456!'" };
  } catch (err) {
    return { ok: false, message: "", error: err instanceof Error ? err.message : "Failed to create default admin" };
  }
}

export async function deleteDevUserAction(userId: number): Promise<{ ok: boolean; error?: string }> {
  if (!devToolsEnabled()) return { ok: false, error: DEV_TOOLS_DISABLED };
  try {
    const db = getDb();
    db.transaction(() => {
      db.prepare("DELETE FROM user_sessions WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM user_roles WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM users WHERE id = ?").run(userId);
    })();
    revalidatePath("/dev");
    revalidatePath("/login");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to delete user" };
  }
}

export async function resetDevUserPasswordAction(
  userId: number,
  newPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!devToolsEnabled()) return { ok: false, error: DEV_TOOLS_DISABLED };
  try {
    if (!newPassword || newPassword.length < 10) {
      return { ok: false, error: "Password must be at least 10 characters" };
    }
    const db = getDb();
    const hash = await hashPassword(newPassword);
    const now = new Date().toISOString();
    db.transaction(() => {
      db.prepare(
        "UPDATE users SET password_hash = ?, failed_login_count = 0, locked_until = NULL, updated_at = ? WHERE id = ?",
      ).run(hash, now, userId);
      revokeAllUserSessions(db, userId);
    })();
    revalidatePath("/dev");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to reset password" };
  }
}

export async function quickLoginDevUserAction(userId: number): Promise<{ ok: boolean; error?: string }> {
  if (!devToolsEnabled()) return { ok: false, error: DEV_TOOLS_DISABLED };
  try {
    const db = getDb();
    const user = db.prepare("SELECT id, is_active FROM users WHERE id = ?").get(userId) as
      | { id: number; is_active: number }
      | undefined;
    if (!user || user.is_active !== 1) {
      return { ok: false, error: "User not found or inactive" };
    }

    const session = createSession(db, userId);
    const store = await cookies();
    store.set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: "strict",
      secure: false,
      path: "/",
      expires: new Date(session.expiresAt),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to quick login" };
  }
}

export async function wipeAllUsersAction(): Promise<{ ok: boolean; error?: string }> {
  if (!devToolsEnabled()) return { ok: false, error: DEV_TOOLS_DISABLED };
  try {
    const db = getDb();
    db.transaction(() => {
      db.prepare("DELETE FROM user_sessions").run();
      db.prepare("DELETE FROM user_roles").run();
      db.prepare("DELETE FROM users").run();
      db.prepare("DELETE FROM app_settings WHERE key = 'setup_completed_at'").run();
    })();
    revalidatePath("/dev");
    revalidatePath("/login");
    revalidatePath("/setup");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to wipe users" };
  }
}
