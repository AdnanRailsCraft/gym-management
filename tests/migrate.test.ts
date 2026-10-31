import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDb } from "@/server/db";
import { runMigrations } from "@/server/db/migrate";

const dirs: string[] = [];

function tmpDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "gms-mig-"));
  dirs.push(d);
  return d;
}

function scaffold(root: string) {
  const migrations = path.join(root, "migrations");
  const backups = path.join(root, "backups");
  const dbFile = path.join(root, "db", "gym.db");
  fs.mkdirSync(migrations, { recursive: true });
  fs.mkdirSync(backups, { recursive: true });
  return { migrations, backups, dbFile };
}

function writeMigration(migrations: string, name: string, sql: string) {
  fs.writeFileSync(path.join(migrations, name), sql);
}

afterEach(() => {
  for (const d of dirs.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

describe("runMigrations", () => {
  it("applies the first migration to a fresh database and marks it fresh", async () => {
    const root = tmpDir();
    const { migrations, backups, dbFile } = scaffold(root);
    writeMigration(
      migrations,
      "0001_init.sql",
      "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;",
    );
    const result = await runMigrations({ dbFile, migrationsDir: migrations, backupsDir: backups });
    expect(result.applied).toEqual(["0001_init"]);
    expect(result.fresh).toBe(true);
    expect(result.backupFile).toBeNull();

    const db = openDb(dbFile);
    try {
      const rows = db.prepare("SELECT version FROM schema_migrations").all();
      expect(rows).toEqual([{ version: "0001_init" }]);
    } finally {
      db.close();
    }
  });

  it("is idempotent: second run applies nothing", async () => {
    const root = tmpDir();
    const { migrations, backups, dbFile } = scaffold(root);
    writeMigration(migrations, "0001_init.sql", "CREATE TABLE t (id TEXT PRIMARY KEY);");
    await runMigrations({ dbFile, migrationsDir: migrations, backupsDir: backups });
    const second = await runMigrations({ dbFile, migrationsDir: migrations, backupsDir: backups });
    expect(second.applied).toEqual([]);
    expect(second.fresh).toBe(false);
    expect(second.backupFile).toBeNull();
  });

  it("takes an online backup before applying an upgrade migration", async () => {
    const root = tmpDir();
    const { migrations, backups, dbFile } = scaffold(root);
    writeMigration(migrations, "0001_init.sql", "CREATE TABLE t (id TEXT PRIMARY KEY);");
    await runMigrations({ dbFile, migrationsDir: migrations, backupsDir: backups });

    writeMigration(migrations, "0002_add_c.sql", "ALTER TABLE t ADD COLUMN c TEXT;");
    const upgraded = await runMigrations({ dbFile, migrationsDir: migrations, backupsDir: backups });
    expect(upgraded.applied).toEqual(["0002_add_c"]);
    expect(upgraded.fresh).toBe(false);
    expect(upgraded.backupFile).not.toBeNull();
    expect(path.basename(upgraded.backupFile!)).toMatch(/^pre-migration-/);
    expect(fs.existsSync(upgraded.backupFile!)).toBe(true);

    // Backup still has the pre-upgrade schema.
    const bak = openDb(upgraded.backupFile!);
    try {
      const cols = bak.pragma("table_info(t)") as { name: string }[];
      expect(cols.map((c) => c.name)).toEqual(["id"]);
      const rows = bak.prepare("SELECT version FROM schema_migrations").all();
      expect(rows).toEqual([{ version: "0001_init" }]);
    } finally {
      bak.close();
    }

    // Live database has the upgrade.
    const live = openDb(dbFile);
    try {
      const cols = live.pragma("table_info(t)") as { name: string }[];
      expect(cols.map((c) => c.name).sort()).toEqual(["c", "id"]);
    } finally {
      live.close();
    }
  });

  it("rolls back a failing migration and leaves no partial schema_migrations row", async () => {
    const root = tmpDir();
    const { migrations, backups, dbFile } = scaffold(root);
    writeMigration(migrations, "0001_init.sql", "CREATE TABLE t (id TEXT PRIMARY KEY);");
    await runMigrations({ dbFile, migrationsDir: migrations, backupsDir: backups });

    writeMigration(
      migrations,
      "0002_bad.sql",
      "CREATE TABLE ok (id TEXT PRIMARY KEY); THIS IS NOT SQL;",
    );
    await expect(
      runMigrations({ dbFile, migrationsDir: migrations, backupsDir: backups }),
    ).rejects.toThrow();

    const db = openDb(dbFile);
    try {
      const rows = db.prepare("SELECT version FROM schema_migrations ORDER BY version").all();
      expect(rows).toEqual([{ version: "0001_init" }]);
      // The failed statement rolled back with the transaction.
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ok'")
        .all();
      expect(tables).toEqual([]);
    } finally {
      db.close();
    }
  });
});
