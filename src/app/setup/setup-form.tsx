"use client";

import { useActionState, useState } from "react";
import { setupAction, type FormState } from "./actions";

const initial: FormState = { error: null };
const STEPS = ["Gym details", "Owner account", "Receipt"] as const;

export function SetupForm() {
  const [state, formAction, pending] = useActionState(setupAction, initial);
  const [step, setStep] = useState(0);

  return (
    <form action={formAction} className="form" noValidate>
      <ol className="steps" aria-label="Setup steps">
        {STEPS.map((label, i) => (
          <li key={label} className={i === step ? "step step-current" : "step"}>
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {state.error ? (
        <p className="error" role="alert">
          {state.error}
        </p>
      ) : null}

      {step === 0 ? (
        <section className="wizard-step">
          <div className="field">
            <label htmlFor="gymName">Gym name *</label>
            <input id="gymName" name="gymName" defaultValue="Empire Fitness" required />
          </div>
          <div className="field">
            <label htmlFor="address">Address</label>
            <input id="address" name="address" />
          </div>
          <div className="field">
            <label htmlFor="phone">Phone</label>
            <input id="phone" name="phone" />
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="currencyCode">Currency *</label>
              <input id="currencyCode" name="currencyCode" defaultValue="PKR" required />
            </div>
            <div className="field">
              <label htmlFor="timezone">Timezone *</label>
              <input id="timezone" name="timezone" defaultValue="Asia/Karachi" required />
            </div>
          </div>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="wizard-step">
          <div className="field">
            <label htmlFor="ownerFullName">Full name *</label>
            <input id="ownerFullName" name="ownerFullName" required />
          </div>
          <div className="field">
            <label htmlFor="ownerUsername">Username *</label>
            <input id="ownerUsername" name="ownerUsername" autoComplete="username" required />
          </div>
          <div className="field">
            <label htmlFor="ownerEmail">Email (optional)</label>
            <input id="ownerEmail" name="ownerEmail" type="email" autoComplete="email" />
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="ownerPassword">Password *</label>
              <input
                id="ownerPassword"
                name="ownerPassword"
                type="password"
                autoComplete="new-password"
                minLength={10}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="ownerPasswordConfirm">Confirm password *</label>
              <input
                id="ownerPasswordConfirm"
                name="ownerPasswordConfirm"
                type="password"
                autoComplete="new-password"
                minLength={10}
                required
              />
            </div>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="wizard-step">
          <div className="field">
            <label htmlFor="receiptHeader">Receipt header (optional)</label>
            <input id="receiptHeader" name="receiptHeader" placeholder="Thank you for training with us" />
          </div>
          <div className="field">
            <label htmlFor="receiptFooter">Receipt footer (optional)</label>
            <input id="receiptFooter" name="receiptFooter" placeholder="No refunds after 7 days" />
          </div>
        </section>
      ) : null}

      <div className="wizard-nav">
        {step > 0 ? (
          <button type="button" className="btn-secondary" onClick={() => setStep(step - 1)}>
            Back
          </button>
        ) : null}
        {step < STEPS.length - 1 ? (
          <button type="button" onClick={() => setStep(step + 1)}>
            Next
          </button>
        ) : (
          <button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Complete setup"}
          </button>
        )}
      </div>
    </form>
  );
}
