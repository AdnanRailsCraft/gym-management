"use client";

import { useEffect, useState, useTransition } from "react";
import { MEMBERSHIP_STATE_LABELS } from "@/lib/dates";
import { formatMinorUnits, minorToMajor } from "@/lib/money";
import type { MembershipView } from "@/server/members/memberships";
import {
  archiveMemberAction,
  setMemberStatusAction,
  setMemberHealthAction,
} from "../actions";
import {
  cancelMembershipAction,
  extendMembershipAction,
  freezeMembershipAction,
  reactivateMembershipAction,
  renewMembershipAction,
  sellMembershipAction,
  suspendMembershipAction,
  unfreezeMembershipAction,
} from "../membership-actions";
import { IconCheckCircle } from "@/components/icons";
import { queueToast, takeToast } from "@/lib/toast";

interface PlanOption {
  id: number;
  name: string;
  priceMinor: number;
  joiningFeeMinor: number;
  durationValue: number;
  durationUnit: "days" | "months";
  graceDays: number;
  freezeAllowed: boolean;
  maxFreezeDays: number | null;
  isActive: boolean;
  sellableToNewMembers: boolean;
}

interface FreezeView {
  id: number;
  fromOn: string;
  toOn: string;
  days: number;
  reason: string;
}

interface Props {
  memberId: number;
  memberStatus: "active" | "inactive" | "suspended" | "archived";
  current: MembershipView | null;
  plans: PlanOption[];
  freezes: FreezeView[];
  today: string;
  currencyCode: string;
  minorUnits: number;
  canSell: boolean;
  canRenew: boolean;
  canFreeze: boolean;
  canExtend: boolean;
  canSuspend: boolean;
  canCancel: boolean;
  canUpdateMember: boolean;
  canArchive: boolean;
  canViewHealth: boolean;
  healthNotes: string | null;
  healthConsent: boolean;
}

type ActionKind =
  | "sell"
  | "renew"
  | "freeze"
  | "unfreeze"
  | "extend"
  | "suspend"
  | "cancel"
  | "status"
  | "archive"
  | "health"
  | null;

const ACTION_TOAST: Record<Exclude<ActionKind, null>, string> = {
  sell: "Membership started.",
  renew: "Membership renewed.",
  freeze: "Membership frozen.",
  unfreeze: "Membership resumed.",
  extend: "Membership extended.",
  suspend: "Membership suspended.",
  cancel: "Membership cancelled.",
  status: "Client status updated.",
  archive: "Client archived. Their history is kept.",
  health: "Health notes saved.",
};

function newKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function MemberDetailClient({
  memberId,
  memberStatus,
  current,
  plans,
  freezes,
  today,
  currencyCode,
  minorUnits,
  canSell,
  canRenew,
  canFreeze,
  canExtend,
  canSuspend,
  canCancel,
  canUpdateMember,
  canArchive,
  canViewHealth,
  healthNotes,
  healthConsent,
}: Props) {
  const [action, setAction] = useState<ActionKind>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const queued = takeToast();
    if (queued) {
      setToast(queued);
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, []);

  const sellablePlans = plans.filter(
    (p) => p.isActive && p.sellableToNewMembers,
  );
  const activePlans = plans.filter((p) => p.isActive);

  const [sellPlanId, setSellPlanId] = useState<number>(sellablePlans[0]?.id ?? 0);
  const [sellPrice, setSellPrice] = useState<string>(
    sellablePlans[0] ? String(minorToMajor(sellablePlans[0].priceMinor, minorUnits)) : "",
  );
  const [renewPlanId, setRenewPlanId] = useState<number>(
    current?.plan_id ?? activePlans[0]?.id ?? 0,
  );
  const [renewPrice, setRenewPrice] = useState<string>(() => {
    const plan = plans.find((p) => p.id === (current?.plan_id ?? activePlans[0]?.id));
    return plan ? String(minorToMajor(plan.priceMinor, minorUnits)) : "";
  });
  const [idempotencyKey, setIdempotencyKey] = useState<string>(newKey);

  const money = (minor: number) => formatMinorUnits(minor, currencyCode, minorUnits);

  const open = (next: ActionKind) => {
    setError(null);
    setIdempotencyKey(newKey());
    setAction(next);
  };

  const submit = (
    fn: (formData: FormData) => Promise<{ ok: boolean; error?: string }>,
    event: React.FormEvent<HTMLFormElement>,
  ) => {    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await fn(formData);
      if (result.ok) {
        queueToast(action ? ACTION_TOAST[action] : "Saved.");
        window.location.reload();
      } else {
        setError(result.error ?? "The request failed");
      }
    });
  };

  const runEmpty = (
    fn: (formData: FormData) => Promise<{ ok: boolean; error?: string }>,
    extra: Record<string, string>,
  ) => {
    const formData = new FormData();
    for (const [key, value] of Object.entries(extra)) formData.set(key, value);
    setError(null);
    startTransition(async () => {
      const result = await fn(formData);
      if (result.ok) {
        queueToast(action ? ACTION_TOAST[action] : "Saved.");
        window.location.reload();
      } else setError(result.error ?? "The request failed");
    });
  };

  const sellPlan = sellablePlans.find((p) => p.id === sellPlanId);
  const activeFreeze = freezes.find(
    (f) => f.fromOn <= today && f.toOn >= today,
  );

  return (
    <div className="section">
      <h2>Membership</h2>

      {toast ? (
        <div className="success" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <IconCheckCircle size={16} />
          <span>{toast}</span>
        </div>
      ) : null}

      {error ? <p className="error">{error}</p> : null}

      {current ? (
        <div>
          <p>
            <strong>{current.planName}</strong>{" "}
            <span className="chip">{MEMBERSHIP_STATE_LABELS[current.state]}</span>
          </p>
          <p className="muted">
            {current.start_on} → {current.end_on} (ends {current.end_on}, grace until{" "}
            {current.graceEndsOn}) · charge {money(current.totalChargeMinor)}
            {current.discount_minor > 0 ? ` (discount ${money(current.discount_minor)})` : ""}
          </p>
        </div>
      ) : (
        <p className="muted">No membership yet. Sell a plan to activate this client.</p>
      )}

      <div className="row-actions" style={{ flexWrap: "wrap" }}>
        {canSell ? (
          <button type="button" className="btn-secondary" onClick={() => open("sell")}>
            Sell membership
          </button>
        ) : null}
        {current && canRenew ? (
          <button type="button" className="btn-secondary" onClick={() => open("renew")}>
            Renew
          </button>
        ) : null}
        {current && canExtend ? (
          <button type="button" className="btn-secondary" onClick={() => open("extend")}>
            Extend
          </button>
        ) : null}
        {current && canFreeze && current.state !== "cancelled" && current.state !== "suspended" ? (
          <button type="button" className="btn-secondary" onClick={() => open("freeze")}>
            Freeze
          </button>
        ) : null}
        {current && canFreeze && activeFreeze ? (
          <button type="button" className="btn-secondary" onClick={() => open("unfreeze")}>
            End freeze
          </button>
        ) : null}
        {current && canSuspend && current.lifecycle_status !== "suspended" && current.lifecycle_status !== "cancelled" ? (
          <button type="button" className="btn-secondary" onClick={() => open("suspend")}>
            Suspend
          </button>
        ) : null}
        {current && canSuspend && current.lifecycle_status === "suspended" ? (
          <button
            type="button"
            className="btn-secondary"
            disabled={isPending}
            onClick={() => runEmpty(reactivateMembershipAction, { membershipId: String(current.id) })}
          >
            Reactivate
          </button>
        ) : null}
        {current && canCancel && current.lifecycle_status !== "cancelled" ? (
          <button type="button" className="btn-secondary" onClick={() => open("cancel")}>
            Cancel membership
          </button>
        ) : null}
        {canUpdateMember && memberStatus !== "archived" ? (
          <button type="button" className="btn-secondary" onClick={() => open("status")}>
            Change status
          </button>
        ) : null}
        {canArchive && memberStatus !== "archived" ? (
          <button type="button" className="btn-secondary" onClick={() => open("archive")}>
            Archive client
          </button>
        ) : null}
        {canViewHealth ? (
          <button type="button" className="btn-secondary" onClick={() => open("health")}>
            Health notes
          </button>
        ) : null}
      </div>

      {action === "sell" ? (
        <form className="form" onSubmit={(e) => submit(sellMembershipAction, e)}>
          <input type="hidden" name="memberId" value={memberId} />
          <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
          <div className="grid-2">
            <div className="field">
              <label htmlFor="sellPlan">Plan</label>
              <select
                id="sellPlan"
                name="planId"
                value={sellPlanId}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  setSellPlanId(id);
                  const plan = sellablePlans.find((p) => p.id === id);
                  if (plan) setSellPrice(String(minorToMajor(plan.priceMinor, minorUnits)));
                }}
              >
                {sellablePlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {money(p.priceMinor)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="sellStart">Start date (blank = today)</label>
              <input id="sellStart" type="date" name="startOn" defaultValue="" />
            </div>
            <div className="field">
              <label htmlFor="sellPrice">Price ({currencyCode})</label>
              <input
                id="sellPrice"
                name="price"
                inputMode="decimal"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="sellJoining">Joining fee</label>
              <input
                id="sellJoining"
                name="joiningFee"
                inputMode="decimal"
                defaultValue={sellPlan ? String(minorToMajor(sellPlan.joiningFeeMinor, minorUnits)) : "0"}
              />
            </div>
            <div className="field">
              <label htmlFor="sellDiscount">Discount</label>
              <input id="sellDiscount" name="discount" inputMode="decimal" defaultValue="0" />
            </div>
            <div className="field">
              <label htmlFor="sellDiscountReason">Discount reason</label>
              <input id="sellDiscountReason" name="discountReason" />
            </div>
            <div className="field span-2">
              <label htmlFor="sellNotes">Notes</label>
              <input id="sellNotes" name="notes" />
            </div>
          </div>
          <div className="row-actions">
            <button type="submit" disabled={isPending || !sellPlanId}>
              {isPending ? "Saving…" : "Sell membership"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setAction(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {action === "renew" && current ? (
        <form className="form" onSubmit={(e) => submit(renewMembershipAction, e)}>
          <input type="hidden" name="membershipId" value={current.id} />
          <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
          <div className="grid-2">
            <div className="field">
              <label htmlFor="renewPlan">Plan</label>
              <select
                id="renewPlan"
                name="planId"
                value={renewPlanId}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  setRenewPlanId(id);
                  const plan = activePlans.find((p) => p.id === id);
                  if (plan) setRenewPrice(String(minorToMajor(plan.priceMinor, minorUnits)));
                }}
              >
                {activePlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {money(p.priceMinor)}
                  </option>
                ))}
              </select>
            </div>
            {canExtend ? (
              <div className="field">
                <label htmlFor="renewStart">Start date (blank = after current end)</label>
                <input id="renewStart" type="date" name="startOn" defaultValue="" />
              </div>
            ) : null}
            <div className="field">
              <label htmlFor="renewPrice">Price ({currencyCode})</label>
              <input
                id="renewPrice"
                name="price"
                inputMode="decimal"
                value={renewPrice}
                onChange={(e) => setRenewPrice(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="renewDiscount">Discount</label>
              <input id="renewDiscount" name="discount" inputMode="decimal" defaultValue="0" />
            </div>
            <div className="field span-2">
              <label htmlFor="renewNotes">Notes</label>
              <input id="renewNotes" name="notes" />
            </div>
          </div>
          <div className="row-actions">
            <button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Renew membership"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setAction(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {action === "freeze" && current ? (
        <form className="form" onSubmit={(e) => submit(freezeMembershipAction, e)}>
          <input type="hidden" name="membershipId" value={current.id} />
          <div className="grid-2">
            <div className="field">
              <label htmlFor="freezeFrom">From</label>
              <input id="freezeFrom" type="date" name="fromOn" defaultValue={today} required />
            </div>
            <div className="field">
              <label htmlFor="freezeTo">To</label>
              <input id="freezeTo" type="date" name="toOn" defaultValue={today} required />
            </div>
            <div className="field span-2">
              <label htmlFor="freezeReason">Reason</label>
              <input id="freezeReason" name="reason" required />
            </div>
          </div>
          <p className="muted">
            Frozen days are added to the end date
            {current.maxFreezeDays !== null
              ? ` (plan allows up to ${current.maxFreezeDays} in total)`
              : ""}
            .
          </p>
          <div className="row-actions">
            <button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Freeze membership"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setAction(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {action === "unfreeze" && current ? (
        <form className="form" onSubmit={(e) => submit(unfreezeMembershipAction, e)}>
          <input type="hidden" name="membershipId" value={current.id} />
          <div className="field span-2">
            <label htmlFor="unfreezeReason">Reason for ending the freeze</label>
            <input id="unfreezeReason" name="reason" required />
          </div>
          <div className="row-actions">
            <button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "End freeze"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setAction(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {action === "extend" && current ? (
        <form className="form" onSubmit={(e) => submit(extendMembershipAction, e)}>
          <input type="hidden" name="membershipId" value={current.id} />
          <div className="grid-2">
            <div className="field">
              <label htmlFor="extendDays">Extend by days</label>
              <input id="extendDays" name="days" inputMode="numeric" />
            </div>
            <div className="field">
              <label htmlFor="extendMonths">…or by months</label>
              <input id="extendMonths" name="months" inputMode="numeric" />
            </div>
            <div className="field span-2">
              <label htmlFor="extendReason">Reason (required)</label>
              <input id="extendReason" name="reason" required />
            </div>
          </div>
          <div className="row-actions">
            <button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Extend"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setAction(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {action === "suspend" && current ? (
        <form className="form" onSubmit={(e) => submit(suspendMembershipAction, e)}>
          <input type="hidden" name="membershipId" value={current.id} />
          <div className="field span-2">
            <label htmlFor="suspendReason">Reason (required)</label>
            <input id="suspendReason" name="reason" required />
          </div>
          <div className="row-actions">
            <button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Suspend"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setAction(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {action === "cancel" && current ? (
        <form className="form" onSubmit={(e) => submit(cancelMembershipAction, e)}>
          <input type="hidden" name="membershipId" value={current.id} />
          <div className="field span-2">
            <label htmlFor="cancelReason">Reason (required)</label>
            <input id="cancelReason" name="reason" required />
          </div>
          <p className="muted">
            Cancelling stops the membership. Any refund or balance adjustment is handled with
            the payment tools in a later phase.
          </p>
          <div className="row-actions">
            <button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Cancel membership"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setAction(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {action === "status" ? (
        <form className="form" onSubmit={(e) => submit(setMemberStatusAction, e)}>
          <input type="hidden" name="id" value={memberId} />
          <div className="grid-2">
            <div className="field">
              <label htmlFor="memberStatus">Member status</label>
              <select id="memberStatus" name="status" defaultValue={memberStatus}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="statusReason">Reason</label>
              <input id="statusReason" name="reason" />
            </div>
          </div>
          <div className="row-actions">
            <button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save status"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setAction(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {action === "archive" ? (
        <form className="form" onSubmit={(e) => submit(archiveMemberAction, e)}>
          <input type="hidden" name="id" value={memberId} />
          <div className="field span-2">
            <label htmlFor="archiveReason">Reason</label>
            <input id="archiveReason" name="reason" />
          </div>
          <p className="muted">
            Archived clients are kept with their membership and audit history; nothing is
            deleted.
          </p>
          <div className="row-actions">
            <button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Archive client"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setAction(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {action === "health" ? (
        <form className="form" onSubmit={(e) => submit(setMemberHealthAction, e)}>
          <input type="hidden" name="id" value={memberId} />
          <div className="field span-2">
            <label htmlFor="healthNotes">Injury/health notes (restricted)</label>
            <textarea
              id="healthNotes"
              name="notes"
              rows={4}
              defaultValue={healthNotes ?? ""}
              placeholder="Only staff with members.view_health can read this."
            />
          </div>
          <div className="field span-2" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input
              id="healthConsent"
              type="checkbox"
              name="consent"
              defaultChecked={healthConsent}
            />
            <label htmlFor="healthConsent">
              I have consent to record and store these health notes
            </label>
          </div>
          <p className="muted">
            Health notes are only visible to users with the <strong>members.view_health</strong>{" "}
            permission. They are never included in member lists or exports.
          </p>
          <div className="row-actions">
            <button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save health notes"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setAction(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
