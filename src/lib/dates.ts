/**
 * Pure date and membership-state math. No I/O, no server-only marker so the
 * same rules drive the server and the UI (DESIGN B5).
 *
 * All dates are date-only `YYYY-MM-DD` strings. Arithmetic runs on UTC
 * midnights so daylight-saving shifts can never change a calendar date.
 */

export type DurationUnit = "days" | "months";

export type MembershipLifecycleStatus =
  | "scheduled"
  | "active"
  | "cancelled"
  | "suspended";

export type MembershipState =
  | MembershipLifecycleStatus
  | "frozen"
  | "expired"
  | "expiring_soon";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface DateParts {
  y: number;
  m: number;
  d: number;
}

function parts(iso: string): DateParts {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return { y, m, d };
}

function utc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

function isoFromUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** True when `value` is a real calendar date in `YYYY-MM-DD` form. */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const { y, m, d } = parts(value);
  if (m < 1 || m > 12) return false;
  return d >= 1 && d <= daysInMonth(y, m);
}

export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of `month`.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(iso: string, days: number): string {
  const { y, m, d } = parts(iso);
  const date = utc(y, m, d);
  date.setUTCDate(date.getUTCDate() + days);
  return isoFromUtc(date);
}

/** Add calendar months, clamping the day to the target month's last day. */
export function addMonthsClamped(iso: string, months: number): string {
  const { y, m, d } = parts(iso);
  const zeroBased = m - 1 + months;
  const year = y + Math.floor(zeroBased / 12);
  const month = ((zeroBased % 12) + 12) % 12; // 0-based
  const day = Math.min(d, daysInMonth(year, month + 1));
  return isoFromUtc(utc(year, month + 1, day));
}

/** Whole days from `fromIso` to `toIso` (positive when `toIso` is later). */
export function diffDays(fromIso: string, toIso: string): number {
  const f = parts(fromIso);
  const t = parts(toIso);
  return Math.round(
    (utc(t.y, t.m, t.d).getTime() - utc(f.y, f.m, f.d).getTime()) / 86_400_000,
  );
}

/** Inclusive day count: a single day is 1, a range of 7 days is 7. */
export function inclusiveDayCount(fromIso: string, toIso: string): number {
  return diffDays(fromIso, toIso) + 1;
}

/** Lexicographic comparison is valid for `YYYY-MM-DD`. */
export function compareIso(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Inclusive end date for a plan (DESIGN B5):
 *  - calendar months: add months, clamp to the target month's last day, then
 *    subtract one day (15 Jan + 1 month -> 14 Feb; 31 Jan + 1 month -> 27 Feb,
 *    or 28 Feb in a leap year).
 *  - day plans: add N - 1 days.
 */
export function computeEndOn(
  startOn: string,
  durationValue: number,
  unit: DurationUnit,
): string {
  if (!Number.isInteger(durationValue) || durationValue < 1) {
    throw new Error("Duration must be a positive integer");
  }
  if (unit === "days") return addDays(startOn, durationValue - 1);
  return addDays(addMonthsClamped(startOn, durationValue), -1);
}

/**
 * Renewal rule (DESIGN B5): while the current membership still covers today,
 * the new one starts the day after it ends; once expired it starts today.
 */
export function resolveRenewalStart(
  currentEndOn: string | null,
  today: string,
): string {
  if (currentEndOn && compareIso(currentEndOn, today) >= 0) {
    return addDays(currentEndOn, 1);
  }
  return today;
}

export interface MembershipStateInput {
  lifecycleStatus: MembershipLifecycleStatus;
  startOn: string;
  endOn: string;
  graceDays: number;
  reminderDays: number;
  frozenToday: boolean;
  today: string;
}

export function computeMembershipState(input: MembershipStateInput): MembershipState {
  if (input.lifecycleStatus === "cancelled") return "cancelled";
  if (input.lifecycleStatus === "suspended") return "suspended";
  if (input.frozenToday) return "frozen";
  if (compareIso(input.today, input.startOn) < 0) return "scheduled";
  const graceEnd = addDays(input.endOn, input.graceDays);
  if (compareIso(input.today, graceEnd) > 0) return "expired";
  if (diffDays(input.today, input.endOn) <= input.reminderDays) {
    return "expiring_soon";
  }
  return "active";
}

export const MEMBERSHIP_STATE_LABELS: Record<MembershipState, string> = {
  scheduled: "Scheduled",
  active: "Active",
  expiring_soon: "Expiring soon",
  frozen: "Frozen",
  suspended: "Suspended",
  expired: "Expired",
  cancelled: "Cancelled",
};

/** Today in a specific IANA timezone, as `YYYY-MM-DD` (DESIGN B5). */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  try {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}
