-- ============================================================
-- Seed: Vehicle Programs + Current Live Price data
-- Run after schema_v3.sql
-- ============================================================

-- 1. Vehicle programs
INSERT INTO vehicle_program (code, name, description, model_year, platform, segment) VALUES
  ('SUV1', 'Compact SUV Alpha',   'Entry-level compact crossover, FWD/AWD option, 5-seat',          2024, 'MX-A1', 'Compact SUV'),
  ('SUV2', 'Mid-Size SUV Beta',   'Mid-size SUV with available AWD, 5-seat, 2.0T engine',           2024, 'MX-B1', 'Mid-Size SUV'),
  ('SUV3', 'Full-Size SUV Gamma', '3-row full-size SUV, 7-seat, V6 engine, 4WD',                    2025, 'MX-C1', 'Full-Size SUV'),
  ('SUV4', 'Performance SUV Delta','High-performance twin-turbo AWD SUV, sport suspension',          2025, 'MX-D1', 'Performance SUV'),
  ('SUV5', 'Electric SUV Epsilon','Battery-electric SUV, 400V architecture, ~500 km range',         2026, 'EV-X1', 'BEV SUV')
ON CONFLICT (code) DO NOTHING;

-- 2. Distribute existing parts across programs (round-robin by part id)
WITH ranked_programs AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn FROM vehicle_program
),
ranked_parts AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn FROM part_master
)
UPDATE part_master pm
SET    program_id = rp.id
FROM   ranked_parts rprt
JOIN   ranked_programs rp ON rp.rn = ((rprt.rn - 1) % 5) + 1
WHERE  pm.id = rprt.id
  AND  pm.program_id IS NULL;

-- 3. Assign program_id to should_cost_header and supplier_quote_header
UPDATE should_cost_header sch
SET    program_id = pm.program_id
FROM   part_master pm
WHERE  pm.id = sch.part_id
  AND  sch.program_id IS NULL;

UPDATE supplier_quote_header sqh
SET    program_id = pm.program_id
FROM   part_master pm
WHERE  pm.id = sqh.part_id
  AND  sqh.program_id IS NULL;

-- 4. Insert current_price_header for all parts that have a published should-cost
INSERT INTO current_price_header
  (part_id, program_id, version, total_cost, supplier_name, annual_volume, effective_date, notes)
SELECT
  pm.id,
  pm.program_id,
  1,
  ROUND(latest_sc.total_cost * (1.10 + (pm.id % 8) * 0.02), 4),   -- 10-24% above SC
  CASE (pm.id % 5)
    WHEN 0 THEN 'Precision Parts Inc.'
    WHEN 1 THEN 'Global Auto Components Ltd.'
    WHEN 2 THEN 'Heritage Manufacturing Co.'
    WHEN 3 THEN 'TechParts GmbH'
    ELSE        'Apex Automotive Supplies'
  END,
  COALESCE(latest_sc.annual_volume, 10000),
  '2024-01-01',
  'Incumbent supplier pricing – FY2024 contract'
FROM part_master pm
JOIN LATERAL (
  SELECT total_cost, annual_volume
  FROM   should_cost_header
  WHERE  part_id = pm.id
    AND  status  = 'published'
  ORDER BY version DESC
  LIMIT 1
) latest_sc ON TRUE
ON CONFLICT (part_id, version) DO NOTHING;

-- 5. Insert current_price_breakdown by inflating SC breakdown values
INSERT INTO current_price_breakdown
  (current_price_header_id, cost_element, category, value, basis, sort_order)
SELECT
  cph.id,
  scb.cost_element,
  -- map SC categories to the 7-bucket scheme
  CASE scb.category
    WHEN 'material'   THEN 'RAW_MATERIAL'
    WHEN 'labor'      THEN 'MANUFACTURING'
    WHEN 'overhead'   THEN 'OVERHEAD'
    WHEN 'logistics'  THEN 'LOGISTICS'
    WHEN 'profit'     THEN 'PROFIT'
    WHEN 'tooling'    THEN 'TOOLING'
    ELSE scb.category
  END,
  -- vary inflation per element so the table looks realistic
  ROUND(scb.value * (1.05 + (cph.id % 6) * 0.025 + (scb.sort_order % 4) * 0.01), 4),
  scb.basis,
  scb.sort_order
FROM current_price_header cph
JOIN LATERAL (
  SELECT sch.id AS sc_id
  FROM   should_cost_header sch
  WHERE  sch.part_id = cph.part_id
    AND  sch.status  = 'published'
  ORDER BY sch.version DESC
  LIMIT 1
) latest_sch ON TRUE
JOIN should_cost_breakdown scb ON scb.should_cost_header_id = latest_sch.sc_id;

-- 6. Add a few BOP entries to current price to demonstrate the extra category
UPDATE current_price_breakdown
SET    category = 'BOP'
WHERE  cost_element ILIKE '%purchased%'
   OR  cost_element ILIKE '%bought%'
   OR  cost_element ILIKE '%fastener%'
   OR  cost_element ILIKE '%bearing%'
   OR  cost_element ILIKE '%seal%';
