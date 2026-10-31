"use client";

import { useActionState, useState } from "react";
import {
  createUserAction,
  resetPasswordAction,
  updateRolesAction,
  type UserFormState,
} from "./actions";
import { ROLE_KEYS } from "@/server/policies/permissions";

const initial: UserFormState = { error: null, ok: false };

export function CreateUserForm() {
  const [state, formAction, pending] = useActionState(createUserAction, initial);
  return (
    <form action={formAction} className="form" noValidate>
      <h2>Create user</h2>
      {state.error ? (
        <p className="error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="success" role="status">
          User created.
        </p>
      ) : null}
      <div className="field-row">
        <div className="field">
          <label htmlFor="c-username">Username</label>
          <input id="c-username" name="username" required />
        </div>
        <div className="field">
          <label htmlFor="c-fullName">Full name</label>
          <input id="c-fullName" name="fullName" required />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="c-email">Email</label>
          <input id="c-email" name="email" type="email" />
        </div>
        <div className="field">
          <label htmlFor="c-password">Password</label>
          <input id="c-password" name="password" type="password" minLength={10} required />
        </div>
      </div>
      <fieldset className="field">
        <legend>Roles</legend>
        <div className="checkbox-row">
          {ROLE_KEYS.map((role) => (
            <label key={role} className="checkbox">
              <input type="checkbox" name="roles" value={role} />
              {role}
            </label>
          ))}
        </div>
      </fieldset>
      <button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create user"}
      </button>
    </form>
  );
}

export function RolesForm({
  userId,
  currentRoles,
}: {
  userId: number;
  currentRoles: string[];
}) {
  const [state, formAction, pending] = useActionState(updateRolesAction, initial);
  return (
    <form action={formAction} className="form form-inline">
      <input type="hidden" name="userId" value={userId} />
      <div className="checkbox-row">
        {ROLE_KEYS.map((role) => (
          <label key={role} className="checkbox">
            <input
              type="checkbox"
              name="roles"
              value={role}
              defaultChecked={currentRoles.includes(role)}
            />
            {role}
          </label>
        ))}
      </div>
      <button type="submit" className="btn-secondary" disabled={pending}>
        {pending ? "Saving…" : "Update roles"}
      </button>
      {state.error ? (
        <p className="error" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

export function ResetPasswordForm({ userId }: { userId: number }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(resetPasswordAction, initial);
  if (!open) {
    return (
      <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
        Reset password
      </button>
    );
  }
  return (
    <form action={formAction} className="form form-inline">
      <input type="hidden" name="userId" value={userId} />
      <label>
        New password{" "}
        <input name="password" type="password" minLength={10} required />
      </label>
      <button type="submit" className="btn-secondary" disabled={pending}>
        {pending ? "Resetting…" : "Set password"}
      </button>
      <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {state.error ? (
        <p className="error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="success" role="status">
          Password reset. Active sessions revoked.
        </p>
      ) : null}
    </form>
  );
}
