import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanupTestDbs, makeTestDb } from "./helpers/db";
import { completeSetup } from "@/server/setup";
import type { AuthzUser } from "@/server/policies/authorize";
import type { Db } from "@/server/db";
import { addDays } from "@/lib/dates";
import { createPlan } from "@/server/members/plans";
import { createMember } from "@/server/members/service";
import { gymToday } from "@/server/members/context";
import { sellMembership } from "@/server/members/memberships";
import {
  listExpiringMemberships,
  listMemberReminders,
  recordReminder,
} from "@/server/members/reminders";
import {
  buildReminderMessage,
  normalizeWhatsAppNumber,
  smsHref,
  whatsappHref,
} from "@/lib/reminders";
import { devToolsEnabled } from "@/server/dev/guard";

afterEach(cleanupTestDbs);

async function setup(): Promise<{ db: Db; actor: AuthzUser }> {
  const { db } = await makeTestDb();
  const id = await completeSetup(db, {
    gymName: "Empire Fitness",
    address: null,
    phone: null,
    currencyCode: "PKR",
    timezone: "UTC",
    receiptHeader: null,
    receiptFooter: null,
    ownerFullName: "Boss",
    ownerUsername: "boss",
    ownerEmail: null,
    ownerPassword: "boss password 1",
  });
  const actor: AuthzUser = {
    id,
    username: "boss",
    fullName: "Boss",
    isActive: true,
    roles: ["owner"],
    permissions: new Set(),
  };
  return { db, actor };
}

function plan(db: Db, actor: AuthzUser, name = "30 Day") {
  return createPlan(db, actor, {
    name,
    description: null,
    durationValue: 30,
    durationUnit: "days",
    priceMinor: 500000,
    joiningFeeMinor: 0,
    graceDays: 0,
    freezeAllowed: false,
    maxFreezeDays: null,
    visitLimit: null,
    sellableToNewMembers: true,
  });
}

function member(db: Db, actor: AuthzUser, fullName: string, phone: string | null) {
  return createMember(db, actor, {
    fullName,
    phone,
    email: null,
    gender: null,
    dateOfBirth: null,
    address: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    notes: null,
    referralSource: null,
    fitnessGoals: null,
    marketingConsent: false,
  });
}

describe("reminder messages", () => {
  it("words the message for upcoming, last-day, and expired memberships", () => {
    const base = {
      gymName: "Empire Fitness",
      memberName: "Ali Khan",
      planName: "Monthly",
      endOn: "2026-11-01",
    };
    expect(buildReminderMessage({ ...base, daysLeft: 5 })).toContain(
      "ends on 2026-11-01 (5 days from now)",
    );
    expect(buildReminderMessage({ ...base, daysLeft: 1 })).toContain("ends tomorrow");
    expect(buildReminderMessage({ ...base, daysLeft: 0 })).toContain("ends today");
    const expired = buildReminderMessage({ ...base, daysLeft: -3 });
    expect(expired).toContain("ended on 2026-11-01");
    expect(expired).toContain("3 days ago");
    // Greets by first name only, and keeps the gym name in the body.
    expect(expired.startsWith("Hi Ali,")).toBe(true);
    expect(expired).toContain("Empire Fitness");
  });

  it("normalises local phone numbers for WhatsApp and encodes links", () => {
    expect(normalizeWhatsAppNumber("0300-1111111")).toBe("923001111111");
    expect(normalizeWhatsAppNumber("+92 300 1111111")).toBe("923001111111");
    expect(normalizeWhatsAppNumber(null)).toBeNull();

    const wa = whatsappHref("0300-1111111", "Hi Ali & family");
    expect(wa).toBe(
      "https://wa.me/923001111111?text=Hi%20Ali%20%26%20family",
    );
    const sms = smsHref("0300-1111111", "Hi Ali & family");
    expect(sms).toBe("sms:0300-1111111?body=Hi%20Ali%20%26%20family");
    expect(whatsappHref(null, "x")).toBeNull();
    expect(smsHref("  ", "x")).toBeNull();
  });
});

describe("expiry reminders", () => {
  it("lists only the current membership inside the reminder window", async () => {
    const { db, actor } = await setup();
    const p = plan(db, actor);
    const today = gymToday(db);

    const due = member(db, actor, "Ali Khan", "0300-1111111");
    sellMembership(db, actor, {
      memberId: due.id,
      planId: p.id,
      startOn: addDays(today, -25),
    });

    const expired = member(db, actor, "Sara Ahmed", "0300-2222222");
    sellMembership(db, actor, {
      memberId: expired.id,
      planId: p.id,
      startOn: addDays(today, -34),
    });

    const farAway = member(db, actor, "Bilal Hussain", "0300-3333333");
    sellMembership(db, actor, {
      memberId: farAway.id,
      planId: p.id,
      startOn: addDays(today, -10),
    });

    const renewed = member(db, actor, "Hina Malik", "0300-4444444");
    sellMembership(db, actor, {
      memberId: renewed.id,
      planId: p.id,
      startOn: addDays(today, -90),
    });
    sellMembership(db, actor, {
      memberId: renewed.id,
      planId: p.id,
      startOn: addDays(today, -28),
    });

    const list = listExpiringMemberships(db, 7);
    const names = list.map((c) => c.memberName);
    expect(names).toContain("Ali Khan");
    expect(names).toContain("Sara Ahmed");
    expect(names).not.toContain("Bilal Hussain");
    // A renewal must not create a second, stale reminder for the same member.
    expect(names.filter((n) => n === "Hina Malik")).toHaveLength(1);

    const ali = list.find((c) => c.memberName === "Ali Khan");
    expect(ali?.daysLeft).toBe(4);
    expect(ali?.phone).toBe("0300-1111111");
    expect(ali?.lastRemindedAt).toBeNull();

    const sara = list.find((c) => c.memberName === "Sara Ahmed");
    expect(sara?.daysLeft).toBe(-5);

    // Sorted by urgency: expired first, then fewest days left.
    expect(list[0]?.memberName).toBe("Sara Ahmed");
  });

  it("records a reminder, audits it, and exposes the last contact", async () => {
    const { db, actor } = await setup();
    const p = plan(db, actor);
    const today = gymToday(db);
    const m = member(db, actor, "Ali Khan", "0300-1111111");
    const sold = sellMembership(db, actor, {
      memberId: m.id,
      planId: p.id,
      startOn: addDays(today, -27),
    });

    recordReminder(db, actor, {
      membershipId: sold.id,
      channel: "whatsapp",
      message: "Hi Ali, your membership ends soon.",
      notes: "Called at reception",
    });

    const history = listMemberReminders(db, m.id);
    expect(history).toHaveLength(1);
    expect(history[0]?.channel).toBe("whatsapp");
    expect(history[0]?.sent_by).toBe(actor.id);

    const candidate = listExpiringMemberships(db, 7).find((c) => c.memberId === m.id);
    expect(candidate?.lastRemindedAt).not.toBeNull();
    expect(candidate?.lastChannel).toBe("whatsapp");

    const audit = db
      .prepare("SELECT action_key, entity_type, entity_id FROM audit_logs WHERE action_key = ?")
      .all("membership.reminder") as {
      action_key: string;
      entity_type: string;
      entity_id: string;
    }[];
    expect(audit).toHaveLength(1);
    expect(audit[0]?.entity_type).toBe("membership");
    expect(audit[0]?.entity_id).toBe(String(sold.id));
  });

  it("refuses to log a reminder for a membership that does not exist", async () => {
    const { db, actor } = await setup();
    expect(() =>
      recordReminder(db, actor, {
        membershipId: 9999,
        channel: "sms",
        message: "Hello",
      }),
    ).toThrow(/Membership not found/);
  });
});

describe("dev tools guard", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is off in production unless explicitly enabled", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GMS_ENABLE_DEV_MENU", "");
    expect(devToolsEnabled()).toBe(false);

    vi.stubEnv("GMS_ENABLE_DEV_MENU", "1");
    expect(devToolsEnabled()).toBe(true);
  });
});
