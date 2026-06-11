-- ============================================================
-- Seed: 10 Demo Supplier Quotes (5 parts × 2 suppliers each)
-- Run after seed_programs.sql
-- ============================================================

-- Add more supplier companies
INSERT INTO supplier (code, name, country, contact_name, contact_email) VALUES
  ('SUP-003', 'Precision Parts Ltd.',        'India',         'Vikram Nair',    'vikram@precisionparts.example'),
  ('SUP-004', 'Continental Components GmbH', 'Germany',       'Hans Müller',    'hans@continental.example'),
  ('SUP-005', 'Apex Auto Supplies Co.',      'China',         'Liu Wei',        'liu@apexautosupply.example')
ON CONFLICT (code) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- 10 quotes: 2 competing suppliers on each of the first 5 published-SC parts
-- SUP-001 = incumbent-level pricing (8–17 % above SC)
-- SUP-003 = new competitive entrant  (4–9 %  above SC)
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_part    RECORD;
  v_sc      RECORD;
  v_sup1    INTEGER;
  v_sup2    INTEGER;
  v_q1_id   INTEGER;
  v_q2_id   INTEGER;
  v_n       INTEGER := 0;
  v_status1 VARCHAR(30);
  v_status2 VARCHAR(30);
  v_mult1   NUMERIC;
  v_mult2   NUMERIC;
BEGIN
  SELECT id INTO v_sup1 FROM supplier WHERE code = 'SUP-001';
  SELECT id INTO v_sup2 FROM supplier WHERE code = 'SUP-003';

  FOR v_part IN
    SELECT pm.id AS part_id, pm.part_number
    FROM   part_master pm
    WHERE  EXISTS (
             SELECT 1 FROM should_cost_header
             WHERE  part_id = pm.id AND status = 'published'
           )
    ORDER BY pm.id
    LIMIT 5
  LOOP
    v_n := v_n + 1;

    -- Fetch latest published SC for this part
    SELECT sch.id AS sc_id, sch.total_cost AS sc_total, sch.annual_volume
    INTO   v_sc
    FROM   should_cost_header sch
    WHERE  sch.part_id = v_part.part_id AND sch.status = 'published'
    ORDER BY sch.version DESC
    LIMIT  1;

    -- Inflation multipliers vary per slot for realistic data spread
    v_mult1  := ROUND((1.08 + (v_n % 4) * 0.03)::NUMERIC, 4);   -- 8, 11, 14, 17, 8 % above SC
    v_mult2  := ROUND((1.04 + (v_n % 3) * 0.025)::NUMERIC, 4);  -- 4,  6.5, 9, 4, 6.5 % above SC

    -- Status variety to make the demo interesting
    v_status1 := CASE v_n
                   WHEN 1 THEN 'negotiating'
                   WHEN 3 THEN 'accepted'
                   ELSE        'submitted'
                 END;
    v_status2 := CASE v_n
                   WHEN 2 THEN 'negotiating'
                   ELSE        'submitted'
                 END;

    -- ── Quote 1 — SUP-001 (Acme Precision Parts) ──────────────────────────
    INSERT INTO supplier_quote_header
      (part_id, supplier_id, version, status, rfq_number,
       annual_volume, currency, total_price, validity_date, submitted_at)
    VALUES (
      v_part.part_id, v_sup1, 1, v_status1,
      'RFQ-2024-' || LPAD(v_n::TEXT, 3, '0'),
      COALESCE(v_sc.annual_volume, 10000), 'GBP',
      ROUND(v_sc.sc_total * v_mult1, 4),
      '2025-06-30',
      NOW() - ((v_n * 7) || ' days')::INTERVAL
    )
    ON CONFLICT (part_id, supplier_id, version) DO NOTHING
    RETURNING id INTO v_q1_id;

    IF v_q1_id IS NOT NULL THEN
      INSERT INTO supplier_quote_breakdown
        (supplier_quote_header_id, cost_element, category, value, basis, sort_order)
      SELECT
        v_q1_id,
        scb.cost_element,
        CASE scb.category
          WHEN 'material'  THEN 'RAW_MATERIAL'
          WHEN 'labor'     THEN 'MANUFACTURING'
          WHEN 'overhead'  THEN 'OVERHEAD'
          WHEN 'logistics' THEN 'LOGISTICS'
          WHEN 'profit'    THEN 'PROFIT'
          WHEN 'tooling'   THEN 'TOOLING'
          ELSE UPPER(scb.category)
        END,
        -- slightly different margin per element to look realistic
        ROUND(scb.value * (v_mult1 + (scb.sort_order % 3) * 0.01), 4),
        scb.basis,
        scb.sort_order
      FROM should_cost_breakdown scb
      WHERE scb.should_cost_header_id = v_sc.sc_id;
    END IF;

    -- ── Quote 2 — SUP-003 (Precision Parts Ltd.) ──────────────────────────
    INSERT INTO supplier_quote_header
      (part_id, supplier_id, version, status, rfq_number,
       annual_volume, currency, total_price, validity_date, submitted_at)
    VALUES (
      v_part.part_id, v_sup2, 1, v_status2,
      'RFQ-2024-' || LPAD(v_n::TEXT, 3, '0'),
      COALESCE(v_sc.annual_volume, 10000), 'GBP',
      ROUND(v_sc.sc_total * v_mult2, 4),
      '2025-09-30',
      NOW() - ((v_n * 3) || ' days')::INTERVAL
    )
    ON CONFLICT (part_id, supplier_id, version) DO NOTHING
    RETURNING id INTO v_q2_id;

    IF v_q2_id IS NOT NULL THEN
      INSERT INTO supplier_quote_breakdown
        (supplier_quote_header_id, cost_element, category, value, basis, sort_order)
      SELECT
        v_q2_id,
        scb.cost_element,
        CASE scb.category
          WHEN 'material'  THEN 'RAW_MATERIAL'
          WHEN 'labor'     THEN 'MANUFACTURING'
          WHEN 'overhead'  THEN 'OVERHEAD'
          WHEN 'logistics' THEN 'LOGISTICS'
          WHEN 'profit'    THEN 'PROFIT'
          WHEN 'tooling'   THEN 'TOOLING'
          ELSE UPPER(scb.category)
        END,
        -- competitive entrant is sharper on material & labor, margin on profit
        ROUND(scb.value * (v_mult2 - (scb.sort_order % 2) * 0.005), 4),
        scb.basis,
        scb.sort_order
      FROM should_cost_breakdown scb
      WHERE scb.should_cost_header_id = v_sc.sc_id;
    END IF;

  END LOOP;

  RAISE NOTICE 'Demo quotes seeded: % parts × 2 suppliers = % quotes', v_n, v_n * 2;
END $$;
