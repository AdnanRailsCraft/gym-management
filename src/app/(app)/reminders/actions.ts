"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/connection";
import { authorize, PolicyError } from "@/server/policies/authorize";
import { PERMISSIONS } from "@/server/policies/permissions";
import { reminderSchema } from "@/server/members/schemas";
import { recordReminder } from "@/server/members/reminders";

export interface ReminderActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

function fail(error: unknown): ReminderActionResult {
  if (error instanceof PolicyError) return { ok: false, error: error.message };
  return {
    ok: false,
    error: error instanceof Error ? error.message : "The request failed",
  };
}

export async function recordReminderAction(formData: FormData): Promise<ReminderActionResult> {
  const user = await requireUser();
  try {
    authorize(user, PERMISSIONS.membershipsView);
    const parsed = reminderSchema.safeParse({
      membershipId: formData.get("membershipId"),
      channel: formData.get("channel") ?? "whatsapp",
      message: formData.get("message") ?? "",
      notes: formData.get("notes") ?? "",
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const db = getDb();
    recordReminder(db, user, {
      membershipId: parsed.data.membershipId,
      channel: parsed.data.channel,
      message: parsed.data.message,
      notes: parsed.data.notes ?? null,
    });
    revalidatePath("/reminders");
    return { ok: true, message: "Reminder logged" };
  } catch (err) {
    return fail(err);
  }
}
