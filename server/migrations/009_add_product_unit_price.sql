-- Store the price per unit the goods are SOLD to the client for.
--
-- Until now only the combined invoice total was stored, and the sell price per
-- unit was reverse-engineered in the form as total ÷ quantity. That made the
-- product side and the transport side impossible to separate: the invoice
-- could not show goods and delivery as distinct lines, and the product's own
-- profit could not be stated at all.
--
-- The invoice total is now DERIVED instead:
--     client_selling_price = product_unit_price × total_tonnage
--                          + trip_count × (truck_cost + driver_cost + explicit_profit)
--
-- Backfill keeps every existing invoice at exactly the amount already billed:
-- the transport portion is subtracted from the stored total and whatever
-- remains is the goods portion, so product_total + transport_total reproduces
-- the original client_selling_price to the dinar. Amounts clients have already
-- been invoiced and part-paid therefore do not move.
--
-- Rerun safety has two layers. In practice the whole file is skipped on any
-- boot after the first, because the runner tolerates the ALTER's "duplicate
-- column name" by skipping the file. But the backfill formula is written in
-- the PRE-migration-012 transport model (truck + driver + margin summed), so
-- if it ever ran against a database 012 has already restated it would write
-- wrong — typically negative — unit prices. The schema_flags guard makes that
-- impossible by construction rather than by accident of the runner: once 012
-- has stamped the new model, this backfill refuses to touch anything.
CREATE TABLE IF NOT EXISTS schema_flags (
    key         TEXT PRIMARY KEY,
    applied_at  TEXT DEFAULT (datetime('now'))
);

ALTER TABLE material_resales ADD COLUMN product_unit_price REAL DEFAULT 0;

UPDATE material_resales
SET product_unit_price =
      (client_selling_price
        - (MAX(1, COALESCE(trip_count, 1)) * (truck_cost + driver_cost + explicit_profit)))
      / total_tonnage
WHERE (product_unit_price IS NULL OR product_unit_price = 0)
  AND total_tonnage > 0
  AND NOT EXISTS (SELECT 1 FROM schema_flags WHERE key = 'resale_transport_model_v2');
