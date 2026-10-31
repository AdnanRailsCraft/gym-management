import "server-only";
import type { Db } from "@/server/db/index";
import { appVersion } from "@/server/config/env";

export interface AuditEntry {
  userId: number | null;
  actionKey: string;
  entityType?: string;
  entityId?: string | number;
  before?: unknown;
  after?: unknown;
  reason?: string;
}

function jsonOrNull(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

/**
 * Append-only audit write (DESIGN B9). DB triggers reject UPDATE/DELETE.
 * before/after store JSON summaries of changed fields only — never secrets.
 */
export function writeAudit(db: Db, entry: AuditEntry): void {
  db.prepare(
    `INSERT INTO audit_logs
       (user_id, action_key, entity_type, entity_id, before_json, after_json, reason, app_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    entry.userId,
    entry.actionKey,
    entry.entityType ?? null,
    entry.entityId === undefined ? null : String(entry.entityId),
    jsonOrNull(entry.before),
    jsonOrNull(entry.after),
    entry.reason ?? null,
    appVersion(),
  );
}

/** Field-level diff for audit before/after summaries. */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: T,
): { before: Partial<T>; after: Partial<T> } {
  const b: Partial<T> = {};
  const a: Partial<T> = {};
  for (const key of Object.keys(after) as (keyof T)[]) {
    if (before[key] !== after[key]) {
      if (before[key] !== undefined) b[key] = before[key];
      if (after[key] !== undefined) a[key] = after[key];
    }
  }
  return { before: b, after: a };
}
