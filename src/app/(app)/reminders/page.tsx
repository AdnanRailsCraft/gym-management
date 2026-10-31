import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb } from "@/server/db/connection";
import { requireUser } from "@/server/auth/current-user";
import { can } from "@/server/policies/authorize";
import { PERMISSIONS } from "@/server/policies/permissions";
import { gymSettings } from "@/server/members/context";
import { listExpiringMemberships, reminderWindowDays } from "@/server/members/reminders";
import { RemindersClient } from "./reminders-client";

export const metadata: Metadata = {
  title: "Expiry reminders — Empire Fitness",
};

export const dynamic = "force-dynamic";

export default async function RemindersPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const user = await requireUser();
  if (!can(user, PERMISSIONS.membershipsView)) redirect("/");
  const db = getDb();
  const gym = gymSettings(db);
  const params = await searchParams;
  const requested = Number(params.days ?? "");
  const fallback = reminderWindowDays(db);
  const windowDays =
    Number.isFinite(requested) && requested > 0 && requested <= 120 ? Math.floor(requested) : fallback;

  const candidates = listExpiringMemberships(db, windowDays);

  return (
    <div className="page page-wide">
      <header className="page-header">
        <div>
          <h1>Expiry reminders</h1>
          <p className="muted">
            Follow up with members before their subscription lapses. Sending a message opens
            WhatsApp or your SMS app; nothing is sent automatically.
          </p>
        </div>
        <a className="btn-secondary" href={`/reminders?days=${windowDays === 30 ? 7 : 30}`}>
          {windowDays === 30 ? "Show 7-day window" : "Show 30-day window"}
        </a>
      </header>

      <RemindersClient
        candidates={candidates}
        gymName={gym.gym_name}
        windowDays={windowDays}
      />
    </div>
  );
}
