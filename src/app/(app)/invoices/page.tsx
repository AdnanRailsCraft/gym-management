import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/connection";
import { can } from "@/server/policies/authorize";
import { PERMISSIONS } from "@/server/policies/permissions";
import { getGymSettings } from "@/server/users/service";
import { listMemberSummaries } from "@/server/members/service";
import { listInvoices, getInvoiceStats } from "@/server/invoices/service";
import { formatMinorUnits } from "@/lib/money";
import { InvoicesClient } from "./invoices-client";
import {
  IconReceipt,
  IconCreditCard,
  IconCheckCircle,
  IconAlertTriangle,
} from "@/components/icons";

export const metadata: Metadata = {
  title: "Invoices & Billing — Empire Fitness",
};

export const dynamic = "force-dynamic";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ memberId?: string }>;
}) {
  const user = await requireUser();
  if (!can(user, PERMISSIONS.paymentsView)) redirect("/");

  const params = await searchParams;
  const preselectedMemberId = params.memberId ? Number(params.memberId) : undefined;

  const db = getDb();
  const gym = getGymSettings(db);
  const invoices = listInvoices(db);
  const stats = getInvoiceStats(db);
  const members = listMemberSummaries(db);

  const minorUnits = gym.currency_minor_units;
  const currency = gym.currency_code;
  const fmt = (minor: number) => formatMinorUnits(minor, currency, minorUnits);

  return (
    <div className="page-wide">
      <div className="page-header">
        <div>
          <h1>Invoices, Billing &amp; Receipts</h1>
          <p className="muted" style={{ margin: 0 }}>
            Generate invoices, record collections, print official receipts, and send directly via WhatsApp.
          </p>
        </div>
      </div>

      {/* KPI Financial Overview Cards */}
      <div className="kpi-row">
        <div className="kpi" style={{ borderTop: "3px solid #2563eb" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="kpi-label">Total Invoiced</span>
            <IconReceipt size={18} style={{ color: "#2563eb" }} />
          </div>
          <span className="kpi-value">{fmt(stats.totalInvoicedMinor)}</span>
        </div>

        <div className="kpi" style={{ borderTop: "3px solid #16a34a" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="kpi-label">Collected Revenue</span>
            <IconCheckCircle size={18} style={{ color: "#16a34a" }} />
          </div>
          <span className="kpi-value" style={{ color: "#16a34a" }}>
            {fmt(stats.totalCollectedMinor)}
          </span>
        </div>

        <div className="kpi" style={{ borderTop: "3px solid #dc2626" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="kpi-label">Outstanding Balance</span>
            <IconAlertTriangle size={18} style={{ color: "#dc2626" }} />
          </div>
          <span className="kpi-value" style={{ color: stats.totalOutstandingMinor > 0 ? "#dc2626" : "inherit" }}>
            {fmt(stats.totalOutstandingMinor)}
          </span>
        </div>

        <div className="kpi" style={{ borderTop: "3px solid #64748b" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="kpi-label">Total Invoices</span>
            <IconCreditCard size={18} style={{ color: "#64748b" }} />
          </div>
          <span className="kpi-value">{stats.invoiceCount}</span>
        </div>
      </div>

      <InvoicesClient
        initialInvoices={invoices}
        members={members.map((m) => ({
          id: m.id,
          name: m.full_name,
          number: m.member_number,
          phone: m.phone,
          planName: m.membership?.planName ?? null,
        }))}
        gymInfo={{
          name: gym.gym_name,
          address: gym.address,
          phone: gym.phone,
          currencyCode: gym.currency_code,
          minorUnits: gym.currency_minor_units,
          receiptPrefix: gym.receipt_prefix || "INV",
          receiptHeader: gym.receipt_header,
          receiptFooter: gym.receipt_footer,
        }}
        canRecord={can(user, PERMISSIONS.paymentsRecord)}
        canRefund={can(user, PERMISSIONS.paymentsRefund)}
        preselectedMemberId={preselectedMemberId}
      />
    </div>
  );
}
