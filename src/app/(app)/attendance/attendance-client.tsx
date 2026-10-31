"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { MEMBERSHIP_STATE_LABELS, type MembershipState } from "@/lib/dates";
import { checkInAction, searchMembersAction, type MemberLookup } from "./actions";
import {
  IconSearch,
  IconZap,
  IconCheckCircle,
  IconAlertTriangle,
  IconX,
  IconClock,
  IconArrowRight,
} from "@/components/icons";

type Item = {
  id: number;
  member_id: number;
  member_name: string;
  member_number: string;
  checked_in_at: string;
  method: string;
  status: string;
  notes: string | null;
};

function stateChip(state: MembershipState | null): { className: string; label: string; isGood: boolean } {
  if (!state) return { className: "chip", label: "No membership", isGood: false };
  if (state === "active") return { className: "chip chip-ok", label: MEMBERSHIP_STATE_LABELS[state], isGood: true };
  if (state === "expiring_soon") return { className: "chip chip-warn", label: MEMBERSHIP_STATE_LABELS[state], isGood: true };
  if (state === "scheduled" || state === "frozen")
    return { className: "chip chip-warn", label: MEMBERSHIP_STATE_LABELS[state], isGood: false };
  return { className: "chip chip-bad", label: MEMBERSHIP_STATE_LABELS[state], isGood: false };
}

export function AttendanceClient({
  initialItems,
  canRecord,
  canOverride,
  duplicateWindowMinutes,
}: {
  initialItems: Item[];
  canRecord: boolean;
  canOverride: boolean;
  duplicateWindowMinutes: number;
}) {
  const items = initialItems;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemberLookup[]>([]);
  const [selected, setSelected] = useState<MemberLookup | null>(null);
  const [method, setMethod] = useState("manual");
  const [notes, setNotes] = useState("");
  const [override, setOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchRef.current) searchRef.current.focus();
  }, []);

  useEffect(() => {
    if (selected) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      startTransition(async () => {
        const res = await searchMembersAction(q);
        if (cancelled) return;
        setResults(res.results ?? []);
        if (!res.ok) setError(res.error ?? "Search failed");
      });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, selected]);

  function choose(member: MemberLookup) {
    setSelected(member);
    setResults([]);
    setQuery("");
    setError(null);
    setMessage(null);
  }

  function reset() {
    setSelected(null);
    setQuery("");
    setResults([]);
    setNotes("");
    setOverride(false);
    setOverrideReason("");
    setError(null);
    setMessage(null);
    requestAnimationFrame(() => searchRef.current?.focus());
  }

  function submit() {
    if (!selected) return;
    const fd = new FormData();
    fd.set("memberId", String(selected.id));
    fd.set("method", method);
    fd.set("notes", notes);
    if (override) {
      fd.set("override", "on");
      fd.set("overrideReason", overrideReason);
    }
    startTransition(async () => {
      const res = await checkInAction(fd);
      if (!res.ok) {
        setError(res.error ?? "Could not check in");
        return;
      }
      setMessage(res.message ?? "Checked in successfully");
      requestAnimationFrame(() => {
        window.location.reload();
      });
    });
  }

  const chip = selected ? stateChip(selected.state) : null;
  const isEligible = chip?.isGood ?? false;

  return (
    <div>
      {/* Front Desk Check-in Box */}
      <div className="section" style={{ borderTop: "4px solid #2563eb" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div>
            <h2 style={{ display: "flex", alignItems: "center", gap: "8px", margin: 0 }}>
              <IconZap size={20} style={{ color: "#2563eb" }} />
              <span>Fast Front-Desk Check-in</span>
            </h2>
            <p className="muted small" style={{ margin: "2px 0 0" }}>
              Search member by name, member number, or phone to record arrival.
            </p>
          </div>
          <div className="chip chip-ok" style={{ fontSize: "0.82rem", padding: "4px 12px" }}>
            <span>Today&apos;s check-ins:</span>
            <strong>{items.length}</strong>
          </div>
        </div>

        {!selected ? (
          <div>
            <div className="field">
              <div className="search-input-wrap">
                <IconSearch size={18} className="search-icon-inside" />
                <input
                  id="memberSearch"
                  ref={searchRef}
                  type="search"
                  autoComplete="off"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setError(null);
                  }}
                  placeholder="Type member name, EF-number, or phone (e.g. John or 0300)..."
                  disabled={!canRecord}
                  style={{
                    fontSize: "1.05rem",
                    padding: "12px 14px 12px 42px",
                    borderRadius: "10px",
                  }}
                />
                {query ? (
                  <button
                    type="button"
                    className="search-clear-btn"
                    onClick={() => setQuery("")}
                    title="Clear search"
                  >
                    <IconX size={16} />
                  </button>
                ) : null}
              </div>
            </div>

            {query.trim().length >= 2 && results.length === 0 && !isPending ? (
              <p className="muted" style={{ marginTop: "10px" }}>
                No active or registered members match &ldquo;{query.trim()}&rdquo;.
              </p>
            ) : null}

            {results.length > 0 ? (
              <ul className="search-results">
                {results.map((r) => {
                  const c = stateChip(r.state);
                  const initials = r.fullName
                    .split(" ")
                    .map((p) => p[0])
                    .filter(Boolean)
                    .join("")
                    .slice(0, 2)
                    .toUpperCase();
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        className="search-item"
                        onClick={() => choose(r)}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <span className="member-avatar-sm">{initials}</span>
                          <div>
                            <strong>{r.fullName}</strong>
                            <div className="muted small">
                              {r.memberNumber}
                              {r.phone ? ` ·  ${r.phone}` : ""}
                              {r.planName ? ` · ${r.planName}` : ""}
                            </div>
                          </div>
                        </div>
                        <span className={c.className}>{c.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        ) : (
          <div>
            {/* Selected Member Access Status Card */}
            <div
              className={`selected-member ${
                isEligible ? "status-granted" : "status-denied"
              }`}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                {isEligible ? (
                  <IconCheckCircle size={36} style={{ color: "#16a34a" }} />
                ) : (
                  <IconAlertTriangle size={36} style={{ color: "#dc2626" }} />
                )}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <h3 style={{ margin: 0, fontSize: "1.2rem" }}>{selected.fullName}</h3>
                    {chip ? <span className={chip.className}>{chip.label}</span> : null}
                  </div>
                  <div className="muted" style={{ marginTop: "2px", fontSize: "0.9rem" }}>
                    <span>{selected.memberNumber}</span>
                    {selected.phone ? ` ·  ${selected.phone}` : ""}
                    {selected.planName ? ` · Plan: ${selected.planName}` : ""}
                    {selected.endOn ? ` · Valid until: ${selected.endOn}` : ""}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <Link
                  href={`/members/${selected.id}`}
                  className="btn-secondary"
                  target="_blank"
                  style={{ fontSize: "0.85rem", padding: "6px 12px" }}
                >
                  View Profile
                </Link>
                <button type="button" className="btn-ghost" onClick={reset}>
                  Change
                </button>
              </div>
            </div>

            {/* Check-in options form */}
            <div className="grid-2" style={{ marginTop: 16 }}>
              <div className="field">
                <label htmlFor="method">Check-in Method</label>
                <select id="method" value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option value="manual">Manual Entry (Front Desk)</option>
                  <option value="qr">Barcode / QR Card</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="notes">Staff Note (Optional)</label>
                <input
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Guest pass, locker assigned..."
                />
              </div>
            </div>

            {/* Override block if expired / frozen */}
            {canOverride && !isEligible ? (
              <div
                style={{
                  marginTop: 14,
                  background: "#fffbeb",
                  border: "1px solid #fde68a",
                  borderRadius: "10px",
                  padding: "14px",
                }}
              >
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={override}
                    onChange={(e) => setOverride(e.target.checked)}
                  />
                  <span>
                    <strong>Manager Override:</strong> Grant entry despite expired or frozen membership
                  </span>
                </label>
                {override ? (
                  <div className="field" style={{ marginTop: 10 }}>
                    <label htmlFor="overrideReason">Reason for entry override *</label>
                    <input
                      id="overrideReason"
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      placeholder="e.g. Promised payment tomorrow, owner permission..."
                      required
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            {error ? <p className="error" style={{ marginTop: 14 }}>{error}</p> : null}
            {message ? <p className="success" style={{ marginTop: 14 }}>{message}</p> : null}

            <div className="row-actions" style={{ marginTop: 18 }}>
              <button
                type="button"
                onClick={submit}
                disabled={isPending || !canRecord || (!isEligible && !override)}
                className="btn-primary"
                style={{ padding: "10px 22px", fontSize: "1rem" }}
              >
                <IconZap size={18} />
                <span>{isPending ? "Recording…" : "Confirm Check-in"}</span>
              </button>
              <button type="button" className="btn-secondary" onClick={reset}>
                Cancel
              </button>
              {!isEligible ? (
                <Link
                  href={`/members/${selected.id}`}
                  className="btn-secondary"
                  style={{ marginLeft: "auto" }}
                >
                  Renew Membership
                </Link>
              ) : null}
            </div>
          </div>
        )}

        <div style={{ marginTop: "16px", paddingTop: "12px", borderTop: "1px solid #e2e8f0" }}>
          <p className="muted small" style={{ margin: 0 }}>
            Note: Repeat check-ins within {duplicateWindowMinutes} minutes are prevented to prevent double scans unless overridden.
          </p>
        </div>
      </div>

      {/* Today's Check-ins Log */}
      <div className="section">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <h2>Today&apos;s Check-in Feed</h2>
          <span className="muted small">Ordered by most recent</span>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Member</th>
                <th>Method</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const initials = i.member_name
                  .split(" ")
                  .map((p) => p[0])
                  .filter(Boolean)
                  .join("")
                  .slice(0, 2)
                  .toUpperCase();

                const timeFormatted = new Date(i.checked_in_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });

                return (
                  <tr key={i.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <IconClock size={14} className="muted" />
                        <strong>{timeFormatted}</strong>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center" }}>
                        <span className="member-avatar-sm">{initials}</span>
                        <div>
                          <Link className="strong-link" href={`/members/${i.member_id}`}>
                            {i.member_name}
                          </Link>
                          <div className="muted small">{i.member_number}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="chip" style={{ textTransform: "capitalize" }}>
                        {i.method}
                      </span>
                      {i.notes ? <div className="muted small">{i.notes}</div> : null}
                    </td>
                    <td>
                      <span className={i.status === "overridden" ? "chip chip-warn" : "chip chip-ok"}>
                        {i.status === "overridden" ? "Overridden" : "Allowed"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link
                        className="btn-secondary"
                        style={{ padding: "4px 8px", fontSize: "0.8rem" }}
                        href={`/members/${i.member_id}`}
                      >
                        <span>Profile</span>
                        <IconArrowRight size={12} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <div className="empty">
                      <IconClock size={32} className="muted" />
                      <h3>No check-ins recorded yet today</h3>
                      <p className="muted">Search for a client above to check them in as they enter.</p>
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
