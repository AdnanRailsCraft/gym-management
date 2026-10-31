import "server-only";
import type { Db } from "@/server/db/index";
import type { AuthzUser } from "@/server/policies/authorize";
import { diffFields, writeAudit } from "@/server/audit";
import type { DurationUnit } from "@/lib/dates";

export interface MembershipPlanRow {
  id: number;
  name: string;
  description: string | null;
  duration_value: number;
  duration_unit: DurationUnit;
  price_minor: number;
  joining_fee_minor: number;
  grace_days: number;
  freeze_allowed: number;
  max_freeze_days: number | null;
  visit_limit: number | null;
  sellable_to_new_members: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface MembershipPlanInput {
  name: string;
  description: string | null;
  durationValue: number;
  durationUnit: DurationUnit;
  priceMinor: number;
  joiningFeeMinor: number;
  graceDays: number;
  freezeAllowed: boolean;
  maxFreezeDays: number | null;
  visitLimit: number | null;
  sellableToNewMembers: boolean;
}

export function listPlans(
  db: Db,
  opts: { includeInactive?: boolean } = {},
): MembershipPlanRow[] {
  const where = opts.includeInactive ? "" : "WHERE is_active = 1";
  return db
    .prepare(`SELECT * FROM membership_plans ${where} ORDER BY is_active DESC, name`)
    .all() as MembershipPlanRow[];
}

export function getPlan(db: Db, id: number): MembershipPlanRow | null {
  const row = db
    .prepare("SELECT * FROM membership_plans WHERE id = ?")
    .get(id) as MembershipPlanRow | undefined;
  return row ?? null;
}

/** Plans a receptionist is allowed to sell right now. */
export function listSellablePlans(db: Db): MembershipPlanRow[] {
  return db
    .prepare(
      `SELECT * FROM membership_plans
       WHERE is_active = 1 AND sellable_to_new_members = 1
       ORDER BY duration_value, name`,
    )
    .all() as MembershipPlanRow[];
}

function auditFields(plan: MembershipPlanRow) {
  return {
    name: plan.name,
    duration_value: plan.duration_value,
    duration_unit: plan.duration_unit,
    price_minor: plan.price_minor,
    joining_fee_minor: plan.joining_fee_minor,
    grace_days: plan.grace_days,
    freeze_allowed: plan.freeze_allowed,
    max_freeze_days: plan.max_freeze_days,
    visit_limit: plan.visit_limit,
    sellable_to_new_members: plan.sellable_to_new_members,
    is_active: plan.is_active,
  };
}

export function createPlan(
  db: Db,
  actor: AuthzUser,
  input: MembershipPlanInput,
): MembershipPlanRow {
  const now = new Date().toISOString();
  return db.transaction(() => {
    const duplicate = db
      .prepare("SELECT id FROM membership_plans WHERE name = ?")
      .get(input.name.trim());
    if (duplicate) {
      throw new Error(`A membership plan named "${input.name.trim()}" already exists.`);
    }
    const res = db
      .prepare(
        `INSERT INTO membership_plans
           (name, description, duration_value, duration_unit, price_minor,
            joining_fee_minor, grace_days, freeze_allowed, max_freeze_days,
            visit_limit, sellable_to_new_members, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(
        input.name.trim(),
        input.description,
        input.durationValue,
        input.durationUnit,
        input.priceMinor,
        input.joiningFeeMinor,
        input.graceDays,
        input.freezeAllowed ? 1 : 0,
        input.maxFreezeDays,
        input.visitLimit,
        input.sellableToNewMembers ? 1 : 0,
        now,
        now,
      );
    const plan = getPlan(db, Number(res.lastInsertRowid))!;
    writeAudit(db, {
      userId: actor.id,
      actionKey: "plan.create",
      entityType: "membership_plan",
      entityId: plan.id,
      after: auditFields(plan),
    });
    return plan;
  })();
}

export function updatePlan(
  db: Db,
  actor: AuthzUser,
  id: number,
  input: MembershipPlanInput,
): MembershipPlanRow {
  const before = getPlan(db, id);
  if (!before) throw new Error("Plan not found");
  const now = new Date().toISOString();
  return db.transaction(() => {
    db.prepare(
      `UPDATE membership_plans SET
         name = ?, description = ?, duration_value = ?, duration_unit = ?,
         price_minor = ?, joining_fee_minor = ?, grace_days = ?,
         freeze_allowed = ?, max_freeze_days = ?, visit_limit = ?,
         sellable_to_new_members = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      input.name.trim(),
      input.description,
      input.durationValue,
      input.durationUnit,
      input.priceMinor,
      input.joiningFeeMinor,
      input.graceDays,
      input.freezeAllowed ? 1 : 0,
      input.maxFreezeDays,
      input.visitLimit,
      input.sellableToNewMembers ? 1 : 0,
      now,
      id,
    );
    const after = getPlan(db, id)!;
    const changed = diffFields(auditFields(before), auditFields(after));
    writeAudit(db, {
      userId: actor.id,
      actionKey: "plan.update",
      entityType: "membership_plan",
      entityId: id,
      before: changed.before,
      after: changed.after,
    });
    return after;
  })();
}

export function setPlanActive(
  db: Db,
  actor: AuthzUser,
  id: number,
  active: boolean,
): void {
  const before = getPlan(db, id);
  if (!before) throw new Error("Plan not found");
  if (before.is_active === (active ? 1 : 0)) return;
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare("UPDATE membership_plans SET is_active = ?, updated_at = ? WHERE id = ?").run(
      active ? 1 : 0,
      now,
      id,
    );
    writeAudit(db, {
      userId: actor.id,
      actionKey: active ? "plan.activate" : "plan.deactivate",
      entityType: "membership_plan",
      entityId: id,
      before: { is_active: before.is_active },
      after: { is_active: active ? 1 : 0 },
    });
  })();
}
