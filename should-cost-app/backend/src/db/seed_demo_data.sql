-- ============================================================
-- Seed: 10 Hand-Crafted Demo Parts — Full Three-Way Dataset
-- Each part has:
--   • Published Should-Cost  (detailed 2-level breakdown)
--   • Current Live Price     (incumbent supplier, where we overpay)
--   • 2 New Supplier Quotes  (Sterling Precision UK / Mitra Auto India)
-- Categories follow the cost-engineering template:
--   RAW_MATERIAL → BOP (purchased parts) → MANUFACTURING (process)
--   → OVERHEAD (factory OH + SG&A) → LOGISTICS → TOOLING → PROFIT
-- Runs AFTER seed_programs.sql (programs + hierarchy must exist)
-- ============================================================

INSERT INTO supplier (code, name, country, contact_name, contact_email) VALUES
  ('SUP-101', 'Sterling Precision Ltd.',  'United Kingdom', 'James Whitfield', 'j.whitfield@sterlingprecision.example'),
  ('SUP-102', 'Mitra Auto Industries',    'India',          'Ananya Mitra',    'ananya@mitraauto.example')
ON CONFLICT (code) DO NOTHING;

DO $$
DECLARE
  v_sup1     INTEGER;  -- Sterling Precision (UK)
  v_sup2     INTEGER;  -- Mitra Auto (India)
  v_part_id  INTEGER;
  v_sc_id    INTEGER;
  v_cp_id    INTEGER;
  v_q1_id    INTEGER;
  v_q2_id    INTEGER;
  p          RECORD;
  v_sc_tot   NUMERIC; v_cp_tot NUMERIC; v_q1_tot NUMERIC; v_q2_tot NUMERIC;
  v_n        INTEGER := 0;
BEGIN
  SELECT id INTO v_sup1 FROM supplier WHERE code = 'SUP-101';
  SELECT id INTO v_sup2 FROM supplier WHERE code = 'SUP-102';

  -- ── Part master data ──────────────────────────────────────────
  CREATE TEMP TABLE demo_parts (
    pn TEXT, descr TEXT, commodity TEXT, sys_code TEXT, prog_code TEXT,
    volume NUMERIC, incumbent TEXT
  ) ON COMMIT DROP;

  INSERT INTO demo_parts VALUES
    ('DPN-1001', 'Front Door Outer Panel (CR4 Steel)',          'Stampings',        'VB',  'SUV1',  60000, 'Heritage Manufacturing Co.'),
    ('BRK-2001', 'Front Brake Disc — Ventilated Cast Iron',     'Castings',         'BRK', 'SUV2', 120000, 'Global Auto Components Ltd.'),
    ('SEA-3001', 'Front Seat Frame Assembly',                   'Assemblies',       'SEA', 'SUV1',  60000, 'Precision Parts Inc.'),
    ('LMP-4001', 'LED Headlamp Assembly — LH',                  'Electronics',      'EXT', 'SUV3',  60000, 'TechParts GmbH'),
    ('HVC-5001', 'HVAC Blower Module',                          'Electro-Mech',     'THM', 'SUV2',  60000, 'Apex Automotive Supplies'),
    ('BAT-6001', 'Battery Cooling Plate — Brazed Aluminum',     'Thermal',          'BEV', 'SUV5',  40000, 'TechParts GmbH'),
    ('STK-7001', 'Steering Knuckle — Forged Aluminum 6082',     'Forgings',         'SUS', 'SUV4',  80000, 'Global Auto Components Ltd.'),
    ('EXH-8001', 'Exhaust Muffler Assembly — SS409',            'Fabrications',     'FES', 'SUV3',  50000, 'Heritage Manufacturing Co.'),
    ('IPN-9001', 'Instrument Panel Substrate — PP-LGF30',       'Injection Molding','INT', 'SUV1',  60000, 'Precision Parts Inc.'),
    ('WIR-1002', 'Floor Wiring Harness — Main Body',            'Electrical',       'EE',  'SUV5',  60000, 'Apex Automotive Supplies');

  -- ── Cost lines: sort, element, category, basis, SC, CurrentPrice, Quote1(Sterling), Quote2(Mitra) ──
  CREATE TEMP TABLE demo_lines (
    pn TEXT, sort INTEGER, el TEXT, cat TEXT, basis TEXT,
    sc NUMERIC, cp NUMERIC, q1 NUMERIC, q2 NUMERIC
  ) ON COMMIT DROP;

  INSERT INTO demo_lines VALUES
  -- ── 1. DPN-1001 Front Door Outer Panel — incumbent way off on process & overhead ──
  ('DPN-1001', 1,'Steel Coil CR4 (7.2 kg @ £0.92/kg)','RAW_MATERIAL','£/part', 6.62, 7.45, 6.80, 6.35),
  ('DPN-1001', 2,'Engineered Scrap & Offal (net)',    'RAW_MATERIAL','£/part', 0.95, 1.20, 1.00, 0.90),
  ('DPN-1001', 3,'Blanking Operation',                'MANUFACTURING','£/stroke',0.85, 1.15, 0.88, 0.74),
  ('DPN-1001', 4,'Draw Press Operation (2000T)',      'MANUFACTURING','£/stroke',1.45, 1.98, 1.50, 1.28),
  ('DPN-1001', 5,'Trim & Pierce Operation',           'MANUFACTURING','£/stroke',0.95, 1.30, 0.99, 0.85),
  ('DPN-1001', 6,'Flange & Hem Operation',            'MANUFACTURING','£/stroke',0.78, 1.05, 0.81, 0.70),
  ('DPN-1001', 7,'Mastic Pads & Sealant',             'BOP','£/set',           0.42, 0.55, 0.45, 0.40),
  ('DPN-1001', 8,'Reinforcement Bracket (purchased)', 'BOP','£/EA',            1.10, 1.32, 1.15, 1.02),
  ('DPN-1001', 9,'Factory Overhead',                  'OVERHEAD','% of process',1.62, 2.20, 1.70, 1.45),
  ('DPN-1001',10,'SG&A Markup',                       'OVERHEAD','% of cost',  0.98, 1.40, 1.05, 0.92),
  ('DPN-1001',11,'Returnable Packaging & Dunnage',    'LOGISTICS','£/part',    0.35, 0.52, 0.38, 0.45),
  ('DPN-1001',12,'Freight to Plant',                  'LOGISTICS','£/part',    0.48, 0.75, 0.42, 0.85),
  ('DPN-1001',13,'Tooling Amortisation (5-die line)', 'TOOLING','£/part',      0.55, 0.62, 0.58, 0.50),
  ('DPN-1001',14,'Profit Margin',                     'PROFIT','% of total',   0.92, 1.35, 1.00, 0.88),

  -- ── 2. BRK-2001 Front Brake Disc — moderate gap, machining is the lever ──
  ('BRK-2001', 1,'Grey Cast Iron GG20 (9.5 kg @ £0.55/kg)','RAW_MATERIAL','£/part',5.23, 5.60, 5.35, 5.05),
  ('BRK-2001', 2,'Melting & Casting (DISA line)',     'MANUFACTURING','£/part', 1.85, 2.10, 1.92, 1.70),
  ('BRK-2001', 3,'CNC Machining Op10/Op20',           'MANUFACTURING','£/part', 1.42, 1.78, 1.45, 1.25),
  ('BRK-2001', 4,'Balancing & Grinding',              'MANUFACTURING','£/part', 0.55, 0.72, 0.58, 0.50),
  ('BRK-2001', 5,'Anti-Corrosion Coating (Geomet)',   'MANUFACTURING','£/part', 0.38, 0.52, 0.40, 0.36),
  ('BRK-2001', 6,'Wheel Studs & Hardware',            'BOP','£/set',            0.65, 0.78, 0.68, 0.60),
  ('BRK-2001', 7,'Factory Overhead',                  'OVERHEAD','% of process',1.05, 1.32, 1.10, 0.95),
  ('BRK-2001', 8,'SG&A Markup',                       'OVERHEAD','% of cost',   0.62, 0.85, 0.66, 0.58),
  ('BRK-2001', 9,'Packaging (palletised)',            'LOGISTICS','£/part',     0.22, 0.30, 0.24, 0.28),
  ('BRK-2001',10,'Freight to Plant',                  'LOGISTICS','£/part',     0.35, 0.48, 0.30, 0.55),
  ('BRK-2001',11,'Pattern & Tooling Amortisation',    'TOOLING','£/part',       0.18, 0.22, 0.20, 0.16),
  ('BRK-2001',12,'Profit Margin',                     'PROFIT','% of total',    0.68, 0.92, 0.72, 0.62),

  -- ── 3. SEA-3001 Front Seat Frame — BOP-heavy, recliner & track are the levers ──
  ('SEA-3001', 1,'HSLA Steel Tube & Stampings (8.4 kg)','RAW_MATERIAL','£/part',7.90, 8.60, 8.05, 7.45),
  ('SEA-3001', 2,'Tube Bending & Forming',            'MANUFACTURING','£/part', 1.25, 1.55, 1.28, 1.10),
  ('SEA-3001', 3,'Robotic MIG Welding (32 joints)',   'MANUFACTURING','£/part', 2.85, 3.65, 2.95, 2.45),
  ('SEA-3001', 4,'E-Coat & Powder Coat',              'MANUFACTURING','£/part', 0.95, 1.18, 0.99, 0.88),
  ('SEA-3001', 5,'Recliner Mechanism (purchased)',    'BOP','£/EA',             6.50, 7.20, 6.65, 6.30),
  ('SEA-3001', 6,'Seat Track Assembly (purchased)',   'BOP','£/EA',             4.20, 4.85, 4.35, 4.05),
  ('SEA-3001', 7,'Fasteners & Clips',                 'BOP','£/set',            0.85, 0.98, 0.88, 0.78),
  ('SEA-3001', 8,'Factory Overhead',                  'OVERHEAD','% of process',1.95, 2.55, 2.05, 1.75),
  ('SEA-3001', 9,'SG&A Markup',                       'OVERHEAD','% of cost',   1.30, 1.78, 1.38, 1.22),
  ('SEA-3001',10,'Packaging (steel stillages)',       'LOGISTICS','£/part',     0.55, 0.72, 0.58, 0.62),
  ('SEA-3001',11,'Freight to Plant',                  'LOGISTICS','£/part',     0.75, 1.05, 0.65, 1.15),
  ('SEA-3001',12,'Tooling & Welding Fixtures',        'TOOLING','£/part',       0.85, 0.95, 0.88, 0.80),
  ('SEA-3001',13,'Profit Margin',                     'PROFIT','% of total',    1.55, 2.10, 1.65, 1.45),

  -- ── 4. LMP-4001 LED Headlamp — electronics BOP dominates, big SG&A gap ──
  ('LMP-4001', 1,'PC Lens & PP Housing Resin',        'RAW_MATERIAL','£/part',  3.85, 4.20, 3.95, 3.60),
  ('LMP-4001', 2,'Injection Molding (lens + housing)','MANUFACTURING','£/part', 2.45, 3.05, 2.52, 2.20),
  ('LMP-4001', 3,'Metallization & Hard Coating',      'MANUFACTURING','£/part', 1.65, 2.10, 1.72, 1.50),
  ('LMP-4001', 4,'Assembly & Aim Test (EOL)',         'MANUFACTURING','£/part', 1.95, 2.45, 2.02, 1.70),
  ('LMP-4001', 5,'LED Module & Driver PCB',           'BOP','£/EA',            14.50,16.80,14.95,13.80),
  ('LMP-4001', 6,'Wiring Pigtail & Connectors',       'BOP','£/set',            1.85, 2.15, 1.92, 1.70),
  ('LMP-4001', 7,'Adjusters & Mounting Brackets',     'BOP','£/set',            1.25, 1.45, 1.30, 1.15),
  ('LMP-4001', 8,'Factory Overhead',                  'OVERHEAD','% of process',2.10, 2.70, 2.20, 1.90),
  ('LMP-4001', 9,'SG&A Markup',                       'OVERHEAD','% of cost',   1.55, 2.05, 1.65, 1.45),
  ('LMP-4001',10,'Protective Packaging',              'LOGISTICS','£/part',     0.65, 0.85, 0.68, 0.75),
  ('LMP-4001',11,'Freight to Plant',                  'LOGISTICS','£/part',     0.85, 1.15, 0.72, 1.30),
  ('LMP-4001',12,'Tooling Amortisation',              'TOOLING','£/part',       1.15, 1.30, 1.20, 1.05),
  ('LMP-4001',13,'Profit Margin',                     'PROFIT','% of total',    2.05, 2.85, 2.18, 1.92),

  -- ── 5. HVC-5001 HVAC Blower Module — motor purchase price is the lever ──
  ('HVC-5001', 1,'PP-GF20 Housing Resin (1.1 kg)',    'RAW_MATERIAL','£/part',  1.45, 1.60, 1.50, 1.35),
  ('HVC-5001', 2,'Injection Molding Housing',         'MANUFACTURING','£/part', 0.95, 1.18, 0.98, 0.85),
  ('HVC-5001', 3,'Final Assembly & EOL Test',         'MANUFACTURING','£/part', 0.85, 1.10, 0.88, 0.75),
  ('HVC-5001', 4,'BLDC Blower Motor (purchased)',     'BOP','£/EA',             6.80, 7.85, 7.00, 6.45),
  ('HVC-5001', 5,'Control Module PCB',                'BOP','£/EA',             3.20, 3.70, 3.30, 3.00),
  ('HVC-5001', 6,'Cage Fan & Hardware',               'BOP','£/set',            1.15, 1.32, 1.20, 1.05),
  ('HVC-5001', 7,'Factory Overhead',                  'OVERHEAD','% of process',0.85, 1.08, 0.90, 0.78),
  ('HVC-5001', 8,'SG&A Markup',                       'OVERHEAD','% of cost',   0.65, 0.88, 0.70, 0.60),
  ('HVC-5001', 9,'Packaging',                         'LOGISTICS','£/part',     0.28, 0.38, 0.30, 0.34),
  ('HVC-5001',10,'Freight to Plant',                  'LOGISTICS','£/part',     0.42, 0.58, 0.36, 0.62),
  ('HVC-5001',11,'Tooling Amortisation',              'TOOLING','£/part',       0.35, 0.40, 0.38, 0.32),
  ('HVC-5001',12,'Profit Margin',                     'PROFIT','% of total',    0.92, 1.25, 0.98, 0.85),

  -- ── 6. BAT-6001 Battery Cooling Plate — brazing process gap, BEV part ──
  ('BAT-6001', 1,'Aluminum 3003 Brazing Sheet (4.8 kg)','RAW_MATERIAL','£/part',9.12, 9.85, 9.30, 8.70),
  ('BAT-6001', 2,'Stamping & Forming Channels',       'MANUFACTURING','£/part', 1.35, 1.72, 1.40, 1.20),
  ('BAT-6001', 3,'Vacuum Brazing (CAB furnace)',      'MANUFACTURING','£/part', 2.85, 3.70, 2.95, 2.50),
  ('BAT-6001', 4,'Helium Leak Test & Flushing',       'MANUFACTURING','£/part', 0.95, 1.25, 0.98, 0.85),
  ('BAT-6001', 5,'Inlet/Outlet Fittings (purchased)', 'BOP','£/set',            1.65, 1.92, 1.70, 1.55),
  ('BAT-6001', 6,'Factory Overhead',                  'OVERHEAD','% of process',1.45, 1.90, 1.52, 1.30),
  ('BAT-6001', 7,'SG&A Markup',                       'OVERHEAD','% of cost',   0.95, 1.32, 1.02, 0.90),
  ('BAT-6001', 8,'Clean-Room Packaging',              'LOGISTICS','£/part',     0.45, 0.60, 0.48, 0.52),
  ('BAT-6001', 9,'Freight to Plant',                  'LOGISTICS','£/part',     0.58, 0.82, 0.50, 0.88),
  ('BAT-6001',10,'Tooling Amortisation',              'TOOLING','£/part',       0.65, 0.75, 0.68, 0.60),
  ('BAT-6001',11,'Profit Margin',                     'PROFIT','% of total',    1.25, 1.70, 1.32, 1.15),

  -- ── 7. STK-7001 Steering Knuckle — forging & machining levers ──
  ('STK-7001', 1,'Aluminum 6082 Billet (3.6 kg @ £2.00/kg)','RAW_MATERIAL','£/part',7.20, 7.90, 7.35, 6.80),
  ('STK-7001', 2,'Forging — 3-Stage Press Line',      'MANUFACTURING','£/part', 2.45, 3.10, 2.52, 2.15),
  ('STK-7001', 3,'Heat Treatment T6',                 'MANUFACTURING','£/part', 0.95, 1.22, 0.98, 0.85),
  ('STK-7001', 4,'CNC Machining (5-axis)',            'MANUFACTURING','£/part', 2.85, 3.55, 2.92, 2.50),
  ('STK-7001', 5,'Bushings & Bearing Race (purchased)','BOP','£/set',           1.45, 1.68, 1.50, 1.35),
  ('STK-7001', 6,'Factory Overhead',                  'OVERHEAD','% of process',1.55, 2.00, 1.62, 1.40),
  ('STK-7001', 7,'SG&A Markup',                       'OVERHEAD','% of cost',   1.05, 1.42, 1.12, 0.98),
  ('STK-7001', 8,'Packaging',                         'LOGISTICS','£/part',     0.32, 0.42, 0.34, 0.38),
  ('STK-7001', 9,'Freight to Plant',                  'LOGISTICS','£/part',     0.48, 0.65, 0.42, 0.72),
  ('STK-7001',10,'Forge Die Amortisation',            'TOOLING','£/part',       0.75, 0.85, 0.78, 0.68),
  ('STK-7001',11,'Profit Margin',                     'PROFIT','% of total',    1.15, 1.55, 1.22, 1.05),

  -- ── 8. EXH-8001 Exhaust Muffler — welding & freight levers ──
  ('EXH-8001', 1,'SS409 Tube & Sheet (6.2 kg)',       'RAW_MATERIAL','£/part',  6.45, 7.05, 6.60, 6.10),
  ('EXH-8001', 2,'Tube Bending & End Forming',        'MANUFACTURING','£/part', 0.95, 1.25, 0.98, 0.85),
  ('EXH-8001', 3,'Shell Rolling & Lock Seam',         'MANUFACTURING','£/part', 0.85, 1.12, 0.88, 0.75),
  ('EXH-8001', 4,'Robotic TIG/MIG Welding',           'MANUFACTURING','£/part', 1.85, 2.45, 1.92, 1.62),
  ('EXH-8001', 5,'Internal Baffles & Glass Wool',     'BOP','£/set',            1.95, 2.25, 2.02, 1.82),
  ('EXH-8001', 6,'Hangers & Clamps (purchased)',      'BOP','£/set',            0.85, 0.98, 0.88, 0.78),
  ('EXH-8001', 7,'Factory Overhead',                  'OVERHEAD','% of process',1.15, 1.50, 1.20, 1.02),
  ('EXH-8001', 8,'SG&A Markup',                       'OVERHEAD','% of cost',   0.78, 1.08, 0.84, 0.72),
  ('EXH-8001', 9,'Packaging',                         'LOGISTICS','£/part',     0.38, 0.50, 0.40, 0.45),
  ('EXH-8001',10,'Freight to Plant (bulky)',          'LOGISTICS','£/part',     0.95, 1.35, 0.82, 1.45),
  ('EXH-8001',11,'Tooling Amortisation',              'TOOLING','£/part',       0.45, 0.52, 0.48, 0.42),
  ('EXH-8001',12,'Profit Margin',                     'PROFIT','% of total',    0.95, 1.30, 1.02, 0.88),

  -- ── 9. IPN-9001 Instrument Panel Substrate — molding press rate & freight ──
  ('IPN-9001', 1,'PP-LGF30 Resin (4.2 kg @ £1.50/kg)','RAW_MATERIAL','£/part',  6.30, 6.90, 6.45, 5.95),
  ('IPN-9001', 2,'Injection Molding (3200T press)',   'MANUFACTURING','£/part', 2.95, 3.80, 3.05, 2.60),
  ('IPN-9001', 3,'Vibration Welding Ducts',           'MANUFACTURING','£/part', 0.85, 1.10, 0.88, 0.75),
  ('IPN-9001', 4,'Punch, Deflash & Flame Treat',      'MANUFACTURING','£/part', 0.55, 0.72, 0.58, 0.48),
  ('IPN-9001', 5,'Metal Reinforcement Brackets',      'BOP','£/set',            1.45, 1.65, 1.50, 1.35),
  ('IPN-9001', 6,'Clips & Fasteners',                 'BOP','£/set',            0.55, 0.65, 0.58, 0.50),
  ('IPN-9001', 7,'Factory Overhead',                  'OVERHEAD','% of process',1.35, 1.78, 1.42, 1.22),
  ('IPN-9001', 8,'SG&A Markup',                       'OVERHEAD','% of cost',   0.90, 1.25, 0.96, 0.84),
  ('IPN-9001', 9,'Custom Rack Packaging',             'LOGISTICS','£/part',     0.65, 0.88, 0.68, 0.78),
  ('IPN-9001',10,'Freight to Plant (volumetric)',     'LOGISTICS','£/part',     1.05, 1.48, 0.90, 1.58),
  ('IPN-9001',11,'Tooling Amortisation (3200T tool)', 'TOOLING','£/part',       1.25, 1.40, 1.30, 1.15),
  ('IPN-9001',12,'Profit Margin',                     'PROFIT','% of total',    1.10, 1.52, 1.18, 1.02),

  -- ── 10. WIR-1002 Floor Wiring Harness — labour-intensive, India strong ──
  ('WIR-1002', 1,'Copper Wire & Cable (1.85 kg Cu)',  'RAW_MATERIAL','£/part',  8.95, 9.80, 9.15, 8.40),
  ('WIR-1002', 2,'Cutting & Crimping (automated)',    'MANUFACTURING','£/part', 1.45, 1.85, 1.50, 1.25),
  ('WIR-1002', 3,'Layout Board Assembly (manual)',    'MANUFACTURING','£/part', 3.85, 4.95, 3.95, 3.20),
  ('WIR-1002', 4,'Electrical Test & QC',              'MANUFACTURING','£/part', 0.65, 0.85, 0.68, 0.55),
  ('WIR-1002', 5,'Connectors & Terminals (purchased)','BOP','£/set',            4.85, 5.55, 5.00, 4.60),
  ('WIR-1002', 6,'Tapes, Conduits & Grommets',        'BOP','£/set',            1.25, 1.45, 1.30, 1.15),
  ('WIR-1002', 7,'Factory Overhead',                  'OVERHEAD','% of process',1.65, 2.15, 1.72, 1.45),
  ('WIR-1002', 8,'SG&A Markup',                       'OVERHEAD','% of cost',   1.15, 1.58, 1.22, 1.05),
  ('WIR-1002', 9,'Packaging',                         'LOGISTICS','£/part',     0.42, 0.55, 0.44, 0.48),
  ('WIR-1002',10,'Freight to Plant',                  'LOGISTICS','£/part',     0.65, 0.90, 0.56, 0.95),
  ('WIR-1002',11,'Layout Boards & Jigs Amortisation', 'TOOLING','£/part',       0.35, 0.40, 0.38, 0.30),
  ('WIR-1002',12,'Profit Margin',                     'PROFIT','% of total',    1.30, 1.78, 1.38, 1.18);

  -- ── Loop: create part + SC + current price + 2 quotes ─────────
  FOR p IN SELECT * FROM demo_parts LOOP
    v_n := v_n + 1;

    -- Skip if this demo part already exists (idempotent re-runs)
    SELECT id INTO v_part_id FROM part_master WHERE part_number = p.pn;
    IF v_part_id IS NOT NULL THEN CONTINUE; END IF;

    INSERT INTO part_master (part_number, description, uom, commodity, drawing_rev, system_id, program_id)
    VALUES (
      p.pn, p.descr, 'EA', p.commodity, 'B',
      (SELECT id FROM vehicle_system  WHERE code = p.sys_code),
      (SELECT id FROM vehicle_program WHERE code = p.prog_code)
    )
    RETURNING id INTO v_part_id;

    SELECT SUM(sc), SUM(cp), SUM(q1), SUM(q2)
    INTO   v_sc_tot, v_cp_tot, v_q1_tot, v_q2_tot
    FROM   demo_lines WHERE pn = p.pn;

    -- 1) Should-Cost (published)
    INSERT INTO should_cost_header
      (part_id, version, status, annual_volume, currency, total_cost, notes, program_id)
    VALUES
      (v_part_id, 1, 'published', p.volume, 'GBP', v_sc_tot,
       'Bottom-up should-cost model — validated cycle times, regional labour & energy rates, LME/commodity indices',
       (SELECT id FROM vehicle_program WHERE code = p.prog_code))
    RETURNING id INTO v_sc_id;

    INSERT INTO should_cost_breakdown (should_cost_header_id, cost_element, category, value, basis, sort_order)
    SELECT v_sc_id, el, cat, sc, basis, sort FROM demo_lines WHERE pn = p.pn ORDER BY sort;

    -- 2) Current Live Price (incumbent)
    INSERT INTO current_price_header
      (part_id, program_id, version, total_cost, currency, supplier_name, annual_volume, effective_date, notes)
    VALUES
      (v_part_id,
       (SELECT id FROM vehicle_program WHERE code = p.prog_code),
       1, v_cp_tot, 'GBP', p.incumbent, p.volume, '2025-01-01',
       'Incumbent contract pricing — FY2025/26, annual LTA without indexation')
    RETURNING id INTO v_cp_id;

    INSERT INTO current_price_breakdown (current_price_header_id, cost_element, category, value, basis, sort_order)
    SELECT v_cp_id, el, cat, cp, basis, sort FROM demo_lines WHERE pn = p.pn ORDER BY sort;

    -- 3) Quote — Sterling Precision Ltd. (UK)
    INSERT INTO supplier_quote_header
      (part_id, supplier_id, version, status, rfq_number, annual_volume, currency,
       total_price, validity_date, submitted_at, program_id)
    VALUES
      (v_part_id, v_sup1, 1,
       CASE WHEN v_n % 3 = 0 THEN 'negotiating' ELSE 'submitted' END,
       'RFQ-2026-' || LPAD(v_n::TEXT, 3, '0'),
       p.volume, 'GBP', v_q1_tot, '2026-12-31',
       NOW() - ((v_n * 4) || ' days')::INTERVAL,
       (SELECT id FROM vehicle_program WHERE code = p.prog_code))
    RETURNING id INTO v_q1_id;

    INSERT INTO supplier_quote_breakdown (supplier_quote_header_id, cost_element, category, value, basis, sort_order)
    SELECT v_q1_id, el, cat, q1, basis, sort FROM demo_lines WHERE pn = p.pn ORDER BY sort;

    -- 4) Quote — Mitra Auto Industries (India)
    INSERT INTO supplier_quote_header
      (part_id, supplier_id, version, status, rfq_number, annual_volume, currency,
       total_price, validity_date, submitted_at, program_id)
    VALUES
      (v_part_id, v_sup2, 1,
       CASE WHEN v_n % 4 = 0 THEN 'negotiating' ELSE 'submitted' END,
       'RFQ-2026-' || LPAD(v_n::TEXT, 3, '0'),
       p.volume, 'GBP', v_q2_tot, '2026-12-31',
       NOW() - ((v_n * 2) || ' days')::INTERVAL,
       (SELECT id FROM vehicle_program WHERE code = p.prog_code))
    RETURNING id INTO v_q2_id;

    INSERT INTO supplier_quote_breakdown (supplier_quote_header_id, cost_element, category, value, basis, sort_order)
    SELECT v_q2_id, el, cat, q2, basis, sort FROM demo_lines WHERE pn = p.pn ORDER BY sort;

  END LOOP;

  RAISE NOTICE 'Demo dataset: % parts, each with SC + current price + 2 supplier quotes', v_n;
END $$;
