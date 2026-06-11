-- ============================================================
-- Schema v5 — Part families (same component across programs)
-- Lets the cross-model comparison group "sibling" parts that are
-- the same component fitted to different vehicle programs.
-- ============================================================

ALTER TABLE part_master ADD COLUMN IF NOT EXISTS family_code VARCHAR(40);
ALTER TABLE part_master ADD COLUMN IF NOT EXISTS family_name VARCHAR(150);

CREATE INDEX IF NOT EXISTS idx_part_family ON part_master(family_code);
