import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDb } from "@/server/db";

const dirs: string[] = [];

function tmpDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "gms-db-"));
  dirs.push(d);
  return d;
}

afterEach(() => {
  for (const d of dirs.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

describe("openDb", () => {
  it("applies WAL, foreign keys and busy timeout pragmas", () => {
    const dir = tmpDir();
    const file = path.join(dir, "test.db");
    const db = openDb(file);
    try {
      expect(db.pragma("journal_mode", { simple: true })).toBe("wal");
      expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
      expect(db.pragma("busy_timeout", { simple: true })).toBe(5000);
    } finally {
      db.close();
    }
  });

  it("enforces foreign key constraints", () => {
    const dir = tmpDir();
    const db = openDb(path.join(dir, "test.db"));
    try {
      db.exec(`
        CREATE TABLE parent (id TEXT PRIMARY KEY);
        CREATE TABLE child (id TEXT PRIMARY KEY, pid TEXT NOT NULL REFERENCES parent(id));
      `);
      db.prepare("INSERT INTO parent (id) VALUES (?)").run("p1");
      db.prepare("INSERT INTO child (id, pid) VALUES (?, ?)").run("c1", "p1");
      expect(() =>
        db.prepare("INSERT INTO child (id, pid) VALUES (?, ?)").run("c2", "missing"),
      ).toThrow(/FOREIGN KEY/i);
    } finally {
      db.close();
    }
  });
});
