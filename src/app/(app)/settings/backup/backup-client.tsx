"use client";

import { useState, useTransition } from "react";
import { createBackupAction, restoreBackupAction, updateBackupSettingsAction } from "./actions";
import { IconCheckCircle, IconAlertTriangle } from "@/components/icons";

interface BackupInfo {
  filename: string;
  path: string;
  sizeBytes: number;
  createdAt: string;
}

export function BackupClient({
  backups: initialBackups,
  backupFolder,
  autoBackup,
  retention,
  lastBackup,
}: {
  backups: BackupInfo[];
  backupFolder: string;
  autoBackup: boolean;
  retention: number;
  lastBackup: string | null;
}) {
  const [backups] = useState(initialBackups);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);

  // Settings form state
  const [folder, setFolder] = useState(backupFolder);
  const [auto, setAuto] = useState(autoBackup);
  const [ret, setRet] = useState(retention);

  const handleCreateBackup = () => {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const res = await createBackupAction();
      if (res.ok) {
        setMessage(res.message ?? "Backup created successfully.");
        window.location.reload();
      } else {
        setError(res.error ?? "Backup failed.");
      }
    });
  };

  const handleRestore = (backupPath: string) => {
    setConfirmRestore(null);
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const res = await restoreBackupAction(backupPath);
      if (res.ok) {
        setMessage(res.message ?? "Restored successfully.");
        window.location.reload();
      } else {
        setError(res.error ?? "Restore failed.");
      }
    });
  };

  const handleSaveSettings = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMessage(null);
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateBackupSettingsAction(formData);
      if (res.ok) {
        setMessage(res.message ?? "Settings saved.");
      } else {
        setError(res.error ?? "Failed to save settings.");
      }
    });
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="section" style={{ maxWidth: "800px" }}>
      {message ? (
        <div className="success" style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
          <IconCheckCircle size={16} />
          <span>{message}</span>
        </div>
      ) : null}
      {error ? (
        <div className="error" style={{ marginBottom: "16px" }}>
          <IconAlertTriangle size={16} style={{ marginRight: "8px" }} />
          {error}
        </div>
      ) : null}

      {/* Backup Settings */}
      <div className="card" style={{ marginBottom: "24px" }}>
        <h3 style={{ margin: "0 0 8px" }}>Backup Settings</h3>
        <p className="muted small" style={{ margin: "0 0 16px" }}>
          Save backups to a cloud-synced folder (Google Drive, OneDrive, Dropbox) for off-site protection.
          Leave empty to use the default local backups folder.
        </p>
        <form onSubmit={handleSaveSettings} className="form">
          <div className="field">
            <label htmlFor="backupFolder">Backup Folder Path</label>
            <input
              id="backupFolder"
              name="backupFolder"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder="e.g. C:\Users\You\Google Drive\GymBackups"
            />
            <p className="muted small" style={{ margin: "4px 0 0" }}>
              Tip: Install Google Drive or OneDrive desktop app, then paste the synced folder path here.
            </p>
          </div>
          <div className="field" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <input
              type="checkbox"
              id="autoBackup"
              name="autoBackup"
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
            />
            <label htmlFor="autoBackup" style={{ margin: 0 }}>Auto-backup on startup</label>
          </div>
          <div className="field">
            <label htmlFor="retention">Keep last N backups</label>
            <input
              id="retention"
              name="retention"
              type="number"
              min={1}
              max={30}
              value={ret}
              onChange={(e) => setRet(parseInt(e.target.value, 10) || 7)}
            />
          </div>
          {lastBackup ? (
            <p className="muted small" style={{ margin: "0 0 12px" }}>
              Last backup: {new Date(lastBackup).toLocaleString()}
            </p>
          ) : null}
          <button type="submit" className="btn-secondary" disabled={isPending}>
            {isPending ? "Saving..." : "Save Settings"}
          </button>
        </form>
      </div>

      <div className="card" style={{ marginBottom: "24px" }}>
        <h3 style={{ margin: "0 0 8px" }}>Create Backup Now</h3>
        <p className="muted small" style={{ margin: "0 0 16px" }}>
          Creates a copy of your database. Saved to the folder configured above.
        </p>
        <button type="button" className="btn-primary" onClick={handleCreateBackup} disabled={isPending}>
          {isPending ? "Creating backup..." : "Back Up Now"}
        </button>
      </div>

      <div className="card">
        <h3 style={{ margin: "0 0 8px" }}>Existing Backups</h3>
        {backups.length === 0 ? (
          <p className="muted">No backups yet. Create your first backup above.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Filename</th>
                  <th>Size</th>
                  <th>Created</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.filename}>
                    <td>{b.filename}</td>
                    <td>{formatSize(b.sizeBytes)}</td>
                    <td>{new Date(b.createdAt).toLocaleString()}</td>
                    <td style={{ textAlign: "right" }}>
                      {confirmRestore === b.path ? (
                        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                          <span className="muted small">Restore this backup?</span>
                          <button
                            type="button"
                            className="btn-danger"
                            onClick={() => handleRestore(b.path)}
                            disabled={isPending}
                          >
                            {isPending ? "Restoring..." : "Yes, Restore"}
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => setConfirmRestore(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => setConfirmRestore(b.path)}
                        >
                          Restore
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small" style={{ marginTop: "12px" }}>
          Restoring replaces your current database with the backup. A pre-restore copy is saved automatically.
        </p>
      </div>
    </div>
  );
}