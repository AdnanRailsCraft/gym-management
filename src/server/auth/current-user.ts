import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Db } from "@/server/db/index";
import { getDb } from "@/server/db/connection";
import { SESSION_COOKIE, validateSession } from "./sessions";
import type { AuthzUser } from "@/server/policies/authorize";

interface JoinedUserRow {
  id: number;
  username: string;
  full_name: string;
  is_active: number;
  roles: string | null;
  permissions: string | null;
}

export function loadAuthUser(db: Db, userId: number): AuthzUser | null {
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.full_name, u.is_active,
              (SELECT group_concat(r.key) FROM user_roles ur
               JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id) AS roles,
              (SELECT group_concat(DISTINCT p.key) FROM user_roles ur
               JOIN role_permissions rp ON rp.role_id = ur.role_id
               JOIN permissions p ON p.id = rp.permission_id
               WHERE ur.user_id = u.id) AS permissions
       FROM users u WHERE u.id = ?`,
    )
    .get(userId) as JoinedUserRow | undefined;
  if (!row || row.is_active !== 1) return null;
  const roles = row.roles ? row.roles.split(",").filter(Boolean) : [];
  const permissions = row.permissions
    ? new Set(row.permissions.split(",").filter(Boolean))
    : new Set<string>();
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    isActive: true,
    roles,
    permissions,
  };
}

export async function getSessionUser(): Promise<AuthzUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value ?? null;
  if (!token) return null;
  const db = getDb();
  const session = validateSession(db, token);
  if (!session) return null;
  return loadAuthUser(db, session.userId);
}

/** Redirect to /login when no valid session. For server components/actions. */
export async function requireUser(): Promise<AuthzUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}
