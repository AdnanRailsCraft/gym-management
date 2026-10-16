import { afterEach, describe, expect, it } from "vitest";
import { cleanupTestDbs, makeTestDb } from "./helpers/db";
import {
  ALL_PERMISSION_KEYS,
  PERMISSIONS,
  ROLE_DEFAULTS,
  ROLE_KEYS,
} from "@/server/policies/permissions";

afterEach(cleanupTestDbs);

describe("permission catalog vs database seeds", () => {
  it("has no duplicate permission keys in code", () => {
    expect(new Set(ALL_PERMISSION_KEYS).size).toBe(ALL_PERMISSION_KEYS.length);
  });

  it("seeds every coded permission key in the permissions table", async () => {
    const { db } = await makeTestDb();
    const rows = db.prepare("SELECT key FROM permissions").all() as { key: string }[];
    const dbKeys = new Set(rows.map((r) => r.key));
    for (const key of ALL_PERMISSION_KEYS) {
      expect(dbKeys.has(key), `missing permission seed: ${key}`).toBe(true);
    }
    expect(rows.length).toBe(ALL_PERMISSION_KEYS.length);
  });

  it("seeds exactly the six system roles", async () => {
    const { db } = await makeTestDb();
    const rows = db.prepare("SELECT key FROM roles ORDER BY key").all() as { key: string }[];
    expect(rows.map((r) => r.key).sort()).toEqual([...ROLE_KEYS].sort());
  });

  it("matches ROLE_DEFAULTS grants to role_permissions rows for every role", async () => {
    const { db } = await makeTestDb();
    for (const roleKey of ROLE_KEYS) {
      const rows = db
        .prepare(
          `SELECT p.key FROM role_permissions rp
           JOIN roles r ON r.id = rp.role_id
           JOIN permissions p ON p.id = rp.permission_id
           WHERE r.key = ? ORDER BY p.key`,
        )
        .all(roleKey) as { key: string }[];
      const fromDb = rows.map((r) => r.key).sort();
      const fromCode = [...ROLE_DEFAULTS[roleKey]].sort();
      expect(fromDb, `role ${roleKey}`).toEqual(fromCode);
    }
  });

  it("owner holds every permission", async () => {
    expect(new Set(ROLE_DEFAULTS.owner)).toEqual(new Set(ALL_PERMISSION_KEYS));
  });
});

describe("authorize", () => {
  it("allows a user with the permission and blocks without it", async () => {
    const { authorize, can, PolicyError } = await import("@/server/policies/authorize");
    const base = {
      id: 1,
      username: "a",
      fullName: "A",
      isActive: true,
      roles: ["owner"],
      permissions: new Set<string>([PERMISSIONS.settingsGymUpdate]),
    };
    expect(() => authorize(base, PERMISSIONS.settingsGymUpdate)).not.toThrow();
    expect(() => authorize(base, PERMISSIONS.backupRestore)).toThrow(PolicyError);
    expect(can(base, PERMISSIONS.settingsGymUpdate)).toBe(true);
    expect(can(base, PERMISSIONS.backupRestore)).toBe(false);
  });

  it("blocks inactive users even with the permission", async () => {
    const { authorize, PolicyError } = await import("@/server/policies/authorize");
    const user = {
      id: 1,
      username: "a",
      fullName: "A",
      isActive: false,
      roles: ["owner"],
      permissions: new Set<string>([PERMISSIONS.settingsGymUpdate]),
    };
    expect(() => authorize(user, PERMISSIONS.settingsGymUpdate)).toThrow(PolicyError);
  });
});
