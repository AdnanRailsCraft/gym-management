import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonthsClamped,
  computeEndOn,
  computeMembershipState,
  diffDays,
  inclusiveDayCount,
  isIsoDate,
  resolveRenewalStart,
  todayInTimeZone,
} from "@/lib/dates";

describe("date helpers", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
  });

  it("adds months with month-end clamping", () => {
    expect(addMonthsClamped("2026-01-15", 1)).toBe("2026-02-15");
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsClamped("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonthsClamped("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonthsClamped("2026-03-31", -1)).toBe("2026-02-28");
  });

  it("computes inclusive calendar-month end dates (DESIGN B5)", () => {
    // A 1-month plan starting 15 Jan ends 14 Feb.
    expect(computeEndOn("2026-01-15", 1, "months")).toBe("2026-02-14");
    // 31 Jan + 1 month clamps to 28 Feb, minus one day -> 27 Feb.
    expect(computeEndOn("2026-01-31", 1, "months")).toBe("2026-02-27");
    // Leap year clamps to 29 Feb, minus one day -> 28 Feb.
    expect(computeEndOn("2024-01-31", 1, "months")).toBe("2024-02-28");
    expect(computeEndOn("2026-01-01", 12, "months")).toBe("2026-12-31");
  });

  it("computes inclusive day plans as N - 1 days", () => {
    expect(computeEndOn("2026-01-15", 1, "days")).toBe("2026-01-15");
    expect(computeEndOn("2026-01-15", 7, "days")).toBe("2026-01-21");
    expect(computeEndOn("2026-01-31", 3, "days")).toBe("2026-02-02");
  });

  it("rejects impossible calendar dates", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("15-01-2026")).toBe(false);
    expect(isIsoDate("")).toBe(false);
  });

  it("counts day differences", () => {
    expect(diffDays("2026-01-01", "2026-01-01")).toBe(0);
    expect(diffDays("2026-01-01", "2026-01-11")).toBe(10);
    expect(diffDays("2026-01-11", "2026-01-01")).toBe(-10);
    expect(inclusiveDayCount("2026-01-01", "2026-01-07")).toBe(7);
  });

  it("resolves the renewal start date", () => {
    // Still valid: start the day after it ends.
    expect(resolveRenewalStart("2026-03-31", "2026-03-15")).toBe("2026-04-01");
    expect(resolveRenewalStart("2026-03-15", "2026-03-15")).toBe("2026-03-16");
    // Already expired: start today.
    expect(resolveRenewalStart("2026-03-01", "2026-03-15")).toBe("2026-03-15");
    expect(resolveRenewalStart(null, "2026-03-15")).toBe("2026-03-15");
  });

  it("derives today for a configured timezone", () => {
    const instant = new Date("2026-06-01T20:00:00Z");
    // Karachi is UTC+5, so 20:00 UTC is already 01:00 on the 2nd.
    expect(todayInTimeZone("Asia/Karachi", instant)).toBe("2026-06-02");
    expect(todayInTimeZone("UTC", instant)).toBe("2026-06-01");
  });
});

describe("computeMembershipState", () => {
  const base = {
    lifecycleStatus: "active" as const,
    startOn: "2026-01-01",
    endOn: "2026-01-31",
    graceDays: 0,
    reminderDays: 7,
    frozenToday: false,
    today: "2026-01-15",
  };

  it("shows cancelled and suspended before anything else", () => {
    expect(
      computeMembershipState({ ...base, lifecycleStatus: "cancelled" }),
    ).toBe("cancelled");
    expect(
      computeMembershipState({ ...base, lifecycleStatus: "suspended", frozenToday: true }),
    ).toBe("suspended");
  });

  it("shows frozen while inside a freeze period", () => {
    expect(computeMembershipState({ ...base, frozenToday: true })).toBe("frozen");
    expect(
      computeMembershipState({ ...base, lifecycleStatus: "cancelled", frozenToday: true }),
    ).toBe("cancelled");
  });

  it("shows scheduled before the start date", () => {
    expect(computeMembershipState({ ...base, today: "2025-12-20" })).toBe("scheduled");
  });

  it("shows expired only after the grace period", () => {
    // End 31 Jan with no grace -> expired from 1 Feb.
    expect(computeMembershipState({ ...base, today: "2026-02-01" })).toBe("expired");
    // With 3 grace days, the membership is still usable on 3 Feb but the
    // reminder rule makes it "expiring soon" until the grace window closes.
    expect(
      computeMembershipState({ ...base, graceDays: 3, today: "2026-02-03" }),
    ).toBe("expiring_soon");
    expect(
      computeMembershipState({ ...base, graceDays: 3, today: "2026-02-04" }),
    ).toBe("expired");
  });

  it("shows expiring soon within the reminder window", () => {
    expect(computeMembershipState({ ...base, today: "2026-01-24" })).toBe("expiring_soon");
    expect(computeMembershipState({ ...base, today: "2026-01-31" })).toBe("expiring_soon");
  });

  it("shows active otherwise", () => {
    expect(computeMembershipState({ ...base, today: "2026-01-01" })).toBe("active");
    expect(computeMembershipState({ ...base, today: "2026-01-10" })).toBe("active");
  });
});
