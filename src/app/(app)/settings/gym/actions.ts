"use server";

import { z } from "zod";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/connection";
import { authorize, PolicyError } from "@/server/policies/authorize";
import { PERMISSIONS } from "@/server/policies/permissions";
import { updateGymSettings } from "@/server/users/service";

export interface GymFormState {
  error: string | null;
  saved: boolean;
}

const schema = z.object({
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
});

function emptyToNull(value: string | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

export async function saveGymSettingsAction(
  _prev: GymFormState,
  formData: FormData,
): Promise<GymFormState> {
  const user = await requireUser();
  try {
    authorize(user, PERMISSIONS.settingsGymUpdate);
  } catch (err) {
    if (err instanceof PolicyError) return { error: err.message, saved: false };
    throw err;
  }

  const parsed = schema.safeParse({
    gymName: formData.get("gymName"),
    address: formData.get("address") ?? "",
    phone: formData.get("phone") ?? "",
    currencyCode: formData.get("currencyCode"),
    timezone: formData.get("timezone"),
    receiptHeader: formData.get("receiptHeader") ?? "",
    receiptFooter: formData.get("receiptFooter") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input", saved: false };
  }

  const db = getDb();
  updateGymSettings(db, user, {
    gymName: parsed.data.gymName,
    address: emptyToNull(parsed.data.address),
    phone: emptyToNull(parsed.data.phone),
    currencyCode: parsed.data.currencyCode,
    timezone: parsed.data.timezone,
    receiptHeader: emptyToNull(parsed.data.receiptHeader),
    receiptFooter: emptyToNull(parsed.data.receiptFooter),
  });
  return { error: null, saved: true };
}
