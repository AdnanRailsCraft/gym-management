"use server";

import { requireUser } from "@/server/auth/current-user";
import { can } from "@/server/policies/authorize";
import { PERMISSIONS } from "@/server/policies/permissions";
import { createBackup, restoreBackup, setBackupFolder, setAutoBackupEnabled, setBackupRetentionCount } from "@/server/backup/service";
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

export async function updateBackupSettingsAction(formData: FormData) {
  const user = await requireUser();
  if (!can(user, PERMISSIONS.settingsGymUpdate)) {
    return { ok: false, error: "You don't have permission to update backup settings." };
  }
  try {
    const folder = (formData.get("backupFolder") as string) || "";
    const autoBackup = formData.get("autoBackup") === "on";
    const retention = parseInt((formData.get("retention") as string) || "7", 10);
    setBackupFolder(folder);
    setAutoBackupEnabled(autoBackup);
    setBackupRetentionCount(retention);
    revalidatePath("/settings/backup");
    return { ok: true, message: "Backup settings saved." };
  } catch (err) {
    return { ok: false, error: `Failed to save settings: ${(err as Error).message}` };
  }
}