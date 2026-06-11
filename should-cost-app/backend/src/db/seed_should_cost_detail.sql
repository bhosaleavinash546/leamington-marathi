-- ============================================================
-- Seed: Level-3 Should-Cost sub-items
-- For every should_cost_breakdown element, generate a realistic
-- cost-driver decomposition so the UI can show a 3-level breakup
-- (category -> element -> sub-item) with expand/collapse.
-- Sub-items sum EXACTLY to their parent element (remainder on last).
-- Idempotent: clears existing sub-items first.
-- Runs AFTER seed_demo_data.sql.
-- ============================================================

DO $$
DECLARE
  r   RECORD;
  v1  NUMERIC; v2 NUMERIC; v3 NUMERIC; v4 NUMERIC; v5 NUMERIC;
BEGIN
  DELETE FROM should_cost_subitem;

  FOR r IN SELECT id, value, basis, category, cost_element FROM should_cost_breakdown LOOP

    IF r.category = 'MANUFACTURING' THEN
      v1 := ROUND(r.value * 0.35, 4);   -- machine
      v2 := ROUND(r.value * 0.30, 4);   -- labour
      v3 := ROUND(r.value * 0.12, 4);   -- energy
      v4 := ROUND(r.value * 0.13, 4);   -- consumables
      v5 := r.value - (v1 + v2 + v3 + v4);
      INSERT INTO should_cost_subitem (breakdown_id, name, value, basis, sort_order) VALUES
        (r.id, 'Machine Cost (depreciation + maintenance)', v1, r.basis, 1),
        (r.id, 'Direct Labour',                             v2, r.basis, 2),
        (r.id, 'Energy & Utilities',                        v3, r.basis, 3),
        (r.id, 'Consumables & Tooling Wear',                v4, r.basis, 4),
        (r.id, 'Setup & Programming',                       v5, r.basis, 5);

    ELSIF r.category = 'RAW_MATERIAL' THEN
      v1 := ROUND(r.value * 0.88, 4);
      v2 := r.value - v1;
      INSERT INTO should_cost_subitem (breakdown_id, name, value, basis, sort_order) VALUES
        (r.id, 'Base Material (net usage)', v1, r.basis, 1),
        (r.id, 'Scrap / Yield Loss',        v2, r.basis, 2);

    ELSIF r.category = 'BOP' THEN
      v1 := ROUND(r.value * 0.82, 4);
      v2 := ROUND(r.value * 0.10, 4);
      v3 := r.value - (v1 + v2);
      INSERT INTO should_cost_subitem (breakdown_id, name, value, basis, sort_order) VALUES
        (r.id, 'Purchased Part Price', v1, r.basis, 1),
        (r.id, 'Inbound Freight & Duty', v2, r.basis, 2),
        (r.id, 'Handling & Markup',      v3, r.basis, 3);

    ELSIF r.category = 'OVERHEAD' THEN
      v1 := ROUND(r.value * 0.45, 4);
      v2 := ROUND(r.value * 0.35, 4);
      v3 := r.value - (v1 + v2);
      INSERT INTO should_cost_subitem (breakdown_id, name, value, basis, sort_order) VALUES
        (r.id, 'Indirect Labour',         v1, r.basis, 1),
        (r.id, 'Facility & Depreciation', v2, r.basis, 2),
        (r.id, 'Quality & Administration', v3, r.basis, 3);

    ELSIF r.category = 'LOGISTICS' THEN
      v1 := ROUND(r.value * 0.60, 4);
      v2 := r.value - v1;
      INSERT INTO should_cost_subitem (breakdown_id, name, value, basis, sort_order) VALUES
        (r.id, 'Transport / Freight', v1, r.basis, 1),
        (r.id, 'Packaging & Dunnage', v2, r.basis, 2);

    ELSIF r.category = 'TOOLING' THEN
      v1 := ROUND(r.value * 0.70, 4);
      v2 := r.value - v1;
      INSERT INTO should_cost_subitem (breakdown_id, name, value, basis, sort_order) VALUES
        (r.id, 'Tool Amortisation', v1, r.basis, 1),
        (r.id, 'Maintenance & Refurb', v2, r.basis, 2);

    ELSIF r.category = 'PROFIT' THEN
      v1 := ROUND(r.value * 0.65, 4);
      v2 := r.value - v1;
      INSERT INTO should_cost_subitem (breakdown_id, name, value, basis, sort_order) VALUES
        (r.id, 'Operating Margin', v1, r.basis, 1),
        (r.id, 'Risk & Contingency', v2, r.basis, 2);
    END IF;

  END LOOP;
END $$;
