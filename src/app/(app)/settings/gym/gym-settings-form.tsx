"use client";

import { useActionState, useEffect, useRef } from "react";
import { saveGymSettingsAction, type GymFormState } from "./actions";

const initial: GymFormState = { error: null, saved: false };

export function GymSettingsForm({
  defaults,
}: {
  defaults: {
    gymName: string;
    address: string;
    phone: string;
    currencyCode: string;
    timezone: string;
    receiptHeader: string;
    receiptFooter: string;
  };
}) {
  const [state, formAction, pending] = useActionState(saveGymSettingsAction, initial);
  const savedRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.saved && savedRef.current) savedRef.current.focus();
  }, [state.saved]);

  return (
    <form action={formAction} className="form" noValidate>
      {state.error ? (
        <p className="error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.saved ? (
        <p className="success" role="status" tabIndex={-1} ref={savedRef}>
          Settings saved.
        </p>
      ) : null}
      <div className="field">
        <label htmlFor="gymName">Gym name</label>
        <input id="gymName" name="gymName" defaultValue={defaults.gymName} required />
      </div>
      <div className="field">
        <label htmlFor="address">Address</label>
        <input id="address" name="address" defaultValue={defaults.address} />
      </div>
      <div className="field">
        <label htmlFor="phone">Phone</label>
        <input id="phone" name="phone" defaultValue={defaults.phone} />
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="currencyCode">Currency</label>
          <input
            id="currencyCode"
            name="currencyCode"
            defaultValue={defaults.currencyCode}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="timezone">Timezone</label>
          <input id="timezone" name="timezone" defaultValue={defaults.timezone} required />
        </div>
      </div>
      <div className="field">
        <label htmlFor="receiptHeader">Receipt header</label>
        <input id="receiptHeader" name="receiptHeader" defaultValue={defaults.receiptHeader} />
      </div>
      <div className="field">
        <label htmlFor="receiptFooter">Receipt footer</label>
        <input id="receiptFooter" name="receiptFooter" defaultValue={defaults.receiptFooter} />
      </div>
      <button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
