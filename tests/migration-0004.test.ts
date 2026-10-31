import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openDb } from "@/server/db";
import { runMigrations } from "@/server/db/migrate";

/**
 * 0004 rebuilds `members` and backfills memberships from the pre-0004 layout
 * where plan/dates/fee lived on the member row. This proves the backfill
 * preserves existing dev data instead of dropping it.
 */
describe("0004_memberships migration", () => {
  it("backfills legacy member subscriptions into memberships", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gms-mig-"));
    const dbFile = path.join(dir, "db", "gym.db");
    const backups = path.join(dir, "backups");
    const partial = path.join(dir, "partial");
    fs.mkdirSync(partial, { recursive: true });

    const fullDir = path.join(process.cwd(), "db", "migrations");
    for (const file of fs.readdirSync(fullDir)) {
      if (/^000[123]_/.test(file)) {
        fs.copyFileSync(path.join(fullDir, file), path.join(partial, file));
      }
    }

    try {
      await runMigrations({ dbFile, migrationsDir: partial, backupsDir: backups });

      const before = openDb(dbFile);
      const insert = before.prepare(
        `INSERT INTO members
           (member_number, full_name, plan_name, start_date, end_date,
            fee_amount, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      insert.run("EF-0001", "Active Al", "Monthly", "2024-01-01", "2024-01-31", 3000, "active");
      insert.run("EF-0002", "Expired Ed", "Annual", "2023-01-01", "2023-12-31", 28000, "expired");
      insert.run("EF-0003", "Archived Ann", "Monthly", "2022-01-01", "2022-01-31", 2500, "archived");
      before.close();

      await runMigrations({ dbFile, migrationsDir: fullDir, backupsDir: backups });

      const db = openDb(dbFile);
      try {
        const members = db
          .prepare("SELECT member_number, status, joined_on FROM members ORDER BY member_number")
          .all() as { member_number: string; status: string; joined_on: string }[];
        expect(members.map((m) => m.status)).toEqual(["active", "active", "archived"]);
        // The legacy membership columns are gone from the rebuilt table.
        const columns = db
          .prepare("PRAGMA table_info(members)")
          .all() as { name: string }[];
        expect(columns.map((c) => c.name)).not.toContain("plan_name");
        expect(columns.map((c) => c.name)).toContain("joined_on");

        const memberships = db
          .prepare(
            `SELECT m.member_id, p.name AS plan_name, m.start_on, m.end_on,
                    m.price_minor, m.lifecycle_status
             FROM memberships m JOIN membership_plans p ON p.id = m.plan_id
             ORDER BY m.member_id`,
          )
          .all() as {
          member_id: number;
          plan_name: string;
          start_on: string;
          end_on: string;
          price_minor: number;
          lifecycle_status: string;
        }[];
        expect(memberships).toHaveLength(3);
        expect(memberships[0]!.plan_name).toBe("Monthly");
        expect(memberships[0]!.price_minor).toBe(300000); // legacy major units x 100
        expect(memberships[0]!.start_on).toBe("2024-01-01");
        expect(memberships[0]!.end_on).toBe("2024-01-31");
        expect(memberships[1]!.plan_name).toBe("Annual");
        expect(memberships[2]!.lifecycle_status).toBe("cancelled");
      } finally {
        db.close();
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
