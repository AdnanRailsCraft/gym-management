"use server";

import { z } from "zod";
import { attemptLogin } from "@/server/auth/login";
import { SESSION_COOKIE } from "@/server/auth/sessions";
import { getDb } from "@/server/db/connection";
import { emptyToNull, gymSettingsFields } from "@/server/gym-form";
import { completeSetup } from "@/server/setup";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export interface FormState {
  error: string | null;
}

const setupSchema = z.object({
  ...gymSettingsFields,
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

export async function setupAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = setupSchema.safeParse({
    gymName: (formData.get("gymName") as string | null) ?? "",
    address: (formData.get("address") as string | null) ?? "",
    phone: (formData.get("phone") as string | null) ?? "",
    currencyCode: (formData.get("currencyCode") as string | null) ?? "",
    timezone: (formData.get("timezone") as string | null) ?? "",
    receiptHeader: (formData.get("receiptHeader") as string | null) ?? "",
    receiptFooter: (formData.get("receiptFooter") as string | null) ?? "",
    ownerFullName: (formData.get("ownerFullName") as string | null) ?? "",
    ownerUsername: (formData.get("ownerUsername") as string | null) ?? "",
    ownerEmail: (formData.get("ownerEmail") as string | null) ?? "",
    ownerPassword: (formData.get("ownerPassword") as string | null) ?? "",
    ownerPasswordConfirm: (formData.get("ownerPasswordConfirm") as string | null) ?? "",
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
    void userId;
    // completeSetup already wrote the setup.completed audit (includes owner username).
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
