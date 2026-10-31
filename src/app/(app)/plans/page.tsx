import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb } from "@/server/db/connection";
import { requireUser } from "@/server/auth/current-user";
import { listPlans } from "@/server/members/plans";
import { gymSettings } from "@/server/members/context";
import { can } from "@/server/policies/authorize";
import { PERMISSIONS } from "@/server/policies/permissions";
import { PlansClient } from "./plans-client";

export const metadata: Metadata = {
  title: "Membership Plans — Empire Fitness",
};

export const dynamic = "force-dynamic";

export default async function PlansPage() {
  const user = await requireUser();
  if (!can(user, PERMISSIONS.plansView)) redirect("/");

  const db = getDb();
  const plans = listPlans(db, { includeInactive: true });
  const gym = gymSettings(db);

  return (
    <div className="page-wide">
      <div className="page-header">
        <div>
          <h1>Membership Plans</h1>
          <p className="muted" style={{ margin: 0 }}>
            Configure durations, subscription prices, joining fees, grace periods, and freeze policies.
          </p>
        </div>
      </div>
      <PlansClient
        plans={plans.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          durationValue: p.duration_value,
          durationUnit: p.duration_unit,
          priceMinor: p.price_minor,
          joiningFeeMinor: p.joining_fee_minor,
          graceDays: p.grace_days,
          freezeAllowed: p.freeze_allowed === 1,
          maxFreezeDays: p.max_freeze_days,
          visitLimit: p.visit_limit,
          sellableToNewMembers: p.sellable_to_new_members === 1,
          isActive: p.is_active === 1,
        }))}
        currencyCode={gym.currency_code}
        minorUnits={gym.currency_minor_units}
        canManage={can(user, PERMISSIONS.plansManage)}
      />
    </div>
  );
}
