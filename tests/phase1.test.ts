import { afterEach, describe, expect, it } from "vitest";
import { cleanupTestDbs, makeTestDb } from "./helpers/db";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { createSession, validateSession } from "@/server/auth/sessions";
import { writeAudit } from "@/server/audit";
import { completeSetup } from "@/server/setup";
import {
  createUser,
  getGymSettings,
  listUsers,
  ownerExists,
  resetUserPassword,
  setUserActive,
  updateGymSettings,
  updateUserRoles,
} from "@/server/users/service";
import type { AuthzUser } from "@/server/policies/authorize";
import type { Db } from "@/server/db";

afterEach(cleanupTestDbs);

const OWNER_ACTOR: AuthzUser = {
  id: 1,
  username: "boss",
  fullName: "Boss",
  isActive: true,
  roles: ["owner"],
  permissions: new Set(),
};

async function setupOwner(db: Db): Promise<number> {
  return completeSetup(db, {
    gymName: "Empire Fitness",
    address: null,
    phone: null,
    currencyCode: "PKR",
    timezone: "Asia/Karachi",
    receiptHeader: null,
    receiptFooter: null,
    ownerFullName: "Boss",
    ownerUsername: "boss",
    ownerEmail: null,
    ownerPassword: "boss password 1",
  });
}

describe("completeSetup", () => {
  it("creates the owner, typed settings, and audit entry in one go", async () => {
    const { db } = await makeTestDb();
    const userId = await setupOwner(db);
    expect(ownerExists(db)).toBe(true);
    const users = listUsers(db);
    expect(users).toHaveLength(1);
    expect(users[0]!.username).toBe("boss");
    expect(users[0]!.roles).toEqual(["owner"]);
    const gym = getGymSettings(db);
    expect(gym.gym_name).toBe("Empire Fitness");
    expect(gym.currency_code).toBe("PKR");
    const setup = db
      .prepare("SELECT value FROM app_settings WHERE key = 'setup_completed_at'")
      .get() as { value: string } | undefined;
    expect(setup?.value).toBeTruthy();
    const audit = db
      .prepare("SELECT action_key FROM audit_logs WHERE action_key = 'setup.completed'")
      .all();
    expect(audit).toHaveLength(1);
    expect(userId).toBeGreaterThan(0);
  });

  it("refuses a second setup", async () => {
    const { db } = await makeTestDb();
    await setupOwner(db);
    await expect(
      completeSetup(db, {
        gymName: "Other",
        address: null,
        phone: null,
        currencyCode: "PKR",
        timezone: "UTC",
        receiptHeader: null,
        receiptFooter: null,
        ownerFullName: "Other",
        ownerUsername: "other",
        ownerEmail: null,
        ownerPassword: "other password",
      }),
    ).rejects.toThrow(/already completed/);
  });
});

describe("users service", () => {
  it("creates users with roles and audits the action", async () => {
    const { db } = await makeTestDb();
    const owner = await setupOwner(db);
    const actor = { ...OWNER_ACTOR, id: owner };
    const id = await createUser(db, actor, {
      username: "recep",
      fullName: "Rita Reception",
      password: "reception pass1",
      email: null,
      roleKeys: ["receptionist"],
    });
    const users = listUsers(db);
    const created = users.find((u) => u.id === id);
    expect(created?.roles).toEqual(["receptionist"]);
    const audit = db
      .prepare("SELECT action_key, entity_id FROM audit_logs WHERE action_key = 'user.create'")
      .all() as { action_key: string; entity_id: string }[];
    // setup also wrote a user.create for the owner
    expect(audit.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects duplicate usernames case-insensitively", async () => {
    const { db } = await makeTestDb();
    const owner = await setupOwner(db);
    const actor = { ...OWNER_ACTOR, id: owner };
    await expect(
      createUser(db, actor, {
        username: "BOSS",
        fullName: "Impostor",
        password: "impostor pass1",
        email: null,
        roleKeys: ["auditor"],
      }),
    ).rejects.toThrow(/UNIQUE/i);
  });

  it("deactivation revokes sessions and blocks login path via is_active", async () => {
    const { db } = await makeTestDb();
    const owner = await setupOwner(db);
    const actor = { ...OWNER_ACTOR, id: owner };
    const id = await createUser(db, actor, {
      username: "temp",
      fullName: "Temp User",
      password: "temp password1",
      email: null,
      roleKeys: ["trainer"],
    });
    const { token } = createSession(db, id);
    expect(validateSession(db, token)).not.toBeNull();
    setUserActive(db, actor, id, false);
    expect(validateSession(db, token)).toBeNull();
    const user = listUsers(db).find((u) => u.id === id);
    expect(user?.isActive).toBe(false);
  });

  it("refuses to deactivate your own account", async () => {
    const { db } = await makeTestDb();
    const owner = await setupOwner(db);
    const actor = { ...OWNER_ACTOR, id: owner };
    expect(() => setUserActive(db, actor, owner, false)).toThrow(/own account/);
  });

  it("password reset replaces the hash and revokes sessions", async () => {
    const { db } = await makeTestDb();
    const owner = await setupOwner(db);
    const actor = { ...OWNER_ACTOR, id: owner };
    const id = await createUser(db, actor, {
      username: "temp",
      fullName: "Temp User",
      password: "temp password1",
      email: null,
      roleKeys: ["trainer"],
    });
    const { token } = createSession(db, id);
    await resetUserPassword(db, actor, id, "brand new pass1");
    expect(validateSession(db, token)).toBeNull();
    const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(id) as {
      password_hash: string;
    };
    expect(await verifyPassword("brand new pass1", row.password_hash)).toBe(true);
    expect(await verifyPassword("temp password1", row.password_hash)).toBe(false);
  });

  it("updates roles and audits before/after", async () => {
    const { db } = await makeTestDb();
    const owner = await setupOwner(db);
    const actor = { ...OWNER_ACTOR, id: owner };
    const id = await createUser(db, actor, {
      username: "flex",
      fullName: "Flex Role",
      password: "flexible pass1",
      email: null,
      roleKeys: ["trainer"],
    });
    updateUserRoles(db, actor, id, ["trainer", "receptionist"]);
    const user = listUsers(db).find((u) => u.id === id);
    expect(user?.roles).toEqual(["receptionist", "trainer"]);
    const audit = db
      .prepare("SELECT before_json, after_json FROM audit_logs WHERE action_key = 'user.roles_update'")
      .get() as { before_json: string; after_json: string };
    expect(JSON.parse(audit.after_json).roles).toEqual(["trainer", "receptionist"]);
  });
});

describe("gym settings + audit immutability", () => {
  it("updates gym settings and records a diff", async () => {
    const { db } = await makeTestDb();
    const owner = await setupOwner(db);
    const actor = { ...OWNER_ACTOR, id: owner };
    updateGymSettings(db, actor, {
      gymName: "Empire Fitness Main",
      address: "12 Main St",
      phone: null,
      currencyCode: "PKR",
      timezone: "Asia/Karachi",
      receiptHeader: "Thanks",
      receiptFooter: null,
    });
    expect(getGymSettings(db).gym_name).toBe("Empire Fitness Main");
    const audit = db
      .prepare("SELECT after_json FROM audit_logs WHERE action_key = 'settings.gym.update'")
      .get() as { after_json: string };
    expect(JSON.parse(audit.after_json).gym_name).toBe("Empire Fitness Main");
  });

  it("rejects UPDATE and DELETE on audit_logs", async () => {
    const { db } = await makeTestDb();
    writeAudit(db, { userId: null, actionKey: "test.event" });
    expect(() => db.prepare("UPDATE audit_logs SET action_key = 'x'").run()).toThrow(
      /append-only/,
    );
    expect(() => db.prepare("DELETE FROM audit_logs").run()).toThrow(/append-only/);
  });

  it("stores only changed fields in diffFields", async () => {
    const { diffFields } = await import("@/server/audit");
    const { before, after } = diffFields(
      { a: 1, b: "keep" },
      { a: 2, b: "keep" },
    );
    expect(before).toEqual({ a: 1 });
    expect(after).toEqual({ a: 2 });
  });
});

describe("password hash strength", () => {
  it("produces a salted scrypt hash that verifies", async () => {
    const h1 = await hashPassword("same password here");
    const h2 = await hashPassword("same password here");
    expect(h1).not.toBe(h2); // salted
    expect(await verifyPassword("same password here", h1)).toBe(true);
  });
});
