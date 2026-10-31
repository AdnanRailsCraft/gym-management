-- Migration: 0009_invoices.sql
-- Invoices, line items, and receipts (REQUIREMENTS 13: billing documents,
-- payment records, WhatsApp sending, and receipt printing).

CREATE TABLE invoices (
  id INTEGER PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  member_id INTEGER NOT NULL REFERENCES members(id),
  membership_id INTEGER REFERENCES memberships(id),
  status TEXT NOT NULL CHECK (status IN ('unpaid', 'partial', 'paid', 'voided')),
  subtotal_minor INTEGER NOT NULL CHECK (subtotal_minor >= 0),
  discount_minor INTEGER NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  total_minor INTEGER NOT NULL CHECK (total_minor >= 0),
  amount_paid_minor INTEGER NOT NULL DEFAULT 0 CHECK (amount_paid_minor >= 0),
  payment_method TEXT CHECK (payment_method IN ('cash', 'bank_transfer', 'card', 'other') OR payment_method IS NULL),
  payment_reference TEXT,
  issued_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  due_date TEXT,
  notes TEXT,
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT;

CREATE TABLE invoice_items (
  id INTEGER PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor >= 0),
  total_minor INTEGER NOT NULL CHECK (total_minor >= 0)
) STRICT;

CREATE INDEX idx_invoices_member ON invoices(member_id, issued_at);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_number ON invoices(invoice_number);
CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_id);
