-- Every resale involves at least one trip, so trip_count is now always >= 1.
--
-- It used to default to 0, meaning "multi-trip not used", and the per-trip
-- price was typed in by hand as trip_unit_cost. That let the typed price
-- disagree with the truck rent + driver wage + profit actually recorded on the
-- deal. The per-trip price is now derived from those three figures instead, and
-- trip_count multiplies them: 3 trips means 3x the truck rent, 3x the driver
-- wage and 3x the profit.
--
-- trip_unit_cost is left in place but no longer read or written. It is not
-- dropped because migrations re-run on every startup and the runner only
-- tolerates "duplicate column name" — a DROP COLUMN would succeed once and
-- then abort every later boot.
--
-- Safe to re-run: rows already at 1 or more are untouched.
UPDATE material_resales
SET trip_count = 1
WHERE trip_count IS NULL OR trip_count < 1;
