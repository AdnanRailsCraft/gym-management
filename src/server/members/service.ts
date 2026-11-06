import "server-only";
import type { Db } from "@/server/db/index";
import type { AuthzUser } from "@/server/policies/authorize";
import { diffFields, writeAudit } from "@/server/audit";
import type { MembershipState } from "@/lib/dates";
import {
  getCurrentMembership,
  type MembershipView,
} from "@/server/members/memberships";
import { gymToday } from "@/server/members/context";

export type MemberStatus = "active" | "inactive" | "suspended" | "archived";

export interface MemberRow {
  id: number;
  member_number: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  gender: string | null;
  date_of_birth: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  status: MemberStatus;
  client_type: "regular" | "pt";
  notes: string | null;
  referral_source: string | null;
  fitness_goals: string | null;
  marketing_consent: number;
  health_notes: string | null;
  health_consent: number;
  joined_on: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Member row without the restricted health columns. List, export, and other
 * bulk payloads use this so health notes never reach a client that may not
 * have `members.view_health` (REQUIREMENTS 10.1).
 */
export type MemberListRow = Omit<MemberRow, "health_notes" | "health_consent">;

export interface MemberHealthInput {
  notes: string | null;
  consent: boolean;
}

export interface MemberProfileInput {
  fullName: string;
  phone: string | null;
  email: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  notes: string | null;
  referralSource: string | null;
  fitnessGoals: string | null;
  marketingConsent: boolean;
  clientType?: "regular" | "pt";
}

export interface MemberSummary extends MemberListRow {
  membership: MembershipView | null;
}

export interface MemberListFilter {
  search?: string;
  status?: MemberStatus | "all";
  membershipState?: MembershipState | "all";
  planId?: number | null;
}

/**
 * Next member number. Derived from the highest existing `EF-####` rather than a
 * row count so it stays stable once members are archived (never deleted).
 */
export function nextMemberNumber(db: Db): string {
  const row = db
    .prepare(
      `SELECT COALESCE(MAX(CAST(substr(member_number, 4) AS INTEGER)), 0) AS max_n
       FROM members WHERE member_number GLOB 'EF-[0-9]*'`,
    )
    .get() as { max_n: number };
  return `EF-${String(row.max_n + 1).padStart(4, "0")}`;
}

export function getMember(db: Db, id: number): MemberRow | null {
  const row = db.prepare("SELECT * FROM members WHERE id = ?").get(id) as
    | MemberRow
    | undefined;
  return row ?? null;
}

export function listMembers(db: Db, filter: MemberListFilter = {}): MemberListRow[] {
  let query = `SELECT id, member_number, full_name, phone, email, gender,
                      date_of_birth, address, emergency_contact_name,
                      emergency_contact_phone, status, client_type, notes, referral_source,
                      fitness_goals, marketing_consent, joined_on, archived_at,
                      created_at, updated_at
               FROM members WHERE 1=1`;
  const params: unknown[] = [];

  if (filter.status && filter.status !== "all") {
    query += " AND status = ?";
    params.push(filter.status);
  }
  if (filter.search && filter.search.trim()) {
    const s = `%${filter.search.trim().toLowerCase()}%`;
    query +=
      ` AND (lower(full_name) LIKE ? OR lower(member_number) LIKE ?
             OR lower(COALESCE(phone,'')) LIKE ? OR lower(COALESCE(email,'')) LIKE ?)`;
    params.push(s, s, s, s);
  }
  query += " ORDER BY id DESC";
  return db.prepare(query).all(...params) as MemberListRow[];
}

/**
 * Member list with the current membership summary attached. The membership
 * state filter is applied in JS because state is computed from dates
 * (DESIGN B5), never stored.
 */
export function listMemberSummaries(
  db: Db,
  filter: MemberListFilter = {},
): MemberSummary[] {
  const members = listMembers(db, filter);
  let summaries = members.map((m) => ({
    ...m,
    membership: getCurrentMembership(db, m.id),
  }));
  if (filter.membershipState && filter.membershipState !== "all") {
    summaries = summaries.filter(
      (s) => s.membership?.state === filter.membershipState,
    );
  }
  if (filter.planId) {
    summaries = summaries.filter((s) => s.membership?.plan_id === filter.planId);
  }
  return summaries;
}

export function getMemberSummary(db: Db, id: number): MemberSummary | null {
  const member = getMember(db, id);
  if (!member) return null;
  return { ...member, membership: getCurrentMembership(db, id) };
}

/**
 * Restricted health read. Only call this after checking `members.view_health`;
 * the value never rides along on list/summary rows.
 */
export function getMemberHealth(
  db: Db,
  id: number,
): { notes: string | null; consent: boolean } | null {
  const row = db
    .prepare("SELECT health_notes, health_consent FROM members WHERE id = ?")
    .get(id) as { health_notes: string | null; health_consent: number } | undefined;
  if (!row) return null;
  return { notes: row.health_notes, consent: row.health_consent === 1 };
}
/** Likely duplicates by phone, email, or exact name (REQUIREMENTS 10.1). */
export function findDuplicateMembers(
  db: Db,
  input: { phone?: string | null; email?: string | null; fullName?: string | null; excludeId?: number },
): MemberRow[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const phone = input.phone?.trim();
  const email = input.email?.trim().toLowerCase();
  const name = input.fullName?.trim().toLowerCase();
  if (phone) {
    clauses.push("phone = ?");
    params.push(phone);
  }
  if (email) {
    clauses.push("lower(email) = ?");
    params.push(email);
  }
  if (name) {
    clauses.push("lower(full_name) = ?");
    params.push(name);
  }
  if (clauses.length === 0) return [];
  let query = `SELECT * FROM members WHERE status != 'archived' AND (${clauses.join(" OR ")})`;
  if (input.excludeId) {
    query += " AND id != ?";
    params.push(input.excludeId);
  }
  query += " ORDER BY id DESC LIMIT 10";
  return db.prepare(query).all(...params) as MemberRow[];
}

function auditFields(m: MemberRow) {
  return {
    full_name: m.full_name,
    phone: m.phone,
    email: m.email,
    gender: m.gender,
    date_of_birth: m.date_of_birth,
    address: m.address,
    emergency_contact_name: m.emergency_contact_name,
    emergency_contact_phone: m.emergency_contact_phone,
    status: m.status,
    notes: m.notes,
    referral_source: m.referral_source,
    fitness_goals: m.fitness_goals,
    marketing_consent: m.marketing_consent,
  };
}

export function createMember(
  db: Db,
  actor: AuthzUser,
  input: MemberProfileInput,
): MemberRow {
  const now = new Date().toISOString();
  return db.transaction(() => {
    const res = db
      .prepare(
        `INSERT INTO members
           (member_number, full_name, phone, email, gender, date_of_birth,
            address, emergency_contact_name, emergency_contact_phone, status,
            client_type, notes, referral_source, fitness_goals, marketing_consent,
            joined_on, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        nextMemberNumber(db),
        input.fullName.trim(),
        input.phone,
        input.email,
        input.gender,
        input.dateOfBirth,
        input.address,
        input.emergencyContactName,
        input.emergencyContactPhone,
        input.clientType ?? "regular",
        input.notes,
        input.referralSource,
        input.fitnessGoals,
        input.marketingConsent ? 1 : 0,
        gymToday(db),
        now,
        now,
      );
    const member = getMember(db, Number(res.lastInsertRowid))!;
    writeAudit(db, {
      userId: actor.id,
      actionKey: "member.create",
      entityType: "member",
      entityId: member.id,
      after: auditFields(member),
    });
    return member;
  })();
}

export function updateMember(
  db: Db,
  actor: AuthzUser,
  id: number,
  input: MemberProfileInput,
): MemberRow {
  const before = getMember(db, id);
  if (!before) throw new Error("Member not found");
  const now = new Date().toISOString();
  return db.transaction(() => {
    db.prepare(
      `UPDATE members SET
         full_name = ?, phone = ?, email = ?, gender = ?, date_of_birth = ?,
         address = ?, emergency_contact_name = ?, emergency_contact_phone = ?,
         client_type = ?, notes = ?, referral_source = ?, fitness_goals = ?, marketing_consent = ?,
         updated_at = ?
       WHERE id = ?`,
    ).run(
      input.fullName.trim(),
      input.phone,
      input.email,
      input.gender,
      input.dateOfBirth,
      input.address,
      input.emergencyContactName,
      input.emergencyContactPhone,
      input.clientType ?? before.client_type,
      input.notes,
      input.referralSource,
      input.fitnessGoals,
      input.marketingConsent ? 1 : 0,
      now,
      id,
    );
    const after = getMember(db, id)!;
    const changed = diffFields(auditFields(before), auditFields(after));
    writeAudit(db, {
      userId: actor.id,
      actionKey: "member.update",
      entityType: "member",
      entityId: id,
      before: changed.before,
      after: changed.after,
    });
    return after;
  })();
}

export function setMemberStatus(
  db: Db,
  actor: AuthzUser,
  id: number,
  status: MemberStatus,
  reason?: string | null,
): void {
  const before = getMember(db, id);
  if (!before) throw new Error("Member not found");
  if (before.status === status) return;
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare("UPDATE members SET status = ?, updated_at = ? WHERE id = ?").run(
      status,
      now,
      id,
    );
    writeAudit(db, {
      userId: actor.id,
      actionKey: `member.${status === "archived" ? "archive" : "status"}`,
      entityType: "member",
      entityId: id,
      before: { status: before.status },
      after: { status },
      reason: reason ?? undefined,
    });
  })();
}

/** Archive a member. Members are never hard-deleted (REQUIREMENTS 10.2). */
export function archiveMember(
  db: Db,
  actor: AuthzUser,
  id: number,
  reason?: string | null,
): void {
  const before = getMember(db, id);
  if (!before) throw new Error("Member not found");
  if (before.status === "archived") return;
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(
      "UPDATE members SET status = 'archived', archived_at = ?, updated_at = ? WHERE id = ?",
    ).run(now, now, id);
    writeAudit(db, {
      userId: actor.id,
      actionKey: "member.archive",
      entityType: "member",
      entityId: id,
      before: { status: before.status },
      after: { status: "archived" },
      reason: reason ?? undefined,
    });
  })();
}

export function setMemberHealth(
  db: Db,
  actor: AuthzUser,
  id: number,
  input: MemberHealthInput,
): MemberRow {
  const before = getMember(db, id);
  if (!before) throw new Error("Member not found");
  if (input.notes && !input.consent) {
    throw new Error("Recorded consent is required before storing health notes.");
  }
  const now = new Date().toISOString();
  return db.transaction(() => {
    db.prepare(
      `UPDATE members SET health_notes = ?, health_consent = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      input.notes,
      input.consent ? 1 : 0,
      now,
      id,
    );
    const after = getMember(db, id)!;
    const changed = diffFields(
      {
        health_notes: before.health_notes,
        health_consent: before.health_consent,
      },
      {
        health_notes: after.health_notes,
        health_consent: after.health_consent,
      },
    );
    writeAudit(db, {
      userId: actor.id,
      actionKey: "member.health.update",
      entityType: "member",
      entityId: id,
      before: changed.before,
      after: changed.after,
    });
    return after;
  })();
}

export interface MemberStats {
  total: number;
  active: number;
  archived: number;
  activeMemberships: number;
  expiringSoon: number;
  expired: number;
  frozen: number;
}

/**
 * Dashboard counters. Membership counters are computed from live memberships
 * so they always match the list screens.
 */
export function getMemberStats(db: Db): MemberStats {
  const total = (
    db.prepare("SELECT COUNT(*) AS c FROM members").get() as { c: number }
  ).c;
  const archived = (
    db
      .prepare("SELECT COUNT(*) AS c FROM members WHERE status = 'archived'")
      .get() as { c: number }
  ).c;

  const memberships = db
    .prepare("SELECT DISTINCT member_id FROM memberships")
    .all() as { member_id: number }[];
  let activeMemberships = 0;
  let expiringSoon = 0;
  let expired = 0;
  let frozen = 0;
  for (const { member_id } of memberships) {
    const current = getCurrentMembership(db, member_id);
    if (!current) continue;
    if (current.state === "active") activeMemberships += 1;
    else if (current.state === "expiring_soon") {
      activeMemberships += 1;
      expiringSoon += 1;
    } else if (current.state === "frozen") {
      activeMemberships += 1;
      frozen += 1;
    } else if (current.state === "expired") expired += 1;
  }

  return {
    total,
    active: total - archived,
    archived,
    activeMemberships,
    expiringSoon,
    expired,
    frozen,
  };
}
