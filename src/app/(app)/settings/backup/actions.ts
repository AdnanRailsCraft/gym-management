"use server";

import { requireUser } from "@/server/auth/current-user";
import { can } from "@/server/policies/authorize";
import { PERMISSIONS } from "@/server/policies/permissions";
import { createBackup, restoreBackup } from "@/server/backup/service";
import { revalidatePath } from "next/cache";

export async function createBackupAction() {
  const user = await requireUser();
  if (!can(user, PERMISSIONS.settingsGymUpdate)) {
    return { ok: false, error: "You don't have permission to create backups." };
  }
  try {
    const path = await createBackup("manual");
    revalidatePath("/settings/backup");
    return { ok: true, message: `Backup created: ${path.split("/").pop()}` };
  } catch (err) {
    return { ok: false, error: `Backup failed: ${(err as Error).message}` };
  }
}

export async function restoreBackupAction(backupPath: string) {
  const user = await requireUser();
  if (!can(user, PERMISSIONS.settingsGymUpdate)) {
    return { ok: false, error: "You don't have permission to restore backups." };
  }
  try {
    await restoreBackup(backupPath);
    revalidatePath("/");
    return { ok: true, message: "Database restored successfully. Please refresh the page." };
  } catch (err) {
    return { ok: false, error: `Restore failed: ${(err as Error).message}` };
  }
}