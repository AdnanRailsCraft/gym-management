import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb } from "@/server/db/connection";
import { requireUser } from "@/server/auth/current-user";
import { getMemberStats, listMemberSummaries } from "@/server/members/service";
import { listPlans } from "@/server/members/plans";
import { gymSettings } from "@/server/members/context";
import { can } from "@/server/policies/authorize";
import { PERMISSIONS } from "@/server/policies/permissions";
import { MembersClient } from "./members-client";
import {
  IconUsers,
  IconCheckCircle,
  IconBell,
  IconAlertTriangle,
  IconDownload,
} from "@/components/icons";

export const metadata: Metadata = {
  title: "Clients & Members — Empire Fitness",
};

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const user = await requireUser();
  if (!can(user, PERMISSIONS.membersView)) redirect("/");
  const db = getDb();
  const members = listMemberSummaries(db);
  const stats = getMemberStats(db);
  const plans = listPlans(db);
  const gym = gymSettings(db);

  return (
    <div className="page-wide">
      <div className="page-header">
        <div>
          <h1>Clients &amp; Members</h1>
          <p className="muted" style={{ margin: 0 }}>
            Register clients, track membership subscriptions, and follow up before expiry.
          </p>
        </div>
        {can(user, PERMISSIONS.membersExport) ? (
          <a
            className="btn-secondary"
            href="/api/members/export"
            download
            title="Download clients database as CSV"
          >
            <IconDownload size={15} />
            <span>Export CSV</span>
          </a>
        ) : null}
      </div>

      <div className="kpi-row">
        <div className="kpi" style={{ borderTop: "3px solid #2563eb" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="kpi-label">Registered Clients</span>
            <IconUsers size={18} style={{ color: "#2563eb" }} />
          </div>
          <span className="kpi-value">{stats.total}</span>
        </div>
        <div className="kpi" style={{ borderTop: "3px solid #16a34a" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="kpi-label">Active Members</span>
            <IconCheckCircle size={18} style={{ color: "#16a34a" }} />
          </div>
          <span className="kpi-value" style={{ color: "#16a34a" }}>
            {stats.activeMemberships}
          </span>
        </div>
        <div className="kpi" style={{ borderTop: "3px solid #d97706" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="kpi-label">Expiring Soon</span>
            <IconBell size={18} style={{ color: "#d97706" }} />
          </div>
          <span className="kpi-value" style={{ color: stats.expiringSoon > 0 ? "#d97706" : "inherit" }}>
            {stats.expiringSoon}
          </span>
        </div>
        <div className="kpi" style={{ borderTop: "3px solid #dc2626" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="kpi-label">Expired</span>
            <IconAlertTriangle size={18} style={{ color: "#dc2626" }} />
          </div>
          <span className="kpi-value" style={{ color: stats.expired > 0 ? "#dc2626" : "inherit" }}>
            {stats.expired}
          </span>
        </div>
      </div>

      <MembersClient
        initialMembers={members}
        plans={plans.map((p) => ({ id: p.id, name: p.name }))}
        currencyCode={gym.currency_code}
        canCreate={can(user, PERMISSIONS.membersCreate)}
        canUpdate={can(user, PERMISSIONS.membersUpdate)}
        canArchive={can(user, PERMISSIONS.membersArchive)}
      />
    </div>
  );
}
