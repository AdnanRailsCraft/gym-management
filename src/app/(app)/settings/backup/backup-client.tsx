"use client";

import { useState, useTransition } from "react";
import { createBackupAction, restoreBackupAction } from "./actions";
import { IconCheckCircle, IconAlertTriangle } from "@/components/icons";

interface BackupInfo {
  filename: string;
  path: string;
  sizeBytes: number;
  createdAt: string;
}

export function BackupClient({ backups: initialBackups }: { backups: BackupInfo[] }) {
  const [backups] = useState(initialBackups);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);

  const handleCreateBackup = () => {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const res = await createBackupAction();
      if (res.ok) {
        setMessage(res.message ?? "Backup created successfully.");
        // Refresh list
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

      <div className="card" style={{ marginBottom: "24px" }}>
        <h3 style={{ margin: "0 0 8px" }}>Create Backup</h3>
        <p className="muted small" style={{ margin: "0 0 16px" }}>
          Creates a copy of your database in the backups folder. Do this regularly — especially before updates.
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