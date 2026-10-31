import type { Metadata } from "next";
import Image from "next/image";
import { requireUser } from "@/server/auth/current-user";
import { logoutAction } from "@/app/login/actions";
import { can } from "@/server/policies/authorize";
import { PERMISSIONS } from "@/server/policies/permissions";
import { getDb } from "@/server/db/connection";
import { getMemberStats } from "@/server/members/service";
import { NavLinks, type NavItem } from "./nav-links";
import { IconLogOut } from "@/components/icons";

export const metadata: Metadata = {
  title: "Empire Fitness — Gym Management System",
};

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();
  const db = getDb();
  let expiringCount = 0;
  try {
    const stats = getMemberStats(db);
    expiringCount = stats.expiringSoon;
  } catch {
    // DB might be initializing or empty
  }

  const navItems: NavItem[] = [{ href: "/", label: "Dashboard" }];
  if (can(user, PERMISSIONS.membersView)) {
    navItems.push({ href: "/members", label: "Clients & Members" });
  }
  if (can(user, PERMISSIONS.plansView)) {
    navItems.push({ href: "/plans", label: "Plans" });
  }
  if (can(user, PERMISSIONS.membershipsView)) {
    navItems.push({
      href: "/reminders",
      label: "Reminders",
      badge: expiringCount > 0 ? expiringCount : undefined,
    });
  }
  if (can(user, PERMISSIONS.attendanceView)) {
    navItems.push({ href: "/attendance", label: "Attendance" });
  }
  if (can(user, PERMISSIONS.paymentsView)) {
    navItems.push({ href: "/invoices", label: "Invoices & Billing" });
  }
  if (can(user, PERMISSIONS.settingsGymUpdate)) {
    navItems.push({ href: "/settings/gym", label: "Gym settings" });
  }
  if (can(user, PERMISSIONS.settingsUsersManage)) {
    navItems.push({ href: "/settings/users", label: "Users" });
  }
  if (can(user, PERMISSIONS.auditView)) {
    navItems.push({ href: "/audit", label: "Audit log" });
  }

  const initials = user.fullName
    ? user.fullName
        .split(" ")
        .map((p) => p[0])
        .filter(Boolean)
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "EF";

  const primaryRole = user.roles[0] ?? "Staff";

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand brand-header">
          <Image
            src="/branding/logo-256.png"
            alt="Empire Fitness"
            width={32}
            height={32}
            priority
          />
          <div className="brand-title-wrap">
            <span className="brand-title">Empire Fitness</span>
            <span className="brand-subtitle">Desktop GMS</span>
          </div>
        </div>
        <nav className="nav" aria-label="Main Navigation">
          <NavLinks items={navItems} />
        </nav>
        <div className="header-user">
          <div className="user-profile-chip" title={`Signed in as ${user.fullName} (${primaryRole})`}>
            <div className="user-avatar">{initials}</div>
            <div className="user-meta">
              <span className="user-name">{user.fullName}</span>
              <span className="user-role-tag">{primaryRole}</span>
            </div>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="btn-secondary"
              style={{
                background: "rgba(255, 255, 255, 0.1)",
                color: "#f8fafc",
                borderColor: "rgba(255, 255, 255, 0.2)",
                padding: "6px 12px",
                fontSize: "0.84rem",
              }}
              title="Sign out of current account"
            >
              <IconLogOut size={15} />
              <span>Sign out</span>
            </button>
          </form>
        </div>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
