"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/connection";
import { authorize, PolicyError } from "@/server/policies/authorize";
import { PERMISSIONS } from "@/server/policies/permissions";
import { parseMajorToMinor } from "@/lib/money";
import { gymCurrency } from "@/server/members/context";
import {
  createInvoice,
  voidInvoice,
  type CreateInvoiceItemInput,
} from "@/server/invoices/service";
import {
  invoiceFormSchema,
  invoiceItemsSchema,
  voidInvoiceSchema,
} from "@/server/invoices/schemas";

export interface InvoiceActionResult {
  ok: boolean;
  invoiceId?: number;
  invoiceNumber?: string;
  error?: string;
}

function fail(error: unknown): InvoiceActionResult {
  if (error instanceof PolicyError) return { ok: false, error: error.message };
  return {
    ok: false,
    error: error instanceof Error ? error.message : "The request failed",
  };
}

export async function createInvoiceAction(formData: FormData): Promise<InvoiceActionResult> {
  try {
    const user = await requireUser();
    authorize(user, PERMISSIONS.paymentsRecord);
    const db = getDb();
    const currency = gymCurrency(db);

    const rawMethod = formData.get("paymentMethod");
    const parsed = invoiceFormSchema.safeParse({
      memberId: formData.get("memberId"),
      membershipId: formData.get("membershipId") ?? "",
      itemsJson: formData.get("itemsJson") ?? "",
      discount: formData.get("discount") ?? "",
      amountPaid: formData.get("amountPaid") ?? "",
      paymentMethod:
        typeof rawMethod === "string" && rawMethod.trim() ? rawMethod.trim() : undefined,
      paymentReference: formData.get("paymentReference") ?? "",
      notes: formData.get("notes") ?? "",
      dueDate: formData.get("dueDate") ?? "",
      idempotencyKey:
        typeof formData.get("idempotencyKey") === "string"
          ? String(formData.get("idempotencyKey")).trim() || undefined
          : undefined,
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid invoice" };
    }

    let rawItems: unknown;
    try {
      rawItems = JSON.parse(parsed.data.itemsJson);
    } catch {
      return { ok: false, error: "Invalid line items data format." };
    }
    const itemsParsed = invoiceItemsSchema.safeParse(rawItems);
    if (!itemsParsed.success) {
      return {
        ok: false,
        error: itemsParsed.error.issues[0]?.message ?? "Invalid line items",
      };
    }

    const items: CreateInvoiceItemInput[] = [];
    for (const item of itemsParsed.data) {
      const unitPriceMinor = parseMajorToMinor(item.unitPrice, currency.minorUnits);
      if (unitPriceMinor === null || unitPriceMinor < 0) {
        return { ok: false, error: `Invalid unit price for "${item.description}".` };
      }
      items.push({
        description: item.description,
        quantity: item.quantity,
        unitPriceMinor,
      });
    }

    const discountMinor = parsed.data.discount
      ? parseMajorToMinor(parsed.data.discount, currency.minorUnits)
      : 0;
    if (discountMinor === null) {
      return { ok: false, error: "Invalid discount amount." };
    }

    const amountPaidMinor = parsed.data.amountPaid
      ? parseMajorToMinor(parsed.data.amountPaid, currency.minorUnits)
      : 0;
    if (amountPaidMinor === null) {
      return { ok: false, error: "Invalid amount paid." };
    }

    const membershipId =
      parsed.data.membershipId && Number.isInteger(Number(parsed.data.membershipId))
        ? Number(parsed.data.membershipId)
        : null;

    const invoice = createInvoice(db, { userId: user.id }, {
      memberId: parsed.data.memberId,
      membershipId,
      items,
      discountMinor,
      amountPaidMinor,
      paymentMethod: parsed.data.paymentMethod ?? "cash",
      paymentReference: parsed.data.paymentReference,
      notes: parsed.data.notes,
      dueDate: parsed.data.dueDate,
      idempotencyKey: parsed.data.idempotencyKey ?? null,
    });

    revalidatePath("/invoices");
    revalidatePath("/members");
    revalidatePath(`/members/${invoice.member_id}`);
    revalidatePath("/");

    return {
      ok: true,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
    };
  } catch (error) {
    return fail(error);
  }
}

export async function voidInvoiceAction(formData: FormData): Promise<InvoiceActionResult> {
  try {
    const user = await requireUser();
    authorize(user, PERMISSIONS.paymentsRefund);
    const db = getDb();

    const parsed = voidInvoiceSchema.safeParse({
      invoiceId: formData.get("invoiceId"),
      reason: formData.get("reason") ?? "",
    });
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid void request" };
    }

    voidInvoice(db, { userId: user.id }, parsed.data.invoiceId, parsed.data.reason);

    revalidatePath("/invoices");
    revalidatePath("/members");
    revalidatePath("/");

    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}
