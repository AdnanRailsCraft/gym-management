import "server-only";

import type { Db } from "@/server/db/index";
import type { AuthzUser } from "@/server/policies/authorize";
import { writeAudit } from "@/server/audit";
import { addDays, diffDays } from "@/lib/dates";
import { getCurrentMembership } from "@/server/members/memberships";
import { gymSettings, gymToday } from "@/server/members/context";

export type ReminderChannel = "whatsapp" | "sms" | "call" | "in_person" | "other";

export const REMINDER_CHANNELS: ReminderChannel[] = [
  "whatsapp",
  "sms",
  "call",
  "in_person",
  "other",
];

export interface ReminderCandidate {
  membershipId: number;
  memberId: number;
  memberNumber: string;
  memberName: string;
  phone: string | null;
  planName: string;
  endOn: string;
  /** Days until the last valid day. 0 = last day, negative = already expired. */
  daysLeft: number;
  lastRemindedAt: string | null;
  lastChannel: ReminderChannel | null;
}

export interface ReminderRow {
  id: number;
  membership_id: number;
  member_id: number;
  channel: ReminderChannel;
  message: string;
  sent_by: number | null;
  sent_at: string;
  notes: string | null;
  created_at: string;
}

interface MemberContactRow {
  id: number;
  member_number: string;
  full_name: string;
  phone: string | null;
  status: string;
}

interface LastReminderRow {
  membership_id: number;
  sent_at: string;
  channel: ReminderChannel;
}

/**
 * Members whose current membership ends within `withinDays` (including those
 * that expired no more than `withinDays` ago, for win-back follow-up).
 * Only the current membership per member is returned, so a renewal never
 * produces a stale duplicate reminder.
 */
export function listExpiringMemberships(db: Db, withinDays: number): ReminderCandidate[] {
  const today = gymToday(db);
  const horizon = addDays(today, withinDays);

  const members = db
    .prepare(
      `SELECT id, member_number, full_name, phone, status
       FROM members WHERE status = 'active'`,
    )
    .all() as MemberContactRow[];
  const contactById = new Map(members.map((m) => [m.id, m]));

  const lastRows = db
    .prepare(
      `SELECT r.membership_id, r.sent_at, r.channel
       FROM membership_reminders r
       JOIN (
         SELECT membership_id, MAX(sent_at) AS sent_at
         FROM membership_reminders GROUP BY membership_id
       ) latest ON latest.membership_id = r.membership_id AND latest.sent_at = r.sent_at`,
    )
    .all() as LastReminderRow[];
  const lastByMembership = new Map<number, LastReminderRow>();
  for (const row of lastRows) {
    if (!lastByMembership.has(row.membership_id)) lastByMembership.set(row.membership_id, row);
  }

  const memberIds = db
    .prepare("SELECT DISTINCT member_id FROM memberships")
    .all() as { member_id: number }[];

  const candidates: ReminderCandidate[] = [];
  for (const { member_id } of memberIds) {
    const contact = contactById.get(member_id);
    if (!contact) continue;
    const current = getCurrentMembership(db, member_id);
    if (!current) continue;
    if (current.lifecycle_status !== "active") continue;
    if (current.state !== "active" && current.state !== "expiring_soon" && current.state !== "expired") {
      continue;
    }
    if (current.end_on > horizon) continue;
    const daysLeft = diffDays(today, current.end_on);
    if (daysLeft < -withinDays) continue;
    const last = lastByMembership.get(current.id) ?? null;
    candidates.push({
      membershipId: current.id,
      memberId: contact.id,
      memberNumber: contact.member_number,
      memberName: contact.full_name,
      phone: contact.phone,
      planName: current.planName,
      endOn: current.end_on,
      daysLeft,
      lastRemindedAt: last?.sent_at ?? null,
      lastChannel: last?.channel ?? null,
    });
  }

  candidates.sort((a, b) => {
    if (a.daysLeft !== b.daysLeft) return a.daysLeft - b.daysLeft;
    return a.memberName.localeCompare(b.memberName);
  });
  return candidates;
}

export function listMemberReminders(db: Db, memberId: number, limit = 20): ReminderRow[] {
  return db
    .prepare(
      `SELECT id, membership_id, member_id, channel, message, sent_by, sent_at, notes, created_at
       FROM membership_reminders
       WHERE member_id = ?
       ORDER BY sent_at DESC
       LIMIT ?`,
    )
    .all(memberId, limit) as ReminderRow[];
}

export interface RecordReminderInput {
  membershipId: number;
  channel: ReminderChannel;
  message: string;
  notes?: string | null;
}

export function recordReminder(
  db: Db,
  actor: AuthzUser,
  input: RecordReminderInput,
): ReminderRow {
  const membership = db
    .prepare("SELECT id, member_id FROM memberships WHERE id = ?")
    .get(input.membershipId) as { id: number; member_id: number } | undefined;
  if (!membership) throw new Error("Membership not found");

  const now = new Date().toISOString();
  return db.transaction(() => {
    const res = db
      .prepare(
        `INSERT INTO membership_reminders
           (membership_id, member_id, channel, message, sent_by, sent_at, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        membership.id,
        membership.member_id,
        input.channel,
        input.message,
        actor.id,
        now,
        input.notes ?? null,
        now,
      );
    const row = db
      .prepare(
        `SELECT id, membership_id, member_id, channel, message, sent_by, sent_at, notes, created_at
         FROM membership_reminders WHERE id = ?`,
      )
      .get(Number(res.lastInsertRowid)) as ReminderRow;
    writeAudit(db, {
      userId: actor.id,
      actionKey: "membership.reminder",
      entityType: "membership",
      entityId: membership.id,
      before: null,
      after: { channel: input.channel, member_id: membership.member_id },
    });
    return row;
  })();
}

/** Default reminder window from gym settings (falls back to 7 days). */
export function reminderWindowDays(db: Db): number {
  const settings = gymSettings(db);
  const value = Number(settings.expiry_reminder_days_1 ?? 7);
  return Number.isFinite(value) && value > 0 && value <= 120 ? value : 7;
}
