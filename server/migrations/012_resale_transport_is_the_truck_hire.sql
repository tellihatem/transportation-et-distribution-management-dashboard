-- The truck hire is the whole transport charge on a resale too
--
-- The resale's transport block used to charge the client truck hire + driver
-- wage + a typed margin, per trip. The hire is now the whole charge, the wage
-- comes out of it, and the margin is the difference (server/resale-math.ts) —
-- the same rule migration 011 applied to plain transport trips.
--
-- Rows entered under the old rule are restated so that what the client was
-- billed does not move:
--
--   truck_cost     := truck_cost + driver_cost + explicit_profit   (old per-trip charge)
--   driver_cost    := unchanged
--   explicit_profit:= new truck_cost − driver_cost = truck_cost + explicit_profit
--
-- client_selling_price is left alone on purpose: it already holds the invoice
-- total, and since the per-trip charge is unchanged in value, recomputing it
-- would produce the same number. Payment allocations therefore stay valid.
--
-- Guarded by a flag, like 011: migrations re-run on every boot and a second
-- pass would inflate every shipment.

CREATE TABLE IF NOT EXISTS schema_flags (
    key         TEXT PRIMARY KEY,
    applied_at  TEXT DEFAULT (datetime('now'))
);

UPDATE material_resales
SET truck_cost      = truck_cost + driver_cost + explicit_profit,
    explicit_profit = truck_cost + explicit_profit,
    updated_at      = datetime('now'),
    synced_at       = NULL
WHERE NOT EXISTS (SELECT 1 FROM schema_flags WHERE key = 'resale_transport_model_v2');

INSERT OR IGNORE INTO schema_flags (key) VALUES ('resale_transport_model_v2');
