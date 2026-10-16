import "server-only";
import type { PermissionKey } from "./permissions";

export interface AuthzUser {
  id: number;
  username: string;
  fullName: string;
  isActive: boolean;
  roles: string[];
  permissions: ReadonlySet<string>;
}

export class PolicyError extends Error {
  readonly status = 403;
  constructor(permission: string) {
    super(`Missing permission: ${permission}`);
    this.name = "PolicyError";
  }
}

/**
 * Server-side authorization. Permissions are the authority (DESIGN B8) —
 * the UI only hides what the user cannot do; every mutation re-checks here.
 */
export function authorize(user: AuthzUser, permission: PermissionKey): void {
  if (!user.isActive || !user.permissions.has(permission)) {
    throw new PolicyError(permission);
  }
}

export function can(user: AuthzUser, permission: PermissionKey): boolean {
  return user.isActive && user.permissions.has(permission);
}
