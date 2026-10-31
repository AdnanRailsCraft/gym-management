"use client";

import { useState, useTransition } from "react";
import { formatMinorUnits, minorToMajor } from "@/lib/money";
import {
  createPlanAction,
  setPlanActiveAction,
  updatePlanAction,
} from "./actions";
import {
  IconPlus,
  IconEdit,
} from "@/components/icons";
import { Modal } from "@/components/modal";

interface PlanView {
  id: number;
  name: string;
  description: string | null;
  durationValue: number;
  durationUnit: "days" | "months";
  priceMinor: number;
  joiningFeeMinor: number;
  graceDays: number;
  freezeAllowed: boolean;
  maxFreezeDays: number | null;
  visitLimit: number | null;
  sellableToNewMembers: boolean;
  isActive: boolean;
}

interface Props {
  plans: PlanView[];
  currencyCode: string;
  minorUnits: number;
  canManage: boolean;
}

export function PlansClient({ plans, currencyCode, minorUnits, canManage }: Props) {
  const [editing, setEditing] = useState<PlanView | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const money = (minor: number) => formatMinorUnits(minor, currencyCode, minorUnits);

  const submit = (
    fn: (formData: FormData) => Promise<{ ok: boolean; error?: string }>,
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await fn(formData);
      if (result.ok) window.location.reload();
      else setError(result.error ?? "The request failed");
    });
  };

  const toggleActive = (plan: PlanView) => {
    const formData = new FormData();
    formData.set("id", String(plan.id));
    formData.set("active", plan.isActive ? "0" : "1");
    setError(null);
    startTransition(async () => {
      const result = await setPlanActiveAction(formData);
      if (result.ok) window.location.reload();
      else setError(result.error ?? "The request failed");
    });
  };

  const openCreate = () => {
    setError(null);
    setEditing(null);
    setCreating(true);
  };

  const openEdit = (plan: PlanView) => {
    setError(null);
    setCreating(false);
    setEditing(plan);
  };

  const closeForm = () => {
    setEditing(null);
    setCreating(false);
  };

  const showForm = creating || editing !== null;
  const plan = editing;

  return (
    <div>
      {error ? <p className="error">{error}</p> : null}

      {canManage ? (
        <div className="toolbar" style={{ justifyContent: "flex-end", marginBottom: "16px" }}>
          <button type="button" onClick={openCreate} className="btn-primary">
            <IconPlus size={16} />
            <span>Create New Plan</span>
          </button>
        </div>
      ) : null}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Plan Name</th>
              <th>Duration</th>
              <th>Subscription Price</th>
              <th>Joining Fee</th>
              <th>Grace Period</th>
              <th>Freeze Allowance</th>
              <th>Visits</th>
              <th>Status</th>
              {canManage ? <th style={{ textAlign: "right" }}>Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.name}</strong>
                  {p.description ? <div className="muted small">{p.description}</div> : null}
                </td>
                <td>
                  <span className="chip" style={{ fontWeight: 600 }}>
                    {p.durationValue} {p.durationUnit}
                  </span>
                </td>
                <td>
                  <strong style={{ fontSize: "1.02rem" }}>{money(p.priceMinor)}</strong>
                </td>
                <td>
                  {p.joiningFeeMinor > 0 ? (
                    <span>{money(p.joiningFeeMinor)}</span>
                  ) : (
                    <span className="muted">None (0)</span>
                  )}
                </td>
                <td>
                  {p.graceDays > 0 ? (
                    <span className="chip chip-warn">{p.graceDays} days</span>
                  ) : (
                    <span className="muted">0 days</span>
                  )}
                </td>
                <td>
                  {p.freezeAllowed ? (
                    <span className="chip chip-ok">
                      {p.maxFreezeDays !== null ? `Up to ${p.maxFreezeDays} days` : "Allowed"}
                    </span>
                  ) : (
                    <span className="chip">Disabled</span>
                  )}
                </td>
                <td>{p.visitLimit ? `${p.visitLimit} visits` : <span className="muted">Unlimited</span>}</td>
                <td>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <span className={p.isActive ? "chip chip-ok" : "chip"}>
                      {p.isActive ? "Active" : "Inactive"}
                    </span>
                    {!p.sellableToNewMembers ? (
                      <span className="chip chip-warn" style={{ fontSize: "0.72rem" }}>
                        Renewals only
                      </span>
                    ) : null}
                  </div>
                </td>
                {canManage ? (
                  <td>
                    <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => openEdit(p)}
                        style={{ padding: "5px 10px", fontSize: "0.84rem" }}
                      >
                        <IconEdit size={13} />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={isPending}
                        onClick={() => toggleActive(p)}
                        style={{ padding: "5px 10px", fontSize: "0.84rem" }}
                      >
                        {p.isActive ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={showForm}
        onClose={closeForm}
        title={plan ? `Edit Plan: ${plan.name}` : "Create New Membership Plan"}
      >
        {error ? <p className="error">{error}</p> : null}
            <form
              className="form"
              onSubmit={(e) => submit(plan ? updatePlanAction : createPlanAction, e)}
            >
              {plan ? <input type="hidden" name="id" value={plan.id} /> : null}
              <div className="grid-2">
                <div className="field span-2">
                  <label htmlFor="name">Plan Name *</label>
                  <input
                    id="name"
                    name="name"
                    defaultValue={plan?.name ?? ""}
                    placeholder="e.g. Monthly Standard, Annual VIP"
                    required
                    autoFocus
                  />
                </div>
                <div className="field span-2">
                  <label htmlFor="description">Description (Optional)</label>
                  <input
                    id="description"
                    name="description"
                    defaultValue={plan?.description ?? ""}
                    placeholder="e.g. Includes full gym floor and locker access"
                  />
                </div>
                <div className="field">
                  <label htmlFor="durationValue">Duration Number *</label>
                  <input
                    id="durationValue"
                    name="durationValue"
                    inputMode="numeric"
                    defaultValue={plan?.durationValue ?? 1}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="durationUnit">Duration Unit *</label>
                  <select
                    id="durationUnit"
                    name="durationUnit"
                    defaultValue={plan?.durationUnit ?? "months"}
                  >
                    <option value="days">Days</option>
                    <option value="months">Months</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="price">Membership Price ({currencyCode}) *</label>
                  <input
                    id="price"
                    name="price"
                    inputMode="decimal"
                    defaultValue={plan ? String(minorToMajor(plan.priceMinor, minorUnits)) : "0"}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="joiningFee">One-time Joining Fee ({currencyCode})</label>
                  <input
                    id="joiningFee"
                    name="joiningFee"
                    inputMode="decimal"
                    defaultValue={
                      plan ? String(minorToMajor(plan.joiningFeeMinor, minorUnits)) : "0"
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="graceDays">Grace Period (Days)</label>
                  <input
                    id="graceDays"
                    name="graceDays"
                    inputMode="numeric"
                    defaultValue={plan?.graceDays ?? 0}
                    placeholder="Days allowed after expiry before denial"
                  />
                </div>
                <div className="field">
                  <label htmlFor="visitLimit">Visit Limit (Blank = Unlimited)</label>
                  <input
                    id="visitLimit"
                    name="visitLimit"
                    inputMode="numeric"
                    defaultValue={plan?.visitLimit ?? ""}
                    placeholder="e.g. 12 for 12 sessions"
                  />
                </div>
                <div
                  className="field span-2"
                  style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: "6px" }}
                >
                  <input
                    id="freezeAllowed"
                    type="checkbox"
                    name="freezeAllowed"
                    defaultChecked={plan ? plan.freezeAllowed : true}
                    style={{ width: "18px", height: "18px" }}
                  />
                  <label htmlFor="freezeAllowed" style={{ cursor: "pointer", fontWeight: 500 }}>
                    Allow members on this plan to temporarily freeze / pause their membership
                  </label>
                </div>
                <div className="field">
                  <label htmlFor="maxFreezeDays">Maximum Freeze Days (Blank = Unlimited)</label>
                  <input
                    id="maxFreezeDays"
                    name="maxFreezeDays"
                    inputMode="numeric"
                    defaultValue={plan?.maxFreezeDays ?? ""}
                    placeholder="e.g. 30"
                  />
                </div>
                <div
                  className="field span-2"
                  style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
                >
                  <input
                    id="sellableToNewMembers"
                    type="checkbox"
                    name="sellableToNewMembers"
                    defaultChecked={plan ? plan.sellableToNewMembers : true}
                    style={{ width: "18px", height: "18px" }}
                  />
                  <label htmlFor="sellableToNewMembers" style={{ cursor: "pointer", fontWeight: 500 }}>
                    Available for new registrations (uncheck to restrict to renewals only)
                  </label>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={closeForm}>
                  Cancel
                </button>
                <button type="submit" disabled={isPending}>
                  {isPending ? "Saving…" : plan ? "Save Changes" : "Create Plan"}
                </button>
              </div>
            </form>
      </Modal>
    </div>
  );
}
