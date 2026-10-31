import { optionalText } from "@/server/members/schemas";
import { z } from "zod";

export const checkInSchema = z.object({
  memberId: z.coerce.number().int().positive(),
  method: z.enum(["manual", "qr", "other"]).default("manual"),
  notes: optionalText(300),
  override: z.preprocess((v) => v === "on" || v === "1" || v === "true", z.boolean()).optional(),
  overrideReason: optionalText(300),
});
