import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/server/db";
import { makeTestDb, cleanupTestDbs } from "./helpers/db";
import { createUser } from "@/server/users/service";
import type { AuthzUser } from "@/server/policies/authorize";
import { createMember } from "@/server/members/service";
import {
  createInvoice,
  getInvoice,
  listInvoices,
  listInvoicePayments,
  listInvoicesForMember,
  voidInvoice,
  getInvoiceStats,
} from "@/server/invoices/service";
import {
  buildInvoiceWhatsAppMessage,
  invoiceWhatsAppHref,
} from "@/lib/invoices";

describe("invoices and WhatsApp receipts", () => {
  let db: Db;
  let actor: AuthzUser;
  let memberId: number;

  beforeEach(async () => {
    const res = await makeTestDb();
    db = res.db;

    const userId = await createUser(db, null, {
      username: "owner",
      fullName: "Gym Owner",
      password: "password123456",
      email: null,
      roleKeys: ["owner"],
    });
    actor = {
      id: userId,
      username: "owner",
      fullName: "Gym Owner",
      isActive: true,
      roles: ["owner"],
      permissions: new Set(),
    };

    const member = createMember(db, actor, {
      fullName: "Ali Khan",
      phone: "0300 1234567",
      email: "ali@example.com",
      gender: null,
      dateOfBirth: null,
      address: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
      notes: null,
      referralSource: null,
      fitnessGoals: null,
      marketingConsent: false,
    });
    memberId = member.id;
  });

  afterEach(() => {
    cleanupTestDbs();
  });

  it("creates an invoice with line items, sequential numbering, and audits", () => {
    const inv = createInvoice(db, { userId: actor.id }, {
      memberId,
      items: [
        { description: "Monthly Membership Plan", quantity: 1, unitPriceMinor: 500000 },
        { description: "Joining Fee", quantity: 1, unitPriceMinor: 100000 },
      ],
      discountMinor: 50000,
      amountPaidMinor: 550000,
      paymentMethod: "cash",
      notes: "First month package",
    });

    expect(inv.id).toBeGreaterThan(0);
    expect(inv.invoice_number).toMatch(/^[A-Z]+-\d{4}$/);
    expect(inv.subtotal_minor).toBe(600000);
    expect(inv.discount_minor).toBe(50000);
    expect(inv.total_minor).toBe(550000);
    expect(inv.amount_paid_minor).toBe(550000);
    expect(inv.balance_due_minor).toBe(0);
    expect(inv.status).toBe("paid");
    expect(inv.items).toHaveLength(2);
    expect(inv.member_name).toBe("Ali Khan");

    // Money is recorded in the ledger, not by editing the invoice total.
    const payments = listInvoicePayments(db, inv.id);
    expect(payments).toHaveLength(1);
    expect(payments[0]?.amount_minor).toBe(550000);
    expect(payments[0]?.method).toBe("cash");

    // Verify audit logs
    const audits = db
      .prepare("SELECT action_key, entity_type FROM audit_logs WHERE entity_id = ?")
      .all(String(inv.id)) as Array<{ action_key: string; entity_type: string }>;

    expect(audits.some((a) => a.action_key === "invoice.create")).toBe(true);
    expect(audits.some((a) => a.action_key === "payment.record")).toBe(true);
  });

  it("handles partial and unpaid statuses accurately", () => {
    const unpaid = createInvoice(db, { userId: actor.id }, {
      memberId,
      items: [{ description: "Quarterly Plan", quantity: 1, unitPriceMinor: 1200000 }],
      amountPaidMinor: 0,
    });
    expect(unpaid.status).toBe("unpaid");
    expect(unpaid.balance_due_minor).toBe(1200000);
    expect(listInvoicePayments(db, unpaid.id)).toHaveLength(0);

    const partial = createInvoice(db, { userId: actor.id }, {
      memberId,
      items: [{ description: "Annual Plan", quantity: 1, unitPriceMinor: 3000000 }],
      amountPaidMinor: 1000000,
      paymentMethod: "bank_transfer",
    });
    expect(partial.status).toBe("partial");
    expect(partial.balance_due_minor).toBe(2000000);
  });

  it("rejects overpayment and a discount larger than the subtotal", () => {
    expect(() =>
      createInvoice(db, { userId: actor.id }, {
        memberId,
        items: [{ description: "Monthly", quantity: 1, unitPriceMinor: 100000 }],
        amountPaidMinor: 100001,
      }),
    ).toThrow(/cannot be more than the total/i);

    expect(() =>
      createInvoice(db, { userId: actor.id }, {
        memberId,
        items: [{ description: "Monthly", quantity: 1, unitPriceMinor: 100000 }],
        discountMinor: 100001,
      }),
    ).toThrow(/discount cannot be greater/i);
  });

  it("returns the original invoice when the same idempotency key is retried", () => {
    const input = {
      memberId,
      items: [{ description: "Monthly", quantity: 1, unitPriceMinor: 200000 }],
      amountPaidMinor: 200000,
      paymentMethod: "cash" as const,
      idempotencyKey: "retry-key-1",
    };
    const first = createInvoice(db, { userId: actor.id }, input);
    const second = createInvoice(db, { userId: actor.id }, input);

    expect(second.id).toBe(first.id);
    expect(listInvoices(db)).toHaveLength(1);
    expect(listInvoicePayments(db, first.id)).toHaveLength(1);
  });

  it("lists invoices and member invoices from ledger-derived balances", () => {
    createInvoice(db, { userId: actor.id }, {
      memberId,
      items: [{ description: "Training Session", quantity: 2, unitPriceMinor: 150000 }],
      amountPaidMinor: 300000,
      paymentMethod: "cash",
    });

    const all = listInvoices(db);
    expect(all).toHaveLength(1);
    expect(all[0]!.item_count).toBe(1);
    expect(all[0]!.amount_paid_minor).toBe(300000);

    const forMember = listInvoicesForMember(db, memberId);
    expect(forMember).toHaveLength(1);

    const stats = getInvoiceStats(db);
    expect(stats.totalInvoicedMinor).toBe(300000);
    expect(stats.totalCollectedMinor).toBe(300000);
    expect(stats.totalOutstandingMinor).toBe(0);
    expect(stats.invoiceCount).toBe(1);
  });

  it("voids an invoice with an audited reason", () => {
    const inv = createInvoice(db, { userId: actor.id }, {
      memberId,
      items: [{ description: "Mistaken Item", quantity: 1, unitPriceMinor: 50000 }],
    });

    const voided = voidInvoice(db, { userId: actor.id }, inv.id, "Entered in error");
    expect(voided.status).toBe("voided");

    const audit = db
      .prepare("SELECT * FROM audit_logs WHERE action_key = 'invoice.void' AND entity_id = ?")
      .get(String(inv.id)) as { reason: string } | undefined;

    expect(audit).toBeDefined();
    expect(audit?.reason).toBe("Entered in error");
  });

  it("reverses collected money in the ledger when an invoice is voided", () => {
    const inv = createInvoice(db, { userId: actor.id }, {
      memberId,
      items: [{ description: "Monthly", quantity: 1, unitPriceMinor: 400000 }],
      amountPaidMinor: 400000,
      paymentMethod: "cash",
    });

    voidInvoice(db, { userId: actor.id }, inv.id, "Client cancelled same day");

    const payments = listInvoicePayments(db, inv.id);
    expect(payments).toHaveLength(2);
    expect(payments[0]?.amount_minor).toBe(400000);
    expect(payments[1]?.amount_minor).toBe(-400000);
    expect(payments[1]?.reverses_payment_id).toBe(payments[0]?.id);
    expect(payments[1]?.reason).toContain("cancelled");
    expect(payments.reduce((sum, p) => sum + p.amount_minor, 0)).toBe(0);

    // The original payment row is never deleted or edited.
    expect(payments[0]?.amount_minor).toBe(400000);

    const stats = getInvoiceStats(db);
    expect(stats.totalCollectedMinor).toBe(0);
    expect(stats.totalOutstandingMinor).toBe(0);

    const reversalAudit = db
      .prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action_key = 'payment.reversal'")
      .get() as { n: number };
    expect(reversalAudit.n).toBe(1);

    expect(() => voidInvoice(db, { userId: actor.id }, inv.id, "again")).toThrow(
      /already voided/i,
    );
  });

  it("builds a WhatsApp invoice message and href with normalized international phone number", () => {
    const inv = createInvoice(db, { userId: actor.id }, {
      memberId,
      items: [
        { description: "Monthly Standard", quantity: 1, unitPriceMinor: 500000 },
        { description: "Locker Fee", quantity: 1, unitPriceMinor: 100000 },
      ],
      discountMinor: 0,
      amountPaidMinor: 600000,
      paymentMethod: "cash",
    });

    const message = buildInvoiceWhatsAppMessage({
      gymName: "Empire Fitness",
      gymPhone: "+92 300 0000000",
      invoiceNumber: inv.invoice_number,
      issuedAt: inv.issued_at,
      memberName: inv.member_name,
      memberNumber: inv.member_number,
      currencyCode: "PKR",
      minorUnits: 2,
      items: inv.items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unitPriceMinor: i.unit_price_minor,
        totalMinor: i.total_minor,
      })),
      subtotalMinor: inv.subtotal_minor,
      discountMinor: inv.discount_minor,
      totalMinor: inv.total_minor,
      amountPaidMinor: inv.amount_paid_minor,
      balanceDueMinor: inv.balance_due_minor,
      paymentMethod: inv.payment_method,
      status: inv.status,
    });

    expect(message).toContain("EMPIRE FITNESS — INVOICE / RECEIPT");
    expect(message).toContain(inv.invoice_number);
    expect(message).toContain("Ali Khan");
    expect(message).toContain("Monthly Standard");
    expect(message).toContain("PAID ✅");

    const href = invoiceWhatsAppHref("0300 1234567", {
      gymName: "Empire Fitness",
      invoiceNumber: inv.invoice_number,
      issuedAt: inv.issued_at,
      memberName: inv.member_name,
      memberNumber: inv.member_number,
      currencyCode: "PKR",
      items: [],
      subtotalMinor: 0,
      discountMinor: 0,
      totalMinor: 0,
      amountPaidMinor: 0,
      balanceDueMinor: 0,
      status: "paid",
    });

    expect(href).toContain("https://wa.me/923001234567?text=");
  });

  it("reads the invoice with its items after creation", () => {
    const inv = createInvoice(db, { userId: actor.id }, {
      memberId,
      items: [{ description: "Day Pass", quantity: 3, unitPriceMinor: 50000 }],
      amountPaidMinor: 150000,
      paymentMethod: "cash",
    });
    const reread = getInvoice(db, inv.id);
    expect(reread?.items).toHaveLength(1);
    expect(reread?.items[0]?.total_minor).toBe(150000);
    expect(reread?.status).toBe("paid");
  });
});
