"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/connection";
import { authorize, PolicyError } from "@/server/policies/authorize";
import { PERMISSIONS, ROLE_KEYS } from "@/server/policies/permissions";
import {
  createUser,
  resetUserPassword,
  setUserActive,
  updateUserRoles,
} from "@/server/users/service";

export interface UserFormState {
  error: string | null;
  ok: boolean;
}

async function guard(): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  try {
    authorize(user, PERMISSIONS.settingsUsersManage);
    return { ok: true };
  } catch (err) {
    if (err instanceof PolicyError) return { ok: false, error: err.message };
    throw err;
  }
}

const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .regex(/^[a-zA-Z0-9._-]+$/, "Letters, numbers, dot, underscore, hyphen only"),
  fullName: z.string().trim().min(1, "Full name is required"),
  email: z.string().trim().email("Invalid email").optional().or(z.literal("")),
  password: z.string().min(10, "Password must be at least 10 characters"),
  roles: z.array(z.string()),
});

export async function createUserAction(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const g = await guard();
  if (!g.ok) return g;

  const rawRoles = formData.getAll("roles").map(String);
  const parsed = createUserSchema.safeParse({
    username: formData.get("username"),
    fullName: formData.get("fullName"),
    email: formData.get("email") ?? "",
    password: formData.get("password"),
    roles: rawRoles.filter((r) => (ROLE_KEYS as readonly string[]).includes(r)),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input", ok: false };
  }
  if (parsed.data.roles.length === 0) {
    return { error: "Select at least one role", ok: false };
  }

  const user = await requireUser();
  const db = getDb();
  try {
    await createUser(db, user, {
      username: parsed.data.username,
      fullName: parsed.data.fullName,
      password: parsed.data.password,
      email: parsed.data.email?.trim() ? parsed.data.email.trim() : null,
      roleKeys: parsed.data.roles as (typeof ROLE_KEYS)[number][],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create user";
    return {
      error: /UNIQUE constraint failed: users_username_lower/.test(message)
        ? "Username already exists"
        : message,
      ok: false,
    };
  }
  revalidatePath("/settings/users");
  return { error: null, ok: true };
}

const userIdSchema = z.object({ userId: z.coerce.number().int().positive() });

export async function setUserActiveAction(formData: FormData): Promise<void> {
  const g = await guard();
  if (!g.ok) throw new Error(g.error);
  const parsed = userIdSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) throw new Error("Invalid user");
  const active = formData.get("active") === "1";
  const user = await requireUser();
  try {
    setUserActive(getDb(), user, parsed.data.userId, active);
  } catch (err) {
    throw err instanceof Error ? err : new Error("Update failed");
  }
  revalidatePath("/settings/users");
}

const resetSchema = z.object({
  userId: z.coerce.number().int().positive(),
  password: z.string().min(10, "Password must be at least 10 characters"),
});

export async function resetPasswordAction(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const g = await guard();
  if (!g.ok) return g;
  const parsed = resetSchema.safeParse({
    userId: formData.get("userId"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input", ok: false };
  }
  const user = await requireUser();
  await resetUserPassword(getDb(), user, parsed.data.userId, parsed.data.password);
  revalidatePath("/settings/users");
  return { error: null, ok: true };
}

const rolesSchema = z.object({
  userId: z.coerce.number().int().positive(),
  roles: z.array(z.string()),
});

export async function updateRolesAction(
  _prev: UserFormState,
  formData: FormData,
): Promise<UserFormState> {
  const g = await guard();
  if (!g.ok) return g;
  const parsed = rolesSchema.safeParse({
    userId: formData.get("userId"),
    roles: formData.getAll("roles").map(String),
  });
  if (!parsed.success) return { error: "Invalid roles", ok: false };
  const user = await requireUser();
  try {
    updateUserRoles(getDb(), user, parsed.data.userId, parsed.data.roles);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Update failed", ok: false };
  }
  revalidatePath("/settings/users");
  return { error: null, ok: true };
}
