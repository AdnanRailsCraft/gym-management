"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { attemptLogin } from "@/server/auth/login";
import { revokeSession, SESSION_COOKIE, validateSession } from "@/server/auth/sessions";
import { writeAudit } from "@/server/audit";
import { getDb } from "@/server/db/connection";

export interface FormState {
  error: string | null;
}

const loginSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "Invalid username or password",
  disabled: "This account is deactivated. Contact the owner.",
  locked: "Account locked after too many failed attempts. Try again in 15 minutes.",
};

export async function loginAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Enter username and password" };
  }

  const db = getDb();
  const result = await attemptLogin(db, parsed.data.username, parsed.data.password);

  if (!result.ok) {
    writeAudit(db, {
      userId: null,
      actionKey: "user.login_failed",
      after: {
        username: parsed.data.username,
        reason: result.reason,
      },
    });
    return { error: LOGIN_ERROR_MESSAGES[result.reason] ?? "Login failed" };
  }

  writeAudit(db, {
    userId: result.userId,
    actionKey: "user.login",
    entityType: "user",
    entityId: result.userId,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, result.session.token, {
    httpOnly: true,
    sameSite: "strict",
    secure: false,
    path: "/",
    expires: new Date(result.session.expiresAt),
  });
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value ?? null;
  const db = getDb();
  if (token) {
    const session = validateSession(db, token);
    if (session) {
      writeAudit(db, {
        userId: session.userId,
        actionKey: "user.logout",
        entityType: "user",
        entityId: session.userId,
      });
    }
    revokeSession(db, token);
  }
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
