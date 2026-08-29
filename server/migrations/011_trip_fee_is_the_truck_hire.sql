-- The truck hire IS the client's price
--
-- Transport trips used to bill the client the sum of three typed figures:
-- truck hire + driver wage + company profit. The hire is now the whole price,
-- the wage is paid out of it, and the profit is the difference (server/trip-math.ts).
--
-- Rows entered under the old rule have to be restated or the same trip would
-- suddenly bill less than it did. What the client owes and what the driver
-- earns are both preserved exactly; only the profit is recomputed under the
-- new definition:
--
--   truck_cost     := truck_cost + driver_cut + company_profit   (the old total)
--   driver_cut     := unchanged
--   company_profit := new truck_cost − driver_cut  =  truck_cost + company_profit
--
-- Payment allocations reference amounts, not fees, and the total each trip is
-- worth does not move, so every settled trip stays settled.
--
-- Migrations re-run on every boot, and running this twice would inflate every
-- trip, so it is guarded by a flag rather than by ALTER TABLE (a failing ALTER
-- would also skip the statements after it in this file).

CREATE TABLE IF NOT EXISTS schema_flags (
    key         TEXT PRIMARY KEY,
    applied_at  TEXT DEFAULT (datetime('now'))
);

UPDATE client_trips
SET truck_cost     = truck_cost + driver_cut + company_profit,
    company_profit = truck_cost + company_profit,
    updated_at     = datetime('now'),
    synced_at      = NULL
WHERE NOT EXISTS (SELECT 1 FROM schema_flags WHERE key = 'trip_fee_model_v2');

INSERT OR IGNORE INTO schema_flags (key) VALUES ('trip_fee_model_v2');
