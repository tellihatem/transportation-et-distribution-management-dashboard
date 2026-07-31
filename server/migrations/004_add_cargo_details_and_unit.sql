-- ============================================================
-- Migration 004: Cargo details on resale deals + flexible quantity unit
--
-- material_type / origin_factory: resale deals previously only recorded the
--   destination, so the facture could not state what was shipped or where it
--   came from (trips already had these columns).
-- quantity_unit: quantities are not always in tonnes — some jobs are counted
--   by unit, cubic metre, etc. Defaults to 'طن' so existing rows keep their
--   current meaning.
--
-- Columns are nullable with defaults so importing older JSON backups that
-- lack these keys still works; row mappers coalesce nulls.
-- ============================================================

ALTER TABLE client_trips ADD COLUMN quantity_unit TEXT DEFAULT 'طن';

ALTER TABLE material_resales ADD COLUMN material_type TEXT DEFAULT '';
ALTER TABLE material_resales ADD COLUMN origin_factory TEXT DEFAULT '';
ALTER TABLE material_resales ADD COLUMN quantity_unit TEXT DEFAULT 'طن';
