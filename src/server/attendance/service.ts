import "server-only";

import type { Db } from "@/server/db/index";
import type { AuthzUser } from "@/server/policies/authorize";
import { writeAudit } from "@/server/audit";
import { getMember } from "@/server/members/service";
import { getCurrentMembership } from "@/server/members/memberships";
import { gymSettings, gymToday } from "@/server/members/context";

export type CheckInMethod = "manual" | "qr" | "other";
export type CheckInStatus = "allowed" | "overridden";

export interface AttendanceRecord {
  id: number;
  member_id: number;
  checked_in_at: string;
  checked_out_at: string | null;
  method: CheckInMethod;
  status: CheckInStatus;
  override_reason: string | null;
  notes: string | null;
  recorded_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface CheckInInput {
  memberId: number;
  method?: CheckInMethod;
  notes?: string | null;
  override?: boolean;
  overrideReason?: string | null;
}

export interface CheckInResult {
  ok: boolean;
  status: CheckInStatus | null;
  message?: string;
}

function addMinutes(iso: string, minutes: number): string {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

export function getMemberAttendance(db: Db, memberId: number, limit = 50): AttendanceRecord[] {
  return db
    .prepare(
      `SELECT id, member_id, checked_in_at, checked_out_at, method, status,
              override_reason, notes, recorded_by, created_at, updated_at
       FROM attendance
       WHERE member_id = ?
       ORDER BY checked_in_at DESC
       LIMIT ?`,
    )
    .all(memberId, limit) as AttendanceRecord[];
}

export function listAttendanceToday(db: Db): (AttendanceRecord & { member_name: string; member_number: string })[] {
  const today = gymToday(db);
  const start = `${today}T00:00:00.000Z`;
  const end = `${today}T23:59:59.999Z`;
  return db
    .prepare(
      `SELECT a.id, a.member_id, a.checked_in_at, a.checked_out_at, a.method,
              a.status, a.override_reason, a.notes, a.recorded_by, a.created_at,
              a.updated_at, m.full_name AS member_name, m.member_number AS member_number
       FROM attendance a
       JOIN members m ON m.id = a.member_id
       WHERE a.checked_in_at >= ? AND a.checked_in_at <= ?
       ORDER BY a.checked_in_at DESC`,
    )
    .all(start, end) as (AttendanceRecord & { member_name: string; member_number: string })[];
}

export function checkIn(db: Db, actor: AuthzUser, input: CheckInInput): CheckInResult {
  const member = getMember(db, input.memberId);
  if (!member) return { ok: false, status: null, message: "Member not found" };

  const settings = gymSettings(db);
  const windowMinutes = Number(settings.duplicate_checkin_window_minutes ?? 10) || 10;
  const nowIso = new Date().toISOString();
  const method: CheckInMethod = input.method ?? "manual";
  const notes = input.notes ?? null;

  return db.transaction(() => {
    if (member.status === "archived" || member.status === "suspended") {
      return { ok: false, status: null, message: `Member is ${member.status}` };
    }
    const membership = getCurrentMembership(db, member.id);
    if (!membership) {
      return { ok: false, status: null, message: "No active membership" };
    }
    if (membership.state === "expired") {
      if (input.override && input.overrideReason?.trim()) {
        const reason = input.overrideReason.trim();
        db.prepare(
          `INSERT INTO attendance (member_id, checked_in_at, checked_out_at, method, status, override_reason, notes, recorded_by, created_at, updated_at)
           VALUES (?, ?, NULL, ?, 'overridden', ?, ?, ?, ?, ?)`,
        ).run(member.id, nowIso, method, reason, notes, actor.id, nowIso, nowIso);
        writeAudit(db, {
          userId: actor.id,
          actionKey: "attendance.checkin.override",
          entityType: "attendance",
          entityId: member.id,
          before: { membership_state: membership.state },
          after: { status: "overridden" },
          reason,
        });
        return { ok: true, status: "overridden", message: "Checked in (override: membership expired)" } as CheckInResult;
      }
      return { ok: false, status: null, message: "Membership expired" };
    }
    if (membership.state === "frozen") {
      if (input.override && input.overrideReason?.trim()) {
        const reason = input.overrideReason.trim();
        db.prepare(
          `INSERT INTO attendance (member_id, checked_in_at, checked_out_at, method, status, override_reason, notes, recorded_by, created_at, updated_at)
           VALUES (?, ?, NULL, ?, 'overridden', ?, ?, ?, ?, ?)`,
        ).run(member.id, nowIso, method, reason, notes, actor.id, nowIso, nowIso);
        writeAudit(db, {
          userId: actor.id,
          actionKey: "attendance.checkin.override",
          entityType: "attendance",
          entityId: member.id,
          before: { membership_state: membership.state },
          after: { status: "overridden" },
          reason,
        });
        return { ok: true, status: "overridden", message: "Checked in (override: membership frozen)" } as CheckInResult;
      }
      return { ok: false, status: null, message: "Membership frozen" };
    }
    // Duplicate check
    const windowStart = addMinutes(nowIso, -windowMinutes);
    const recent = db
      .prepare(
        `SELECT id, checked_in_at FROM attendance
         WHERE member_id = ? AND checked_in_at >= ?
         ORDER BY checked_in_at DESC
         LIMIT 1`,
      )
      .get(member.id, windowStart) as { id: number; checked_in_at: string } | undefined;
    if (recent) {
      if (input.override && input.overrideReason?.trim()) {
        const reason = input.overrideReason.trim();
        db.prepare(
          `INSERT INTO attendance (member_id, checked_in_at, checked_out_at, method, status, override_reason, notes, recorded_by, created_at, updated_at)
           VALUES (?, ?, NULL, ?, 'overridden', ?, ?, ?, ?, ?)`,
        ).run(member.id, nowIso, method, reason, notes, actor.id, nowIso, nowIso);
        writeAudit(db, {
          userId: actor.id,
          actionKey: "attendance.checkin.override",
          entityType: "attendance",
          entityId: member.id,
          before: { duplicate_at: recent.checked_in_at },
          after: { status: "overridden" },
          reason,
        });
        return { ok: true, status: "overridden", message: "Checked in (override: duplicate)" } as CheckInResult;
      }
      return { ok: false, status: null, message: `Already checked in recently (within ${windowMinutes}m)` };
    }
    db.prepare(
      `INSERT INTO attendance (member_id, checked_in_at, checked_out_at, method, status, override_reason, notes, recorded_by, created_at, updated_at)
       VALUES (?, ?, NULL, ?, 'allowed', NULL, ?, ?, ?, ?)`,
    ).run(member.id, nowIso, method, notes, actor.id, nowIso, nowIso);
    writeAudit(db, {
      userId: actor.id,
      actionKey: "attendance.checkin",
      entityType: "attendance",
      entityId: member.id,
      before: null,
      after: { status: "allowed" },
    });
    return { ok: true, status: "allowed", message: "Checked in" } as CheckInResult;
  })();
}
