-- ============================================================
-- Supabase Cloud Replica Schema
-- Run this SQL in the Supabase SQL Editor to create replica tables
-- ============================================================

-- Tab 1: Client Transport Trips
CREATE TABLE IF NOT EXISTS client_trips (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    client_name TEXT NOT NULL,
    origin_factory TEXT NOT NULL,
    destination TEXT NOT NULL,
    material_type TEXT NOT NULL,
    total_tonnage NUMERIC NOT NULL,
    truck_cost INTEGER NOT NULL,
    driver_cut INTEGER NOT NULL,
    company_profit INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tab 2: Material Resale Transactions
CREATE TABLE IF NOT EXISTS material_resales (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    end_client TEXT NOT NULL,
    destination TEXT NOT NULL DEFAULT '',
    factory_purchase_price INTEGER NOT NULL,
    total_tonnage NUMERIC NOT NULL,
    client_selling_price INTEGER NOT NULL,
    truck_cost INTEGER NOT NULL,
    driver_cost INTEGER NOT NULL,
    explicit_profit INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tab 3: Other Expenses
CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    category TEXT NOT NULL,
    truck_plate TEXT NOT NULL,
    amount INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('Paid', 'Pending')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS but allow full access for service role
ALTER TABLE client_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_resales ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS by default, but add policies for clarity
CREATE POLICY "service_full_access" ON client_trips FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON material_resales FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_full_access" ON expenses FOR ALL USING (true) WITH CHECK (true);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_trips_date ON client_trips(date);
CREATE INDEX IF NOT EXISTS idx_resales_date ON material_resales(date);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);

-- If this schema was already applied before the "destination" column existed,
-- run this once against an existing instance:
-- ALTER TABLE material_resales ADD COLUMN destination TEXT NOT NULL DEFAULT '';
