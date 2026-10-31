"use server";

import { gymSettingsSchema } from "@/server/gym-form";
import { emptyToNull } from "@/server/gym-form";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/connection";
import { authorize, PolicyError } from "@/server/policies/authorize";
import { PERMISSIONS } from "@/server/policies/permissions";
import { updateGymSettings } from "@/server/users/service";

export interface GymFormState {
  error: string | null;
  saved: boolean;
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

  const parsed = gymSettingsSchema.safeParse({
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
