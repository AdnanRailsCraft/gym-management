import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/server/db/connection";
import { requireUser } from "@/server/auth/current-user";
import { getMemberHealth, getMemberSummary } from "@/server/members/service";
import { listFreezes, listMemberships } from "@/server/members/memberships";
import { listPlans } from "@/server/members/plans";
import { gymSettings, gymToday } from "@/server/members/context";
import { can } from "@/server/policies/authorize";
import { PERMISSIONS } from "@/server/policies/permissions";
import { MEMBERSHIP_STATE_LABELS } from "@/lib/dates";
import { formatMinorUnits } from "@/lib/money";
import { whatsappHref } from "@/lib/reminders";
import { listInvoicesForMember } from "@/server/invoices/service";
import { invoiceWhatsAppHref } from "@/lib/invoices";
import { MemberDetailClient } from "./member-detail-client";
import {
  IconWhatsApp,
  IconReceipt,
  IconPlus,
} from "@/components/icons";

export const metadata: Metadata = {
  title: "Client Profile — Empire Fitness",
};

export const dynamic = "force-dynamic";

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const memberId = Number(id);
  if (!Number.isInteger(memberId) || memberId < 1) notFound();

  const user = await requireUser();
  if (!can(user, PERMISSIONS.membersView)) redirect("/");
  const db = getDb();
  const member = getMemberSummary(db, memberId);
  if (!member) notFound();

  const memberships = listMemberships(db, memberId);
  const current = member.membership;
  const freezes = current ? listFreezes(db, current.id) : [];
  const plans = listPlans(db);
  const gym = gymSettings(db);
  const money = (minor: number) =>
    formatMinorUnits(minor, gym.currency_code, gym.currency_minor_units);

  const canSeeBilling = can(user, PERMISSIONS.paymentsView);
  const invoices = canSeeBilling ? listInvoicesForMember(db, memberId) : [];
  const canSeeHealth = can(user, PERMISSIONS.membersViewHealth);
  const health = canSeeHealth ? getMemberHealth(db, memberId) : null;

  const initials = member.full_name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const waUrl = member.phone
    ? whatsappHref(
        member.phone,
        `Hello ${member.full_name}, greeting from ${gym.gym_name}!`,
      )
    : null;

  return (
    <div className="page-wide">
      {/* Back Link */}
      <div style={{ marginBottom: "12px" }}>
        <Link href="/members" className="btn-ghost" style={{ padding: "6px 0", fontSize: "0.88rem" }}>
          ← Back to Clients &amp; Members
        </Link>
      </div>

      {/* Member Profile Card */}
      <div className="member-profile-card">
        <div className="member-head">
          <div className="member-title">
            <div className="member-avatar-lg">{initials}</div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <h1 style={{ margin: 0, fontSize: "1.75rem" }}>{member.full_name}</h1>
                <span className="chip" style={{ fontWeight: 800, fontSize: "0.82rem" }}>
                  {member.member_number}
                </span>
                <span
                  className={
                    member.status === "archived" || member.status === "suspended"
                      ? "chip chip-warn"
                      : "chip chip-ok"
                  }
                >
                  Status: {member.status}
                </span>
                {member.membership ? (
                  <span
                    className={
                      member.membership.state === "active"
                        ? "chip chip-ok"
                        : member.membership.state === "expiring_soon"
                          ? "chip chip-warn"
                          : "chip chip-bad"
                    }
                  >
                    Subscription: {MEMBERSHIP_STATE_LABELS[member.membership.state]}
                  </span>
                ) : (
                  <span className="chip">No active membership</span>
                )}
              </div>
              <div className="muted" style={{ marginTop: "6px", display: "flex", gap: "16px", flexWrap: "wrap", fontSize: "0.9rem" }}>
                <span>Joined {member.joined_on}</span>
                {member.phone ? <span> {member.phone}</span> : null}
                {member.email ? <span> {member.email}</span> : null}
              </div>
            </div>
          </div>

          <div className="row-actions">
            {waUrl ? (
              <a
                className="btn-whatsapp"
                href={waUrl}
                target="_blank"
                rel="noreferrer"
                title="Send message on WhatsApp"
              >
                <IconWhatsApp size={16} />
                <span>WhatsApp</span>
              </a>
            ) : null}
            {can(user, PERMISSIONS.paymentsRecord) ? (
              <Link className="btn-secondary btn-link" href={`/invoices?memberId=${member.id}`}>
                <IconReceipt size={14} />
                <span>Create Invoice</span>
              </Link>
            ) : null}
            {can(user, PERMISSIONS.attendanceRecord) ? (
              <Link className="btn-secondary btn-link" href="/attendance">
                Check in
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      {/* Contact & Personal Information Details */}
      <div className="section">
        <h2>Client Profile &amp; Contact Details</h2>
        <div className="detail-grid">
          <ul className="meta-list">
            <li>
              <span>Phone</span>
              <span>{member.phone || "—"}</span>
            </li>
            <li>
              <span>Email</span>
              <span>{member.email || "—"}</span>
            </li>
            <li>
              <span>Gender</span>
              <span>{member.gender || "—"}</span>
            </li>
            <li>
              <span>Date of Birth</span>
              <span>{member.date_of_birth || "—"}</span>
            </li>
          </ul>
          <ul className="meta-list">
            <li>
              <span>Address</span>
              <span>{member.address || "—"}</span>
            </li>
            <li>
              <span>Emergency Contact</span>
              <span>
                {member.emergency_contact_name || "—"}
                {member.emergency_contact_phone ? ` (${member.emergency_contact_phone})` : ""}
              </span>
            </li>
            <li>
              <span>Referral Source</span>
              <span>{member.referral_source || "—"}</span>
            </li>
            <li>
              <span>Marketing Consent</span>
              <span>{member.marketing_consent === 1 ? "Consented (Yes)" : "No"}</span>
            </li>
          </ul>
        </div>
        {member.fitness_goals || member.notes ? (
          <div style={{ marginTop: "16px", paddingTop: "12px", borderTop: "1px solid #f1f5f9" }}>
            {member.fitness_goals ? (
              <p style={{ margin: "0 0 6px", fontSize: "0.92rem" }}>
                <strong>Fitness Goals:</strong> {member.fitness_goals}
              </p>
            ) : null}
            {member.notes ? (
              <p style={{ margin: 0, fontSize: "0.92rem" }} className="muted">
                <strong>Internal Staff Notes:</strong> {member.notes}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Membership Management & Lifecycle Actions */}
      <MemberDetailClient
        memberId={member.id}
        memberStatus={member.status}
        current={current}
        plans={plans.map((p) => ({
          id: p.id,
          name: p.name,
          priceMinor: p.price_minor,
          joiningFeeMinor: p.joining_fee_minor,
          durationValue: p.duration_value,
          durationUnit: p.duration_unit,
          graceDays: p.grace_days,
          freezeAllowed: p.freeze_allowed === 1,
          maxFreezeDays: p.max_freeze_days,
          isActive: p.is_active === 1,
          sellableToNewMembers: p.sellable_to_new_members === 1,
        }))}
        freezes={freezes.map((f) => ({
          id: f.id,
          fromOn: f.from_on,
          toOn: f.to_on,
          days: f.days,
          reason: f.reason,
        }))}
        today={gymToday(db)}
        currencyCode={gym.currency_code}
        minorUnits={gym.currency_minor_units}
        canSell={can(user, PERMISSIONS.membershipsSell)}
        canRenew={can(user, PERMISSIONS.membershipsRenew)}
        canFreeze={can(user, PERMISSIONS.membershipsFreeze)}
        canExtend={can(user, PERMISSIONS.membershipsExtend)}
        canSuspend={can(user, PERMISSIONS.membershipsSuspend)}
        canCancel={can(user, PERMISSIONS.membershipsCancel)}
        canUpdateMember={can(user, PERMISSIONS.membersUpdate)}
        canArchive={can(user, PERMISSIONS.membersArchive)}
        canViewHealth={canSeeHealth}
        healthNotes={health?.notes ?? null}
        healthConsent={health?.consent ?? false}
      />

      {/* Invoices & Receipts Section */}
      {canSeeBilling ? (
        <div className="section">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <div>
              <h2>Billing &amp; Invoices</h2>
              <p className="muted small" style={{ margin: 0 }}>
                Official invoices, receipts, and payment history for this client.
              </p>
            </div>
            {can(user, PERMISSIONS.paymentsRecord) ? (
              <Link
                href={`/invoices?memberId=${member.id}`}
                className="btn-primary"
                style={{ fontSize: "0.85rem", padding: "6px 12px" }}
              >
                <IconPlus size={14} />
                <span>+ Create Invoice</span>
              </Link>
            ) : null}
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Date</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Paid</th>
                  <th>Balance</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", padding: "24px" }} className="muted">
                      No invoices recorded for this client yet.
                    </td>
                  </tr>
                ) : (
                  invoices.map((inv) => {
                    const waHref = invoiceWhatsAppHref(member.phone, {
                      gymName: gym.gym_name,
                      gymAddress: gym.address,
                      gymPhone: gym.phone,
                      invoiceNumber: inv.invoice_number,
                      issuedAt: inv.issued_at,
                      memberName: member.full_name,
                      memberNumber: member.member_number,
                      currencyCode: gym.currency_code,
                      minorUnits: gym.currency_minor_units,
                      items: [
                        {
                          description: inv.items_summary || "Gym Service",
                          quantity: inv.item_count || 1,
                          unitPriceMinor: inv.subtotal_minor,
                          totalMinor: inv.subtotal_minor,
                        },
                      ],
                      subtotalMinor: inv.subtotal_minor,
                      discountMinor: inv.discount_minor,
                      totalMinor: inv.total_minor,
                      amountPaidMinor: inv.amount_paid_minor,
                      balanceDueMinor: inv.balance_due_minor,
                      paymentMethod: inv.payment_method,
                      status: inv.status,
                      notes: inv.notes,
                    });

                    return (
                      <tr key={inv.id}>
                        <td>
                          <span className="chip" style={{ fontWeight: 800 }}>
                            {inv.invoice_number}
                          </span>
                        </td>
                        <td>{inv.issued_at.slice(0, 10)}</td>
                        <td>{inv.items_summary}</td>
                        <td>
                          <strong>{money(inv.total_minor)}</strong>
                        </td>
                        <td style={{ color: "#16a34a", fontWeight: 600 }}>
                          {money(inv.amount_paid_minor)}
                        </td>
                        <td>
                          {inv.balance_due_minor > 0 ? (
                            <span style={{ color: "#dc2626", fontWeight: 700 }}>
                              {money(inv.balance_due_minor)}
                            </span>
                          ) : (
                            <span className="muted">0</span>
                          )}
                        </td>
                        <td>
                          <span
                            className={
                              inv.status === "paid"
                                ? "chip chip-ok"
                                : inv.status === "partial"
                                  ? "chip chip-warn"
                                  : "chip"
                            }
                            style={{ textTransform: "uppercase" }}
                          >
                            {inv.status}
                          </span>
                        </td>
                        <td>
                          <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                            {waHref ? (
                              <a
                                className="btn-whatsapp"
                                href={waHref}
                                target="_blank"
                                rel="noreferrer"
                                style={{ padding: "4px 8px", fontSize: "0.8rem" }}
                                title="Send invoice via WhatsApp"
                              >
                                <IconWhatsApp size={13} />
                                <span>WhatsApp</span>
                              </a>
                            ) : null}
                            <Link
                              className="btn-secondary"
                              href="/invoices"
                              style={{ padding: "4px 8px", fontSize: "0.8rem" }}
                            >
                              View / Print
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Membership History Table */}
      <div className="section">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h2>Subscription History</h2>
          <span className="muted small">{memberships.length} recorded subscriptions</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Plan Name</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>State</th>
                <th>Amount Paid</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {memberships.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "24px" }} className="muted">
                    No memberships recorded yet for this client.
                  </td>
                </tr>
              ) : (
                memberships.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <span className="chip" style={{ fontWeight: 700 }}>
                        #{m.id}
                      </span>
                    </td>
                    <td>
                      <strong>{m.planName}</strong>
                    </td>
                    <td>{m.start_on}</td>
                    <td>
                      <div>{m.end_on}</div>
                      {m.graceDays > 0 ? (
                        <span className="muted small">+{m.graceDays}d grace</span>
                      ) : null}
                    </td>
                    <td>
                      <span
                        className={
                          m.state === "active"
                            ? "chip chip-ok"
                            : m.state === "expiring_soon"
                              ? "chip chip-warn"
                              : "chip"
                        }
                      >
                        {MEMBERSHIP_STATE_LABELS[m.state]}
                      </span>
                    </td>
                    <td>
                      <strong>{money(m.totalChargeMinor)}</strong>
                    </td>
                    <td>{m.notes ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {freezes.length > 0 ? (
          <div style={{ marginTop: "20px" }}>
            <h3>Membership Freeze History</h3>
            <ul style={{ margin: "8px 0 0", paddingLeft: "20px", color: "#334155" }}>
              {freezes.map((f) => (
                <li key={f.id} style={{ marginBottom: "4px" }}>
                  <strong>{f.from_on} → {f.to_on}</strong> ({f.days} day{f.days === 1 ? "" : "s"}) —{" "}
                  <span className="muted">{f.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
