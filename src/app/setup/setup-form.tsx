"use client";

import { useActionState, useState } from "react";
import { setupAction, type FormState } from "./actions";

const initial: FormState = { error: null };
const STEPS = ["Gym details", "Owner account", "Receipt"] as const;

export function SetupForm() {
  const [state, formAction, pending] = useActionState(setupAction, initial);
  const [step, setStep] = useState(0);
  const [clientError, setClientError] = useState<string | null>(null);

  const validateStep = (currentStep: number): boolean => {
    setClientError(null);
    if (currentStep === 0) {
      const gymName = (document.getElementById("gymName") as HTMLInputElement)?.value?.trim();
      const currencyCode = (document.getElementById("currencyCode") as HTMLInputElement)?.value?.trim();
      const timezone = (document.getElementById("timezone") as HTMLInputElement)?.value?.trim();

      if (!gymName) {
        setClientError("Gym name is required");
        return false;
      }
      if (!currencyCode || !/^[A-Z]{3}$/.test(currencyCode)) {
        setClientError("Currency must be a 3-letter code (e.g. PKR, USD, EUR)");
        return false;
      }
      if (!timezone) {
        setClientError("Timezone is required");
        return false;
      }
    } else if (currentStep === 1) {
      const fullName = (document.getElementById("ownerFullName") as HTMLInputElement)?.value?.trim();
      const username = (document.getElementById("ownerUsername") as HTMLInputElement)?.value?.trim();
      const password = (document.getElementById("ownerPassword") as HTMLInputElement)?.value;
      const confirmPassword = (document.getElementById("ownerPasswordConfirm") as HTMLInputElement)?.value;

      if (!fullName) {
        setClientError("Owner full name is required");
        return false;
      }
      if (!username || username.length < 3) {
        setClientError("Username must be at least 3 characters");
        return false;
      }
      if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
        setClientError("Username can only contain letters, numbers, dot, underscore, and hyphen");
        return false;
      }
      if (!password || password.length < 10) {
        setClientError("Password must be at least 10 characters");
        return false;
      }
      if (password !== confirmPassword) {
        setClientError("Passwords do not match");
        return false;
      }
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep(step)) {
      setStep((prev) => prev + 1);
    }
  };

  const errorMessage = clientError || state.error;

  return (
    <form action={formAction} className="form" noValidate>
      <ol className="steps" aria-label="Setup steps">
        {STEPS.map((label, i) => (
          <li key={label} className={i === step ? "step step-current" : "step"}>
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {errorMessage ? (
        <p className="error" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {/* Step 0: Gym details (kept in DOM so values are included on submit) */}
      <section className="wizard-step" style={{ display: step === 0 ? "block" : "none" }}>
        <div className="field">
          <label htmlFor="gymName">Gym name *</label>
          <input id="gymName" name="gymName" defaultValue="Empire Fitness" required />
        </div>
        <div className="field">
          <label htmlFor="address">Address</label>
          <input id="address" name="address" defaultValue="Hassan Trade Building, Last Floor, Near Kabal Tehsil" />
        </div>
        <div className="field">
          <label htmlFor="phone">Phone</label>
          <input id="phone" name="phone" placeholder="e.g. +92 300 1234567" />
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

      {/* Step 1: Owner account (kept in DOM so values are included on submit) */}
      <section className="wizard-step" style={{ display: step === 1 ? "block" : "none" }}>
        <div className="field">
          <label htmlFor="ownerFullName">Full name *</label>
          <input id="ownerFullName" name="ownerFullName" placeholder="e.g. Administrator" required />
        </div>
        <div className="field">
          <label htmlFor="ownerUsername">Username *</label>
          <input id="ownerUsername" name="ownerUsername" autoComplete="username" placeholder="e.g. admin" required />
        </div>
        <div className="field">
          <label htmlFor="ownerEmail">Email (optional)</label>
          <input id="ownerEmail" name="ownerEmail" type="email" autoComplete="email" placeholder="e.g. admin@example.com" />
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="ownerPassword">Password * (min 10 characters)</label>
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

      {/* Step 2: Receipt (kept in DOM so values are included on submit) */}
      <section className="wizard-step" style={{ display: step === 2 ? "block" : "none" }}>
        <div className="field">
          <label htmlFor="receiptHeader">Receipt header (optional)</label>
          <input id="receiptHeader" name="receiptHeader" placeholder="Thank you for training with us" />
        </div>
        <div className="field">
          <label htmlFor="receiptFooter">Receipt footer (optional)</label>
          <input id="receiptFooter" name="receiptFooter" placeholder="No refunds after 7 days" />
        </div>
      </section>

      <div className="wizard-nav">
        {step > 0 ? (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setClientError(null);
              setStep(step - 1);
            }}
          >
            Back
          </button>
        ) : null}
        {step < STEPS.length - 1 ? (
          <button type="button" onClick={handleNext}>
            Next
          </button>
        ) : (
          <button
            type="submit"
            disabled={pending}
            onClick={(e) => {
              if (!validateStep(0) || !validateStep(1)) {
                e.preventDefault();
              }
            }}
          >
            {pending ? "Creating…" : "Complete setup"}
          </button>
        )}
      </div>
    </form>
  );
}
