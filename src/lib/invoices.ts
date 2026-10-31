import { formatMinorUnits } from "./money";
import { normalizeWhatsAppNumber } from "./reminders";

export interface InvoiceLineItemInput {
  description: string;
  quantity: number;
  unitPriceMinor: number;
  totalMinor: number;
}

export interface InvoiceWhatsAppInput {
  gymName: string;
  gymAddress?: string | null;
  gymPhone?: string | null;
  invoiceNumber: string;
  issuedAt: string;
  memberName: string;
  memberNumber: string;
  currencyCode: string;
  minorUnits?: number;
  items: InvoiceLineItemInput[];
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  amountPaidMinor: number;
  balanceDueMinor: number;
  paymentMethod?: string | null;
  status: "paid" | "partial" | "unpaid" | "voided";
  notes?: string | null;
}

export function buildInvoiceWhatsAppMessage(input: InvoiceWhatsAppInput): string {
  const {
    gymName,
    gymAddress,
    gymPhone,
    invoiceNumber,
    issuedAt,
    memberName,
    memberNumber,
    currencyCode,
    minorUnits = 2,
    items,
    subtotalMinor,
    discountMinor,
    totalMinor,
    amountPaidMinor,
    balanceDueMinor,
    paymentMethod,
    status,
    notes,
  } = input;

  const fmt = (minor: number) => formatMinorUnits(minor, currencyCode, minorUnits);

  const statusEmoji =
    status === "paid" ? "PAID ✅" : status === "partial" ? "PARTIAL ⏳" : status === "voided" ? "VOIDED ❌" : "UNPAID ⚠️";

  const dateStr = issuedAt.slice(0, 10);

  const lines = [
    `🏋️ *${gymName.toUpperCase()} — INVOICE / RECEIPT*`,
    `Invoice #: *${invoiceNumber}*`,
    `Date: ${dateStr}`,
    `Client: *${memberName}* (${memberNumber})`,
    ``,
    `*Items:*`,
  ];

  for (const item of items) {
    const qtyStr = item.quantity > 1 ? ` (${item.quantity}x @ ${fmt(item.unitPriceMinor)})` : "";
    lines.push(`• ${item.description}${qtyStr}: ${fmt(item.totalMinor)}`);
  }

  lines.push(`--------------------------------`);
  lines.push(`Subtotal: ${fmt(subtotalMinor)}`);
  if (discountMinor > 0) {
    lines.push(`Discount: -${fmt(discountMinor)}`);
  }
  lines.push(`*Total Amount:* *${fmt(totalMinor)}*`);
  lines.push(`Amount Paid: ${fmt(amountPaidMinor)}${paymentMethod ? ` via ${paymentMethod.replace("_", " ")}` : ""}`);
  lines.push(`*Balance Due:* *${fmt(balanceDueMinor)}*`);
  lines.push(`Status: *${statusEmoji}*`);

  if (notes) {
    lines.push(``);
    lines.push(`Notes: ${notes}`);
  }

  lines.push(``);
  lines.push(`Thank you for training with ${gymName}!`);
  if (gymPhone) {
    lines.push(`📞 Contact: ${gymPhone}`);
  }
  if (gymAddress) {
    lines.push(`📍 Address: ${gymAddress}`);
  }

  return lines.join("\n");
}

export function invoiceWhatsAppHref(
  phone: string | null | undefined,
  input: InvoiceWhatsAppInput,
): string | null {
  const number = normalizeWhatsAppNumber(phone);
  if (!number) return null;
  const msg = buildInvoiceWhatsAppMessage(input);
  return `https://wa.me/${number}?text=${encodeURIComponent(msg)}`;
}

export function invoiceSmsHref(
  phone: string | null | undefined,
  input: InvoiceWhatsAppInput,
): string | null {
  const raw = (phone ?? "").trim();
  if (!raw) return null;
  const target = raw.replace(/\s+/g, "");
  const msg = buildInvoiceWhatsAppMessage(input);
  return `sms:${target}?body=${encodeURIComponent(msg)}`;
}
