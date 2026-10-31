"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/connection";
import { authorize, PolicyError } from "@/server/policies/authorize";
import { PERMISSIONS } from "@/server/policies/permissions";
import { checkInSchema } from "@/server/attendance/schemas";
import { checkIn } from "@/server/attendance/service";
import { getCurrentMembership } from "@/server/members/memberships";
import type { MembershipState } from "@/lib/dates";

export interface CheckInActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

function fail(error: unknown): CheckInActionResult {
  if (error instanceof PolicyError) return { ok: false, error: error.message };
  return {
    ok: false,
    error: error instanceof Error ? error.message : "The request failed",
  };
}

export async function checkInAction(formData: FormData): Promise<CheckInActionResult> {
  const user = await requireUser();
  try {
    authorize(user, PERMISSIONS.attendanceRecord);
    const parsed = checkInSchema.safeParse({
      memberId: formData.get("memberId"),
      method: formData.get("method") ?? "manual",
      notes: formData.get("notes") ?? "",
      override: formData.get("override"),
      overrideReason: formData.get("overrideReason") ?? "",
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    if (parsed.data.override && !parsed.data.overrideReason?.trim()) {
      return { ok: false, error: "Override reason is required" };
    }
    const db = getDb();
    const res = checkIn(db, user, parsed.data);
    if (!res.ok) return { ok: false, error: res.message ?? "Not allowed" };
    revalidatePath("/attendance");
    return { ok: true, message: res.message };
  } catch (err) {
    return fail(err);
  }
}

export interface MemberLookup {
  id: number;
  memberNumber: string;
  fullName: string;
  phone: string | null;
  state: MembershipState | null;
  planName: string | null;
  endOn: string | null;
}

export interface MemberSearchResult {
  ok: boolean;
  results?: MemberLookup[];
  error?: string;
}

export async function searchMembersAction(query: string): Promise<MemberSearchResult> {
  const user = await requireUser();
  try {
    authorize(user, PERMISSIONS.attendanceRecord);
    const q = query.trim();
    if (q.length < 2) return { ok: true, results: [] };
    const db = getDb();
    const like = `%${q.toLowerCase()}%`;
    const rows = db
      .prepare(
        `SELECT id, member_number, full_name, phone
         FROM members
         WHERE status != 'archived'
           AND (lower(full_name) LIKE ? OR lower(member_number) LIKE ? OR phone LIKE ?)
         ORDER BY full_name
         LIMIT 8`,
      )
      .all(like, like, `%${q}%`) as {
      id: number;
      member_number: string;
      full_name: string;
      phone: string | null;
    }[];
    const results = rows.map((row) => {
      const current = getCurrentMembership(db, row.id);
      return {
        id: row.id,
        memberNumber: row.member_number,
        fullName: row.full_name,
        phone: row.phone,
        state: current?.state ?? null,
        planName: current?.planName ?? null,
        endOn: current?.end_on ?? null,
      };
    });
    return { ok: true, results };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Search failed" };
  }
}
