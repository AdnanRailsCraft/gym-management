import "server-only";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "@/server/db/connection";
import { dbFile, backupsDir } from "@/server/config/env";

export interface BackupInfo {
  filename: string;
  path: string;
  sizeBytes: number;
  createdAt: string;
}

/** List existing backups in the backups directory. */
export function listBackups(): BackupInfo[] {
  const dir = backupsDir();
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
  const dir = backupsDir();
  fs.mkdirSync(dir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = label ? `${label}-${timestamp}.db` : `backup-${timestamp}.db`;
  const dest = path.join(dir, filename);

  await db.backup(dest);
  return dest;
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
