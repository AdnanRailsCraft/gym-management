import { z } from "zod";

/**
 * Zod schemas for member, plan, and membership forms. Server actions are public
 * endpoints, so every one of these is parsed on the server (AGENT_PROMPT 4).
 */

const emptyToUndefined = (value: unknown) =>
  value === null ||
  value === undefined ||
  (typeof value === "string" && value.trim() === "")
    ? undefined
    : value;

export const optionalText = (max: number) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());

export const optionalEmail = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .trim()
    .max(254)
    .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, "Invalid email address")
    .optional(),
);

export const optionalIsoDate = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date in YYYY-MM-DD form")
    .optional(),
);

const optionalPositiveInt = (max: number) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).max(max).optional(),
  );

const optionalNonNegativeInt = (max: number) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(0).max(max).optional(),
  );

/** A money amount already converted to integer minor units, or blank. */
export const optionalMinorAmount = optionalNonNegativeInt(1_000_000_000);

/** HTML checkboxes submit "on" when checked and nothing when not. */
export const checkboxField = z.preprocess(
  (value) =>
    value === true || value === 1 || value === "1" || value === "on" || value === "true",
  z.boolean(),
);

export const memberProfileSchema = z
  .object({
    fullName: z.string().trim().min(2, "Full name is required").max(120),
    phone: optionalText(30),
    email: optionalEmail,
    gender: z.preprocess(
      emptyToUndefined,
      z.enum(["Male", "Female", "Other"]).optional(),
    ),
    dateOfBirth: optionalIsoDate,
    address: optionalText(300),
    emergencyContactName: optionalText(120),
    emergencyContactPhone: optionalText(30),
    notes: optionalText(2000),
    referralSource: optionalText(120),
    fitnessGoals: optionalText(500),
    marketingConsent: checkboxField,
    clientType: z.preprocess(emptyToUndefined, z.enum(["regular", "pt"]).optional()),
    id: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
  })
  .refine((value) => Boolean(value.phone) || Boolean(value.email), {
    message: "Provide a phone number or an email address",
    path: ["phone"],
  });

export const planSchema = z.object({
  name: z.string().trim().min(2, "Plan name is required").max(80),
  description: optionalText(300),
  durationValue: z.coerce.number().int().min(1, "Duration must be at least 1").max(3650),
  durationUnit: z.enum(["days", "months"]),
  priceMinor: z.coerce.number().int().min(0).max(1_000_000_000),
  joiningFeeMinor: z.coerce.number().int().min(0).max(1_000_000_000),
  graceDays: z.coerce.number().int().min(0).max(365),
  freezeAllowed: checkboxField,
  maxFreezeDays: optionalNonNegativeInt(3650),
  visitLimit: optionalPositiveInt(1_000_000),
  sellableToNewMembers: checkboxField,
});

export const setMemberStatusSchema = z.object({
  id: z.coerce.number().int().positive(),
  status: z.enum(["active", "inactive", "suspended", "archived"]),
  reason: optionalText(300),
});

export const archiveMemberSchema = z.object({
  id: z.coerce.number().int().positive(),
  reason: optionalText(300),
});

export const sellMembershipSchema = z.object({
  memberId: z.coerce.number().int().positive(),
  planId: z.coerce.number().int().positive(),
  startOn: optionalIsoDate,
  priceMinor: optionalMinorAmount,
  joiningFeeMinor: optionalMinorAmount,
  discountMinor: optionalMinorAmount,
  discountReason: optionalText(200),
  notes: optionalText(500),
  idempotencyKey: optionalText(100),
});

export const renewMembershipSchema = z.object({
  membershipId: z.coerce.number().int().positive(),
  planId: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().optional(),
  ),
  startOn: optionalIsoDate,
  priceMinor: optionalMinorAmount,
  discountMinor: optionalMinorAmount,
  discountReason: optionalText(200),
  notes: optionalText(500),
  idempotencyKey: optionalText(100),
});

export const freezeMembershipSchema = z.object({
  membershipId: z.coerce.number().int().positive(),
  fromOn: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  toOn: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  reason: z.string().trim().min(3, "A reason is required").max(300),
});

export const extendMembershipSchema = z.object({
  membershipId: z.coerce.number().int().positive(),
  days: optionalPositiveInt(3650),
  months: optionalPositiveInt(120),
  reason: z.string().trim().min(3, "A reason is required").max(300),
});

export const membershipReasonSchema = z.object({
  membershipId: z.coerce.number().int().positive(),
  reason: z.string().trim().min(3, "A reason is required").max(300),
});

export const memberHealthSchema = z.object({
  id: z.coerce.number().int().positive(),
  notes: optionalText(4000),
  consent: checkboxField,
});

export const reminderSchema = z.object({
  membershipId: z.coerce.number().int().positive(),
  channel: z.enum(["whatsapp", "sms", "call", "in_person", "other"]),
  message: z.string().trim().min(3, "A message is required").max(1000),
  notes: optionalText(300),
});
