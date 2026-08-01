-- Optional multi-trip support for resale transactions.
-- When trip_count > 0 and trip_unit_cost > 0, the facture shows
-- a per-trip breakdown instead of a flat transport line.
ALTER TABLE material_resales ADD COLUMN trip_count INTEGER DEFAULT 0;
ALTER TABLE material_resales ADD COLUMN trip_unit_cost INTEGER DEFAULT 0;
