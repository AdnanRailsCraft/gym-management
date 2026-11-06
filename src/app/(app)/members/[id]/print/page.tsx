import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/current-user";
import { can } from "@/server/policies/authorize";
import { PERMISSIONS } from "@/server/policies/permissions";
import { getDb } from "@/server/db/connection";
import { getMember } from "@/server/members/service";
import { getMemberHealth } from "@/server/members/service";
import { listMemberships } from "@/server/members/memberships";
import { getGymSettings } from "@/server/users/service";
import { formatMinorUnits } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function PrintMemberPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!can(user, PERMISSIONS.membersView)) redirect("/");
  const { id } = await params;
  const memberId = Number(id);
  if (!Number.isFinite(memberId)) redirect("/members");

  const db = getDb();
  const member = getMember(db, memberId);
  if (!member) redirect("/members");

  const gym = getGymSettings(db);
  const memberships = listMemberships(db, memberId);
  const health = can(user, PERMISSIONS.membersViewHealth) ? getMemberHealth(db, memberId) : null;

  const money = (minor: number) => formatMinorUnits(minor, gym.currency_code, 2);

  return (
    <div style={{ fontFamily: "Arial, sans-serif", margin: "20px", color: "#1a1a1a" }}>
      <style>{`
        @media print {
          body > *:not(.print-content) { display: none !important; }
        }
      `}</style>
      <div className="print-content">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "2px solid #333", paddingBottom: "12px" }}>
          <div>
            <div style={{ fontSize: "20px", fontWeight: "bold" }}>{gym.gym_name}</div>
            <div style={{ fontSize: "12px", color: "#666" }}>{gym.address} · {gym.phone}</div>
          </div>
          <div style={{ textAlign: "right", fontSize: "12px", color: "#666" }}>
            Client Profile<br />
            Printed: {new Date().toLocaleDateString()}
          </div>
        </div>

        <h1 style={{ fontSize: "18px", margin: "0 0 4px" }}>{member.full_name}</h1>
        <div style={{ fontSize: "12px", color: "#666", marginBottom: "12px" }}>
          {member.member_number} · {member.client_type === "pt" ? "Personal Training" : "Regular Member"} · Status: {member.status}
        </div>

        <h2 style={{ fontSize: "14px", margin: "16px 0 8px", borderBottom: "1px solid #ccc", paddingBottom: "4px" }}>Contact Information</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <div style={{ fontWeight: 600, color: "#555", fontSize: "12px", textTransform: "uppercase" }}>Phone</div>
            <div style={{ fontSize: "14px", marginBottom: "8px" }}>{member.phone || "—"}</div>
          </div>
          <div>
            <div style={{ fontWeight: 600, color: "#555", fontSize: "12px", textTransform: "uppercase" }}>Email</div>
            <div style={{ fontSize: "14px", marginBottom: "8px" }}>{member.email || "—"}</div>
          </div>
          <div>
            <div style={{ fontWeight: 600, color: "#555", fontSize: "12px", textTransform: "uppercase" }}>Gender</div>
            <div style={{ fontSize: "14px", marginBottom: "8px" }}>{member.gender || "—"}</div>
          </div>
          <div>
            <div style={{ fontWeight: 600, color: "#555", fontSize: "12px", textTransform: "uppercase" }}>Date of Birth</div>
            <div style={{ fontSize: "14px", marginBottom: "8px" }}>{member.date_of_birth || "—"}</div>
          </div>
          <div>
            <div style={{ fontWeight: 600, color: "#555", fontSize: "12px", textTransform: "uppercase" }}>Address</div>
            <div style={{ fontSize: "14px", marginBottom: "8px" }}>{member.address || "—"}</div>
          </div>
          <div>
            <div style={{ fontWeight: 600, color: "#555", fontSize: "12px", textTransform: "uppercase" }}>Emergency Contact</div>
            <div style={{ fontSize: "14px", marginBottom: "8px" }}>
              {member.emergency_contact_name || "—"}
              {member.emergency_contact_phone ? ` (${member.emergency_contact_phone})` : ""}
            </div>
          </div>
        </div>

        {member.fitness_goals ? (
          <>
            <h2 style={{ fontSize: "14px", margin: "16px 0 8px", borderBottom: "1px solid #ccc", paddingBottom: "4px" }}>Fitness Goals</h2>
            <div style={{ fontSize: "14px", marginBottom: "8px" }}>{member.fitness_goals}</div>
          </>
        ) : null}

        {health?.notes ? (
          <>
            <h2 style={{ fontSize: "14px", margin: "16px 0 8px", borderBottom: "1px solid #ccc", paddingBottom: "4px" }}>Health Notes</h2>
            <div style={{ fontSize: "14px", marginBottom: "8px" }}>{health.notes}</div>
          </>
        ) : null}

        <h2 style={{ fontSize: "14px", margin: "16px 0 8px", borderBottom: "1px solid #ccc", paddingBottom: "4px" }}>Membership History</h2>
        {memberships.length === 0 ? (
          <p style={{ color: "#666" }}>No memberships recorded.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "8px" }}>
            <thead>
              <tr>
                <th style={{ border: "1px solid #ddd", padding: "6px 8px", fontSize: "12px", textAlign: "left", background: "#f5f5f5", fontWeight: 600 }}>Plan</th>
                <th style={{ border: "1px solid #ddd", padding: "6px 8px", fontSize: "12px", textAlign: "left", background: "#f5f5f5", fontWeight: 600 }}>Start</th>
                <th style={{ border: "1px solid #ddd", padding: "6px 8px", fontSize: "12px", textAlign: "left", background: "#f5f5f5", fontWeight: 600 }}>End</th>
                <th style={{ border: "1px solid #ddd", padding: "6px 8px", fontSize: "12px", textAlign: "left", background: "#f5f5f5", fontWeight: 600 }}>State</th>
                <th style={{ border: "1px solid #ddd", padding: "6px 8px", fontSize: "12px", textAlign: "left", background: "#f5f5f5", fontWeight: 600 }}>Amount Paid</th>
              </tr>
            </thead>
            <tbody>
              {memberships.map((m) => (
                <tr key={m.id}>
                  <td style={{ border: "1px solid #ddd", padding: "6px 8px", fontSize: "12px" }}>{m.planName}</td>
                  <td style={{ border: "1px solid #ddd", padding: "6px 8px", fontSize: "12px" }}>{m.start_on}</td>
                  <td style={{ border: "1px solid #ddd", padding: "6px 8px", fontSize: "12px" }}>{m.end_on}</td>
                  <td style={{ border: "1px solid #ddd", padding: "6px 8px", fontSize: "12px" }}>{m.state}</td>
                  <td style={{ border: "1px solid #ddd", padding: "6px 8px", fontSize: "12px" }}>{money(m.price_minor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ marginTop: "24px", fontSize: "11px", color: "#888", textAlign: "center", borderTop: "1px solid #ccc", paddingTop: "8px" }}>
          {gym.receipt_footer || `Thank you for training with ${gym.gym_name}!`}
        </div>
      </div>
    </div>
  );
}