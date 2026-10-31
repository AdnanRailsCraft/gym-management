import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/server/db/connection";
import { requireUser } from "@/server/auth/current-user";
import { can, PolicyError } from "@/server/policies/authorize";
import { PERMISSIONS } from "@/server/policies/permissions";
import { listMembers } from "@/server/members/service";

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes("\"") || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export async function GET(_req: NextRequest) {
  try {
    const user = await requireUser();
    if (!can(user, PERMISSIONS.membersExport)) {
      throw new PolicyError("You do not have permission to export members");
    }
    const db = getDb();
    const members = listMembers(db); // listMembers excludes health fields
    const headers = [
      "member_number",
      "full_name",
      "phone",
      "email",
      "gender",
      "date_of_birth",
      "address",
      "emergency_contact_name",
      "emergency_contact_phone",
      "status",
      "referral_source",
      "fitness_goals",
      "marketing_consent",
      "joined_on",
      "archived_at",
      "notes",
    ];
    const lines: string[] = [headers.join(",")];
    for (const m of members) {
      lines.push(
        [
          m.member_number,
          m.full_name,
          m.phone,
          m.email,
          m.gender,
          m.date_of_birth,
          m.address,
          m.emergency_contact_name,
          m.emergency_contact_phone,
          m.status,
          m.referral_source,
          m.fitness_goals,
          m.marketing_consent ? "1" : "0",
          m.joined_on,
          m.archived_at,
          m.notes,
        ]
          .map(csvEscape)
          .join(","),
      );
    }
    const csv = lines.join("\n");
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="members-${ts}.csv"`,
      },
    });
  } catch (err) {
    if (err instanceof PolicyError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
