import { afterEach, describe, expect, it } from "vitest";
import { cleanupTestDbs, makeTestDb } from "./helpers/db";
import { completeSetup } from "@/server/setup";
import type { AuthzUser } from "@/server/policies/authorize";
import type { Db } from "@/server/db";
import { addDays, addMonthsClamped, computeEndOn } from "@/lib/dates";
import { createPlan, listPlans } from "@/server/members/plans";
import { gymToday } from "@/server/members/context";
import {
  archiveMember,
  createMember,
  findDuplicateMembers,
  getMember,
  getMemberStats,
  listMembers,
  nextMemberNumber,
  setMemberHealth,
  setMemberStatus,
} from "@/server/members/service";
import {
  cancelMembership,
  extendMembership,
  freezeMembership,
  getCurrentMembership,
  getMembership,
  listFreezes,
  listMemberships,
  reactivateMembership,
  renewMembership,
  sellMembership,
  suspendMembership,
  unfreezeMembership,
} from "@/server/members/memberships";

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

function monthlyPlan(
  db: Db,
  actor: AuthzUser,
  overrides: Partial<Parameters<typeof createPlan>[2]> = {},
) {
  return createPlan(db, actor, {
    name: "Test Monthly",
    description: null,
    durationValue: 1,
    durationUnit: "months",
    priceMinor: 300000,
    joiningFeeMinor: 10000,
    graceDays: 3,
    freezeAllowed: true,
    maxFreezeDays: 30,
    visitLimit: null,
    sellableToNewMembers: true,
    ...overrides,
  });
}

function newMember(
  db: Db,
  actor: AuthzUser,
  overrides: Partial<Parameters<typeof createMember>[2]> = {},
) {
  return createMember(db, actor, {
    fullName: "Ali Khan",
    phone: "0300-1111111",
    email: "ali@example.com",
    gender: "Male",
    dateOfBirth: null,
    address: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    notes: null,
    referralSource: null,
    fitnessGoals: null,
    marketingConsent: false,
    ...overrides,
  });
}

describe("members", () => {
  it("seeds the starter plan templates", async () => {
    const { db } = await setup();
    const names = listPlans(db).map((p) => p.name);
    expect(names).toContain("Daily");
    expect(names).toContain("Monthly");
    expect(names).toContain("Annual");
  });

  it("registers members with sequential numbers and flags duplicates", async () => {
    const { db, actor } = await setup();
    const first = newMember(db, actor);
    expect(first.member_number).toBe("EF-0001");
    const second = newMember(db, actor, {
      fullName: "Sara Ahmed",
      phone: "0300-2222222",
      email: "sara@example.com",
    });
    expect(second.member_number).toBe("EF-0002");
    expect(nextMemberNumber(db)).toBe("EF-0003");

    const duplicates = findDuplicateMembers(db, { phone: "0300-1111111" });
    expect(duplicates.map((d) => d.id)).toEqual([first.id]);
    expect(findDuplicateMembers(db, { email: "SARA@example.com" })).toHaveLength(1);
  });

  it("archives members without deleting them or their history", async () => {
    const { db, actor } = await setup();
    const member = newMember(db, actor);
    const plan = monthlyPlan(db, actor, { name: "Monthly Archive" });
    sellMembership(db, actor, { memberId: member.id, planId: plan.id });

    archiveMember(db, actor, member.id, "moved away");
    expect(getMember(db, member.id)?.status).toBe("archived");
    expect(getMember(db, member.id)?.archived_at).toBeTruthy();
    expect(listMemberships(db, member.id)).toHaveLength(1);

    const audit = db
      .prepare("SELECT action_key FROM audit_logs WHERE action_key = 'member.archive'")
      .all();
    expect(audit).toHaveLength(1);
  });

  it("changes member status with an audit entry", async () => {
    const { db, actor } = await setup();
    const member = newMember(db, actor);
    setMemberStatus(db, actor, member.id, "suspended", "unpaid");
    expect(getMember(db, member.id)?.status).toBe("suspended");
    const audit = db
      .prepare("SELECT reason FROM audit_logs WHERE action_key = 'member.status'")
      .get() as { reason: string } | undefined;
    expect(audit?.reason).toBe("unpaid");
  });

  it("stores optional profile fields and marketing consent", async () => {
    const { db, actor } = await setup();
    const member = newMember(db, actor, {
      referralSource: "Instagram",
      fitnessGoals: "Lose 5 kg",
      marketingConsent: true,
    });
    expect(member.referral_source).toBe("Instagram");
    expect(member.fitness_goals).toBe("Lose 5 kg");
    expect(member.marketing_consent).toBe(1);
  });
});

describe("memberships", () => {
  it("sells a membership, computes the end date, and audits it", async () => {
    const { db, actor } = await setup();
    const member = newMember(db, actor);
    const plan = monthlyPlan(db, actor, { name: "Monthly Sell" });

    const membership = sellMembership(db, actor, {
      memberId: member.id,
      planId: plan.id,
    });
    const today = gymToday(db);
    expect(membership.start_on).toBe(today);
    expect(membership.end_on).toBe(computeEndOn(today, 1, "months"));
    expect(membership.lifecycle_status).toBe("active");

    const view = getMembership(db, membership.id)!;
    expect(view.state).toBe("active");
    expect(view.totalChargeMinor).toBe(310000);
    expect(getCurrentMembership(db, member.id)?.id).toBe(membership.id);

    const audit = db
      .prepare("SELECT action_key FROM audit_logs WHERE action_key = 'membership.sell'")
      .all();
    expect(audit).toHaveLength(1);
  });

  it("applies a discount to the total charge", async () => {
    const { db, actor } = await setup();
    const member = newMember(db, actor);
    const plan = monthlyPlan(db, actor, { name: "Monthly Discount" });
    const membership = sellMembership(db, actor, {
      memberId: member.id,
      planId: plan.id,
      discountMinor: 50000,
      discountReason: "student",
    });
    expect(getMembership(db, membership.id)!.totalChargeMinor).toBe(260000);
  });

  it("is idempotent for the same idempotency key", async () => {
    const { db, actor } = await setup();
    const member = newMember(db, actor);
    const plan = monthlyPlan(db, actor, { name: "Monthly Idem" });
    const first = sellMembership(db, actor, {
      memberId: member.id,
      planId: plan.id,
      idempotencyKey: "abc-123",
    });
    const second = sellMembership(db, actor, {
      memberId: member.id,
      planId: plan.id,
      idempotencyKey: "abc-123",
    });
    expect(second.id).toBe(first.id);
    expect(listMemberships(db, member.id)).toHaveLength(1);
  });

  it("rejects a membership that overlaps an existing one", async () => {
    const { db, actor } = await setup();
    const member = newMember(db, actor);
    const plan = monthlyPlan(db, actor, { name: "Monthly Overlap" });
    sellMembership(db, actor, { memberId: member.id, planId: plan.id });
    expect(() =>
      sellMembership(db, actor, { memberId: member.id, planId: plan.id }),
    ).toThrow(/Overlap/);
  });

  it("renews after the current end date while still active", async () => {
    const { db, actor } = await setup();
    const member = newMember(db, actor);
    const plan = monthlyPlan(db, actor, { name: "Monthly Renew" });
    const first = sellMembership(db, actor, { memberId: member.id, planId: plan.id });

    const renewal = renewMembership(db, actor, { membershipId: first.id });
    expect(renewal.start_on).toBe(addDays(first.end_on, 1));
    expect(renewal.lifecycle_status).toBe("scheduled");
    // The still-active membership stays the current one.
    expect(getCurrentMembership(db, member.id)?.id).toBe(first.id);
    // Renewals do not charge the joining fee again.
    expect(renewal.joining_fee_minor).toBe(0);
  });

  it("renews from today once the membership has expired", async () => {
    const { db, actor } = await setup();
    const member = newMember(db, actor);
    const plan = monthlyPlan(db, actor, { name: "Monthly Expired" });
    const today = gymToday(db);
    const first = sellMembership(db, actor, {
      memberId: member.id,
      planId: plan.id,
      startOn: addDays(today, -60),
    });
    expect(getMembership(db, first.id)!.state).toBe("expired");

    const renewal = renewMembership(db, actor, { membershipId: first.id });
    expect(renewal.start_on).toBe(today);
    expect(renewal.lifecycle_status).toBe("active");
  });

  it("refuses to renew a cancelled membership", async () => {
    const { db, actor } = await setup();
    const member = newMember(db, actor);
    const plan = monthlyPlan(db, actor, { name: "Monthly Cancelled" });
    const membership = sellMembership(db, actor, { memberId: member.id, planId: plan.id });
    cancelMembership(db, actor, membership.id, "member left");
    expect(() =>
      renewMembership(db, actor, { membershipId: membership.id }),
    ).toThrow(/cancelled/);
  });

  it("freezes by pushing the end date out and enforces the plan cap", async () => {
    const { db, actor } = await setup();
    const member = newMember(db, actor);
    const plan = monthlyPlan(db, actor, {
      name: "Monthly Freeze",
      maxFreezeDays: 7,
    });
    const membership = sellMembership(db, actor, { memberId: member.id, planId: plan.id });
    const today = gymToday(db);

    const frozen = freezeMembership(db, actor, {
      membershipId: membership.id,
      fromOn: today,
      toOn: addDays(today, 6),
      reason: "sick",
    });
    expect(frozen.end_on).toBe(addDays(membership.end_on, 7));
    expect(getMembership(db, membership.id)!.state).toBe("frozen");

    expect(() =>
      freezeMembership(db, actor, {
        membershipId: membership.id,
        fromOn: addDays(today, 10),
        toOn: addDays(today, 11),
        reason: "again",
      }),
    ).toThrow(/at most 7/);
  });

  it("removes unused freeze days when a freeze ends early", async () => {
    const { db, actor } = await setup();
    const member = newMember(db, actor);
    const plan = monthlyPlan(db, actor, { name: "Monthly Unfreeze" });
    const membership = sellMembership(db, actor, { memberId: member.id, planId: plan.id });
    const today = gymToday(db);

    freezeMembership(db, actor, {
      membershipId: membership.id,
      fromOn: today,
      toOn: addDays(today, 6),
      reason: "sick",
    });
    const after = unfreezeMembership(db, actor, membership.id, "recovered");
    // 7 days planned, 6 unused, 1 frozen day consumed. The freeze period is
    // inclusive, so today (the day it was ended) is still a frozen day.
    expect(after.end_on).toBe(addDays(membership.end_on, 1));
    const freezes = listFreezes(db, membership.id);
    expect(freezes[0]!.days).toBe(1);
    expect(freezes[0]!.to_on).toBe(today);
    expect(getMembership(db, membership.id)!.state).toBe("frozen");
  });

  it("refuses to freeze a plan that does not allow freezing", async () => {
    const { db, actor } = await setup();
    const member = newMember(db, actor);
    const plan = monthlyPlan(db, actor, { name: "No Freeze", freezeAllowed: false });
    const membership = sellMembership(db, actor, { memberId: member.id, planId: plan.id });
    const today = gymToday(db);
    expect(() =>
      freezeMembership(db, actor, {
        membershipId: membership.id,
        fromOn: today,
        toOn: today,
        reason: "sick",
      }),
    ).toThrow(/does not allow freezing/);
  });

  it("extends expiry by days or months with a mandatory reason", async () => {
    const { db, actor } = await setup();
    const member = newMember(db, actor);
    const plan = monthlyPlan(db, actor, { name: "Monthly Extend" });
    const membership = sellMembership(db, actor, { memberId: member.id, planId: plan.id });

    expect(() =>
      extendMembership(db, actor, {
        membershipId: membership.id,
        days: 5,
        reason: "",
      }),
    ).toThrow(/reason/);

    const byDays = extendMembership(db, actor, {
      membershipId: membership.id,
      days: 5,
      reason: "gesture",
    });
    expect(byDays.end_on).toBe(addDays(membership.end_on, 5));

    const byMonths = extendMembership(db, actor, {
      membershipId: membership.id,
      months: 1,
      reason: "gesture",
    });
    expect(byMonths.end_on).toBe(addMonthsClamped(byDays.end_on, 1));
  });

  it("suspends, reactivates, and cancels memberships", async () => {
    const { db, actor } = await setup();
    const member = newMember(db, actor);
    const plan = monthlyPlan(db, actor, { name: "Monthly Lifecycle" });
    const membership = sellMembership(db, actor, { memberId: member.id, planId: plan.id });

    expect(() => suspendMembership(db, actor, membership.id, "")).toThrow(/reason/);
    suspendMembership(db, actor, membership.id, "payment hold");
    expect(getMembership(db, membership.id)!.state).toBe("suspended");

    reactivateMembership(db, actor, membership.id);
    expect(getMembership(db, membership.id)!.state).toBe("active");

    cancelMembership(db, actor, membership.id, "member left");
    expect(getMembership(db, membership.id)!.state).toBe("cancelled");
    expect(getMembership(db, membership.id)!.lifecycle_status).toBe("cancelled");
  });

  it("summarises membership counts for the dashboard", async () => {
    const { db, actor } = await setup();
    const member = newMember(db, actor);
    const plan = monthlyPlan(db, actor, { name: "Monthly Stats" });
    sellMembership(db, actor, { memberId: member.id, planId: plan.id });
    const stats = getMemberStats(db);
    expect(stats.total).toBe(1);
    expect(stats.activeMemberships).toBe(1);
    expect(stats.expired).toBe(0);
  });

  it("stores health notes only with recorded consent and never in list rows", async () => {
    const { db, actor } = await setup();
    const member = newMember(db, actor);

    expect(() =>
      setMemberHealth(db, actor, member.id, { notes: "Knee injury", consent: false }),
    ).toThrow(/consent/i);

    const saved = setMemberHealth(db, actor, member.id, {
      notes: "Knee injury — avoid deep squats",
      consent: true,
    });
    expect(saved.health_notes).toContain("Knee injury");
    expect(saved.health_consent).toBe(1);

    // Clearing the note does not require consent again.
    const cleared = setMemberHealth(db, actor, member.id, { notes: null, consent: false });
    expect(cleared.health_notes).toBeNull();

    setMemberHealth(db, actor, member.id, { notes: "Asthma", consent: true });
    const rows = listMembers(db);
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0] ?? {})).not.toContain("health_notes");
    expect(Object.keys(rows[0] ?? {})).not.toContain("health_consent");

    // But the restricted detail read still returns it.
    expect(getMember(db, member.id)?.health_notes).toBe("Asthma");
  });
});
