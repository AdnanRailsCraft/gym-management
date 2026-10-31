"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { buildReminderMessage, smsHref, whatsappHref, } from "@/lib/reminders";
import type { ReminderCandidate } from "@/server/members/reminders";
import { recordReminderAction } from "./actions";
import { IconBell, IconAlertTriangle, IconWhatsApp, IconPhone, IconCopy, IconCheckCircle, IconArrowRight, } from "@/components/icons";
import { Modal } from "@/components/modal";
type Filter = "all" | "due" | "expired" | "uncontacted";
function dayLabel(daysLeft: number): string {
    if (daysLeft > 1)
        return `${daysLeft} days left`;
    if (daysLeft === 1)
        return "Tomorrow";
    if (daysLeft === 0)
        return "Last day today";
    const ago = Math.abs(daysLeft);
    return `Expired ${ago} day${ago === 1 ? "" : "s"} ago`;
}
function dayTone(daysLeft: number): string {
    if (daysLeft < 0)
        return "chip chip-bad";
    if (daysLeft <= 1)
        return "chip chip-warn";
    return "chip chip-ok";
}
export function RemindersClient({ candidates, gymName, windowDays, }: {
    candidates: ReminderCandidate[];
    gymName: string;
    windowDays: number;
}) {
    const [filter, setFilter] = useState<Filter>("all");
    const [selected, setSelected] = useState<ReminderCandidate | null>(null);
    const [message, setMessage] = useState("");
    const [channel, setChannel] = useState("whatsapp");
    const [notes, setNotes] = useState("");
    const [toast, setToast] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const counts = useMemo(() => { const due = candidates.filter((c) => c.daysLeft >= 0).length; const expired = candidates.filter((c) => c.daysLeft < 0).length; const uncontacted = candidates.filter((c) => !c.lastRemindedAt || Date.parse(c.lastRemindedAt) < Date.now() - 24 * 3600000).length; return { all: candidates.length, due, expired, uncontacted }; }, [candidates]);
    const visible = candidates.filter((c) => {
        if (filter === "due")
            return c.daysLeft >= 0;
        if (filter === "expired")
            return c.daysLeft < 0;
        if (filter === "uncontacted")
            return !c.lastRemindedAt || Date.parse(c.lastRemindedAt) < Date.now() - 24 * 3600000;
        return true;
    });
    function openLog(candidate: ReminderCandidate, presetChannel = "whatsapp") { setSelected(candidate); setChannel(presetChannel); setNotes(""); setError(null); setMessage(buildReminderMessage({ gymName, memberName: candidate.memberName, planName: candidate.planName, endOn: candidate.endOn, daysLeft: candidate.daysLeft, })); }
    async function copy(text: string) {
        try {
            await navigator.clipboard.writeText(text);
            setToast("Reminder message copied to clipboard!");
            setTimeout(() => setToast(null), 6000);
        }
        catch {
            setToast("Could not copy automatically. Select and copy manually.");
        }
    }
    function submitLog(formData: FormData) {
        startTransition(async () => {
            const res = await recordReminderAction(formData);
            if (!res.ok) {
                setError(res.error ?? "Could not save the reminder");
                return;
            }
            setSelected(null);
            setToast("Reminder logged successfully.");
            setTimeout(() => setToast(null), 6000);
        });
    }
    const filters: {
        key: Filter;
        label: string;
        count: number;
    }[] = [{ key: "all", label: "All Reminders", count: counts.all }, { key: "due", label: "Due Soon", count: counts.due }, { key: "expired", label: "Already Expired", count: counts.expired }, { key: "uncontacted", label: "Need Follow-up", count: counts.uncontacted },];
    return (<>      {/* Metric KPI cards */}      <div className="kpi-row">        <div className="kpi" style={{ borderTop: "3px solid #d97706" }}>          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>            <span className="kpi-label">Due Soon ({windowDays}d window)</span>            <IconBell size={18} style={{ color: "#d97706" }}/>          </div>          <span className="kpi-value" style={{ color: counts.due > 0 ? "#d97706" : "inherit" }}>            {counts.due}          </span>        </div>        <div className="kpi" style={{ borderTop: "3px solid #dc2626" }}>          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>            <span className="kpi-label">Already Expired</span>            <IconAlertTriangle size={18} style={{ color: "#dc2626" }}/>          </div>          <span className="kpi-value" style={{ color: counts.expired > 0 ? "#dc2626" : "inherit" }}>            {counts.expired}          </span>        </div>        <div className="kpi" style={{ borderTop: "3px solid #2563eb" }}>          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>            <span className="kpi-label">Uncontacted (&gt;24h)</span>            <IconPhone size={18} style={{ color: "#2563eb" }}/>          </div>          <span className="kpi-value" style={{ color: counts.uncontacted > 0 ? "#2563eb" : "inherit" }}>            {counts.uncontacted}          </span>        </div>      </div>      {toast ? (<div className="success" style={{ display: "flex", alignItems: "center", gap: "8px" }}>          <IconCheckCircle size={16}/>          <span>{toast}</span>        </div>) : null}      <div className="section">        {/* Tab Filters */}        <div className="tab-group" style={{ marginBottom: "16px" }}>          {filters.map((f) => (<button key={f.key} type="button" className={`tab ${filter === f.key ? "tab-active" : ""}`} onClick={() => setFilter(f.key)}>              <span>{f.label}</span>              <span className="tab-count">{f.count}</span>            </button>))}        </div>        {visible.length === 0 ? (<div className="empty">            <IconCheckCircle size={36} style={{ color: "#16a34a" }}/>            <h3>No reminders needed</h3>            <p className="muted">              No memberships match the selected filter within the {windowDays}-day reminder window.            </p>          </div>) : (<div className="table-wrap">            <table className="table">              <thead>                <tr>                  <th>Client</th>                  <th>Subscription Plan</th>                  <th>Expiry Date</th>                  <th>Phone Number</th>                  <th>Last Follow-up</th>                  <th style={{ textAlign: "right" }}>Quick Actions</th>                </tr>              </thead>              <tbody>                {visible.map((c) => { const text = buildReminderMessage({ gymName, memberName: c.memberName, planName: c.planName, endOn: c.endOn, daysLeft: c.daysLeft, }); const wa = whatsappHref(c.phone, text); const sms = smsHref(c.phone, text); const initials = c.memberName.split(" ").map((p) => p[0]).filter(Boolean).join("").slice(0, 2).toUpperCase(); return (<tr key={c.membershipId}>                      <td>                        <div style={{ display: "flex", alignItems: "center" }}>                          <span className="member-avatar-sm">{initials}</span>                          <div>                            <Link href={`/members/${c.memberId}`} className="strong-link">                              {c.memberName}                            </Link>                            <div className="muted small">{c.memberNumber}</div>                          </div>                        </div>                      </td>                      <td>                        <strong>{c.planName}</strong>                      </td>                      <td>                        <div>{c.endOn}</div>                        <span className={dayTone(c.daysLeft)} style={{ marginTop: "2px" }}>                          {dayLabel(c.daysLeft)}                        </span>                      </td>                      <td>                        {c.phone ? (<span>{c.phone}</span>) : (<span className="muted">No phone recorded</span>)}                      </td>                      <td>                        {c.lastRemindedAt ? (<>                            <div>{new Date(c.lastRemindedAt).toLocaleDateString()}</div>                            <span className="chip" style={{ fontSize: "0.72rem", textTransform: "capitalize" }}>                              {c.lastChannel}                            </span>                          </>) : (<span className="chip chip-warn" style={{ fontSize: "0.72rem" }}>                            Not contacted                          </span>)}                      </td>                      <td>                        <div className="row-actions" style={{ justifyContent: "flex-end" }}>`n                          <Link href={`/members/${c.memberId}`} className="btn-secondary" title="Open client to renew" style={{ padding: "6px 10px", fontSize: "0.82rem" }}>`n                            <IconArrowRight size={13}/>`n                            <span>Renew</span>`n                          </Link>                          {wa ? (<a className="btn-whatsapp" href={wa} target="_blank" rel="noreferrer" title="Send WhatsApp reminder" style={{ padding: "6px 12px", fontSize: "0.82rem" }}>                              <IconWhatsApp size={14}/>                              <span>WhatsApp</span>                            </a>) : null}                          {sms ? (<a className="btn-secondary" href={sms} title="Send SMS" style={{ padding: "6px 10px", fontSize: "0.82rem" }}>                              <IconPhone size={13}/>                              <span>SMS</span>                            </a>) : null}                          <button type="button" className="btn-secondary" onClick={() => copy(text)} title="Copy message to clipboard" style={{ padding: "6px 10px", fontSize: "0.82rem" }}>                            <IconCopy size={13}/>                            <span>Copy</span>                          </button>                          <button type="button" className="btn-secondary" onClick={() => openLog(c)} title="Log that a reminder was sent" style={{ padding: "6px 10px", fontSize: "0.82rem" }}>                            <span>Log</span>                          </button>                        </div>                      </td>                    </tr>); })}              </tbody>            </table>          </div>)}      </div>      {/* Log Reminder Modal */}      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title={`Log Reminder: ${selected?.memberName ?? ""}`}>        <form className="form" action={submitLog}>              <input type="hidden" name="membershipId" value={selected?.membershipId ?? ""}/>              <div className="grid-2">                <div className="field">                  <label htmlFor="channel">Communication Channel *</label>                  <select id="channel" name="channel" value={channel} onChange={(e) => setChannel(e.target.value)}>                    <option value="whatsapp">WhatsApp</option>                    <option value="sms">SMS</option>                    <option value="call">Phone Call</option>                    <option value="in_person">In Person / Front Desk</option>                    <option value="other">Other</option>                  </select>                </div>                <div className="field">                  <label htmlFor="notes">Staff Notes (Optional)</label>                  <input id="notes" name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Member said they will pay next Monday"/>                </div>              </div>              <div className="field">                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>                  <label htmlFor="message">Message Sent</label>                  <button type="button" className="btn-ghost" onClick={() => copy(message)} style={{ fontSize: "0.8rem", padding: "2px 6px" }}>                    <IconCopy size={12}/>                    <span>Copy Text</span>                  </button>                </div>                <textarea id="message" name="message" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} required/>              </div>              {error ? <p className="error">{error}</p> : null}              <div className="modal-footer">                <button type="button" className="btn-secondary" onClick={() => setSelected(null)}>                  Cancel                </button>                <button type="submit" disabled={isPending}>                  {isPending ? "Saving…" : "Save to Log"}                </button>              </div>            </form>      </Modal>    </>);
}
