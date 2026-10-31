"use client";

import { useActionState } from "react";
import { loginAction, type FormState } from "./actions";

const initial: FormState = { error: null };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initial);
  return (
    <form action={formAction} className="form" noValidate>
      {state.error ? (
        <p className="error" role="alert">
          {state.error}
        </p>
      ) : null}
      <div className="field">
        <label htmlFor="username">Username</label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          placeholder="Enter your username"
          required
          autoFocus
        />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          required
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="btn-primary"
        style={{ width: "100%", padding: "12px", marginTop: "8px", fontSize: "1rem" }}
      >
        {pending ? "Signing in…" : "Sign In to Dashboard"}
      </button>
      <div style={{ marginTop: "1rem", textAlign: "center" }}>
        <a
          href="/setup"
          style={{
            fontSize: "0.85rem",
            color: "var(--brand-muted)",
            textDecoration: "underline",
          }}
        >
          First-time setup wizard
        </a>
      </div>
    </form>
  );
}
