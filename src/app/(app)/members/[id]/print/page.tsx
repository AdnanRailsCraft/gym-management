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
    <html>
      <head>
        <title>Client Profile - {member.full_name}</title>
        <style>{`
          body { font-family: Arial, sans-serif; margin: 20px; color: #1a1a1a; }
          h1 { font-size: 18px; margin: 0 0 4px; }
          h2 { font-size: 14px; margin: 16px 0 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
          .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 2px solid #333; padding-bottom: 12px; }
          .gym-name { font-size: 20px; font-weight: bold; }
          .label { font-weight: 600; color: #555; font-size: 12px; text-transform: uppercase; }
          .value { font-size: 14px; margin-bottom: 8px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
          .membership-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          .membership-table th, .membership-table td { border: 1px solid #ddd; padding: 6px 8px; font-size: 12px; text-align: left; }
          .membership-table th { background: #f5f5f5; font-weight: 600; }
          .footer { margin-top: 24px; font-size: 11px; color: #888; text-align: center; border-top: 1px solid #ccc; padding-top: 8px; }
          @media print { body { margin: 10px; } }
        `}</style>
      </head>
      <body>
        <div className="header">
          <div>
            <div className="gym-name">{gym.gym_name}</div>
            <div style={{ fontSize: "12px", color: "#666" }}>{gym.address} · {gym.phone}</div>
          </div>
          <div style={{ textAlign: "right", fontSize: "12px", color: "#666" }}>
            Client Profile<br />
            Printed: {new Date().toLocaleDateString()}
          </div>
        </div>

        <h1>{member.full_name}</h1>
        <div style={{ fontSize: "12px", color: "#666", marginBottom: "12px" }}>
          {member.member_number} · {member.client_type === "pt" ? "Personal Training" : "Regular Member"} · Status: {member.status}
        </div>

        <h2>Contact Information</h2>
        <div className="grid">
          <div>
            <div className="label">Phone</div>
            <div className="value">{member.phone || "—"}</div>
          </div>
          <div>
            <div className="label">Email</div>
            <div className="value">{member.email || "—"}</div>
          </div>
          <div>
            <div className="label">Gender</div>
            <div className="value">{member.gender || "—"}</div>
          </div>
          <div>
            <div className="label">Date of Birth</div>
            <div className="value">{member.date_of_birth || "—"}</div>
          </div>
          <div>
            <div className="label">Address</div>
            <div className="value">{member.address || "—"}</div>
          </div>
          <div>
            <div className="label">Emergency Contact</div>
            <div className="value">
              {member.emergency_contact_name || "—"}
              {member.emergency_contact_phone ? ` (${member.emergency_contact_phone})` : ""}
            </div>
          </div>
        </div>

        {member.fitness_goals ? (
          <>
            <h2>Fitness Goals</h2>
            <div className="value">{member.fitness_goals}</div>
          </>
        ) : null}

        {health?.notes ? (
          <>
            <h2>Health Notes</h2>
            <div className="value">{health.notes}</div>
          </>
        ) : null}

        <h2>Membership History</h2>
        {memberships.length === 0 ? (
          <p className="muted">No memberships recorded.</p>
        ) : (
          <table className="membership-table">
            <thead>
              <tr>
                <th>Plan</th>
                <th>Start</th>
                <th>End</th>
                <th>State</th>
                <th>Amount Paid</th>
              </tr>
            </thead>
            <tbody>
              {memberships.map((m) => (
                <tr key={m.id}>
                  <td>{m.planName}</td>
                  <td>{m.start_on}</td>
                  <td>{m.end_on}</td>
                  <td>{m.state}</td>
                  <td>{money(m.price_minor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="footer">
          {gym.receipt_footer || `Thank you for training with ${gym.gym_name}!`}
        </div>
      </body>
    </html>
  );
}