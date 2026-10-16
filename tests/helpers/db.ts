import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDb, type Db } from "@/server/db";
import { runMigrations } from "@/server/db/migrate";

const cleanups: Array<() => void> = [];

/** Creates a temp DB with the real migrations applied. */
export async function makeTestDb(): Promise<{ db: Db; dir: string }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gms-p1-"));
  cleanups.push(() => fs.rmSync(dir, { recursive: true, force: true }));
  const dbFile = path.join(dir, "db", "gym.db");
  const backups = path.join(dir, "backups");
  await runMigrations({
    dbFile,
    migrationsDir: path.join(process.cwd(), "db", "migrations"),
    backupsDir: backups,
  });
  const db = openDb(dbFile);
  cleanups.push(() => {
    if (db.open) db.close();
  });
  return { db, dir };
}

export function cleanupTestDbs(): void {
  for (const fn of cleanups.splice(0)) fn();
}
