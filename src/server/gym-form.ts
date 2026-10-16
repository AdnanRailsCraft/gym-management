import { z } from "zod";

export function emptyToNull(value: string | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

/** Shared gym-settings fields (setup wizard + settings form). */
export const gymSettingsFields = {
  gymName: z.string().trim().min(1, "Gym name is required"),
  address: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  currencyCode: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/, "Use a 3-letter currency code, e.g. PKR"),
  timezone: z.string().trim().min(1, "Timezone is required"),
  receiptHeader: z.string().trim().optional(),
  receiptFooter: z.string().trim().optional(),
} as const;

export const gymSettingsSchema = z.object(gymSettingsFields);
