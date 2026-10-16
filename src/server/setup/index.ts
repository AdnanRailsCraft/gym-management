import "server-only";
import type { Db } from "@/server/db/index";
import { hashPassword } from "@/server/auth/password";
import { writeAudit } from "@/server/audit";

export interface SetupInput {
  gymName: string;
  address: string | null;
  phone: string | null;
  currencyCode: string;
  timezone: string;
  receiptHeader: string | null;
  receiptFooter: string | null;
  ownerFullName: string;
  ownerUsername: string;
  ownerEmail: string | null;
  ownerPassword: string;
}

/**
 * First-run setup: one short transaction creates the owner account, seeds
 * typed gym settings from the wizard, and stamps setup_completed_at
 * (REQUIREMENTS §5, §28.2). Returns the new owner user id.
 */
export async function completeSetup(db: Db, input: SetupInput): Promise<number> {
  const existing = db
    .prepare(
      `SELECT 1 AS ok FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE r.key = 'owner' AND u.is_active = 1 LIMIT 1`,
    )
    .get();
  if (existing) throw new Error("Setup already completed");

  const passwordHash = await hashPassword(input.ownerPassword);
  const now = new Date().toISOString();

  return db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO users (username, email, full_name, password_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.ownerUsername.trim(),
        input.ownerEmail,
        input.ownerFullName.trim(),
        passwordHash,
        now,
        now,
      );
    const userId = Number(result.lastInsertRowid);
    const ownerRole = db.prepare("SELECT id FROM roles WHERE key = 'owner'").get() as
      | { id: number }
      | undefined;
    if (!ownerRole) throw new Error("owner role missing — re-run migrations");
    db.prepare(
      "INSERT INTO user_roles (user_id, role_id, created_at) VALUES (?, ?, ?)",
    ).run(userId, ownerRole.id, now);

    db.prepare(
      `UPDATE gym_settings SET gym_name = ?, address = ?, phone = ?,
         currency_code = ?, timezone = ?, receipt_header = ?, receipt_footer = ?,
         updated_at = ? WHERE id = 1`,
    ).run(
      input.gymName,
      input.address,
      input.phone,
      input.currencyCode,
      input.timezone,
      input.receiptHeader,
      input.receiptFooter,
      now,
    );

    db.prepare(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ('setup_completed_at', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).run(now, now);

    writeAudit(db, {
      userId,
      actionKey: "setup.completed",
      entityType: "user",
      entityId: userId,
      after: {
        owner_username: input.ownerUsername.trim(),
        gym_name: input.gymName,
        currency_code: input.currencyCode,
      },
    });
    return userId;
  })();
}
