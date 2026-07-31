-- ============================================================
-- Migration 005: Client and Driver Payment Ledgers & Allocations
-- Client Payments: records payments made by clients (bulk, advance, or per-trip)
-- Client Payment Allocations: maps a client payment to 1-to-many trips/resales
-- Driver Payments: records payouts/settlements/advances paid to drivers
-- Driver Payment Allocations: maps a driver payout to 1-to-many trips/resales
-- ============================================================

-- Client Payments table
CREATE TABLE IF NOT EXISTS client_payments (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    client_name TEXT NOT NULL,
    amount INTEGER NOT NULL,
    payment_method TEXT DEFAULT 'Cash',
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    synced_at TEXT
);

-- Client Payment Allocations table
CREATE TABLE IF NOT EXISTS client_payment_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_id TEXT NOT NULL,
    trip_type TEXT NOT NULL CHECK(trip_type IN ('transport', 'resale')),
    trip_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (payment_id) REFERENCES client_payments(id) ON DELETE CASCADE
);

-- Driver Payments table
CREATE TABLE IF NOT EXISTS driver_payments (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    driver_name TEXT NOT NULL,
    amount INTEGER NOT NULL,
    payment_type TEXT DEFAULT 'Settlement', -- 'Settlement', 'Advance', 'Bonus'
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    synced_at TEXT
);

-- Driver Payment Allocations table
CREATE TABLE IF NOT EXISTS driver_payment_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_id TEXT NOT NULL,
    trip_type TEXT NOT NULL CHECK(trip_type IN ('transport', 'resale')),
    trip_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (payment_id) REFERENCES driver_payments(id) ON DELETE CASCADE
);

-- Indexes for efficient queries and statements
CREATE INDEX IF NOT EXISTS idx_client_payments_client ON client_payments(client_name);
CREATE INDEX IF NOT EXISTS idx_client_alloc_payment ON client_payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_client_alloc_trip ON client_payment_allocations(trip_type, trip_id);

CREATE INDEX IF NOT EXISTS idx_driver_payments_driver ON driver_payments(driver_name);
CREATE INDEX IF NOT EXISTS idx_driver_alloc_payment ON driver_payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_driver_alloc_trip ON driver_payment_allocations(trip_type, trip_id);
