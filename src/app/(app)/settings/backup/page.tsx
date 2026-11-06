import { requireUser } from "@/server/auth/current-user";
import { can } from "@/server/policies/authorize";
import { PERMISSIONS } from "@/server/policies/permissions";
import { listBackups, getBackupFolder, isAutoBackupEnabled, getBackupRetentionCount, getLastBackupAt } from "@/server/backup/service";
import { BackupClient } from "./backup-client";

export default async function BackupPage() {
  const user = await requireUser();
  if (!can(user, PERMISSIONS.settingsGymUpdate)) {
    return <div className="page-wide"><p>You don't have permission to access backups.</p></div>;
  }
  const backups = listBackups();
  const backupFolder = getBackupFolder();
  const autoBackup = isAutoBackupEnabled();
  const retention = getBackupRetentionCount();
  const lastBackup = getLastBackupAt();
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
      <BackupClient
        backups={backups}
        backupFolder={backupFolder}
        autoBackup={autoBackup}
        retention={retention}
        lastBackup={lastBackup}
      />
    </div>
  );
}