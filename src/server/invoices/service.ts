import "server-only";

import type { Db } from "@/server/db/index";
import { writeAudit } from "@/server/audit";

export type InvoiceStatus = "unpaid" | "partial" | "paid" | "voided";
export type PaymentMethod = "cash" | "bank_transfer" | "card" | "other";

const PAYMENT_METHODS: PaymentMethod[] = ["cash", "bank_transfer", "card", "other"];

export interface InvoiceItemRow {
  id: number;
  invoice_id: number;
  description: string;
  quantity: number;
  unit_price_minor: number;
  total_minor: number;
}

export interface InvoicePaymentRow {
  id: number;
  invoice_id: number;
  member_id: number;
  amount_minor: number;
  method: PaymentMethod;
  reference: string | null;
  received_by: number | null;
  received_at: string;
  reverses_payment_id: number | null;
  reason: string | null;
}

export interface InvoiceRow {
  id: number;
  invoice_number: string;
  member_id: number;
  membership_id: number | null;
  status: InvoiceStatus;
  subtotal_minor: number;
  discount_minor: number;
  total_minor: number;
  /** Derived from the payment ledger on every read. */
  amount_paid_minor: number;
  payment_method: PaymentMethod | null;
  payment_reference: string | null;
  issued_at: string;
  due_date: string | null;
  notes: string | null;
  created_by_user_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceListItem extends InvoiceRow {
  member_name: string;
  member_number: string;
  member_phone: string | null;
  created_by_name: string | null;
  item_count: number;
  items_summary: string;
  balance_due_minor: number;
}

export interface InvoiceWithItems extends InvoiceListItem {
  items: InvoiceItemRow[];
}

export interface CreateInvoiceItemInput {
  description: string;
  quantity: number;
  unitPriceMinor: number;
}

export interface CreateInvoiceInput {
  memberId: number;
  membershipId?: number | null;
  items: CreateInvoiceItemInput[];
  discountMinor?: number;
  amountPaidMinor?: number;
  paymentMethod?: PaymentMethod | null;
  paymentReference?: string | null;
  notes?: string | null;
  dueDate?: string | null;
  /** Retry key: a repeated submission returns the original invoice. */
  idempotencyKey?: string | null;
}

/**
 * Generate a sequential invoice number safely inside a transaction.
 * Reads receipt_prefix from gym_settings (defaults to 'INV').
 */
function nextInvoiceNumber(db: Db): string {
  const settings = db
    .prepare("SELECT receipt_prefix FROM gym_settings LIMIT 1")
    .get() as { receipt_prefix: string | null } | undefined;

  const prefix = (settings?.receipt_prefix?.trim() || "INV").toUpperCase();

  const maxRow = db
    .prepare("SELECT MAX(id) AS max_id FROM invoices")
    .get() as { max_id: number | null };

  const nextSeq = (maxRow.max_id ?? 0) + 1;
  return `${prefix}-${String(nextSeq).padStart(4, "0")}`;
}

function ledgerPaid(db: Db, invoiceId: number): number {
  const row = db
    .prepare(
      "SELECT COALESCE(SUM(amount_minor), 0) AS paid FROM invoice_payments WHERE invoice_id = ?",
    )
    .get(invoiceId) as { paid: number };
  return row.paid;
}

function deriveStatus(
  stored: string,
  totalMinor: number,
  paidMinor: number,
): InvoiceStatus {
  if (stored === "voided") return "voided";
  if (totalMinor === 0) return "paid";
  if (paidMinor >= totalMinor) return "paid";
  if (paidMinor > 0) return "partial";
  return "unpaid";
}

function normaliseMethod(method: PaymentMethod | null | undefined, paid: number): PaymentMethod {
  if (method && PAYMENT_METHODS.includes(method)) return method;
  if (method) throw new Error("Unsupported payment method.");
  return paid > 0 ? "cash" : "cash";
}

export function createInvoice(
  db: Db,
  actor: { userId: number | null },
  input: CreateInvoiceInput,
): InvoiceWithItems {
  if (input.items.length === 0) {
    throw new Error("An invoice must contain at least one line item.");
  }

  const member = db
    .prepare("SELECT id, full_name, member_number, phone, status FROM members WHERE id = ?")
    .get(input.memberId) as
    | {
        id: number;
        full_name: string;
        member_number: string;
        phone: string | null;
        status: string;
      }
    | undefined;

  if (!member) {
    throw new Error(`Member with id ${input.memberId} does not exist.`);
  }
  if (member.status === "archived") {
    throw new Error("Archived clients cannot be invoiced.");
  }

  let subtotalMinor = 0;
  for (const item of input.items) {
    if (!item.description || !item.description.trim()) {
      throw new Error("Item description is required.");
    }
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new Error("Item quantity must be a positive integer.");
    }
    if (!Number.isInteger(item.unitPriceMinor) || item.unitPriceMinor < 0) {
      throw new Error("Item unit price cannot be negative.");
    }
    subtotalMinor += item.quantity * item.unitPriceMinor;
  }

  const discountMinor = input.discountMinor ?? 0;
  if (!Number.isInteger(discountMinor) || discountMinor < 0) {
    throw new Error("Discount cannot be negative.");
  }
  if (discountMinor > subtotalMinor) {
    throw new Error("Discount cannot be greater than the subtotal.");
  }

  const totalMinor = subtotalMinor - discountMinor;

  const amountPaidMinor = input.amountPaidMinor ?? 0;
  if (!Number.isInteger(amountPaidMinor) || amountPaidMinor < 0) {
    throw new Error("Amount paid cannot be negative.");
  }
  if (amountPaidMinor > totalMinor) {
    throw new Error("Amount paid cannot be more than the total due.");
  }

  const paymentMethod = amountPaidMinor > 0 ? normaliseMethod(input.paymentMethod, amountPaidMinor) : null;
  const status = deriveStatus("unpaid", totalMinor, amountPaidMinor);

  return db.transaction(() => {
    if (input.idempotencyKey) {
      const existing = db
        .prepare("SELECT id FROM invoices WHERE idempotency_key = ?")
        .get(input.idempotencyKey) as { id: number } | undefined;
      if (existing) {
        const found = getInvoice(db, existing.id);
        if (found) return found;
      }
    }

    const invoiceNumber = nextInvoiceNumber(db);

    const result = db
      .prepare(
        `INSERT INTO invoices (
           invoice_number,
           member_id,
           membership_id,
           status,
           subtotal_minor,
           discount_minor,
           total_minor,
           amount_paid_minor,
           payment_method,
           payment_reference,
           due_date,
           notes,
           created_by_user_id,
           idempotency_key
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        invoiceNumber,
        input.memberId,
        input.membershipId ?? null,
        status,
        subtotalMinor,
        discountMinor,
        totalMinor,
        paymentMethod,
        input.paymentReference?.trim() || null,
        input.dueDate ?? null,
        input.notes?.trim() || null,
        actor.userId,
        input.idempotencyKey ?? null,
      );

    const invoiceId = Number(result.lastInsertRowid);

    const insertItem = db.prepare(
      `INSERT INTO invoice_items (
         invoice_id, description, quantity, unit_price_minor, total_minor
       ) VALUES (?, ?, ?, ?, ?)`,
    );

    for (const item of input.items) {
      insertItem.run(
        invoiceId,
        item.description.trim(),
        item.quantity,
        item.unitPriceMinor,
        item.quantity * item.unitPriceMinor,
      );
    }

    // Money enters through the ledger only. The invoice row keeps a cached
    // amount for older readers, but every read recomputes from this table.
    if (amountPaidMinor > 0 && paymentMethod) {
      db.prepare(
        `INSERT INTO invoice_payments
           (invoice_id, member_id, amount_minor, method, reference, received_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        invoiceId,
        input.memberId,
        amountPaidMinor,
        paymentMethod,
        input.paymentReference?.trim() || null,
        actor.userId,
      );

      db.prepare(
        `UPDATE invoices
         SET amount_paid_minor = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ?`,
      ).run(amountPaidMinor, invoiceId);

      writeAudit(db, {
        userId: actor.userId,
        actionKey: "payment.record",
        entityType: "invoice",
        entityId: invoiceId,
        after: {
          invoiceNumber,
          memberId: input.memberId,
          amountMinor: amountPaidMinor,
          paymentMethod,
          paymentReference: input.paymentReference ?? null,
        },
      });
    }

    writeAudit(db, {
      userId: actor.userId,
      actionKey: "invoice.create",
      entityType: "invoice",
      entityId: invoiceId,
      after: {
        invoiceNumber,
        memberId: input.memberId,
        memberName: member.full_name,
        totalMinor,
        amountPaidMinor,
        status,
        itemCount: input.items.length,
      },
      reason: input.notes ?? undefined,
    });

    const created = getInvoice(db, invoiceId);
    if (!created) {
      throw new Error("Failed to retrieve created invoice.");
    }
    return created;
  })();
}

export function getInvoice(db: Db, id: number): InvoiceWithItems | null {
  const row = db
    .prepare(
      `SELECT
         i.*,
         m.full_name AS member_name,
         m.member_number,
         m.phone AS member_phone,
         u.full_name AS created_by_name,
         (SELECT COUNT(*) FROM invoice_items WHERE invoice_id = i.id) AS item_count,
         (SELECT GROUP_CONCAT(description, ', ') FROM invoice_items WHERE invoice_id = i.id) AS items_summary
       FROM invoices i
       JOIN members m ON m.id = i.member_id
       LEFT JOIN users u ON u.id = i.created_by_user_id
       WHERE i.id = ?`,
    )
    .get(id) as (InvoiceRow & {
      member_name: string;
      member_number: string;
      member_phone: string | null;
      created_by_name: string | null;
      item_count: number;
      items_summary: string | null;
    }) | undefined;

  if (!row) return null;

  const items = db
    .prepare("SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id ASC")
    .all(id) as InvoiceItemRow[];

  const paid = ledgerPaid(db, id);
  const status = deriveStatus(row.status, row.total_minor, paid);
  const balanceDue = status === "voided" ? 0 : Math.max(0, row.total_minor - paid);

  return {
    ...row,
    status,
    amount_paid_minor: paid,
    items_summary: row.items_summary ?? "",
    balance_due_minor: balanceDue,
    items,
  };
}

export function listInvoicePayments(db: Db, invoiceId: number): InvoicePaymentRow[] {
  return db
    .prepare(
      "SELECT * FROM invoice_payments WHERE invoice_id = ? ORDER BY id ASC",
    )
    .all(invoiceId) as InvoicePaymentRow[];
}

export function listInvoices(
  db: Db,
  options?: {
    memberId?: number;
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  },
): InvoiceListItem[] {
  const conditions: string[] = [];
  const args: (string | number)[] = [];

  if (options?.memberId) {
    conditions.push("i.member_id = ?");
    args.push(options.memberId);
  }

  if (options?.status && options.status !== "all") {
    conditions.push("i.status = ?");
    args.push(options.status);
  }

  if (options?.search && options.search.trim()) {
    const q = `%${options.search.trim()}%`;
    conditions.push(
      "(i.invoice_number LIKE ? OR m.full_name LIKE ? OR m.member_number LIKE ? OR m.phone LIKE ?)",
    );
    args.push(q, q, q, q);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = options?.limit ?? 100;
  const offset = options?.offset ?? 0;

  const rows = db
    .prepare(
      `SELECT
         i.*,
         m.full_name AS member_name,
         m.member_number,
         m.phone AS member_phone,
         u.full_name AS created_by_name,
         (SELECT COUNT(*) FROM invoice_items WHERE invoice_id = i.id) AS item_count,
         (SELECT GROUP_CONCAT(description, ', ') FROM invoice_items WHERE invoice_id = i.id) AS items_summary,
         (SELECT COALESCE(SUM(amount_minor), 0) FROM invoice_payments WHERE invoice_id = i.id) AS ledger_paid_minor
       FROM invoices i
       JOIN members m ON m.id = i.member_id
       LEFT JOIN users u ON u.id = i.created_by_user_id
       ${whereClause}
       ORDER BY i.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...args, limit, offset) as Array<
      InvoiceRow & {
        member_name: string;
        member_number: string;
        member_phone: string | null;
        created_by_name: string | null;
        item_count: number;
        items_summary: string | null;
        ledger_paid_minor: number;
      }
    >;

  return rows.map((r) => {
    const paid = r.ledger_paid_minor;
    const status = deriveStatus(r.status, r.total_minor, paid);
    return {
      ...r,
      status,
      amount_paid_minor: paid,
      items_summary: r.items_summary ?? "",
      balance_due_minor: status === "voided" ? 0 : Math.max(0, r.total_minor - paid),
    };
  });
}

export function listInvoicesForMember(db: Db, memberId: number): InvoiceListItem[] {
  return listInvoices(db, { memberId });
}

export function voidInvoice(
  db: Db,
  actor: { userId: number | null },
  invoiceId: number,
  reason: string,
): InvoiceWithItems {
  if (!reason || !reason.trim()) {
    throw new Error("A reason is required to void an invoice.");
  }

  const existing = getInvoice(db, invoiceId);
  if (!existing) {
    throw new Error(`Invoice #${invoiceId} not found.`);
  }
  if (existing.status === "voided") {
    throw new Error("This invoice is already voided.");
  }

  return db.transaction(() => {
    // Reverse every payment still standing, as new negative ledger rows.
    const openPayments = db
      .prepare(
        `SELECT * FROM invoice_payments p
         WHERE p.invoice_id = ?
           AND p.amount_minor > 0
           AND NOT EXISTS (
             SELECT 1 FROM invoice_payments r WHERE r.reverses_payment_id = p.id
           )`,
      )
      .all(invoiceId) as InvoicePaymentRow[];

    const insertReversal = db.prepare(
      `INSERT INTO invoice_payments
         (invoice_id, member_id, amount_minor, method, reference, received_by, reverses_payment_id, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    for (const payment of openPayments) {
      insertReversal.run(
        invoiceId,
        payment.member_id,
        -payment.amount_minor,
        payment.method,
        payment.reference,
        actor.userId,
        payment.id,
        reason.trim(),
      );
      writeAudit(db, {
        userId: actor.userId,
        actionKey: "payment.reversal",
        entityType: "invoice",
        entityId: invoiceId,
        before: { paymentId: payment.id, amountMinor: payment.amount_minor },
        after: { reversed: true, reason: reason.trim() },
        reason: reason.trim(),
      });
    }

    db.prepare(
      `UPDATE invoices
       SET status = 'voided',
           amount_paid_minor = 0,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ?`,
    ).run(invoiceId);

    writeAudit(db, {
      userId: actor.userId,
      actionKey: "invoice.void",
      entityType: "invoice",
      entityId: invoiceId,
      before: { status: existing.status, paidMinor: existing.amount_paid_minor },
      after: { status: "voided" },
      reason: reason.trim(),
    });

    return getInvoice(db, invoiceId)!;
  })();
}

export function getInvoiceStats(db: Db): {
  totalInvoicedMinor: number;
  totalCollectedMinor: number;
  totalOutstandingMinor: number;
  invoiceCount: number;
} {
  const row = db
    .prepare(
      `SELECT
         COALESCE(SUM(i.total_minor), 0) AS total_invoiced,
         COALESCE(SUM(
           (SELECT COALESCE(SUM(p.amount_minor), 0)
            FROM invoice_payments p WHERE p.invoice_id = i.id)
         ), 0) AS total_collected,
         COUNT(*) AS count
       FROM invoices i
       WHERE i.status != 'voided'`,
    )
    .get() as { total_invoiced: number; total_collected: number; count: number };

  const outstanding = Math.max(0, row.total_invoiced - row.total_collected);
  return {
    totalInvoicedMinor: row.total_invoiced,
    totalCollectedMinor: row.total_collected,
    totalOutstandingMinor: outstanding,
    invoiceCount: row.count,
  };
}
