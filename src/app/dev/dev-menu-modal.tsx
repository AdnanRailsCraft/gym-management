"use client";

import React, { useEffect, useState, useTransition } from "react";
import {
  createDefaultAdminAction,
  createDevAdminAction,
  deleteDevUserAction,
  getDevStatusAction,
  quickLoginDevUserAction,
  resetDevUserPasswordAction,
  wipeAllUsersAction,
  type DevStatus,
} from "@/server/dev/actions";

export function DevMenuModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<DevStatus | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [resetPassUserId, setResetPassUserId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");

  // Password protection for dev menu
  const [authenticated, setAuthenticated] = useState(false);
  const DEV_PASSWORD = "Pakistan@12";

  // Password prompt visibility
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const passwordInputRef = React.useRef<HTMLInputElement>(null);

  const refresh = () => {
    startTransition(async () => {
      try {
        const res = await getDevStatusAction();
        setStatus(res);
      } catch (err) {
        console.error("Failed to load dev status", err);
      }
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+D or Ctrl+Alt+D
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.shiftKey || e.altKey) &&
        (e.key === "D" || e.key === "d")
      ) {
        e.preventDefault();
        setShowPasswordPrompt(true);
      }
      if (e.key === "F10") {
        e.preventDefault();
        setShowPasswordPrompt(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    if (window.gms?.onOpenDevMenu) {
      window.gms.onOpenDevMenu(() => setShowPasswordPrompt(true));
    }

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (showPasswordPrompt) {
      setError(null);
    }
  }, [showPasswordPrompt]);

  useEffect(() => {
    if (isOpen) {
      setAuthenticated(false);
      refresh();
      setMessage(null);
      setError(null);
    }
  }, [isOpen]);

  const handleCreateDefaultAdmin = () => {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const res = await createDefaultAdminAction();
      if (res.ok) {
        setMessage(res.message);
        refresh();
      } else {
        setError(res.error || "Failed to create default admin");
      }
    });
  };

  const handleCreateUser = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMessage(null);
    setError(null);
    const form = e.currentTarget;
    const formData = new FormData(form);

    startTransition(async () => {
      const res = await createDevAdminAction(formData);
      if (res.ok) {
        setMessage("User created successfully!");
        form.reset();
        refresh();
      } else {
        setError(res.error || "Failed to create user");
      }
    });
  };

  const handleDeleteUser = (userId: number, username: string) => {
    if (!confirm(`Are you sure you want to delete user '${username}'?`)) return;
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const res = await deleteDevUserAction(userId);
      if (res.ok) {
        setMessage(`User '${username}' deleted.`);
        refresh();
      } else {
        setError(res.error || "Failed to delete user");
      }
    });
  };

  const handleQuickLogin = (userId: number, username: string) => {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const res = await quickLoginDevUserAction(userId);
      if (res.ok) {
        setMessage(`Logged in as '${username}'. Refreshing page...`);
        setTimeout(() => {
          window.location.href = "/";
        }, 500);
      } else {
        setError(res.error || "Failed to quick login");
      }
    });
  };

  const handleResetPassword = (userId: number) => {
    if (!newPassword || newPassword.length < 10) {
      setError("New password must be at least 10 characters");
      return;
    }
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const res = await resetDevUserPasswordAction(userId, newPassword);
      if (res.ok) {
        setMessage("Password updated successfully.");
        setResetPassUserId(null);
        setNewPassword("");
        refresh();
      } else {
        setError(res.error || "Failed to reset password");
      }
    });
  };

  const handleWipeAll = () => {
    if (
      !confirm(
        "WARNING: This will delete ALL users and reset the setup wizard status. Proceed?",
      )
    )
      return;
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const res = await wipeAllUsersAction();
      if (res.ok) {
        setMessage("All accounts wiped. System reset to fresh state.");
        refresh();
      } else {
        setError(res.error || "Failed to wipe users");
      }
    });
  };

  return (
    <>
      {/* Floating pill button in bottom right corner */}
      <button
        type="button"
        onClick={() => setShowPasswordPrompt(true)}
        style={{
          position: "fixed",
          bottom: "16px",
          right: "16px",
          zIndex: 99998,
          background: "rgba(30, 41, 59, 0.95)",
          color: "#f8fafc",
          border: "1px solid #475569",
          borderRadius: "20px",
          padding: "6px 14px",
          fontSize: "12px",
          fontWeight: 600,
          cursor: "pointer",
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
        title="Developer Menu (Ctrl+Shift+D or Ctrl+Alt+D)"
      >
        <span>🛠 Dev Menu</span>
        <span style={{ opacity: 0.6, fontSize: "10px" }}>[Ctrl+Shift+D]</span>
      </button>

      {/* Modal Dialog */}
      {/* Password Prompt Modal */}
      {showPasswordPrompt && !isOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(4px)",
            zIndex: 99999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowPasswordPrompt(false);
          }}
        >
          <div
            style={{
              background: "#1e293b",
              color: "#f8fafc",
              border: "1px solid #334155",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "400px",
              padding: "24px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
            }}
          >
            <h2 style={{ margin: "0 0 8px", fontSize: "18px", fontWeight: 700, color: "#38bdf8" }}>
              🔒 Developer Menu Access
            </h2>
            <p style={{ fontSize: "13px", color: "#94a3b8", margin: "0 0 16px" }}>
              Enter the developer password to access the control panel.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const entered = passwordInputRef.current?.value ?? "";
                if (entered === DEV_PASSWORD) {
                  setAuthenticated(true);
                  setShowPasswordPrompt(false);
                  setIsOpen(true);
                } else {
                  setError("Incorrect password. Access denied.");
                }
              }}
            >
              <input
                type="password"
                ref={passwordInputRef}
                defaultValue=""
                placeholder="Enter password"
                autoFocus
                id="dev-menu-password"
                style={{
                  width: "100%",
                  background: "#0f172a",
                  color: "white",
                  border: "1px solid #475569",
                  borderRadius: "6px",
                  padding: "8px 12px",
                  fontSize: "14px",
                  marginBottom: "12px",
                  boxSizing: "border-box",
                }}
              />
              {error && (
                <div
                  style={{
                    marginBottom: "12px",
                    padding: "8px 12px",
                    backgroundColor: "#7f1d1d",
                    border: "1px solid #dc2626",
                    borderRadius: "6px",
                    fontSize: "13px",
                    color: "#fecaca",
                  }}
                >
                  ⚠️ {error}
                </div>
              )}
              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setShowPasswordPrompt(false)}
                  style={{
                    background: "#334155",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    padding: "8px 16px",
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    background: "#0284c7",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    padding: "8px 16px",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Unlock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isOpen && authenticated && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(4px)",
            zIndex: 99999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsOpen(false);
          }}
        >
          <div
            style={{
              background: "#1e293b",
              color: "#f8fafc",
              border: "1px solid #334155",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "800px",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid #334155",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#38bdf8" }}>
                  🛠 Developer & Admin Control Menu
                </h2>
                <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                  Shortcut: Ctrl+Shift+D or Ctrl+Alt+D · Easily add/delete admins or run setup
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#94a3b8",
                  fontSize: "20px",
                  cursor: "pointer",
                  padding: "4px 8px",
                }}
              >
                ✕
              </button>
            </div>

            {/* Notification Banners */}
            {message && (
              <div
                style={{
                  margin: "12px 20px 0",
                  padding: "10px 14px",
                  backgroundColor: "#064e3b",
                  border: "1px solid #059669",
                  borderRadius: "6px",
                  fontSize: "13px",
                  color: "#a7f3d0",
                }}
              >
                ✓ {message}
              </div>
            )}
            {error && (
              <div
                style={{
                  margin: "12px 20px 0",
                  padding: "10px 14px",
                  backgroundColor: "#7f1d1d",
                  border: "1px solid #dc2626",
                  borderRadius: "6px",
                  fontSize: "13px",
                  color: "#fecaca",
                }}
              >
                ⚠ {error}
              </div>
            )}

            {/* Content Body */}
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Quick Action Toolbar */}
              <div
                style={{
                  background: "#0f172a",
                  padding: "14px",
                  borderRadius: "8px",
                  border: "1px solid #1e293b",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "10px",
                  alignItems: "center",
                }}
              >
                <button
                  type="button"
                  onClick={handleCreateDefaultAdmin}
                  disabled={isPending}
                  style={{
                    background: "#0284c7",
                    color: "white",
                    border: "none",
                    borderRadius: "6px",
                    padding: "8px 14px",
                    fontWeight: 600,
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                >
                  ⚡ Create/Reset Default Admin (admin / Admin123456!)
                </button>

                <a
                  href="/setup"
                  onClick={() => setIsOpen(false)}
                  style={{
                    background: "#334155",
                    color: "white",
                    borderRadius: "6px",
                    padding: "8px 14px",
                    fontSize: "13px",
                    textDecoration: "none",
                    display: "inline-block",
                  }}
                >
                  🚀 Open Setup Wizard (/setup)
                </a>

                <button
                  type="button"
                  onClick={handleWipeAll}
                  disabled={isPending}
                  style={{
                    background: "#991b1b",
                    color: "#fecaca",
                    border: "none",
                    borderRadius: "6px",
                    padding: "8px 14px",
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                >
                  🗑 Wipe All Users & Reset Setup
                </button>
              </div>

              {/* Status Pills */}
              <div style={{ display: "flex", gap: "10px", fontSize: "12px" }}>
                <span
                  style={{
                    background: status?.ownerExists ? "#065f46" : "#854d0e",
                    padding: "4px 10px",
                    borderRadius: "12px",
                  }}
                >
                  Owner Account: {status?.ownerExists ? "Exists ✓" : "None Yet (Setup pending)"}
                </span>
                <span style={{ background: "#334155", padding: "4px 10px", borderRadius: "12px" }}>
                  Total Users: {status?.users.length ?? 0}
                </span>
              </div>

              {/* Existing Users Table */}
              <div>
                <h3 style={{ margin: "0 0 10px 0", fontSize: "15px", color: "#e2e8f0" }}>
                  User Accounts
                </h3>
                {status?.users && status.users.length > 0 ? (
                  <div style={{ overflowX: "auto" }}>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: "13px",
                        textAlign: "left",
                      }}
                    >
                      <thead>
                        <tr style={{ borderBottom: "1px solid #334155", color: "#94a3b8" }}>
                          <th style={{ padding: "8px" }}>ID</th>
                          <th style={{ padding: "8px" }}>Username</th>
                          <th style={{ padding: "8px" }}>Full Name</th>
                          <th style={{ padding: "8px" }}>Role(s)</th>
                          <th style={{ padding: "8px" }}>Status</th>
                          <th style={{ padding: "8px" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {status.users.map((u) => (
                          <tr key={u.id} style={{ borderBottom: "1px solid #1e293b" }}>
                            <td style={{ padding: "8px" }}>{u.id}</td>
                            <td style={{ padding: "8px", fontWeight: 600 }}>{u.username}</td>
                            <td style={{ padding: "8px" }}>{u.fullName}</td>
                            <td style={{ padding: "8px" }}>
                              {u.roles.map((r) => (
                                <span
                                  key={r}
                                  style={{
                                    background: r === "owner" ? "#0369a1" : "#475569",
                                    color: "white",
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                    fontSize: "11px",
                                    marginRight: "4px",
                                  }}
                                >
                                  {r}
                                </span>
                              ))}
                            </td>
                            <td style={{ padding: "8px" }}>
                              <span
                                style={{
                                  color: u.isActive ? "#4ade80" : "#f87171",
                                  fontWeight: 500,
                                }}
                              >
                                {u.isActive ? "Active" : "Disabled"}
                              </span>
                            </td>
                            <td style={{ padding: "8px" }}>
                              <div style={{ display: "flex", gap: "6px" }}>
                                <button
                                  type="button"
                                  onClick={() => handleQuickLogin(u.id, u.username)}
                                  disabled={isPending || !u.isActive}
                                  style={{
                                    background: "#166534",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "4px",
                                    padding: "4px 8px",
                                    fontSize: "11px",
                                    cursor: "pointer",
                                  }}
                                  title="Instantly sign in as this user"
                                >
                                  Quick Login
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    setResetPassUserId(resetPassUserId === u.id ? null : u.id)
                                  }
                                  disabled={isPending}
                                  style={{
                                    background: "#475569",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "4px",
                                    padding: "4px 8px",
                                    fontSize: "11px",
                                    cursor: "pointer",
                                  }}
                                >
                                  Reset Pass
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleDeleteUser(u.id, u.username)}
                                  disabled={isPending}
                                  style={{
                                    background: "#dc2626",
                                    color: "white",
                                    border: "none",
                                    borderRadius: "4px",
                                    padding: "4px 8px",
                                    fontSize: "11px",
                                    cursor: "pointer",
                                  }}
                                >
                                  Delete
                                </button>
                              </div>

                              {/* In-line password reset box */}
                              {resetPassUserId === u.id && (
                                <div
                                  style={{
                                    marginTop: "8px",
                                    display: "flex",
                                    gap: "6px",
                                    alignItems: "center",
                                  }}
                                >
                                  <input
                                    type="password"
                                    placeholder="New pass (min 10 chars)"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    style={{
                                      background: "#0f172a",
                                      color: "white",
                                      border: "1px solid #475569",
                                      padding: "4px 8px",
                                      borderRadius: "4px",
                                      fontSize: "12px",
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleResetPassword(u.id)}
                                    disabled={isPending}
                                    style={{
                                      background: "#0284c7",
                                      color: "white",
                                      border: "none",
                                      padding: "4px 8px",
                                      borderRadius: "4px",
                                      fontSize: "11px",
                                      cursor: "pointer",
                                    }}
                                  >
                                    Save
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p style={{ color: "#94a3b8", fontSize: "13px", fontStyle: "italic" }}>
                    No users created yet. Use the form below or click &quot;Create Default Admin&quot;.
                  </p>
                )}
              </div>

              {/* Add New User Form */}
              <div
                style={{
                  background: "#0f172a",
                  padding: "16px",
                  borderRadius: "8px",
                  border: "1px solid #334155",
                }}
              >
                <h3 style={{ margin: "0 0 12px 0", fontSize: "14px", color: "#38bdf8" }}>
                  Add Admin / User Directly
                </h3>
                <form
                  onSubmit={handleCreateUser}
                  style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}
                >
                  <div>
                    <label style={{ display: "block", fontSize: "12px", marginBottom: "4px", color: "#cbd5e1" }}>
                      Username *
                    </label>
                    <input
                      name="username"
                      required
                      placeholder="e.g. manager1"
                      style={{
                        width: "100%",
                        background: "#1e293b",
                        color: "white",
                        border: "1px solid #475569",
                        borderRadius: "6px",
                        padding: "6px 10px",
                        fontSize: "13px",
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "12px", marginBottom: "4px", color: "#cbd5e1" }}>
                      Full Name *
                    </label>
                    <input
                      name="fullName"
                      required
                      placeholder="e.g. John Doe"
                      style={{
                        width: "100%",
                        background: "#1e293b",
                        color: "white",
                        border: "1px solid #475569",
                        borderRadius: "6px",
                        padding: "6px 10px",
                        fontSize: "13px",
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "12px", marginBottom: "4px", color: "#cbd5e1" }}>
                      Password * (min 10 chars)
                    </label>
                    <input
                      name="password"
                      type="password"
                      required
                      minLength={10}
                      placeholder="••••••••••"
                      style={{
                        width: "100%",
                        background: "#1e293b",
                        color: "white",
                        border: "1px solid #475569",
                        borderRadius: "6px",
                        padding: "6px 10px",
                        fontSize: "13px",
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "12px", marginBottom: "4px", color: "#cbd5e1" }}>
                      Role
                    </label>
                    <select
                      name="role"
                      defaultValue="owner"
                      style={{
                        width: "100%",
                        background: "#1e293b",
                        color: "white",
                        border: "1px solid #475569",
                        borderRadius: "6px",
                        padding: "6px 10px",
                        fontSize: "13px",
                      }}
                    >
                      <option value="owner">Owner / Full Admin</option>
                      <option value="manager">Manager</option>
                      <option value="receptionist">Receptionist</option>
                      <option value="accountant">Accountant</option>
                      <option value="trainer">Trainer</option>
                      <option value="auditor">Auditor (Read-Only)</option>
                    </select>
                  </div>

                  <div style={{ gridColumn: "span 2", marginTop: "4px" }}>
                    <button
                      type="submit"
                      disabled={isPending}
                      style={{
                        background: "#0284c7",
                        color: "white",
                        border: "none",
                        borderRadius: "6px",
                        padding: "8px 18px",
                        fontSize: "13px",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      + Create User
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                padding: "12px 20px",
                borderTop: "1px solid #334155",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "12px",
                color: "#64748b",
              }}
            >
              <span>Press Escape or click outside to close</span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                style={{
                  background: "#334155",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  padding: "4px 12px",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
