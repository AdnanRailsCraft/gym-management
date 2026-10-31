import { z } from "zod";
import { optionalText } from "@/server/members/schemas";

export const invoiceItemSchema = z.object({
  description: z.string().trim().min(1, "Each item needs a description").max(200),
  quantity: z.coerce.number().int().min(1).max(999),
  unitPrice: z.union([z.string(), z.number()]),
});

export const invoiceItemsSchema = z
  .array(invoiceItemSchema)
  .min(1, "At least one line item is required")
  .max(50, "An invoice can have at most 50 line items");

export const invoiceFormSchema = z.object({
  memberId: z.coerce.number().int().positive("A valid client must be selected"),
  membershipId: optionalText(20),
  itemsJson: z.string().min(2, "Invoice must have line items"),
  discount: optionalText(30),
  amountPaid: optionalText(30),
  paymentMethod: z.enum(["cash", "bank_transfer", "card", "other"]).optional(),
  paymentReference: optionalText(120),
  notes: optionalText(500),
  dueDate: optionalText(10),
  idempotencyKey: z.string().trim().max(80).optional(),
});

export const voidInvoiceSchema = z.object({
  invoiceId: z.coerce.number().int().positive("Invalid invoice ID"),
  reason: z.string().trim().min(3, "A reason is required to void an invoice").max(300),
});
