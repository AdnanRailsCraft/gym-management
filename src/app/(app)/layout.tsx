import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { requireUser } from "@/server/auth/current-user";
import { logoutAction } from "@/app/login/actions";
import { can } from "@/server/policies/authorize";
import { PERMISSIONS } from "@/server/policies/permissions";

export const metadata: Metadata = {
  title: "Empire Fitness — Gym Management System",
};

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand brand-header">
          <Image src="/branding/logo-256.png" alt="" width={32} height={32} />
          <span>Empire Fitness</span>
        </div>
        <nav className="nav" aria-label="Main">
          <Link href="/">Dashboard</Link>
          {can(user, PERMISSIONS.settingsGymUpdate) ? (
            <Link href="/settings/gym">Gym settings</Link>
          ) : null}
          {can(user, PERMISSIONS.settingsUsersManage) ? (
            <Link href="/settings/users">Users</Link>
          ) : null}
          {can(user, PERMISSIONS.auditView) ? (
            <Link href="/audit">Audit log</Link>
          ) : null}
        </nav>
        <div className="header-user">
          <span className="muted">{user.fullName}</span>
          <form action={logoutAction}>
            <button type="submit" className="btn-secondary">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
