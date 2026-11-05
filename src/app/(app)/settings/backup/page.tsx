import { requireUser } from "@/server/auth/current-user";
import { can } from "@/server/policies/authorize";
import { PERMISSIONS } from "@/server/policies/permissions";
import { listBackups } from "@/server/backup/service";
import { BackupClient } from "./backup-client";

export default async function BackupPage() {
  const user = await requireUser();
  if (!can(user, PERMISSIONS.settingsGymUpdate)) {
    return <div className="page-wide"><p>You don't have permission to access backups.</p></div>;
  }
  const backups = listBackups();
  return (
    <div className="page-wide">
      <div className="page-header">
        <div>
          <h1>Backup & Restore</h1>
          <p className="muted" style={{ margin: 0 }}>
            Protect your gym data. Create backups regularly and restore if needed.
          </p>
        </div>
      </div>
      <BackupClient backups={backups} />
    </div>
  );
}