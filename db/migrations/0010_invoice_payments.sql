-- Migration: 0010_invoice_payments.sql
-- Money contract: payments are an append-only ledger. An invoice's paid amount
-- and status are derived from `invoice_payments` (never by editing a total).
-- A reversal is a new negative row that points at the payment it reverses;
-- nothing is deleted. An invoice is voided, not removed.

ALTER TABLE invoices ADD COLUMN idempotency_key TEXT;

CREATE UNIQUE INDEX idx_invoices_idempotency
  ON invoices(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE invoice_payments (
  id INTEGER PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  amount_minor INTEGER NOT NULL CHECK (amount_minor <> 0),
  method TEXT NOT NULL CHECK (method IN ('cash','bank_transfer','card','other')),
  reference TEXT,
  received_by INTEGER REFERENCES users(id),
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  reverses_payment_id INTEGER REFERENCES invoice_payments(id),
  reason TEXT,
  CHECK (reverses_payment_id IS NULL OR amount_minor < 0),
  CHECK (reverses_payment_id IS NOT NULL OR amount_minor > 0),
  CHECK (amount_minor > 0 OR reason IS NOT NULL)
) STRICT;

CREATE INDEX idx_invoice_payments_invoice ON invoice_payments(invoice_id, received_at);
CREATE INDEX idx_invoice_payments_member ON invoice_payments(member_id, received_at);
CREATE UNIQUE INDEX idx_invoice_payments_reversal
  ON invoice_payments(reverses_payment_id)
  WHERE reverses_payment_id IS NOT NULL;

-- Backfill: invoices created before the ledger existed stored the paid amount
-- on the invoice row. Record that money as a ledger entry so reports stay whole.
INSERT INTO invoice_payments (invoice_id, member_id, amount_minor, method, received_by, received_at)
SELECT i.id, i.member_id, i.amount_paid_minor, COALESCE(i.payment_method, 'cash'), i.created_by_user_id, i.issued_at
FROM invoices i
WHERE i.amount_paid_minor > 0
  AND NOT EXISTS (SELECT 1 FROM invoice_payments p WHERE p.invoice_id = i.id);
