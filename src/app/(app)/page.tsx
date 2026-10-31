import Link from "next/link";
import Image from "next/image";
import { getGymSettings } from "@/server/users/service";
import { getDb } from "@/server/db/connection";
import { requireUser } from "@/server/auth/current-user";
import { getMemberStats } from "@/server/members/service";
import { listPlans } from "@/server/members/plans";
import { listExpiringMemberships, reminderWindowDays } from "@/server/members/reminders";
import { can } from "@/server/policies/authorize";
import { PERMISSIONS } from "@/server/policies/permissions";
import { whatsappHref, buildReminderMessage } from "@/lib/reminders";
import {
  IconZap,
  IconUsers,
  IconCreditCard,
  IconBell,
  IconCheckCircle,
  IconAlertTriangle,
  IconSnowflake,
  IconWhatsApp,
  IconArrowRight,
  IconReceipt,
  IconPlus,
  IconHeartPulse,
  IconCalendar,
} from "@/components/icons";

export default async function DashboardPage() {
  const user = await requireUser();
  const db = getDb();
  const gym = getGymSettings(db);
  const memberStats = getMemberStats(db);
  const allPlans = listPlans(db, { includeInactive: true });
  const hasPlans = allPlans.length > 0;
  const hasMembers = memberStats.total > 0;
  const canSeeMembers = can(user, PERMISSIONS.membersView);
  const canSeeReminders = can(user, PERMISSIONS.membershipsView);
  const canCheckIn = can(user, PERMISSIONS.attendanceView);
  const windowDays = reminderWindowDays(db);
  const upcoming = canSeeReminders ? listExpiringMemberships(db, windowDays).slice(0, 6) : [];

  const todayStr = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());

  return (
    <div className="page-wide">
      {/* Hero Banner */}
      <div
        className="hero-banner"
        style={{
          background: "var(--brand-black)",
          position: "relative",
          borderRadius: "12px",
          overflow: "hidden",
          marginBottom: "24px",
          padding: "32px",
          color: "white",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <Image
            src="/branding/logo-256.png"
            alt={gym.gym_name}
            width={48}
            height={48}
            style={{ borderRadius: "8px", objectFit: "contain" }}
          />
          <div>
            <h1 style={{ fontSize: "1.5rem", margin: 0, fontWeight: 600 }}>{gym.gym_name}</h1>
            <p style={{ margin: "4px 0 0", fontSize: "0.9rem", opacity: 0.7 }}>
              {todayStr} · Signed in as {user.fullName}
            </p>
          </div>
        </div>
      </div>

      {/* Getting Started Checklist — shown for new gyms */}
      {!hasMembers || !hasPlans ? (
        <div className="card" style={{ marginBottom: "24px", borderLeft: "4px solid var(--primary)" }}>
          <h2 style={{ margin: "0 0 12px", display: "flex", alignItems: "center", gap: "8px" }}>
            <IconZap size={20} style={{ color: "var(--primary)" }} />
            <span>Getting Started</span>
          </h2>
          <p className="muted" style={{ margin: "0 0 16px" }}>
            Welcome! Follow these steps to set up your gym management system.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "1.2rem", color: hasPlans ? "var(--brand-ok)" : "var(--brand-muted-light)" }}>{hasPlans ? "✓" : "○"}</span>
              <div>
                <strong>1. Create membership plans</strong>
                <p className="muted small" style={{ margin: 0 }}>
                  {hasPlans
                    ? `${allPlans.length} plan(s) ready. You can add more anytime.`
                    : "Set up plans like Monthly, Quarterly, Annual with prices."}
                </p>
              </div>
              {!hasPlans ? (
                <Link className="btn-primary" href="/plans" style={{ marginLeft: "auto" }}>
                  <IconPlus size={14} />
                  <span>Create Plan</span>
                </Link>
              ) : null}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "1.2rem" }}>{hasMembers ? "✓" : "○"}</span>
              <div>
                <strong>2. Register your first client</strong>
                <p className="muted small" style={{ margin: 0 }}>
                  {hasMembers
                    ? `${memberStats.total} client(s) registered.`
                    : "Add client details, phone, and contact info."}
                </p>
              </div>
              {!hasMembers ? (
                <Link className="btn-primary" href="/members" style={{ marginLeft: "auto" }}>
                  <IconUsers size={14} />
                  <span>Register Client</span>
                </Link>
              ) : null}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "1.2rem" }}>{hasMembers && hasPlans ? "✓" : "○"}</span>
              <div>
                <strong>3. Sell a membership</strong>
                <p className="muted small" style={{ margin: 0 }}>
                  Open a client profile and sell them a plan to activate their subscription.
                </p>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "1.2rem" }}>{hasMembers && hasPlans ? "○" : "○"}</span>
              <div>
                <strong>4. Take a payment</strong>
                <p className="muted small" style={{ margin: 0 }}>
                  Create an invoice and record the payment at the front desk.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Task Summary — what needs attention today */}
      {hasMembers ? (
        <div className="card" style={{ marginBottom: "24px", borderLeft: "4px solid #d97706" }}>
          <h2 style={{ margin: "0 0 12px", display: "flex", alignItems: "center", gap: "8px" }}>
            <IconBell size={20} style={{ color: "#d97706" }} />
            <span>Today's Tasks</span>
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {memberStats.expiringSoon > 0 ? (
              <Link href="/reminders" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none", color: "inherit" }}>
                
                <span>
                  <strong>{memberStats.expiringSoon}</strong> membership{memberStats.expiringSoon !== 1 ? "s" : ""} expiring soon — send reminders
                </span>
                <IconArrowRight size={14} style={{ marginLeft: "auto" }} />
              </Link>
            ) : null}
            {memberStats.expired > 0 ? (
              <Link href="/reminders" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none", color: "inherit" }}>
                
                <span>
                  <strong>{memberStats.expired}</strong> membership{memberStats.expired !== 1 ? "s" : ""} expired — follow up
                </span>
                <IconArrowRight size={14} style={{ marginLeft: "auto" }} />
              </Link>
            ) : null}
            {memberStats.frozen > 0 ? (
              <Link href="/members" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none", color: "inherit" }}>
                
                <span>
                  <strong>{memberStats.frozen}</strong> frozen membership{memberStats.frozen !== 1 ? "s" : ""} — check status
                </span>
                <IconArrowRight size={14} style={{ marginLeft: "auto" }} />
              </Link>
            ) : null}
            {memberStats.expiringSoon === 0 && memberStats.expired === 0 && memberStats.frozen === 0 ? (
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "1.1rem" }}>✓</span>
                <span className="muted">All caught up! No urgent tasks today.</span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Quick Action Shortcuts */}
      <div className="quick-action-strip">
        {canCheckIn ? (
          <Link className="action-pill-btn primary" href="/attendance" title="Fast front-desk check-in">
            <IconZap size={16} />
            <span>Quick Check-in</span>
          </Link>
        ) : null}
        {can(user, PERMISSIONS.membersCreate) ? (
          <Link className="action-pill-btn" href="/members" title="Add a new client">
            <IconUsers size={16} />
            <span>+ Register Client</span>
          </Link>
        ) : canSeeMembers ? (
          <Link className="action-pill-btn" href="/members">
            <IconUsers size={16} />
            <span>Clients & Members</span>
          </Link>
        ) : null}
        {canSeeReminders ? (
          <Link className="action-pill-btn" href="/reminders" title="See who needs renewal">
            <IconBell size={16} />
            <span>Renewals Due ({memberStats.expiringSoon})</span>
          </Link>
        ) : null}
        {can(user, PERMISSIONS.plansView) ? (
          <Link className="action-pill-btn" href="/plans" title="Manage membership plans">
            <IconCreditCard size={16} />
            <span>Membership Plans</span>
          </Link>
        ) : null}
        {can(user, PERMISSIONS.paymentsView) ? (
          <Link className="action-pill-btn" href="/invoices" title="Create invoices & receipts">
            <IconReceipt size={16} />
            <span>Invoices & Receipts</span>
          </Link>
        ) : null}
      </div>

      {/* Metric KPI Cards */}
      <div className="kpi-row">
        <div className="kpi" style={{ borderTop: "3px solid #2563eb" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="kpi-label">Total Clients</span>
            <IconUsers size={18} style={{ color: "#2563eb" }} />
          </div>
          <span className="kpi-value">{memberStats.total}</span>
        </div>
        <div className="kpi" style={{ borderTop: "3px solid #16a34a" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="kpi-label">Active Members</span>
            <IconCheckCircle size={18} style={{ color: "#16a34a" }} />
          </div>
          <span className="kpi-value" style={{ color: "#16a34a" }}>{memberStats.activeMemberships}</span>
        </div>
        <div className="kpi" style={{ borderTop: "3px solid #d97706" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="kpi-label">Expiring Soon</span>
            <IconBell size={18} style={{ color: "#d97706" }} />
          </div>
          <span className="kpi-value" style={{ color: memberStats.expiringSoon > 0 ? "#d97706" : "inherit" }}>
            {memberStats.expiringSoon}
          </span>
        </div>
        <div className="kpi" style={{ borderTop: "3px solid #dc2626" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="kpi-label">Expired</span>
            <IconAlertTriangle size={18} style={{ color: "#dc2626" }} />
          </div>
          <span className="kpi-value" style={{ color: memberStats.expired > 0 ? "#dc2626" : "inherit" }}>
            {memberStats.expired}
          </span>
        </div>
        <div className="kpi" style={{ borderTop: "3px solid #64748b" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="kpi-label">Frozen</span>
            <IconSnowflake size={18} style={{ color: "#64748b" }} />
          </div>
          <span className="kpi-value">{memberStats.frozen}</span>
        </div>
      </div>

      {/* Needs Attention / Upcoming Renewals */}
      {canSeeReminders ? (
        <div className="section">
          <div className="member-head" style={{ marginBottom: "14px" }}>
            <div>
              <h2>Needs Attention & Renewals</h2>
              <p className="muted" style={{ margin: 0 }}>
                Memberships expiring in the next {windowDays} days or lapsed recently.
              </p>
            </div>
            <Link className="btn-secondary" href="/reminders">
              <span>View all reminders</span>
              <IconArrowRight size={14} />
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <div className="empty">
              <IconCheckCircle size={40} style={{ color: "#16a34a" }} />
              <h3>All caught up!</h3>
              <p className="muted">No memberships are due for renewal right now.</p>
              {can(user, PERMISSIONS.membersCreate) && (
                <Link className="action-pill-btn primary" href="/members" style={{ marginTop: "16px" }}>
                  <IconUsers size={16} />
                  <span>Register your first client</span>
                </Link>
              )}
            </div>
          ) : (
            <ul className="attention-list">
              {upcoming.map((c) => {
                const waUrl = c.phone
                  ? whatsappHref(
                      c.phone,
                      buildReminderMessage({
                        gymName: gym.gym_name,
                        memberName: c.memberName,
                        planName: c.planName,
                        endOn: c.endOn,
                        daysLeft: c.daysLeft,
                      }),
                    )
                  : null;

                const initials = c.memberName
                  .split(" ")
                  .map((p) => p[0])
                  .filter(Boolean)
                  .join("")
                  .slice(0, 2)
                  .toUpperCase();

                return (
                  <li key={c.membershipId}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div className="member-avatar-sm">{initials}</div>
                      <div>
                        <Link className="strong-link" href={`/members/${c.memberId}`}>
                          {c.memberName}
                        </Link>
                        <div className="muted small">
                          {c.planName} · ends {c.endOn}
                          {c.phone ? ` · ${c.phone}` : ""}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span
                        className={
                          c.daysLeft < 0
                            ? "chip chip-bad"
                            : c.daysLeft <= 1
                            ? "chip chip-warn"
                            : "chip chip-ok"
                        }
                      >
                        {c.daysLeft < 0
                          ? `Expired ${Math.abs(c.daysLeft)}d ago`
                          : c.daysLeft === 0
                          ? "Ends today"
                          : c.daysLeft === 1
                          ? "Ends tomorrow"
                          : `${c.daysLeft} days left`}
                      </span>
                      {waUrl ? (
                        <a
                          className="btn-whatsapp"
                          style={{ padding: "5px 10px", fontSize: "0.82rem" }}
                          href={waUrl}
                          target="_blank"
                          rel="noreferrer"
                          title="Send polite WhatsApp reminder"
                        >
                          <IconWhatsApp size={14} />
                          <span>WhatsApp</span>
                        </a>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      {/* Gym Info + Trainer Photo card */}
      <div className="section" style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: "24px" }}>
        <div>
          <h2>Gym Profile Information</h2>
          <ul className="info-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            <li style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
              <span className="muted">Name</span>
              <strong>{gym.gym_name}</strong>
            </li>
            <li style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
              <span className="muted">Address</span>
              <span>{gym.address || "—"}</span>
            </li>
            <li style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
              <span className="muted">Phone</span>
              <span>{gym.phone || "—"}</span>
            </li>
            <li style={{ display: "flex", justifyContent: "space-between", padding: "10px 0" }}>
              <span className="muted">Currency</span>
              <span>{gym.currency_code} ({gym.currency_minor_units} decimals)</span>
            </li>
          </ul>
          <Link className="btn-secondary" href="/settings/gym" style={{ marginTop: "16px" }}>
            <IconCalendar size={14} />
            <span>Edit Gym Settings</span>
          </Link>
        </div>
        <div className="card" style={{ textAlign: "center", padding: "20px" }}>
          <h3 style={{ margin: "0 0 12px" }}>Welcome to {gym.gym_name}</h3>
          <Image
            src="/branding/trainer-photo.jpg"
            alt=""
            width={180}
            height={180}
            style={{
              borderRadius: "50%",
              objectFit: "cover",
              border: "3px solid var(--primary)",
              margin: "0 auto 12px",
              boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
            }}
          />
          <p className="muted small" style={{ margin: "0 0 12px" }}>
            Everything is stored on this computer. No internet needed.
          </p>
          <Link className="btn-secondary" href="/members" style={{ display: "inline-flex" }}>
            <IconHeartPulse size={14} />
            <span>View All Clients</span>
          </Link>
        </div>
      </div>
    </div>
  );
}