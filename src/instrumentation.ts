export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.GMS_SKIP_MIGRATIONS === "1") return;

  const { backupsDir, dbFile, migrationsDir } = await import("./server/config/env");
  const { runMigrations } = await import("./server/db/migrate");

  try {
    const result = await runMigrations({
      dbFile: dbFile(),
      migrationsDir: migrationsDir(),
      backupsDir: backupsDir(),
    });
    if (result.applied.length > 0) {
      console.warn(`[gms] migrations applied: ${result.applied.join(", ")}`);
    }

    // Auto-backup on startup if enabled
    const { getDb } = await import("./server/db/connection");
    const db = getDb();
    const autoBackup = db.prepare("SELECT value FROM app_settings WHERE key = 'auto_backup_enabled'").get() as { value: string } | undefined;
    if (autoBackup?.value === "1") {
      const { createBackup } = await import("./server/backup/service");
      const backupPath = await createBackup("auto");
      console.warn(`[gms] auto-backup created: ${backupPath}`);
    }
  } catch (err) {
    // Fail closed: never serve requests against an unknown schema.
    console.error("[gms] migration failed", err);
    throw err;
  }
}
