import "server-only";
import type { Db } from "@/server/db/index";
import { getGymSettings, type GymSettingsRow } from "@/server/users/service";
import { todayInTimeZone } from "@/lib/dates";

/**
 * Shared gym context for the members feature. Kept in its own module so
 * service.ts and memberships.ts can both use it without a circular import.
 */
export function gymSettings(db: Db): GymSettingsRow {
  return getGymSettings(db);
}

/** Today for the gym's configured timezone (DESIGN B5). */
export function gymToday(db: Db): string {
  return todayInTimeZone(getGymSettings(db).timezone);
}

export interface CurrencyContext {
  code: string;
  minorUnits: number;
}

export function gymCurrency(db: Db): CurrencyContext {
  const gym = getGymSettings(db);
  return { code: gym.currency_code, minorUnits: gym.currency_minor_units };
}
