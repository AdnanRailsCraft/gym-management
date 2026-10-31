import "server-only";
import type { Db } from "@/server/db/index";
import type { AuthzUser } from "@/server/policies/authorize";
import { writeAudit } from "@/server/audit";
import { getPlan } from "@/server/members/plans";
import { gymToday } from "@/server/members/context";
import { getGymSettings } from "@/server/users/service";
import {
  addDays,
  addMonthsClamped,
  compareIso,
  computeEndOn,
  computeMembershipState,
  diffDays,
  inclusiveDayCount,
  isIsoDate,
  resolveRenewalStart,
  type MembershipLifecycleStatus,
  type MembershipState,
} from "@/lib/dates";

export interface MembershipRow {
  id: number;
  member_id: number;
  plan_id: number;
  start_on: string;
  end_on: string;
  lifecycle_status: MembershipLifecycleStatus;
  price_minor: number;
  joining_fee_minor: number;
  discount_minor: number;
  discount_reason: string | null;
  notes: string | null;
  idempotency_key: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

interface MembershipJoinedRow extends MembershipRow {
  plan_name: string;
  plan_grace_days: number;
  plan_freeze_allowed: number;
  plan_max_freeze_days: number | null;
}

export interface MembershipView extends MembershipRow {
  planName: string;
  graceDays: number;
  freezeAllowed: boolean;
  maxFreezeDays: number | null;
  totalChargeMinor: number;
  /** Computed from dates + lifecycle + freezes; never stored (DESIGN B5). */
  state: MembershipState;
  frozenToday: boolean;
  /** Last day the membership is still valid including the plan's grace period. */
  graceEndsOn: string;
}

export interface FreezeRow {
  id: number;
  membership_id: number;
  from_on: string;
  to_on: string;
  days: number;
  reason: string;
  created_by: number | null;
  created_at: string;
}

const JOIN_SQL = `SELECT m.*, p.name AS plan_name, p.grace_days AS plan_grace_days,
                         p.freeze_allowed AS plan_freeze_allowed,
                         p.max_freeze_days AS plan_max_freeze_days
                  FROM memberships m
                  JOIN membership_plans p ON p.id = m.plan_id`;

function totalChargeMinor(row: MembershipRow): number {
  return Math.max(
    0,
    row.price_minor + row.joining_fee_minor - row.discount_minor,
  );
}

function isFrozenOn(db: Db, membershipId: number, day: string): boolean {
  const row = db
    .prepare(
      `SELECT 1 AS ok FROM membership_freezes
       WHERE membership_id = ? AND from_on <= ? AND to_on >= ? LIMIT 1`,
    )
    .get(membershipId, day, day);
  return row !== undefined;
}

function toView(
  db: Db,
  row: MembershipJoinedRow,
  today: string,
  reminderDays: number,
): MembershipView {
  const frozenToday = isFrozenOn(db, row.id, today);
  return {
    id: row.id,
    member_id: row.member_id,
    plan_id: row.plan_id,
    start_on: row.start_on,
    end_on: row.end_on,
    lifecycle_status: row.lifecycle_status,
    price_minor: row.price_minor,
    joining_fee_minor: row.joining_fee_minor,
    discount_minor: row.discount_minor,
    discount_reason: row.discount_reason,
    notes: row.notes,
    idempotency_key: row.idempotency_key,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    planName: row.plan_name,
    graceDays: row.plan_grace_days,
    freezeAllowed: row.plan_freeze_allowed === 1,
    maxFreezeDays: row.plan_max_freeze_days,
    totalChargeMinor: totalChargeMinor(row),
    frozenToday,
    state: computeMembershipState({
      lifecycleStatus: row.lifecycle_status,
      startOn: row.start_on,
      endOn: row.end_on,
      graceDays: row.plan_grace_days,
      reminderDays,
      frozenToday,
      today,
    }),
    graceEndsOn: addDays(row.end_on, row.plan_grace_days),
  };
}

function context(db: Db): { today: string; reminderDays: number } {
  const gym = getGymSettings(db);
  return {
    today: gymToday(db),
    reminderDays: Math.max(gym.expiry_reminder_days_1, gym.expiry_reminder_days_2),
  };
}

export function getMembershipRow(db: Db, id: number): MembershipRow | null {
  const row = db
    .prepare("SELECT * FROM memberships WHERE id = ?")
    .get(id) as MembershipRow | undefined;
  return row ?? null;
}

export function getMembership(db: Db, id: number): MembershipView | null {
  const row = db.prepare(`${JOIN_SQL} WHERE m.id = ?`).get(id) as
    | MembershipJoinedRow
    | undefined;
  if (!row) return null;
  const { today, reminderDays } = context(db);
  return toView(db, row, today, reminderDays);
}

export function listMemberships(db: Db, memberId: number): MembershipView[] {
  const rows = db
    .prepare(`${JOIN_SQL} WHERE m.member_id = ? ORDER BY m.end_on DESC, m.id DESC`)
    .all(memberId) as MembershipJoinedRow[];
  const { today, reminderDays } = context(db);
  return rows.map((r) => toView(db, r, today, reminderDays));
}

export function listFreezes(db: Db, membershipId: number): FreezeRow[] {
  return db
    .prepare(
      "SELECT * FROM membership_freezes WHERE membership_id = ? ORDER BY from_on DESC",
    )
    .all(membershipId) as FreezeRow[];
}

const STATE_RANK: Record<MembershipState, number> = {
  active: 0,
  expiring_soon: 1,
  frozen: 2,
  scheduled: 3,
  suspended: 4,
  expired: 5,
  cancelled: 6,
};

/** The membership that best represents a member's current standing. */
export function getCurrentMembership(db: Db, memberId: number): MembershipView | null {
  const all = listMemberships(db, memberId);
  if (all.length === 0) return null;
  return all.reduce((best, current) => {
    const rank = STATE_RANK[current.state];
    const bestRank = STATE_RANK[best.state];
    if (rank !== bestRank) return rank < bestRank ? current : best;
    if (current.end_on !== best.end_on) {
      return compareIso(current.end_on, best.end_on) > 0 ? current : best;
    }
    return current.id > best.id ? current : best;
  });
}

function findByIdempotencyKey(db: Db, key: string): MembershipRow | null {
  const row = db
    .prepare("SELECT * FROM memberships WHERE idempotency_key = ?")
    .get(key) as MembershipRow | undefined;
  return row ?? null;
}

function assertNonNegativeInt(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative amount`);
  }
}

function findOverlap(
  db: Db,
  memberId: number,
  startOn: string,
  endOn: string,
  excludeId?: number,
): { id: number; start_on: string; end_on: string } | null {
  let query = `SELECT id, start_on, end_on FROM memberships
               WHERE member_id = ? AND lifecycle_status != 'cancelled'
                 AND end_on >= ? AND start_on <= ?`;
  const params: unknown[] = [memberId, startOn, endOn];
  if (excludeId) {
    query += " AND id != ?";
    params.push(excludeId);
  }
  query += " LIMIT 1";
  const row = db.prepare(query).get(...params) as
    | { id: number; start_on: string; end_on: string }
    | undefined;
  return row ?? null;
}

function assertNoOverlap(
  db: Db,
  memberId: number,
  startOn: string,
  endOn: string,
  excludeId?: number,
): void {
  const overlap = findOverlap(db, memberId, startOn, endOn, excludeId);
  if (overlap) {
    throw new Error(
      `Overlaps existing membership #${overlap.id} (${overlap.start_on} to ${overlap.end_on})`,
    );
  }
}

export interface SellMembershipInput {
  memberId: number;
  planId: number;
  startOn?: string | null;
  priceMinor?: number | null;
  joiningFeeMinor?: number | null;
  discountMinor?: number | null;
  discountReason?: string | null;
  notes?: string | null;
  idempotencyKey?: string | null;
}

/** Start a new membership (REQUIREMENTS 11.3). One transaction + audit. */
export function sellMembership(
  db: Db,
  actor: AuthzUser,
  input: SellMembershipInput,
): MembershipRow {
  const today = gymToday(db);
  return db.transaction(() => {
    if (input.idempotencyKey) {
      const existing = findByIdempotencyKey(db, input.idempotencyKey);
      if (existing) return existing;
    }
    const plan = getPlan(db, input.planId);
    if (!plan) throw new Error("Plan not found");
    if (plan.is_active !== 1) throw new Error("Plan is not active");
    if (plan.sellable_to_new_members !== 1) {
      throw new Error("Plan is not available for new memberships");
    }
    const startOn = input.startOn ?? today;
    if (!isIsoDate(startOn)) throw new Error("Invalid start date");
    const endOn = computeEndOn(startOn, plan.duration_value, plan.duration_unit);
    const price = input.priceMinor ?? plan.price_minor;
    const joining = input.joiningFeeMinor ?? plan.joining_fee_minor;
    const discount = input.discountMinor ?? 0;
    assertNonNegativeInt(price, "Price");
    assertNonNegativeInt(joining, "Joining fee");
    assertNonNegativeInt(discount, "Discount");
    assertNoOverlap(db, input.memberId, startOn, endOn);

    const now = new Date().toISOString();
    const lifecycle: MembershipLifecycleStatus =
      compareIso(startOn, today) > 0 ? "scheduled" : "active";
    const res = db
      .prepare(
        `INSERT INTO memberships
           (member_id, plan_id, start_on, end_on, lifecycle_status, price_minor,
            joining_fee_minor, discount_minor, discount_reason, notes,
            idempotency_key, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.memberId,
        plan.id,
        startOn,
        endOn,
        lifecycle,
        price,
        joining,
        discount,
        input.discountReason,
        input.notes,
        input.idempotencyKey ?? null,
        actor.id,
        now,
        now,
      );
    const id = Number(res.lastInsertRowid);
    writeAudit(db, {
      userId: actor.id,
      actionKey: "membership.sell",
      entityType: "membership",
      entityId: id,
      after: {
        member_id: input.memberId,
        plan_id: plan.id,
        plan_name: plan.name,
        start_on: startOn,
        end_on: endOn,
        price_minor: price,
        joining_fee_minor: joining,
        discount_minor: discount,
      },
    });
    return getMembershipRow(db, id)!;
  })();
}

export interface RenewMembershipInput {
  membershipId: number;
  planId?: number | null;
  startOn?: string | null;
  priceMinor?: number | null;
  discountMinor?: number | null;
  discountReason?: string | null;
  notes?: string | null;
  idempotencyKey?: string | null;
}

/**
 * Renew by creating a new membership row (history is preserved). The new
 * membership starts the day after the current end date while it is still
 * valid, otherwise today (DESIGN B5).
 */
export function renewMembership(
  db: Db,
  actor: AuthzUser,
  input: RenewMembershipInput,
): MembershipRow {
  const today = gymToday(db);
  return db.transaction(() => {
    if (input.idempotencyKey) {
      const existing = findByIdempotencyKey(db, input.idempotencyKey);
      if (existing) return existing;
    }
    const current = getMembershipRow(db, input.membershipId);
    if (!current) throw new Error("Membership not found");
    if (current.lifecycle_status === "cancelled") {
      throw new Error("A cancelled membership cannot be renewed");
    }
    if (current.lifecycle_status === "suspended") {
      throw new Error("Reactivate the membership before renewing it");
    }
    const plan = getPlan(db, input.planId ?? current.plan_id);
    if (!plan) throw new Error("Plan not found");
    if (plan.is_active !== 1) throw new Error("Plan is not active");

    const startOn =
      input.startOn ?? resolveRenewalStart(current.end_on, today);
    if (!isIsoDate(startOn)) throw new Error("Invalid start date");
    const endOn = computeEndOn(startOn, plan.duration_value, plan.duration_unit);
    const price = input.priceMinor ?? plan.price_minor;
    const discount = input.discountMinor ?? 0;
    assertNonNegativeInt(price, "Price");
    assertNonNegativeInt(discount, "Discount");
    assertNoOverlap(db, current.member_id, startOn, endOn, current.id);

    const now = new Date().toISOString();
    const lifecycle: MembershipLifecycleStatus =
      compareIso(startOn, today) > 0 ? "scheduled" : "active";
    const res = db
      .prepare(
        `INSERT INTO memberships
           (member_id, plan_id, start_on, end_on, lifecycle_status, price_minor,
            joining_fee_minor, discount_minor, discount_reason, notes,
            idempotency_key, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        current.member_id,
        plan.id,
        startOn,
        endOn,
        lifecycle,
        price,
        discount,
        input.discountReason,
        input.notes,
        input.idempotencyKey ?? null,
        actor.id,
        now,
        now,
      );
    const id = Number(res.lastInsertRowid);
    writeAudit(db, {
      userId: actor.id,
      actionKey: "membership.renew",
      entityType: "membership",
      entityId: id,
      before: { previous_membership_id: current.id, previous_end_on: current.end_on },
      after: {
        member_id: current.member_id,
        plan_id: plan.id,
        start_on: startOn,
        end_on: endOn,
        price_minor: price,
      },
    });
    return getMembershipRow(db, id)!;
  })();
}

export interface ExtendMembershipInput {
  membershipId: number;
  days?: number | null;
  months?: number | null;
  reason: string;
}

/** Extend expiry. Mandatory reason, audited (REQUIREMENTS 11.3). */
export function extendMembership(
  db: Db,
  actor: AuthzUser,
  input: ExtendMembershipInput,
): MembershipRow {
  const reason = input.reason.trim();
  if (!reason) throw new Error("A reason is required to extend a membership");
  const hasDays = input.days !== null && input.days !== undefined && input.days !== 0;
  const hasMonths =
    input.months !== null && input.months !== undefined && input.months !== 0;
  if (hasDays === hasMonths) {
    throw new Error("Provide either a number of days or a number of months");
  }
  return db.transaction(() => {
    const current = getMembershipRow(db, input.membershipId);
    if (!current) throw new Error("Membership not found");
    if (current.lifecycle_status === "cancelled") {
      throw new Error("A cancelled membership cannot be extended");
    }
    let newEnd: string;
    if (hasDays) {
      if (!Number.isInteger(input.days) || (input.days as number) < 1) {
        throw new Error("Days must be a positive integer");
      }
      newEnd = addDays(current.end_on, input.days as number);
    } else {
      if (!Number.isInteger(input.months) || (input.months as number) < 1) {
        throw new Error("Months must be a positive integer");
      }
      newEnd = addMonthsClamped(current.end_on, input.months as number);
    }
    const now = new Date().toISOString();
    db.prepare("UPDATE memberships SET end_on = ?, updated_at = ? WHERE id = ?").run(
      newEnd,
      now,
      current.id,
    );
    writeAudit(db, {
      userId: actor.id,
      actionKey: "membership.extend",
      entityType: "membership",
      entityId: current.id,
      before: { end_on: current.end_on },
      after: { end_on: newEnd },
      reason,
    });
    return getMembershipRow(db, current.id)!;
  })();
}

export interface FreezeMembershipInput {
  membershipId: number;
  fromOn: string;
  toOn: string;
  reason: string;
}

/**
 * Freeze a membership. The frozen days are added to `end_on` so frozen time is
 * not consumed (DESIGN B5). Plan freeze rules and max days are enforced.
 */
export function freezeMembership(
  db: Db,
  actor: AuthzUser,
  input: FreezeMembershipInput,
): MembershipRow {
  const reason = input.reason.trim();
  if (!reason) throw new Error("A reason is required to freeze a membership");
  if (!isIsoDate(input.fromOn) || !isIsoDate(input.toOn)) {
    throw new Error("Invalid freeze dates");
  }
  if (compareIso(input.toOn, input.fromOn) < 0) {
    throw new Error("The freeze end date cannot be before the start date");
  }
  return db.transaction(() => {
    const row = db
      .prepare(`${JOIN_SQL} WHERE m.id = ?`)
      .get(input.membershipId) as MembershipJoinedRow | undefined;
    if (!row) throw new Error("Membership not found");
    if (row.lifecycle_status === "cancelled") {
      throw new Error("A cancelled membership cannot be frozen");
    }
    if (row.lifecycle_status === "suspended") {
      throw new Error("A suspended membership cannot be frozen");
    }
    if (row.plan_freeze_allowed !== 1) {
      throw new Error(`Plan "${row.plan_name}" does not allow freezing`);
    }
    if (compareIso(input.fromOn, row.start_on) < 0) {
      throw new Error("The freeze cannot start before the membership starts");
    }
    if (compareIso(input.fromOn, row.end_on) > 0) {
      throw new Error("The freeze cannot start after the membership ends");
    }
    const overlap = db
      .prepare(
        `SELECT id FROM membership_freezes
         WHERE membership_id = ? AND from_on <= ? AND to_on >= ? LIMIT 1`,
      )
      .get(input.membershipId, input.toOn, input.fromOn);
    if (overlap) throw new Error("These dates overlap an existing freeze");

    const days = inclusiveDayCount(input.fromOn, input.toOn);
    if (row.plan_max_freeze_days !== null) {
      const used = (
        db
          .prepare(
            "SELECT COALESCE(SUM(days), 0) AS total FROM membership_freezes WHERE membership_id = ?",
          )
          .get(input.membershipId) as { total: number }
      ).total;
      if (used + days > row.plan_max_freeze_days) {
        throw new Error(
          `Plan allows at most ${row.plan_max_freeze_days} freeze days in total`,
        );
      }
    }

    const newEnd = addDays(row.end_on, days);
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO membership_freezes
         (membership_id, from_on, to_on, days, reason, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(input.membershipId, input.fromOn, input.toOn, days, reason, actor.id, now);
    db.prepare("UPDATE memberships SET end_on = ?, updated_at = ? WHERE id = ?").run(
      newEnd,
      now,
      input.membershipId,
    );
    writeAudit(db, {
      userId: actor.id,
      actionKey: "membership.freeze",
      entityType: "membership",
      entityId: input.membershipId,
      before: { end_on: row.end_on },
      after: {
        end_on: newEnd,
        from_on: input.fromOn,
        to_on: input.toOn,
        days,
      },
      reason,
    });
    return getMembershipRow(db, input.membershipId)!;
  })();
}

/** End the currently running freeze early; unused days are removed from end_on. */
export function unfreezeMembership(
  db: Db,
  actor: AuthzUser,
  membershipId: number,
  reason: string,
): MembershipRow {
  const trimmed = reason.trim();
  if (!trimmed) throw new Error("A reason is required to end a freeze");
  const today = gymToday(db);
  return db.transaction(() => {
    const current = getMembershipRow(db, membershipId);
    if (!current) throw new Error("Membership not found");
    const freeze = db
      .prepare(
        `SELECT * FROM membership_freezes
         WHERE membership_id = ? AND from_on <= ? AND to_on >= ?
         ORDER BY to_on DESC LIMIT 1`,
      )
      .get(membershipId, today, today) as FreezeRow | undefined;
    if (!freeze) throw new Error("There is no active freeze to end");

    const unusedDays = diffDays(today, freeze.to_on);
    const newEnd = addDays(current.end_on, -unusedDays);
    const newDays = inclusiveDayCount(freeze.from_on, today);
    const now = new Date().toISOString();
    db.prepare(
      "UPDATE membership_freezes SET to_on = ?, days = ? WHERE id = ?",
    ).run(today, newDays, freeze.id);
    db.prepare("UPDATE memberships SET end_on = ?, updated_at = ? WHERE id = ?").run(
      newEnd,
      now,
      membershipId,
    );
    writeAudit(db, {
      userId: actor.id,
      actionKey: "membership.unfreeze",
      entityType: "membership",
      entityId: membershipId,
      before: { end_on: current.end_on, freeze_to_on: freeze.to_on },
      after: { end_on: newEnd, freeze_to_on: today },
      reason: trimmed,
    });
    return getMembershipRow(db, membershipId)!;
  })();
}

function changeLifecycle(
  db: Db,
  actor: AuthzUser,
  membershipId: number,
  to: MembershipLifecycleStatus,
  reason: string | null,
  actionKey: string,
): MembershipRow {
  return db.transaction(() => {
    const current = getMembershipRow(db, membershipId);
    if (!current) throw new Error("Membership not found");
    if (current.lifecycle_status === to) return current;
    const now = new Date().toISOString();
    db.prepare(
      "UPDATE memberships SET lifecycle_status = ?, updated_at = ? WHERE id = ?",
    ).run(to, now, membershipId);
    writeAudit(db, {
      userId: actor.id,
      actionKey,
      entityType: "membership",
      entityId: membershipId,
      before: { lifecycle_status: current.lifecycle_status },
      after: { lifecycle_status: to },
      reason: reason ?? undefined,
    });
    return getMembershipRow(db, membershipId)!;
  })();
}

export function suspendMembership(
  db: Db,
  actor: AuthzUser,
  membershipId: number,
  reason: string,
): MembershipRow {
  const trimmed = reason.trim();
  if (!trimmed) throw new Error("A reason is required to suspend a membership");
  const current = getMembershipRow(db, membershipId);
  if (current?.lifecycle_status === "cancelled") {
    throw new Error("A cancelled membership cannot be suspended");
  }
  return changeLifecycle(db, actor, membershipId, "suspended", trimmed, "membership.suspend");
}

export function reactivateMembership(
  db: Db,
  actor: AuthzUser,
  membershipId: number,
): MembershipRow {
  const current = getMembershipRow(db, membershipId);
  if (!current) throw new Error("Membership not found");
  if (current.lifecycle_status === "cancelled") {
    throw new Error("A cancelled membership cannot be reactivated");
  }
  const today = gymToday(db);
  const to: MembershipLifecycleStatus =
    compareIso(current.start_on, today) > 0 ? "scheduled" : "active";
  return changeLifecycle(db, actor, membershipId, to, null, "membership.reactivate");
}

export function cancelMembership(
  db: Db,
  actor: AuthzUser,
  membershipId: number,
  reason: string,
): MembershipRow {
  const trimmed = reason.trim();
  if (!trimmed) throw new Error("A reason is required to cancel a membership");
  return changeLifecycle(
    db,
    actor,
    membershipId,
    "cancelled",
    trimmed,
    "membership.cancel",
  );
}
