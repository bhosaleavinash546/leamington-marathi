-- ============================================================
-- Schema v4 — Level-3 Should-Cost detail (sub-items)
-- Adds a third tier beneath each should-cost breakdown element:
--   Level 1 = category (RAW_MATERIAL, MANUFACTURING, ...)
--   Level 2 = cost_element row in should_cost_breakdown
--   Level 3 = should_cost_subitem rows (machine, labour, energy, ...)
-- ============================================================

CREATE TABLE IF NOT EXISTS should_cost_subitem (
  id            SERIAL PRIMARY KEY,
  breakdown_id  INTEGER NOT NULL REFERENCES should_cost_breakdown(id) ON DELETE CASCADE,
  name          VARCHAR(150) NOT NULL,
  value         NUMERIC(14,4) NOT NULL DEFAULT 0,
  basis         VARCHAR(100),
  sort_order    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sc_subitem_breakdown
  ON should_cost_subitem(breakdown_id);
