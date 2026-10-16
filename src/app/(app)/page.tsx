import { getGymSettings } from "@/server/users/service";
import { getDb } from "@/server/db/connection";
import { requireUser } from "@/server/auth/current-user";

export default async function DashboardPage() {
  const user = await requireUser();
  const gym = getGymSettings(getDb());
  return (
    <div className="page">
      <h1>{gym.gym_name}</h1>
      <p className="muted">
        Signed in as {user.fullName} ({user.roles.join(", ") || "no roles"})
      </p>
      <div className="card card-left">
        <p className="status">Foundation online</p>
        <dl>
          <dt>Currency</dt>
          <dd>{gym.currency_code}</dd>
          <dt>Timezone</dt>
          <dd>{gym.timezone}</dd>
          <dt>Modules</dt>
          <dd>Members, plans, billing, attendance — coming in later phases</dd>
        </dl>
      </div>
    </div>
  );
}
