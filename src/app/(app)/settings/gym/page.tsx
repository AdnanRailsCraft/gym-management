import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/current-user";
import { can } from "@/server/policies/authorize";
import { PERMISSIONS } from "@/server/policies/permissions";
import { getDb } from "@/server/db/connection";
import { getGymSettings } from "@/server/users/service";
import { GymSettingsForm } from "./gym-settings-form";

export default async function GymSettingsPage() {
  const user = await requireUser();
  if (!can(user, PERMISSIONS.settingsGymUpdate)) redirect("/");
  const gym = getGymSettings(getDb());
  return (
    <div className="page-wide">
      <div className="page-header">
        <div>
          <h1>Gym Settings &amp; Configuration</h1>
          <p className="muted" style={{ margin: 0 }}>
            Configure gym profile, contact details, currency, timezone, and receipt formatting.
          </p>
        </div>
      </div>
      <div className="section" style={{ maxWidth: "800px" }}>
        <GymSettingsForm
          defaults={{
            gymName: gym.gym_name,
            address: gym.address ?? "",
            phone: gym.phone ?? "",
            currencyCode: gym.currency_code,
            timezone: gym.timezone,
            receiptHeader: gym.receipt_header ?? "",
            receiptFooter: gym.receipt_footer ?? "",
          }}
        />
      </div>
    </div>
  );
}
