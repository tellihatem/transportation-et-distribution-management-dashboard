-- Remove allocation rows whose target no longer exists
--
-- Allocation tables have no foreign keys to the work tables (loose linkage,
-- by design), so a deletion path that forgets one of them leaves orphans.
-- That has already happened once: migration 007 and the legacy-seed purge
-- cleared seeded resales and the client/driver allocations, but predate the
-- supplier ledger and left supplier_payment_allocations pointing at deleted
-- shipments. An orphaned allocation row silently widens the gap between the
-- two supplier-credit figures (prepaidBalance counts target caches,
-- availableAdvance counts allocation rows), offering money the deduct
-- endpoint then refuses to spend.
--
-- Pure DELETEs against missing targets: idempotent, so re-running on every
-- boot is free and also mops up any future path that forgets a table.

DELETE FROM supplier_payment_allocations
WHERE (target_type = 'resale'  AND target_id NOT IN (SELECT id FROM material_resales))
   OR (target_type = 'invoice' AND target_id NOT IN (SELECT id FROM supplier_invoices));

DELETE FROM client_payment_allocations
WHERE (trip_type = 'transport' AND trip_id NOT IN (SELECT id FROM client_trips))
   OR (trip_type = 'resale'    AND trip_id NOT IN (SELECT id FROM material_resales));

DELETE FROM driver_payment_allocations
WHERE (trip_type = 'transport' AND trip_id NOT IN (SELECT id FROM client_trips))
   OR (trip_type = 'resale'    AND trip_id NOT IN (SELECT id FROM material_resales));
