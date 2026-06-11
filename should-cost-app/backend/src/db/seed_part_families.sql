-- ============================================================
-- Seed: Cross-model part families
-- Creates the SAME component on several vehicle programs so the
-- cross-model comparison can show how its cost differs by model
-- and where the gap sits. Each family member gets:
--   • Published Should-Cost (scaled from a base profile)
--   • Current Live Price    (incumbent, overpaying)
--   • 2 New Supplier Quotes (Sterling UK / Mitra India)
-- Runs AFTER seed_demo_data.sql (suppliers SUP-101/102 exist) and
-- schema_v5.sql, and BEFORE seed_should_cost_detail.sql so the
-- Level-3 sub-items are generated for these parts too.
-- ============================================================

DO $$
DECLARE
  v_sup1 INTEGER; v_sup2 INTEGER;
  v_part INTEGER; v_sc INTEGER; v_cp INTEGER; v_q INTEGER;
  v_sc_tot NUMERIC; v_cp_tot NUMERIC; v_q1_tot NUMERIC; v_q2_tot NUMERIC;
  fp RECORD; v_n INTEGER := 0;
BEGIN
  SELECT id INTO v_sup1 FROM supplier WHERE code = 'SUP-101';
  SELECT id INTO v_sup2 FROM supplier WHERE code = 'SUP-102';

  -- Base should-cost profile for each family (reference program = factor 1.0)
  CREATE TEMP TABLE fam_lines (
    fam TEXT, sort INTEGER, el TEXT, cat TEXT, basis TEXT, base_sc NUMERIC
  ) ON COMMIT DROP;

  INSERT INTO fam_lines VALUES
  -- Front Brake Disc family (FBD)
  ('FBD', 1,'Grey Cast Iron GG20',        'RAW_MATERIAL','£/part', 5.20),
  ('FBD', 2,'Melting & Casting (DISA)',   'MANUFACTURING','£/part', 1.80),
  ('FBD', 3,'CNC Machining Op10/Op20',    'MANUFACTURING','£/part', 1.40),
  ('FBD', 4,'Balancing & Grinding',       'MANUFACTURING','£/part', 0.55),
  ('FBD', 5,'Anti-Corrosion Coating',     'MANUFACTURING','£/part', 0.38),
  ('FBD', 6,'Wheel Studs & Hardware',     'BOP','£/set',           0.65),
  ('FBD', 7,'Factory Overhead',           'OVERHEAD','% of process',1.05),
  ('FBD', 8,'SG&A Markup',                'OVERHEAD','% of cost',   0.62),
  ('FBD', 9,'Packaging & Freight',        'LOGISTICS','£/part',     0.55),
  ('FBD',10,'Tooling Amortisation',       'TOOLING','£/part',       0.18),
  ('FBD',11,'Profit Margin',              'PROFIT','% of total',    0.68),
  -- Front Door Outer Panel family (FDP)
  ('FDP', 1,'Steel Coil CR4',             'RAW_MATERIAL','£/part',  6.60),
  ('FDP', 2,'Engineered Scrap (net)',     'RAW_MATERIAL','£/part',  0.95),
  ('FDP', 3,'Blanking Operation',         'MANUFACTURING','£/stroke',0.85),
  ('FDP', 4,'Draw Press Operation',       'MANUFACTURING','£/stroke',1.45),
  ('FDP', 5,'Trim & Pierce Operation',    'MANUFACTURING','£/stroke',0.95),
  ('FDP', 6,'Mastic Pads & Sealant',      'BOP','£/set',            0.42),
  ('FDP', 7,'Factory Overhead',           'OVERHEAD','% of process',1.62),
  ('FDP', 8,'SG&A Markup',                'OVERHEAD','% of cost',   0.98),
  ('FDP', 9,'Packaging & Freight',        'LOGISTICS','£/part',     0.83),
  ('FDP',10,'Tooling Amortisation',       'TOOLING','£/part',       0.55),
  ('FDP',11,'Profit Margin',              'PROFIT','% of total',    0.92),
  -- Floor Wiring Harness family (FWH)
  ('FWH', 1,'Copper Wire & Cable',        'RAW_MATERIAL','£/part',  8.95),
  ('FWH', 2,'Cutting & Crimping',         'MANUFACTURING','£/part', 1.45),
  ('FWH', 3,'Layout Board Assembly',      'MANUFACTURING','£/part', 3.85),
  ('FWH', 4,'Electrical Test & QC',       'MANUFACTURING','£/part', 0.65),
  ('FWH', 5,'Connectors & Terminals',     'BOP','£/set',            4.85),
  ('FWH', 6,'Tapes, Conduits & Grommets', 'BOP','£/set',            1.25),
  ('FWH', 7,'Factory Overhead',           'OVERHEAD','% of process',1.65),
  ('FWH', 8,'SG&A Markup',                'OVERHEAD','% of cost',   1.15),
  ('FWH', 9,'Packaging & Freight',        'LOGISTICS','£/part',     1.07),
  ('FWH',10,'Layout Jigs Amortisation',   'TOOLING','£/part',       0.35),
  ('FWH',11,'Profit Margin',              'PROFIT','% of total',    1.30);

  -- Family -> program mapping with scale factors
  --  sc_factor : how the should-cost scales for that program
  --  cp_uplift : current-price multiplier over should-cost (overpay)
  CREATE TEMP TABLE fam_prog (
    fam TEXT, fam_name TEXT, sys_code TEXT, prog TEXT, sc_factor NUMERIC, cp_uplift NUMERIC, incumbent TEXT
  ) ON COMMIT DROP;

  INSERT INTO fam_prog VALUES
  ('FBD','Front Brake Disc','BRK','SUV1', 0.92, 1.14, 'Global Auto Components Ltd.'),
  ('FBD','Front Brake Disc','BRK','SUV2', 1.00, 1.22, 'Global Auto Components Ltd.'),
  ('FBD','Front Brake Disc','BRK','SUV3', 1.18, 1.17, 'Heritage Manufacturing Co.'),
  ('FBD','Front Brake Disc','BRK','SUV4', 1.35, 1.28, 'Precision Parts Inc.'),
  ('FBD','Front Brake Disc','BRK','SUV5', 1.05, 1.12, 'Apex Automotive Supplies'),
  ('FDP','Front Door Outer Panel','VB','SUV1', 0.90, 1.13, 'Heritage Manufacturing Co.'),
  ('FDP','Front Door Outer Panel','VB','SUV2', 1.00, 1.24, 'Heritage Manufacturing Co.'),
  ('FDP','Front Door Outer Panel','VB','SUV3', 1.22, 1.16, 'Precision Parts Inc.'),
  ('FDP','Front Door Outer Panel','VB','SUV4', 1.08, 1.20, 'Global Auto Components Ltd.'),
  ('FWH','Floor Wiring Harness','EE','SUV2', 0.95, 1.15, 'Apex Automotive Supplies'),
  ('FWH','Floor Wiring Harness','EE','SUV3', 1.15, 1.26, 'Apex Automotive Supplies'),
  ('FWH','Floor Wiring Harness','EE','SUV5', 1.32, 1.19, 'TechParts GmbH');

  FOR fp IN SELECT * FROM fam_prog LOOP
    v_n := v_n + 1;

    -- Skip if this family member already exists (idempotent)
    SELECT id INTO v_part FROM part_master WHERE part_number = fp.fam || '-' || fp.prog;
    IF v_part IS NOT NULL THEN CONTINUE; END IF;

    INSERT INTO part_master (part_number, description, uom, commodity, drawing_rev, family_code, family_name, system_id, program_id)
    VALUES (
      fp.fam || '-' || fp.prog,
      fp.fam_name || ' — ' || fp.prog,
      'EA', 'Cross-Model', 'A', fp.fam, fp.fam_name,
      (SELECT id FROM vehicle_system  WHERE code = fp.sys_code),
      (SELECT id FROM vehicle_program WHERE code = fp.prog)
    )
    RETURNING id INTO v_part;

    SELECT SUM(ROUND(base_sc * fp.sc_factor, 4)) INTO v_sc_tot FROM fam_lines WHERE fam = fp.fam;
    v_cp_tot := ROUND(v_sc_tot * fp.cp_uplift, 4);
    v_q1_tot := ROUND(v_sc_tot * 1.03, 4);
    v_q2_tot := ROUND(v_sc_tot * 0.93, 4);

    -- Should-Cost (published)
    INSERT INTO should_cost_header (part_id, version, status, annual_volume, currency, total_cost, notes, program_id)
    VALUES (v_part, 1, 'published', 50000, 'GBP', v_sc_tot,
            'Cross-model should-cost — same component, program-specific scaling',
            (SELECT id FROM vehicle_program WHERE code = fp.prog))
    RETURNING id INTO v_sc;

    INSERT INTO should_cost_breakdown (should_cost_header_id, cost_element, category, value, basis, sort_order)
    SELECT v_sc, el, cat, ROUND(base_sc * fp.sc_factor, 4), basis, sort
    FROM fam_lines WHERE fam = fp.fam ORDER BY sort;

    -- Current Live Price (incumbent, overpaying)
    INSERT INTO current_price_header (part_id, program_id, version, total_cost, currency, supplier_name, annual_volume, effective_date, notes)
    VALUES (v_part, (SELECT id FROM vehicle_program WHERE code = fp.prog), 1, v_cp_tot, 'GBP',
            fp.incumbent, 50000, '2025-01-01', 'Incumbent contract pricing — cross-model family')
    RETURNING id INTO v_cp;

    INSERT INTO current_price_breakdown (current_price_header_id, cost_element, category, value, basis, sort_order)
    SELECT v_cp, el, cat, ROUND(base_sc * fp.sc_factor * fp.cp_uplift, 4), basis, sort
    FROM fam_lines WHERE fam = fp.fam ORDER BY sort;

    -- Quote 1 — Sterling Precision (UK)
    INSERT INTO supplier_quote_header (part_id, supplier_id, version, status, rfq_number, annual_volume, currency, total_price, validity_date, submitted_at, program_id)
    VALUES (v_part, v_sup1, 1, 'submitted', 'RFQ-CM-' || LPAD(v_n::TEXT, 3, '0'), 50000, 'GBP', v_q1_tot, '2026-12-31',
            NOW() - ((v_n * 3) || ' days')::INTERVAL, (SELECT id FROM vehicle_program WHERE code = fp.prog))
    RETURNING id INTO v_q;
    INSERT INTO supplier_quote_breakdown (supplier_quote_header_id, cost_element, category, value, basis, sort_order)
    SELECT v_q, el, cat, ROUND(base_sc * fp.sc_factor * 1.03, 4), basis, sort
    FROM fam_lines WHERE fam = fp.fam ORDER BY sort;

    -- Quote 2 — Mitra Auto (India)
    INSERT INTO supplier_quote_header (part_id, supplier_id, version, status, rfq_number, annual_volume, currency, total_price, validity_date, submitted_at, program_id)
    VALUES (v_part, v_sup2, 1, 'submitted', 'RFQ-CM-' || LPAD(v_n::TEXT, 3, '0'), 50000, 'GBP', v_q2_tot, '2026-12-31',
            NOW() - ((v_n * 2) || ' days')::INTERVAL, (SELECT id FROM vehicle_program WHERE code = fp.prog))
    RETURNING id INTO v_q;
    INSERT INTO supplier_quote_breakdown (supplier_quote_header_id, cost_element, category, value, basis, sort_order)
    SELECT v_q, el, cat, ROUND(base_sc * fp.sc_factor * 0.93, 4), basis, sort
    FROM fam_lines WHERE fam = fp.fam ORDER BY sort;

  END LOOP;

  RAISE NOTICE 'Cross-model families seeded: % members', v_n;
END $$;
