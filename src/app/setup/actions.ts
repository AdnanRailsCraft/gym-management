"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { attemptLogin } from "@/server/auth/login";
import { SESSION_COOKIE } from "@/server/auth/sessions";
import { writeAudit } from "@/server/audit";
import { getDb } from "@/server/db/connection";
import { completeSetup } from "@/server/setup";

export interface FormState {
  error: string | null;
}

const setupSchema = z.object({
  gymName: z.string().trim().min(1, "Gym name is required"),
  address: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  currencyCode: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/, "Use a 3-letter currency code, e.g. PKR"),
  timezone: z.string().trim().min(1, "Timezone is required"),
  receiptHeader: z.string().trim().optional(),
  receiptFooter: z.string().trim().optional(),
  ownerFullName: z.string().trim().min(1, "Owner name is required"),
  ownerUsername: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .regex(/^[a-zA-Z0-9._-]+$/, "Letters, numbers, dot, underscore, hyphen only"),
  ownerEmail: z.string().trim().email("Invalid email").optional().or(z.literal("")),
  ownerPassword: z
    .string()
    .min(10, "Password must be at least 10 characters"),
  ownerPasswordConfirm: z.string(),
});

function emptyToNull(value: string | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

export async function setupAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = setupSchema.safeParse({
    gymName: formData.get("gymName"),
    address: formData.get("address") ?? "",
    phone: formData.get("phone") ?? "",
    currencyCode: formData.get("currencyCode"),
    timezone: formData.get("timezone"),
    receiptHeader: formData.get("receiptHeader") ?? "",
    receiptFooter: formData.get("receiptFooter") ?? "",
    ownerFullName: formData.get("ownerFullName"),
    ownerUsername: formData.get("ownerUsername"),
    ownerEmail: formData.get("ownerEmail") ?? "",
    ownerPassword: formData.get("ownerPassword"),
    ownerPasswordConfirm: formData.get("ownerPasswordConfirm"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  if (parsed.data.ownerPassword !== parsed.data.ownerPasswordConfirm) {
    return { error: "Passwords do not match" };
  }

  const db = getDb();
  try {
    const userId = await completeSetup(db, {
      gymName: parsed.data.gymName,
      address: emptyToNull(parsed.data.address),
      phone: emptyToNull(parsed.data.phone),
      currencyCode: parsed.data.currencyCode,
      timezone: parsed.data.timezone,
      receiptHeader: emptyToNull(parsed.data.receiptHeader),
      receiptFooter: emptyToNull(parsed.data.receiptFooter),
      ownerFullName: parsed.data.ownerFullName,
      ownerUsername: parsed.data.ownerUsername,
      ownerEmail: emptyToNull(parsed.data.ownerEmail),
      ownerPassword: parsed.data.ownerPassword,
    });
    writeAudit(db, {
      userId,
      actionKey: "user.create",
      entityType: "user",
      entityId: userId,
      after: { username: parsed.data.ownerUsername, roles: ["owner"], via: "setup" },
    });
    // Sign the new owner in immediately.
    const login = await attemptLogin(db, parsed.data.ownerUsername, parsed.data.ownerPassword);
    if (login.ok) {
      const store = await cookies();
      store.set(SESSION_COOKIE, login.session.token, {
        httpOnly: true,
        sameSite: "strict",
        secure: false,
        path: "/",
        expires: new Date(login.session.expiresAt),
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Setup failed";
    return { error: message };
  }
  redirect("/");
}
