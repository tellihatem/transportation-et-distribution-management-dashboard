-- ============================================================
-- Migration 002: Add destination (delivery location) to resale deals
-- ============================================================

ALTER TABLE material_resales ADD COLUMN destination TEXT NOT NULL DEFAULT '';
