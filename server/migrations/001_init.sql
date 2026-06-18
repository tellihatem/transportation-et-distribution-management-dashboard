-- ============================================================
-- Logistics Financial Dashboard — Database Schema v1
-- Local SQLite Primary Database
-- ============================================================

-- Tab 1: Client Transport Trips
CREATE TABLE IF NOT EXISTS client_trips (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    client_name TEXT NOT NULL,
    origin_factory TEXT NOT NULL,
    destination TEXT NOT NULL,
    material_type TEXT NOT NULL,
    total_tonnage REAL NOT NULL,
    truck_cost INTEGER NOT NULL,
    driver_cut INTEGER NOT NULL,
    company_profit INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    synced_at TEXT  -- NULL = not yet synced to Supabase
);

-- Tab 2: Material Resale Transactions
CREATE TABLE IF NOT EXISTS material_resales (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    end_client TEXT NOT NULL,
    factory_purchase_price INTEGER NOT NULL,
    total_tonnage REAL NOT NULL,
    client_selling_price INTEGER NOT NULL,
    truck_cost INTEGER NOT NULL,
    driver_cost INTEGER NOT NULL,
    explicit_profit INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    synced_at TEXT
);

-- Tab 3: Other Expenses
CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    category TEXT NOT NULL,
    truck_plate TEXT NOT NULL,
    amount INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('Paid', 'Pending')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    synced_at TEXT
);

-- Sync queue for failed Supabase replication attempts
CREATE TABLE IF NOT EXISTS sync_queue (
    queue_id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    operation TEXT NOT NULL CHECK(operation IN ('upsert', 'delete')),
    payload TEXT,          -- JSON snapshot of the record
    created_at TEXT DEFAULT (datetime('now')),
    retry_count INTEGER DEFAULT 0,
    last_error TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_trips_date ON client_trips(date);
CREATE INDEX IF NOT EXISTS idx_resales_date ON material_resales(date);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_sync_queue_table ON sync_queue(table_name, record_id);
