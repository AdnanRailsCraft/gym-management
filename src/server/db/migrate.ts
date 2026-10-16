import fs from "node:fs";
import path from "node:path";
import { openDb } from "./index";

export interface MigrationOutcome {
  applied: string[];
  backupFile: string | null;
  fresh: boolean;
}

function versionOf(file: string): string {
  return file.replace(/\.sql$/, "");
}

/**
 * Applies pending SQL migrations in filename order, one transaction per
 * migration. When the database already has applied migrations and new ones
 * are pending, an online backup is taken first (docs/PACKAGING.md §7).
 */
export async function runMigrations(opts: {
  dbFile: string;
  migrationsDir: string;
  backupsDir: string;
}): Promise<MigrationOutcome> {
  fs.mkdirSync(path.dirname(opts.dbFile), { recursive: true });
  const db = openDb(opts.dbFile);
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );`);

    const appliedRows = db
      .prepare("SELECT version FROM schema_migrations ORDER BY version")
      .all() as { version: string }[];
    const appliedVersions = new Set(appliedRows.map((r) => r.version));

    const available = fs
      .readdirSync(opts.migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    const pending = available.filter((f) => !appliedVersions.has(versionOf(f)));

    if (pending.length === 0) {
      return { applied: [], backupFile: null, fresh: false };
    }

    const fresh = appliedRows.length === 0;
    let backupFile: string | null = null;
    if (!fresh) {
      fs.mkdirSync(opts.backupsDir, { recursive: true });
      const lastApplied = appliedRows[appliedRows.length - 1]!.version;
      const target = versionOf(pending[pending.length - 1]!);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      backupFile = path.join(
        opts.backupsDir,
        `pre-migration-${stamp}-${lastApplied}-to-${target}.db`,
      );
      await db.backup(backupFile);
    }

    for (const file of pending) {
      const version = versionOf(file);
      const sql = fs.readFileSync(path.join(opts.migrationsDir, file), "utf8");
      db.transaction(() => {
        db.exec(sql);
        db.prepare(
          "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
        ).run(version, file, new Date().toISOString());
      })();
    }

    return { applied: pending.map(versionOf), backupFile, fresh };
  } finally {
    db.close();
  }
}
