-- ============================================================
-- Migration 003: Payment tracking for clients and drivers
-- driver_name: which driver did the trip/deal (groups payables per driver)
-- client_paid: amount the client has paid so far toward the total
-- driver_paid: amount paid to the driver so far toward their wage
-- Columns are nullable with defaults (NOT NULL would break importing
-- older JSON backups that lack these keys); row mappers coalesce nulls.
-- ============================================================

ALTER TABLE client_trips ADD COLUMN driver_name TEXT DEFAULT '';
ALTER TABLE client_trips ADD COLUMN client_paid INTEGER DEFAULT 0;
ALTER TABLE client_trips ADD COLUMN driver_paid INTEGER DEFAULT 0;

ALTER TABLE material_resales ADD COLUMN driver_name TEXT DEFAULT '';
ALTER TABLE material_resales ADD COLUMN client_paid INTEGER DEFAULT 0;
ALTER TABLE material_resales ADD COLUMN driver_paid INTEGER DEFAULT 0;
