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
-- Safe to re-run: rows that already carry a price are skipped, and the
-- expression is deterministic, so recomputing yields the same value.
ALTER TABLE material_resales ADD COLUMN product_unit_price REAL DEFAULT 0;

UPDATE material_resales
SET product_unit_price =
      (client_selling_price
        - (MAX(1, COALESCE(trip_count, 1)) * (truck_cost + driver_cost + explicit_profit)))
      / total_tonnage
WHERE (product_unit_price IS NULL OR product_unit_price = 0)
  AND total_tonnage > 0;
