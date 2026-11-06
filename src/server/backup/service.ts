import "server-only";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "@/server/db/connection";
import { dbFile, backupsDir } from "@/server/config/env";

// --- Settings helpers (app_settings key-value table) ---

function getSetting(db: ReturnType<typeof getDb>, key: string): string | null {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function setSetting(db: ReturnType<typeof getDb>, key: string, value: string): void {
  db.prepare(
    "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
  ).run(key, value);
}

export interface BackupInfo {
  filename: string;
  path: string;
  sizeBytes: number;
  createdAt: string;
}

/** Get the configured backup folder (custom or default). */
export function getBackupFolder(): string {
  const custom = getSetting(getDb(), "backup_folder");
  if (custom && custom.trim()) return custom.trim();
  return backupsDir();
}

/** Set the backup folder path. */
export function setBackupFolder(folder: string): void {
  setSetting(getDb(), "backup_folder", folder.trim());
}

/** Check if auto-backup is enabled. */
export function isAutoBackupEnabled(): boolean {
  const val = getSetting(getDb(), "auto_backup_enabled");
  return val === "1";
}

/** Enable/disable auto-backup. */
export function setAutoBackupEnabled(enabled: boolean): void {
  setSetting(getDb(), "auto_backup_enabled", enabled ? "1" : "0");
}

/** Get backup retention count. */
export function getBackupRetentionCount(): number {
  const val = getSetting(getDb(), "backup_retention_count");
  const num = parseInt(val || "7", 10);
  return isNaN(num) || num < 1 ? 7 : num;
}

/** Set backup retention count. */
export function setBackupRetentionCount(count: number): void {
  setSetting(getDb(), "backup_retention_count", String(Math.max(1, Math.min(30, count))));
}

/** List existing backups in the configured folder. */
export function listBackups(): BackupInfo[] {
  const dir = getBackupFolder();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".db") || f.endsWith(".sqlite") || f.endsWith(".bak"))
    .map((f) => {
      const p = path.join(dir, f);
      const stat = fs.statSync(p);
      return {
        filename: f,
        path: p,
        sizeBytes: stat.size,
        createdAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Create a backup of the current database. Returns the backup path. */
export async function createBackup(label?: string): Promise<string> {
  const db = getDb();
  const dir = getBackupFolder();
  fs.mkdirSync(dir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = label ? `${label}-${timestamp}.db` : `backup-${timestamp}.db`;
  const dest = path.join(dir, filename);

  await db.backup(dest);

  // Update last backup time
  setSetting(db, "last_backup_at", new Date().toISOString());

  // Rotate old backups
  rotateBackups(dir);

  return dest;
}

/** Delete old backups beyond retention count. */
function rotateBackups(dir: string): void {
  const retention = getBackupRetentionCount();
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".db") || f.endsWith(".sqlite") || f.endsWith(".bak"))
    .map((f) => ({ name: f, path: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtime.getTime() }))
    .sort((a, b) => b.mtime - a.mtime);

  for (let i = retention; i < files.length; i++) {
    try {
      fs.unlinkSync(files[i].path);
    } catch {
      // Ignore deletion errors
    }
  }
}

/** Restore from a backup file. Replaces the current DB. */
export async function restoreBackup(backupPath: string): Promise<void> {
  const { resetDb } = await import("@/server/db/connection");
  resetDb();

  const currentDb = dbFile();
  // Pre-restore backup
  const preRestorePath = currentDb + ".pre-restore";
  if (fs.existsSync(currentDb)) {
    fs.copyFileSync(currentDb, preRestorePath);
  }

  // Copy backup over current DB
  fs.copyFileSync(backupPath, currentDb);

  // Reopen
  getDb();
}

/** Get last backup time. */
export function getLastBackupAt(): string | null {
  const val = getSetting(getDb(), "last_backup_at");
  return val && val.trim() ? val.trim() : null;
}