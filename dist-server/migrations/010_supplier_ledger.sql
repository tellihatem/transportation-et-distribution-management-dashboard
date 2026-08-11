-- Supplier/factory financial accounts (حسابات الموردين).
--
-- Mirrors the client/driver ledger pattern (005). The company's debt to a
-- supplier comes from TWO sources: the goods cost of every resale bought from
-- that supplier (factory_purchase_price × total_tonnage, matched by
-- origin_factory) and manual supplier invoices for purchases made outside any
-- resale record. Payments to the supplier net against the combined total;
-- FIFO allocation happens only when a payment is recorded.
--
-- Re-run safe: everything is IF NOT EXISTS, and the migration runner
-- tolerates "duplicate column name" for the ALTER below. Never DROP here.

-- Manual debts: goods received from a supplier with no matching resale row.
CREATE TABLE IF NOT EXISTS supplier_invoices (
    id TEXT PRIMARY KEY,               -- INV-S1, INV-S2, ...
    date TEXT NOT NULL,
    supplier_name TEXT NOT NULL,
    amount INTEGER NOT NULL,
    notes TEXT DEFAULT '',
    paid INTEGER DEFAULT 0,            -- cache: Σ allocations targeting this invoice
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    synced_at TEXT
);

-- Money paid TO a supplier: prepayments (advance credit) and debt repayments.
CREATE TABLE IF NOT EXISTS supplier_payments (
    id TEXT PRIMARY KEY,               -- PAY-S1, PAY-S2, ...
    date TEXT NOT NULL,
    supplier_name TEXT NOT NULL,
    amount INTEGER NOT NULL,
    payment_type TEXT DEFAULT '',      -- label from the UI (دفعة مسبقة / تسديد مستحقات)
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    synced_at TEXT
);

-- Which shipment/invoice each payment settled. target_type discriminates the
-- target table (no FK on target_id, same loose linkage as the other ledgers;
-- the resale/invoice DELETE endpoints clean their allocations up).
CREATE TABLE IF NOT EXISTS supplier_payment_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_id TEXT NOT NULL,
    target_type TEXT NOT NULL CHECK(target_type IN ('resale', 'invoice')),
    target_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (payment_id) REFERENCES supplier_payments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_supplier_invoices_name ON supplier_invoices(supplier_name);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_name ON supplier_payments(supplier_name);
CREATE INDEX IF NOT EXISTS idx_supplier_alloc_payment ON supplier_payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_supplier_alloc_target ON supplier_payment_allocations(target_type, target_id);

-- Cache of how much of a resale's goods cost has been settled with its
-- supplier — the supplier-side twin of driver_paid. Sole writer is
-- syncTargetPaid() in server/routes/suppliers.ts.
ALTER TABLE material_resales ADD COLUMN supplier_paid INTEGER DEFAULT 0;

-- The supplier summary and FIFO queries filter by origin_factory.
CREATE INDEX IF NOT EXISTS idx_resales_origin ON material_resales(origin_factory);
