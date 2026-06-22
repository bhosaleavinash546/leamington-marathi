-- ============================================================
-- Comprehensive Demo Seed — CostLens
-- Populates ALL features with realistic automotive data:
--   Suppliers, Parts, Should-Costs, Quotes, Comparisons,
--   Negotiations, Commodity Prices, ACR Targets,
--   Assembly BOMs, CER Accuracy Logs
-- All statements idempotent (ON CONFLICT DO NOTHING / guards).
-- Run AFTER schema_v6–v9 have been applied.
-- ============================================================

-- ============================================================
-- 1. ADDITIONAL SUPPLIERS
-- ============================================================
INSERT INTO supplier (code, name, country, contact_name, contact_email) VALUES
  ('SUP-103', 'Bharat Forge Limited',        'India',          'Rajiv Sharma',       'r.sharma@bharatforge.example'),
  ('SUP-104', 'Motherson Sumi Systems',       'India',          'Priya Nair',         'p.nair@mothersonsumi.example'),
  ('SUP-105', 'Endurance Technologies Ltd',   'India',          'Suresh Patil',       's.patil@endurance.example'),
  ('SUP-106', 'Minda Industries Ltd',         'India',          'Kiran Mehta',        'k.mehta@minda.example'),
  ('SUP-107', 'Precision Stampings Ltd',      'India',          'Arun Desai',         'a.desai@precisionstampings.example'),
  ('SUP-108', 'Continental Automotive GmbH',  'Germany',        'Hans Weber',         'h.weber@continental.example'),
  ('SUP-109', 'Tata AutoComp Systems',        'India',          'Vikram Joshi',       'v.joshi@tataAutocomp.example')
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 2. NEW PARTS + SHOULD-COSTS + QUOTES (DO $$ block)
-- ============================================================
DO $$
DECLARE
  v_sup103 INTEGER; v_sup104 INTEGER; v_sup105 INTEGER;
  v_sup106 INTEGER; v_sup107 INTEGER; v_sup101 INTEGER; v_sup102 INTEGER;
  v_part   INTEGER; v_sc     INTEGER; v_q1     INTEGER; v_q2     INTEGER;
  v_prog   INTEGER;
  v_user   UUID;
BEGIN
  SELECT id INTO v_sup101 FROM supplier WHERE code = 'SUP-101';
  SELECT id INTO v_sup102 FROM supplier WHERE code = 'SUP-102';
  SELECT id INTO v_sup103 FROM supplier WHERE code = 'SUP-103';
  SELECT id INTO v_sup104 FROM supplier WHERE code = 'SUP-104';
  SELECT id INTO v_sup105 FROM supplier WHERE code = 'SUP-105';
  SELECT id INTO v_sup106 FROM supplier WHERE code = 'SUP-106';
  SELECT id INTO v_sup107 FROM supplier WHERE code = 'SUP-107';
  SELECT id FROM vehicle_program WHERE code = 'SUV1' INTO v_prog;
  SELECT id FROM "user" WHERE email = 'avinash.bhosale@costlens.io' INTO v_user;

  -- ── PART 1: Front Shock Absorber Bracket (Stamped Steel) ──────────
  IF NOT EXISTS (SELECT 1 FROM part_master WHERE part_number = 'BRK-SHK-001') THEN
    INSERT INTO part_master (part_number, description, uom, commodity, drawing_rev, program_id, family_code, family_name)
    VALUES ('BRK-SHK-001','Front Shock Absorber Mounting Bracket','EA','Stampings','C',
            (SELECT id FROM vehicle_program WHERE code='SUV1'),'FAM-BRK','Suspension Brackets')
    RETURNING id INTO v_part;

    INSERT INTO should_cost_header (part_id,version,status,annual_volume,currency,total_cost,notes,program_id,
      part_weight_kg,material_code,manufacturing_country,machine_type,cycle_time_sec,
      labour_rate_hr,machine_rate_hr,scrap_rate_pct,tooling_cost_total,tooling_life_units,created_by)
    VALUES (v_part,1,'published',80000,'GBP',8.42,
      'Parametric model — CR4 steel 2.5mm gauge, progressive die stamping, e-coat finish',
      (SELECT id FROM vehicle_program WHERE code='SUV1'),
      1.85,'STL-CR4','India','Progressive Die Press',18,
      4.50,12.00,3.5,45000,200000,v_user)
    RETURNING id INTO v_sc;

    INSERT INTO should_cost_breakdown (should_cost_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_sc,'CR4 Steel Coil (1.85 kg @ £0.88/kg)','RAW_MATERIAL',1.85,'£/part weight × commodity price',1),
      (v_sc,'Scrap & Offal Allowance (3.5%)','RAW_MATERIAL',0.28,'Material cost × scrap rate',2),
      (v_sc,'Progressive Die Stamping','MANUFACTURING',2.15,'Press rate £12/hr × 18s cycle',3),
      (v_sc,'Pierce & Trim Secondary Op','MANUFACTURING',0.65,'Secondary press £10/hr × 12s',4),
      (v_sc,'E-Coat Surface Treatment','MANUFACTURING',0.55,'£0.55/part bath processing',5),
      (v_sc,'Factory Overhead (32%)','OVERHEAD',1.08,'% of conversion cost',6),
      (v_sc,'SG&A (12%)','OVERHEAD',0.58,'% of total cost',7),
      (v_sc,'Packaging & Dunnage','LOGISTICS',0.28,'Returnable tray amortisation',8),
      (v_sc,'Freight to Plant','LOGISTICS',0.35,'Road freight £/part India-to-plant',9),
      (v_sc,'Tooling Amortisation','TOOLING',0.28,'£45k ÷ 200k units',10),
      (v_sc,'Profit Margin (5%)','PROFIT',0.37,'5% of total cost',11);

    -- Quote from Precision Stampings (India)
    INSERT INTO supplier_quote_header (part_id,supplier_id,version,status,rfq_number,annual_volume,currency,total_price,validity_date,submitted_at,program_id)
    VALUES (v_part,v_sup107,1,'submitted','RFQ-2025-SHK-001',80000,'GBP',9.85,'2026-06-30',NOW()-'15 days'::INTERVAL,
            (SELECT id FROM vehicle_program WHERE code='SUV1'))
    RETURNING id INTO v_q1;
    INSERT INTO supplier_quote_breakdown (supplier_quote_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_q1,'CR4 Steel Coil','RAW_MATERIAL',2.05,'£/part',1),(v_q1,'Scrap Allowance','RAW_MATERIAL',0.35,'£/part',2),
      (v_q1,'Stamping Operations','MANUFACTURING',2.55,'£/part',3),(v_q1,'Secondary Operations','MANUFACTURING',0.82,'£/part',4),
      (v_q1,'Surface Treatment','MANUFACTURING',0.68,'£/part',5),(v_q1,'Factory Overhead','OVERHEAD',1.38,'£/part',6),
      (v_q1,'SG&A','OVERHEAD',0.75,'£/part',7),(v_q1,'Packaging','LOGISTICS',0.38,'£/part',8),
      (v_q1,'Freight','LOGISTICS',0.45,'£/part',9),(v_q1,'Tooling Amortisation','TOOLING',0.34,'£/part',10),
      (v_q1,'Profit Margin','PROFIT',0.10,'£/part',11);

    -- Quote from Mitra Auto (India) - more competitive
    INSERT INTO supplier_quote_header (part_id,supplier_id,version,status,rfq_number,annual_volume,currency,total_price,validity_date,submitted_at,program_id)
    VALUES (v_part,v_sup102,1,'negotiating','RFQ-2025-SHK-001',80000,'GBP',9.12,'2026-06-30',NOW()-'8 days'::INTERVAL,
            (SELECT id FROM vehicle_program WHERE code='SUV1'))
    RETURNING id INTO v_q2;
    INSERT INTO supplier_quote_breakdown (supplier_quote_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_q2,'CR4 Steel Coil','RAW_MATERIAL',1.92,'£/part',1),(v_q2,'Scrap Allowance','RAW_MATERIAL',0.30,'£/part',2),
      (v_q2,'Stamping Operations','MANUFACTURING',2.35,'£/part',3),(v_q2,'Secondary Operations','MANUFACTURING',0.72,'£/part',4),
      (v_q2,'Surface Treatment','MANUFACTURING',0.62,'£/part',5),(v_q2,'Factory Overhead','OVERHEAD',1.25,'£/part',6),
      (v_q2,'SG&A','OVERHEAD',0.68,'£/part',7),(v_q2,'Packaging','LOGISTICS',0.35,'£/part',8),
      (v_q2,'Freight','LOGISTICS',0.52,'£/part',9),(v_q2,'Tooling Amortisation','TOOLING',0.32,'£/part',10),
      (v_q2,'Profit Margin','PROFIT',0.09,'£/part',11);
  END IF;

  -- ── PART 2: Gearbox Side Cover (Die Cast Aluminium) ──────────────
  IF NOT EXISTS (SELECT 1 FROM part_master WHERE part_number = 'GBX-COV-002') THEN
    INSERT INTO part_master (part_number, description, uom, commodity, drawing_rev, program_id, family_code, family_name)
    VALUES ('GBX-COV-002','Gearbox Side Cover — ADC12 Die Cast','EA','Castings','B',
            (SELECT id FROM vehicle_program WHERE code='SUV2'),'FAM-GBX','Gearbox Housings')
    RETURNING id INTO v_part;

    INSERT INTO should_cost_header (part_id,version,status,annual_volume,currency,total_cost,notes,program_id,
      part_weight_kg,material_code,manufacturing_country,machine_type,cycle_time_sec,
      labour_rate_hr,machine_rate_hr,scrap_rate_pct,tooling_cost_total,tooling_life_units,created_by)
    VALUES (v_part,1,'published',50000,'GBP',22.65,
      'HPDC ADC12 — 320T HPDC machine, 3 CNC ops post-cast, leak tested',
      (SELECT id FROM vehicle_program WHERE code='SUV2'),
      3.20,'ALU-ADC12','India','HPDC 320T + CNC Machining',95,
      5.50,28.00,4.0,120000,150000,v_user)
    RETURNING id INTO v_sc;

    INSERT INTO should_cost_breakdown (should_cost_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_sc,'ADC12 Aluminium Alloy (3.2 kg @ £1.92/kg)','RAW_MATERIAL',6.86,'LME Al + alloy premium',1),
      (v_sc,'Scrap & Runner System (4%)','RAW_MATERIAL',0.92,'Shot weight - part weight',2),
      (v_sc,'HPDC Die Casting (95s cycle)','MANUFACTURING',7.42,'Machine rate £28/hr',3),
      (v_sc,'CNC Machining Op10 (sealing faces)','MANUFACTURING',2.15,'CNC £22/hr × 52s',4),
      (v_sc,'CNC Machining Op20 (bore & thread)','MANUFACTURING',1.38,'CNC £22/hr × 33s',5),
      (v_sc,'Leak Test & Pressure Check','MANUFACTURING',0.45,'£0.45/part test rig',6),
      (v_sc,'Factory Overhead (38%)','OVERHEAD',2.30,'% of conversion cost',7),
      (v_sc,'SG&A (10%)','OVERHEAD',0.98,'% of cost',8),
      (v_sc,'Packaging','LOGISTICS',0.35,'VCI bags + cardboard box',9),
      (v_sc,'Freight to Plant','LOGISTICS',0.42,'Road freight India',10),
      (v_sc,'Die Tooling Amortisation','TOOLING',0.80,'£120k ÷ 150k shots',11),
      (v_sc,'Profit (6.5%)','PROFIT',0.92,'6.5% of total',12);

    INSERT INTO supplier_quote_header (part_id,supplier_id,version,status,rfq_number,annual_volume,currency,total_price,validity_date,submitted_at,program_id)
    VALUES (v_part,v_sup105,1,'submitted','RFQ-2025-GBX-002',50000,'GBP',26.80,'2026-09-30',NOW()-'22 days'::INTERVAL,
            (SELECT id FROM vehicle_program WHERE code='SUV2'))
    RETURNING id INTO v_q1;
    INSERT INTO supplier_quote_breakdown (supplier_quote_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_q1,'ADC12 Alloy','RAW_MATERIAL',7.45,'£/part',1),(v_q1,'Scrap & Runner','RAW_MATERIAL',1.05,'£/part',2),
      (v_q1,'HPDC Casting','MANUFACTURING',8.20,'£/part',3),(v_q1,'Machining Op10','MANUFACTURING',2.55,'£/part',4),
      (v_q1,'Machining Op20','MANUFACTURING',1.65,'£/part',5),(v_q1,'Leak Test','MANUFACTURING',0.55,'£/part',6),
      (v_q1,'Factory Overhead','OVERHEAD',2.85,'£/part',7),(v_q1,'SG&A','OVERHEAD',1.20,'£/part',8),
      (v_q1,'Packaging','LOGISTICS',0.42,'£/part',9),(v_q1,'Freight','LOGISTICS',0.52,'£/part',10),
      (v_q1,'Tooling Amortisation','TOOLING',0.87,'£/part',11),(v_q1,'Profit','PROFIT',0.49,'£/part',12);

    INSERT INTO supplier_quote_header (part_id,supplier_id,version,status,rfq_number,annual_volume,currency,total_price,validity_date,submitted_at,program_id)
    VALUES (v_part,v_sup102,1,'submitted','RFQ-2025-GBX-002',50000,'GBP',24.50,'2026-09-30',NOW()-'18 days'::INTERVAL,
            (SELECT id FROM vehicle_program WHERE code='SUV2'))
    RETURNING id INTO v_q2;
    INSERT INTO supplier_quote_breakdown (supplier_quote_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_q2,'ADC12 Alloy','RAW_MATERIAL',7.10,'£/part',1),(v_q2,'Scrap & Runner','RAW_MATERIAL',0.98,'£/part',2),
      (v_q2,'HPDC Casting','MANUFACTURING',7.65,'£/part',3),(v_q2,'Machining Op10','MANUFACTURING',2.32,'£/part',4),
      (v_q2,'Machining Op20','MANUFACTURING',1.48,'£/part',5),(v_q2,'Leak Test','MANUFACTURING',0.50,'£/part',6),
      (v_q2,'Factory Overhead','OVERHEAD',2.55,'£/part',7),(v_q2,'SG&A','OVERHEAD',1.08,'£/part',8),
      (v_q2,'Packaging','LOGISTICS',0.38,'£/part',9),(v_q2,'Freight','LOGISTICS',0.58,'£/part',10),
      (v_q2,'Tooling Amortisation','TOOLING',0.82,'£/part',11),(v_q2,'Profit','PROFIT',0.06,'£/part',12);
  END IF;

  -- ── PART 3: Control Arm (Forged Aluminium) ───────────────────────
  IF NOT EXISTS (SELECT 1 FROM part_master WHERE part_number = 'SUS-CTL-003') THEN
    INSERT INTO part_master (part_number, description, uom, commodity, drawing_rev, program_id, family_code, family_name)
    VALUES ('SUS-CTL-003','Front Lower Control Arm — Forged Al 6082 T6','EA','Forgings','D',
            (SELECT id FROM vehicle_program WHERE code='SUV3'),'FAM-CTL','Control Arms')
    RETURNING id INTO v_part;

    INSERT INTO should_cost_header (part_id,version,status,annual_volume,currency,total_cost,notes,program_id,
      part_weight_kg,material_code,manufacturing_country,machine_type,cycle_time_sec,
      labour_rate_hr,machine_rate_hr,scrap_rate_pct,tooling_cost_total,tooling_life_units,created_by)
    VALUES (v_part,1,'published',60000,'GBP',32.18,
      'Closed-die forging Al6082 — 3-blow press, T6 heat treat, 4-axis CNC, bushing press-in',
      (SELECT id FROM vehicle_program WHERE code='SUV3'),
      2.45,'ALU-6082','India','Forging + 4-axis CNC',180,
      5.50,35.00,5.0,220000,120000,v_user)
    RETURNING id INTO v_sc;

    INSERT INTO should_cost_breakdown (should_cost_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_sc,'Al 6082 Billet (2.45 kg @ £2.10/kg)','RAW_MATERIAL',5.15,'LME Al + 6082 premium',1),
      (v_sc,'Flash & Scale Loss (5%)','RAW_MATERIAL',0.85,'Forging flash allowance',2),
      (v_sc,'Closed-Die Forging (3 blow)','MANUFACTURING',8.75,'Forging press £35/hr × 180s',3),
      (v_sc,'T6 Heat Treatment','MANUFACTURING',1.65,'Batch oven £/part',4),
      (v_sc,'4-Axis CNC Machining','MANUFACTURING',5.20,'CNC £28/hr × 420s',5),
      (v_sc,'Bushing Press-In (×2)','MANUFACTURING',0.85,'Press-in rig £0.85/part',6),
      (v_sc,'Rubber Bushings (×2, purchased)','BOP',2.80,'Purchased rubber-metal bushes',7),
      (v_sc,'Factory Overhead (35%)','OVERHEAD',2.95,'% of conversion cost',8),
      (v_sc,'SG&A (10%)','OVERHEAD',1.32,'% of total',9),
      (v_sc,'Packaging','LOGISTICS',0.45,'Returnable rack',10),
      (v_sc,'Freight to Plant','LOGISTICS',0.55,'Road freight',11),
      (v_sc,'Forge Die Amortisation','TOOLING',1.83,'£220k ÷ 120k parts',12),
      (v_sc,'Profit (6%)','PROFIT',0.83,'6% of total',13);

    INSERT INTO supplier_quote_header (part_id,supplier_id,version,status,rfq_number,annual_volume,currency,total_price,validity_date,submitted_at,program_id)
    VALUES (v_part,v_sup103,1,'submitted','RFQ-2025-CTL-003',60000,'GBP',37.90,'2026-12-31',NOW()-'30 days'::INTERVAL,
            (SELECT id FROM vehicle_program WHERE code='SUV3'))
    RETURNING id INTO v_q1;
    INSERT INTO supplier_quote_breakdown (supplier_quote_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_q1,'Al 6082 Billet','RAW_MATERIAL',5.65,'£/part',1),(v_q1,'Flash & Scale Loss','RAW_MATERIAL',0.95,'£/part',2),
      (v_q1,'Forging','MANUFACTURING',9.85,'£/part',3),(v_q1,'Heat Treatment','MANUFACTURING',1.90,'£/part',4),
      (v_q1,'CNC Machining','MANUFACTURING',5.95,'£/part',5),(v_q1,'Bushing Press-In','MANUFACTURING',1.05,'£/part',6),
      (v_q1,'Rubber Bushings','BOP',3.10,'£/part',7),(v_q1,'Factory Overhead','OVERHEAD',3.55,'£/part',8),
      (v_q1,'SG&A','OVERHEAD',1.60,'£/part',9),(v_q1,'Packaging','LOGISTICS',0.55,'£/part',10),
      (v_q1,'Freight','LOGISTICS',0.68,'£/part',11),(v_q1,'Die Amortisation','TOOLING',1.95,'£/part',12),
      (v_q1,'Profit','PROFIT',0.12,'£/part',13);

    INSERT INTO supplier_quote_header (part_id,supplier_id,version,status,rfq_number,annual_volume,currency,total_price,validity_date,submitted_at,program_id)
    VALUES (v_part,v_sup101,1,'submitted','RFQ-2025-CTL-003',60000,'GBP',41.20,'2026-12-31',NOW()-'25 days'::INTERVAL,
            (SELECT id FROM vehicle_program WHERE code='SUV3'))
    RETURNING id INTO v_q2;
    INSERT INTO supplier_quote_breakdown (supplier_quote_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_q2,'Al 6082 Billet','RAW_MATERIAL',5.80,'£/part',1),(v_q2,'Flash & Scale Loss','RAW_MATERIAL',1.02,'£/part',2),
      (v_q2,'Forging','MANUFACTURING',11.20,'£/part',3),(v_q2,'Heat Treatment','MANUFACTURING',2.10,'£/part',4),
      (v_q2,'CNC Machining','MANUFACTURING',6.85,'£/part',5),(v_q2,'Bushing Press-In','MANUFACTURING',1.15,'£/part',6),
      (v_q2,'Rubber Bushings','BOP',3.20,'£/part',7),(v_q2,'Factory Overhead','OVERHEAD',4.10,'£/part',8),
      (v_q2,'SG&A','OVERHEAD',1.88,'£/part',9),(v_q2,'Packaging','LOGISTICS',0.62,'£/part',10),
      (v_q2,'Freight','LOGISTICS',0.88,'£/part',11),(v_q2,'Die Amortisation','TOOLING',2.08,'£/part',12),
      (v_q2,'Profit','PROFIT',0.32,'£/part',13);
  END IF;

  -- ── PART 4: Camshaft Cover (Injection Moulded PA66-GF30) ─────────
  IF NOT EXISTS (SELECT 1 FROM part_master WHERE part_number = 'ENG-CAM-004') THEN
    INSERT INTO part_master (part_number, description, uom, commodity, drawing_rev, program_id)
    VALUES ('ENG-CAM-004','Camshaft Cover — PA66-GF30 Injection Moulded','EA','Injection Moulding','A',
            (SELECT id FROM vehicle_program WHERE code='SUV1'))
    RETURNING id INTO v_part;

    INSERT INTO should_cost_header (part_id,version,status,annual_volume,currency,total_cost,notes,program_id,
      part_weight_kg,material_code,manufacturing_country,machine_type,cycle_time_sec,
      labour_rate_hr,machine_rate_hr,scrap_rate_pct,tooling_cost_total,tooling_life_units,created_by)
    VALUES (v_part,1,'published',70000,'GBP',14.82,
      'PA66-GF30 injection moulded camshaft cover — oil separator insert, vibration welded tube',
      (SELECT id FROM vehicle_program WHERE code='SUV1'),
      0.92,'PA66-GF30','India','Injection Moulding 650T',55,
      4.50,22.00,2.5,85000,300000,v_user)
    RETURNING id INTO v_sc;

    INSERT INTO should_cost_breakdown (should_cost_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_sc,'PA66-GF30 Resin (0.92 kg @ £2.85/kg)','RAW_MATERIAL',2.62,'LME + resin premium',1),
      (v_sc,'Regrind & Scrap (2.5%)','RAW_MATERIAL',0.22,'Material × scrap %',2),
      (v_sc,'Injection Moulding (55s cycle)','MANUFACTURING',3.36,'650T press £22/hr',3),
      (v_sc,'Vibration Welding (duct insert)','MANUFACTURING',0.88,'Weld rig £16/hr × 90s',4),
      (v_sc,'Assembly & Test (leak check)','MANUFACTURING',0.55,'Manual assembly + air test',5),
      (v_sc,'Oil Separator Insert (purchased)','BOP',3.20,'Purchased stainless separator',6),
      (v_sc,'Seals & Grommets','BOP',0.48,'Rubber seals set',7),
      (v_sc,'Factory Overhead (28%)','OVERHEAD',1.38,'% of conversion',8),
      (v_sc,'SG&A (10%)','OVERHEAD',0.75,'% of total',9),
      (v_sc,'Packaging','LOGISTICS',0.32,'Cardboard box',10),
      (v_sc,'Freight','LOGISTICS',0.38,'Road freight',11),
      (v_sc,'Tooling Amortisation','TOOLING',0.28,'£85k ÷ 300k shots',12),
      (v_sc,'Profit (5%)','PROFIT',0.40,'5% of total',13);

    INSERT INTO supplier_quote_header (part_id,supplier_id,version,status,rfq_number,annual_volume,currency,total_price,validity_date,submitted_at,program_id)
    VALUES (v_part,v_sup104,1,'submitted','RFQ-2025-CAM-004',70000,'GBP',17.45,'2026-06-30',NOW()-'12 days'::INTERVAL,
            (SELECT id FROM vehicle_program WHERE code='SUV1'))
    RETURNING id INTO v_q1;
    INSERT INTO supplier_quote_breakdown (supplier_quote_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_q1,'PA66-GF30 Resin','RAW_MATERIAL',2.85,'£/part',1),(v_q1,'Regrind & Scrap','RAW_MATERIAL',0.28,'£/part',2),
      (v_q1,'Injection Moulding','MANUFACTURING',3.95,'£/part',3),(v_q1,'Vibration Welding','MANUFACTURING',1.10,'£/part',4),
      (v_q1,'Assembly & Test','MANUFACTURING',0.68,'£/part',5),(v_q1,'Oil Separator Insert','BOP',3.40,'£/part',6),
      (v_q1,'Seals & Grommets','BOP',0.55,'£/part',7),(v_q1,'Factory Overhead','OVERHEAD',1.72,'£/part',8),
      (v_q1,'SG&A','OVERHEAD',0.92,'£/part',9),(v_q1,'Packaging','LOGISTICS',0.38,'£/part',10),
      (v_q1,'Freight','LOGISTICS',0.45,'£/part',11),(v_q1,'Tooling Amortisation','TOOLING',0.32,'£/part',12),
      (v_q1,'Profit','PROFIT',0.85,'£/part',13);

    INSERT INTO supplier_quote_header (part_id,supplier_id,version,status,rfq_number,annual_volume,currency,total_price,validity_date,submitted_at,program_id)
    VALUES (v_part,v_sup106,1,'negotiating','RFQ-2025-CAM-004',70000,'GBP',16.20,'2026-06-30',NOW()-'5 days'::INTERVAL,
            (SELECT id FROM vehicle_program WHERE code='SUV1'))
    RETURNING id INTO v_q2;
    INSERT INTO supplier_quote_breakdown (supplier_quote_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_q2,'PA66-GF30 Resin','RAW_MATERIAL',2.72,'£/part',1),(v_q2,'Regrind & Scrap','RAW_MATERIAL',0.25,'£/part',2),
      (v_q2,'Injection Moulding','MANUFACTURING',3.72,'£/part',3),(v_q2,'Vibration Welding','MANUFACTURING',1.02,'£/part',4),
      (v_q2,'Assembly & Test','MANUFACTURING',0.62,'£/part',5),(v_q2,'Oil Separator Insert','BOP',3.30,'£/part',6),
      (v_q2,'Seals & Grommets','BOP',0.52,'£/part',7),(v_q2,'Factory Overhead','OVERHEAD',1.58,'£/part',8),
      (v_q2,'SG&A','OVERHEAD',0.85,'£/part',9),(v_q2,'Packaging','LOGISTICS',0.35,'£/part',10),
      (v_q2,'Freight','LOGISTICS',0.42,'£/part',11),(v_q2,'Tooling Amortisation','TOOLING',0.30,'£/part',12),
      (v_q2,'Profit','PROFIT',0.55,'£/part',13);
  END IF;

  -- ── PART 5: Turbocharger Bracket (Machined Steel) ─────────────────
  IF NOT EXISTS (SELECT 1 FROM part_master WHERE part_number = 'ENG-TRB-005') THEN
    INSERT INTO part_master (part_number, description, uom, commodity, drawing_rev, program_id)
    VALUES ('ENG-TRB-005','Turbocharger Mounting Bracket — Machined EN8 Steel','EA','Machined Parts','B',
            (SELECT id FROM vehicle_program WHERE code='SUV4'))
    RETURNING id INTO v_part;

    INSERT INTO should_cost_header (part_id,version,status,annual_volume,currency,total_cost,notes,program_id,
      part_weight_kg,material_code,manufacturing_country,machine_type,cycle_time_sec,
      labour_rate_hr,machine_rate_hr,scrap_rate_pct,tooling_cost_total,tooling_life_units,created_by)
    VALUES (v_part,1,'published',45000,'GBP',18.65,
      'EN8 steel billet, 3-axis CNC turning & milling, zinc phosphate finish',
      (SELECT id FROM vehicle_program WHERE code='SUV4'),
      2.10,'STL-EN8','India','3-axis CNC Machining',380,
      4.50,20.00,6.0,35000,100000,v_user)
    RETURNING id INTO v_sc;

    INSERT INTO should_cost_breakdown (should_cost_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_sc,'EN8 Steel Billet (2.10 kg @ £0.95/kg)','RAW_MATERIAL',2.00,'£/kg × weight',1),
      (v_sc,'Buy-to-Fly Loss (6%)','RAW_MATERIAL',0.52,'Machining stock removal',2),
      (v_sc,'CNC Turning Op10','MANUFACTURING',4.22,'CNC £20/hr × 380s × 0.55',3),
      (v_sc,'CNC Milling Op20','MANUFACTURING',2.98,'CNC £20/hr × 380s × 0.45',4),
      (v_sc,'Deburr & Inspect','MANUFACTURING',0.55,'Manual deburr 6 min',5),
      (v_sc,'Zinc Phosphate Coating','MANUFACTURING',0.65,'Surface treatment bath',6),
      (v_sc,'Factory Overhead (32%)','OVERHEAD',1.95,'% of conversion',7),
      (v_sc,'SG&A (10%)','OVERHEAD',0.98,'% of total',8),
      (v_sc,'Packaging','LOGISTICS',0.32,'Waxed cardboard',9),
      (v_sc,'Freight','LOGISTICS',0.48,'Road freight',10),
      (v_sc,'Jig & Fixture Amortisation','TOOLING',0.35,'£35k ÷ 100k parts',11),
      (v_sc,'Profit (5%)','PROFIT',0.65,'5% of total',12);

    INSERT INTO supplier_quote_header (part_id,supplier_id,version,status,rfq_number,annual_volume,currency,total_price,validity_date,submitted_at,program_id)
    VALUES (v_part,v_sup102,1,'submitted','RFQ-2025-TRB-005',45000,'GBP',21.80,'2026-06-30',NOW()-'20 days'::INTERVAL,
            (SELECT id FROM vehicle_program WHERE code='SUV4'))
    RETURNING id INTO v_q1;
    INSERT INTO supplier_quote_breakdown (supplier_quote_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_q1,'EN8 Steel Billet','RAW_MATERIAL',2.20,'£/part',1),(v_q1,'Buy-to-Fly Loss','RAW_MATERIAL',0.62,'£/part',2),
      (v_q1,'CNC Turning Op10','MANUFACTURING',4.95,'£/part',3),(v_q1,'CNC Milling Op20','MANUFACTURING',3.45,'£/part',4),
      (v_q1,'Deburr & Inspect','MANUFACTURING',0.68,'£/part',5),(v_q1,'Zinc Phosphate','MANUFACTURING',0.78,'£/part',6),
      (v_q1,'Factory Overhead','OVERHEAD',2.35,'£/part',7),(v_q1,'SG&A','OVERHEAD',1.18,'£/part',8),
      (v_q1,'Packaging','LOGISTICS',0.38,'£/part',9),(v_q1,'Freight','LOGISTICS',0.55,'£/part',10),
      (v_q1,'Fixture Amortisation','TOOLING',0.40,'£/part',11),(v_q1,'Profit','PROFIT',0.26,'£/part',12);

    INSERT INTO supplier_quote_header (part_id,supplier_id,version,status,rfq_number,annual_volume,currency,total_price,validity_date,submitted_at,program_id)
    VALUES (v_part,v_sup101,1,'submitted','RFQ-2025-TRB-005',45000,'GBP',24.50,'2026-06-30',NOW()-'18 days'::INTERVAL,
            (SELECT id FROM vehicle_program WHERE code='SUV4'))
    RETURNING id INTO v_q2;
    INSERT INTO supplier_quote_breakdown (supplier_quote_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_q2,'EN8 Steel Billet','RAW_MATERIAL',2.35,'£/part',1),(v_q2,'Buy-to-Fly Loss','RAW_MATERIAL',0.70,'£/part',2),
      (v_q2,'CNC Turning','MANUFACTURING',5.65,'£/part',3),(v_q2,'CNC Milling','MANUFACTURING',3.95,'£/part',4),
      (v_q2,'Deburr & Inspect','MANUFACTURING',0.85,'£/part',5),(v_q2,'Surface Treatment','MANUFACTURING',0.88,'£/part',6),
      (v_q2,'Factory Overhead','OVERHEAD',2.85,'£/part',7),(v_q2,'SG&A','OVERHEAD',1.42,'£/part',8),
      (v_q2,'Packaging','LOGISTICS',0.42,'£/part',9),(v_q2,'Freight','LOGISTICS',0.78,'£/part',10),
      (v_q2,'Fixture Amortisation','TOOLING',0.45,'£/part',11),(v_q2,'Profit','PROFIT',0.20,'£/part',12);
  END IF;

END $$;

-- ============================================================
-- 3. COMMODITY PRICES — 8 Materials × 6 Months of History
-- ============================================================
INSERT INTO commodity_price (material_name, material_code, price_per_unit, unit, currency, price_date, source, notes) VALUES
-- Hot-Rolled Steel
('Hot Rolled Steel (HR3)', 'STL-HRC', 0.685, 'per kg', 'GBP', '2025-01-01', 'LME / Steel Index', 'Jan 2025 — Q1 contract price'),
('Hot Rolled Steel (HR3)', 'STL-HRC', 0.695, 'per kg', 'GBP', '2025-02-01', 'LME / Steel Index', 'Feb 2025 — mild uptick EU energy costs'),
('Hot Rolled Steel (HR3)', 'STL-HRC', 0.710, 'per kg', 'GBP', '2025-03-01', 'LME / Steel Index', 'Mar 2025 — Q2 contract adjustment'),
('Hot Rolled Steel (HR3)', 'STL-HRC', 0.698, 'per kg', 'GBP', '2025-04-01', 'LME / Steel Index', 'Apr 2025 — demand softening'),
('Hot Rolled Steel (HR3)', 'STL-HRC', 0.702, 'per kg', 'GBP', '2025-05-01', 'LME / Steel Index', 'May 2025'),
('Hot Rolled Steel (HR3)', 'STL-HRC', 0.718, 'per kg', 'GBP', '2025-06-01', 'LME / Steel Index', 'Jun 2025 — summer restocking'),
-- Cold Rolled Steel
('Cold Rolled Steel (CR4)', 'STL-CRC', 0.825, 'per kg', 'GBP', '2025-01-01', 'LME / Steel Index', 'Jan 2025'),
('Cold Rolled Steel (CR4)', 'STL-CRC', 0.838, 'per kg', 'GBP', '2025-02-01', 'LME / Steel Index', 'Feb 2025'),
('Cold Rolled Steel (CR4)', 'STL-CRC', 0.855, 'per kg', 'GBP', '2025-03-01', 'LME / Steel Index', 'Mar 2025 — Q2 uplift'),
('Cold Rolled Steel (CR4)', 'STL-CRC', 0.842, 'per kg', 'GBP', '2025-04-01', 'LME / Steel Index', 'Apr 2025 — slight correction'),
('Cold Rolled Steel (CR4)', 'STL-CRC', 0.848, 'per kg', 'GBP', '2025-05-01', 'LME / Steel Index', 'May 2025'),
('Cold Rolled Steel (CR4)', 'STL-CRC', 0.862, 'per kg', 'GBP', '2025-06-01', 'LME / Steel Index', 'Jun 2025'),
-- Aluminium ADC12 (die cast alloy)
('Aluminium ADC12 Alloy',  'ALU-ADC12', 1.920, 'per kg', 'GBP', '2025-01-01', 'LME Aluminium', 'Jan 2025 — LME Al + ADC12 premium £0.32/kg'),
('Aluminium ADC12 Alloy',  'ALU-ADC12', 1.948, 'per kg', 'GBP', '2025-02-01', 'LME Aluminium', 'Feb 2025'),
('Aluminium ADC12 Alloy',  'ALU-ADC12', 1.972, 'per kg', 'GBP', '2025-03-01', 'LME Aluminium', 'Mar 2025 — energy surcharge'),
('Aluminium ADC12 Alloy',  'ALU-ADC12', 1.958, 'per kg', 'GBP', '2025-04-01', 'LME Aluminium', 'Apr 2025'),
('Aluminium ADC12 Alloy',  'ALU-ADC12', 1.985, 'per kg', 'GBP', '2025-05-01', 'LME Aluminium', 'May 2025 — upward trend'),
('Aluminium ADC12 Alloy',  'ALU-ADC12', 2.015, 'per kg', 'GBP', '2025-06-01', 'LME Aluminium', 'Jun 2025 — 6-month high'),
-- Aluminium 6082 (forging grade)
('Aluminium 6082 T6',      'ALU-6082',  2.085, 'per kg', 'GBP', '2025-01-01', 'LME Aluminium', 'Jan 2025 — 6082 extrusion billet'),
('Aluminium 6082 T6',      'ALU-6082',  2.110, 'per kg', 'GBP', '2025-02-01', 'LME Aluminium', 'Feb 2025'),
('Aluminium 6082 T6',      'ALU-6082',  2.135, 'per kg', 'GBP', '2025-03-01', 'LME Aluminium', 'Mar 2025'),
('Aluminium 6082 T6',      'ALU-6082',  2.122, 'per kg', 'GBP', '2025-04-01', 'LME Aluminium', 'Apr 2025'),
('Aluminium 6082 T6',      'ALU-6082',  2.148, 'per kg', 'GBP', '2025-05-01', 'LME Aluminium', 'May 2025'),
('Aluminium 6082 T6',      'ALU-6082',  2.168, 'per kg', 'GBP', '2025-06-01', 'LME Aluminium', 'Jun 2025'),
-- Copper (ETP grade for wiring)
('Copper ETP (Wire Grade)', 'COP-ETP',   7.250, 'per kg', 'GBP', '2025-01-01', 'LME Copper', 'Jan 2025 — LME Cu $/tonne converted'),
('Copper ETP (Wire Grade)', 'COP-ETP',   7.485, 'per kg', 'GBP', '2025-02-01', 'LME Copper', 'Feb 2025 — sharp rally'),
('Copper ETP (Wire Grade)', 'COP-ETP',   7.620, 'per kg', 'GBP', '2025-03-01', 'LME Copper', 'Mar 2025 — supply tightness'),
('Copper ETP (Wire Grade)', 'COP-ETP',   7.390, 'per kg', 'GBP', '2025-04-01', 'LME Copper', 'Apr 2025 — correction'),
('Copper ETP (Wire Grade)', 'COP-ETP',   7.510, 'per kg', 'GBP', '2025-05-01', 'LME Copper', 'May 2025'),
('Copper ETP (Wire Grade)', 'COP-ETP',   7.680, 'per kg', 'GBP', '2025-06-01', 'LME Copper', 'Jun 2025 — new YTD high'),
-- Polypropylene (injection grade)
('Polypropylene PP-GF20',  'PPL-GF20',  1.650, 'per kg', 'GBP', '2025-01-01', 'ICIS Plastics', 'Jan 2025 — petrochemical linked'),
('Polypropylene PP-GF20',  'PPL-GF20',  1.625, 'per kg', 'GBP', '2025-02-01', 'ICIS Plastics', 'Feb 2025 — crude oil dip'),
('Polypropylene PP-GF20',  'PPL-GF20',  1.648, 'per kg', 'GBP', '2025-03-01', 'ICIS Plastics', 'Mar 2025'),
('Polypropylene PP-GF20',  'PPL-GF20',  1.672, 'per kg', 'GBP', '2025-04-01', 'ICIS Plastics', 'Apr 2025 — Q2 contract'),
('Polypropylene PP-GF20',  'PPL-GF20',  1.690, 'per kg', 'GBP', '2025-05-01', 'ICIS Plastics', 'May 2025'),
('Polypropylene PP-GF20',  'PPL-GF20',  1.705, 'per kg', 'GBP', '2025-06-01', 'ICIS Plastics', 'Jun 2025'),
-- PA66-GF30 (Nylon for under-hood)
('Nylon PA66-GF30',        'PA66-GF30', 2.845, 'per kg', 'GBP', '2025-01-01', 'ICIS Plastics', 'Jan 2025'),
('Nylon PA66-GF30',        'PA66-GF30', 2.820, 'per kg', 'GBP', '2025-02-01', 'ICIS Plastics', 'Feb 2025'),
('Nylon PA66-GF30',        'PA66-GF30', 2.858, 'per kg', 'GBP', '2025-03-01', 'ICIS Plastics', 'Mar 2025'),
('Nylon PA66-GF30',        'PA66-GF30', 2.875, 'per kg', 'GBP', '2025-04-01', 'ICIS Plastics', 'Apr 2025'),
('Nylon PA66-GF30',        'PA66-GF30', 2.892, 'per kg', 'GBP', '2025-05-01', 'ICIS Plastics', 'May 2025'),
('Nylon PA66-GF30',        'PA66-GF30', 2.908, 'per kg', 'GBP', '2025-06-01', 'ICIS Plastics', 'Jun 2025'),
-- Stainless Steel 409 (exhaust grade)
('Stainless Steel SS409',  'STL-SS409', 1.485, 'per kg', 'GBP', '2025-01-01', 'MEPS Steel Index', 'Jan 2025 — ferritic SS, low Ni'),
('Stainless Steel SS409',  'STL-SS409', 1.502, 'per kg', 'GBP', '2025-02-01', 'MEPS Steel Index', 'Feb 2025'),
('Stainless Steel SS409',  'STL-SS409', 1.528, 'per kg', 'GBP', '2025-03-01', 'MEPS Steel Index', 'Mar 2025 — Ni surcharge uplift'),
('Stainless Steel SS409',  'STL-SS409', 1.515, 'per kg', 'GBP', '2025-04-01', 'MEPS Steel Index', 'Apr 2025'),
('Stainless Steel SS409',  'STL-SS409', 1.535, 'per kg', 'GBP', '2025-05-01', 'MEPS Steel Index', 'May 2025'),
('Stainless Steel SS409',  'STL-SS409', 1.558, 'per kg', 'GBP', '2025-06-01', 'MEPS Steel Index', 'Jun 2025')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 4. NEGOTIATION TARGETS — 10 Records (open / agreed / stalled)
-- ============================================================
DO $$
DECLARE
  v_user UUID;
  v_own  UUID;
BEGIN
  SELECT id INTO v_user FROM "user" WHERE email = 'avinash.bhosale@costlens.io';
  SELECT id INTO v_own  FROM "user" WHERE email = 'procurement@costlens.io';

  -- 1. DPN-1001 Front Door Panel vs Sterling — AGREED (saved £1.23/part)
  IF NOT EXISTS (SELECT 1 FROM negotiation_target WHERE part_id=(SELECT id FROM part_master WHERE part_number='DPN-1001') AND supplier_id=(SELECT id FROM supplier WHERE code='SUP-101')) THEN
    INSERT INTO negotiation_target (part_id,supplier_id,target_price,current_price,should_cost,currency,target_date,status,owner_id,notes,agreed_price,agreed_at,created_by)
    VALUES ((SELECT id FROM part_master WHERE part_number='DPN-1001'),
            (SELECT id FROM supplier WHERE code='SUP-101'),
            16.90,18.13,16.50,'GBP','2025-03-31','agreed',v_user,
            'Challenged overhead & freight — benchmarked vs India. Achieved £1.23 saving on £18.13 baseline.',
            16.90,'2025-03-15',v_user);
  END IF;

  -- 2. BRK-2001 Brake Disc vs Sterling — AGREED (£0.84/part saving)
  IF NOT EXISTS (SELECT 1 FROM negotiation_target WHERE part_id=(SELECT id FROM part_master WHERE part_number='BRK-2001') AND supplier_id=(SELECT id FROM supplier WHERE code='SUP-101')) THEN
    INSERT INTO negotiation_target (part_id,supplier_id,target_price,current_price,should_cost,currency,target_date,status,owner_id,notes,agreed_price,agreed_at,created_by)
    VALUES ((SELECT id FROM part_master WHERE part_number='BRK-2001'),
            (SELECT id FROM supplier WHERE code='SUP-101'),
            12.33,13.17,11.77,'GBP','2025-04-30','agreed',v_user,
            'Machining gap challenged — supplier agreed 6.4% reduction with volume commitment.',
            12.33,'2025-04-02',v_user);
  END IF;

  -- 3. STK-7001 Steering Knuckle vs Mitra — OPEN (large gap, ongoing)
  IF NOT EXISTS (SELECT 1 FROM negotiation_target WHERE part_id=(SELECT id FROM part_master WHERE part_number='STK-7001') AND supplier_id=(SELECT id FROM supplier WHERE code='SUP-102')) THEN
    INSERT INTO negotiation_target (part_id,supplier_id,target_price,current_price,should_cost,currency,target_date,status,owner_id,notes,created_by)
    VALUES ((SELECT id FROM part_master WHERE part_number='STK-7001'),
            (SELECT id FROM supplier WHERE code='SUP-102'),
            30.50,32.15,28.50,'GBP','2025-09-30','open',v_own,
            'Al 6082 forging — 12.8% gap vs should-cost. Cycle time and 5-axis machining rate challenged. Mid-term negotiation ongoing.',
            v_user);
  END IF;

  -- 4. WIR-1002 Wiring Harness vs Mitra — STALLED (IP dispute)
  IF NOT EXISTS (SELECT 1 FROM negotiation_target WHERE part_id=(SELECT id FROM part_master WHERE part_number='WIR-1002') AND supplier_id=(SELECT id FROM supplier WHERE code='SUP-102')) THEN
    INSERT INTO negotiation_target (part_id,supplier_id,target_price,current_price,should_cost,currency,target_date,status,owner_id,notes,created_by)
    VALUES ((SELECT id FROM part_master WHERE part_number='WIR-1002'),
            (SELECT id FROM supplier WHERE code='SUP-102'),
            22.80,25.65,24.10,'GBP','2025-06-30','stalled',v_own,
            'Stalled — supplier claims connector tooling costs not included in quote. Tooling ownership dispute pending legal review.',
            v_user);
  END IF;

  -- 5. IPN-9001 Instrument Panel vs Motherson — OPEN (volume leverage)
  IF NOT EXISTS (SELECT 1 FROM negotiation_target WHERE part_id=(SELECT id FROM part_master WHERE part_number='IPN-9001') AND supplier_id=(SELECT id FROM supplier WHERE code='SUP-104')) THEN
    INSERT INTO negotiation_target (part_id,supplier_id,target_price,current_price,should_cost,currency,target_date,status,owner_id,notes,created_by)
    VALUES ((SELECT id FROM part_master WHERE part_number='IPN-9001'),
            (SELECT id FROM supplier WHERE code='SUP-104'),
            15.80,17.48,16.60,'GBP','2025-12-31','open',v_own,
            'Large injection moulded IP substrate — pressing on press rate and volumetric freight. SUV2 platform consolidation leverage.',
            v_user);
  END IF;

  -- 6. GBX-COV-002 Gearbox Cover vs Endurance — OPEN
  IF NOT EXISTS (SELECT 1 FROM negotiation_target WHERE part_id=(SELECT id FROM part_master WHERE part_number='GBX-COV-002') AND supplier_id=(SELECT id FROM supplier WHERE code='SUP-105')) THEN
    INSERT INTO negotiation_target (part_id,supplier_id,target_price,current_price,should_cost,currency,target_date,status,owner_id,notes,created_by)
    VALUES ((SELECT id FROM part_master WHERE part_number='GBX-COV-002'),
            (SELECT id FROM supplier WHERE code='SUP-105'),
            23.50,26.80,22.65,'GBP','2025-10-31','open',v_own,
            'HPDC cover — 18.3% gap. Challenging die cycle time (quoted 120s vs our 95s benchmark) and overhead loading.',
            v_user);
  END IF;

  -- 7. BRK-SHK-001 Shock Bracket vs Precision Stampings — OPEN
  IF NOT EXISTS (SELECT 1 FROM negotiation_target WHERE part_id=(SELECT id FROM part_master WHERE part_number='BRK-SHK-001') AND supplier_id=(SELECT id FROM supplier WHERE code='SUP-107')) THEN
    INSERT INTO negotiation_target (part_id,supplier_id,target_price,current_price,should_cost,currency,target_date,status,owner_id,notes,created_by)
    VALUES ((SELECT id FROM part_master WHERE part_number='BRK-SHK-001'),
            (SELECT id FROM supplier WHERE code='SUP-107'),
            9.00,9.85,8.42,'GBP','2025-08-31','open',v_user,
            'Stamped bracket — overhead and SG&A challenged. Benchmarked vs progressive die industry norms. Targeting 8.6% reduction.',
            v_user);
  END IF;

  -- 8. SUS-CTL-003 Control Arm vs Bharat Forge — OPEN (large gap)
  IF NOT EXISTS (SELECT 1 FROM negotiation_target WHERE part_id=(SELECT id FROM part_master WHERE part_number='SUS-CTL-003') AND supplier_id=(SELECT id FROM supplier WHERE code='SUP-103')) THEN
    INSERT INTO negotiation_target (part_id,supplier_id,target_price,current_price,should_cost,currency,target_date,status,owner_id,notes,created_by)
    VALUES ((SELECT id FROM part_master WHERE part_number='SUS-CTL-003'),
            (SELECT id FROM supplier WHERE code='SUP-103'),
            34.50,37.90,32.18,'GBP','2026-01-31','open',v_user,
            'Al forging — challenging forging cost (+12.6% vs benchmark), CNC rate, and bushing procurement. Critical safety part, dual source being considered.',
            v_user);
  END IF;

  -- 9. SEA-3001 Seat Frame vs Sterling — AGREED (recliner mechanism re-sourced)
  IF NOT EXISTS (SELECT 1 FROM negotiation_target WHERE part_id=(SELECT id FROM part_master WHERE part_number='SEA-3001') AND supplier_id=(SELECT id FROM supplier WHERE code='SUP-101')) THEN
    INSERT INTO negotiation_target (part_id,supplier_id,target_price,current_price,should_cost,currency,target_date,status,owner_id,notes,agreed_price,agreed_at,created_by)
    VALUES ((SELECT id FROM part_master WHERE part_number='SEA-3001'),
            (SELECT id FROM supplier WHERE code='SUP-101'),
            31.00,34.33,31.20,'GBP','2025-05-31','agreed',v_own,
            'Recliner BOP re-sourced to tier-2 — £0.90/part saving. Welding rate challenged via cycle time study. Total agreed saving £3.33/part.',
            31.00,'2025-05-20',v_user);
  END IF;

  -- 10. ENG-TRB-005 Turbo Bracket vs Mitra — STALLED (quality concern)
  IF NOT EXISTS (SELECT 1 FROM negotiation_target WHERE part_id=(SELECT id FROM part_master WHERE part_number='ENG-TRB-005') AND supplier_id=(SELECT id FROM supplier WHERE code='SUP-102')) THEN
    INSERT INTO negotiation_target (part_id,supplier_id,target_price,current_price,should_cost,currency,target_date,status,owner_id,notes,created_by)
    VALUES ((SELECT id FROM part_master WHERE part_number='ENG-TRB-005'),
            (SELECT id FROM supplier WHERE code='SUP-102'),
            19.50,21.80,18.65,'GBP','2025-07-31','stalled',v_user,
            'Stalled — Mitra failed PPAP on geometric tolerance Ø0.05 on turbo flange bore. Re-quoting with corrective action evidence required.',
            v_user);
  END IF;
END $$;

-- ============================================================
-- 5. ACR TARGETS — 15 Records (2024 & 2025)
-- ============================================================
DO $$
DECLARE v_user UUID; v_sup101 INTEGER; v_sup102 INTEGER; v_sup103 INTEGER; v_sup104 INTEGER; v_sup105 INTEGER; v_sup106 INTEGER; v_sup107 INTEGER;
BEGIN
  SELECT id INTO v_user   FROM "user"     WHERE email = 'avinash.bhosale@costlens.io';
  SELECT id INTO v_sup101 FROM supplier WHERE code = 'SUP-101';
  SELECT id INTO v_sup102 FROM supplier WHERE code = 'SUP-102';
  SELECT id INTO v_sup103 FROM supplier WHERE code = 'SUP-103';
  SELECT id INTO v_sup104 FROM supplier WHERE code = 'SUP-104';
  SELECT id INTO v_sup105 FROM supplier WHERE code = 'SUP-105';
  SELECT id INTO v_sup106 FROM supplier WHERE code = 'SUP-106';
  SELECT id INTO v_sup107 FROM supplier WHERE code = 'SUP-107';

  -- 2024 ACR TARGETS (closed year — show mix of agreed/missed)
  INSERT INTO acr_target (part_id,supplier_id,target_year,base_price,base_year,target_reduction_pct,target_price,agreed_price,actual_reduction_pct,status,currency,notes,created_by)
  SELECT (SELECT id FROM part_master WHERE part_number='DPN-1001'),v_sup101,2024,19.20,2023,5.0,18.24,18.13,5.6,'agreed','GBP','FY2024 ACR — achieved above target via process audit',v_user
  WHERE NOT EXISTS (SELECT 1 FROM acr_target WHERE part_id=(SELECT id FROM part_master WHERE part_number='DPN-1001') AND supplier_id=v_sup101 AND target_year=2024);

  INSERT INTO acr_target (part_id,supplier_id,target_year,base_price,base_year,target_reduction_pct,target_price,agreed_price,actual_reduction_pct,status,currency,notes,created_by)
  SELECT (SELECT id FROM part_master WHERE part_number='BRK-2001'),v_sup101,2024,13.85,2023,4.0,13.30,13.17,4.9,'agreed','GBP','FY2024 ACR — machining productivity improvement',v_user
  WHERE NOT EXISTS (SELECT 1 FROM acr_target WHERE part_id=(SELECT id FROM part_master WHERE part_number='BRK-2001') AND supplier_id=v_sup101 AND target_year=2024);

  INSERT INTO acr_target (part_id,supplier_id,target_year,base_price,base_year,target_reduction_pct,target_price,agreed_price,actual_reduction_pct,status,currency,notes,created_by)
  SELECT (SELECT id FROM part_master WHERE part_number='STK-7001'),v_sup102,2024,34.50,2023,5.0,32.78,NULL,NULL,'missed','GBP','FY2024 ACR — missed. Al commodity increase offset savings. Al LME +18% in H1-2024.',v_user
  WHERE NOT EXISTS (SELECT 1 FROM acr_target WHERE part_id=(SELECT id FROM part_master WHERE part_number='STK-7001') AND supplier_id=v_sup102 AND target_year=2024);

  INSERT INTO acr_target (part_id,supplier_id,target_year,base_price,base_year,target_reduction_pct,target_price,agreed_price,actual_reduction_pct,status,currency,notes,created_by)
  SELECT (SELECT id FROM part_master WHERE part_number='WIR-1002'),v_sup102,2024,27.20,2023,6.0,25.57,25.20,7.4,'agreed','GBP','FY2024 ACR — labour cost improvement in India + connector re-sourcing',v_user
  WHERE NOT EXISTS (SELECT 1 FROM acr_target WHERE part_id=(SELECT id FROM part_master WHERE part_number='WIR-1002') AND supplier_id=v_sup102 AND target_year=2024);

  INSERT INTO acr_target (part_id,supplier_id,target_year,base_price,base_year,target_reduction_pct,target_price,agreed_price,actual_reduction_pct,status,currency,notes,created_by)
  SELECT (SELECT id FROM part_master WHERE part_number='SEA-3001'),v_sup101,2024,36.50,2023,3.5,35.22,35.10,3.8,'agreed','GBP','FY2024 ACR — welding fixture upgrade reduced cycle by 8%',v_user
  WHERE NOT EXISTS (SELECT 1 FROM acr_target WHERE part_id=(SELECT id FROM part_master WHERE part_number='SEA-3001') AND supplier_id=v_sup101 AND target_year=2024);

  INSERT INTO acr_target (part_id,supplier_id,target_year,base_price,base_year,target_reduction_pct,target_price,agreed_price,actual_reduction_pct,status,currency,notes,created_by)
  SELECT (SELECT id FROM part_master WHERE part_number='LMP-4001'),v_sup102,2024,38.80,2023,4.0,37.25,NULL,NULL,'missed','GBP','FY2024 ACR — missed. LED module costs increased due to chip shortage surcharge.',v_user
  WHERE NOT EXISTS (SELECT 1 FROM acr_target WHERE part_id=(SELECT id FROM part_master WHERE part_number='LMP-4001') AND supplier_id=v_sup102 AND target_year=2024);

  INSERT INTO acr_target (part_id,supplier_id,target_year,base_price,base_year,target_reduction_pct,target_price,agreed_price,actual_reduction_pct,status,currency,notes,created_by)
  SELECT (SELECT id FROM part_master WHERE part_number='BAT-6001'),v_sup102,2024,22.10,2023,5.5,20.89,20.65,6.6,'agreed','GBP','FY2024 ACR — CAB brazing cycle improvement and Al buy direct from mill',v_user
  WHERE NOT EXISTS (SELECT 1 FROM acr_target WHERE part_id=(SELECT id FROM part_master WHERE part_number='BAT-6001') AND supplier_id=v_sup102 AND target_year=2024);

  INSERT INTO acr_target (part_id,supplier_id,target_year,base_price,base_year,target_reduction_pct,target_price,agreed_price,actual_reduction_pct,status,currency,notes,created_by)
  SELECT (SELECT id FROM part_master WHERE part_number='IPN-9001'),v_sup104,2024,19.20,2023,4.0,18.43,18.50,3.6,'agreed','GBP','FY2024 ACR — press rate challenged, partial saving only',v_user
  WHERE NOT EXISTS (SELECT 1 FROM acr_target WHERE part_id=(SELECT id FROM part_master WHERE part_number='IPN-9001') AND supplier_id=v_sup104 AND target_year=2024);

  -- 2025 ACR TARGETS (current year — mix of open/agreed)
  INSERT INTO acr_target (part_id,supplier_id,target_year,base_price,base_year,target_reduction_pct,target_price,agreed_price,actual_reduction_pct,status,currency,notes,created_by)
  SELECT (SELECT id FROM part_master WHERE part_number='DPN-1001'),v_sup101,2025,18.13,2024,4.0,17.40,16.90,6.8,'agreed','GBP','FY2025 ACR — agreed March 2025 via process audit + overhead challenge',v_user
  WHERE NOT EXISTS (SELECT 1 FROM acr_target WHERE part_id=(SELECT id FROM part_master WHERE part_number='DPN-1001') AND supplier_id=v_sup101 AND target_year=2025);

  INSERT INTO acr_target (part_id,supplier_id,target_year,base_price,base_year,target_reduction_pct,target_price,agreed_price,actual_reduction_pct,status,currency,notes,created_by)
  SELECT (SELECT id FROM part_master WHERE part_number='BRK-2001'),v_sup101,2025,13.17,2024,5.0,12.51,12.33,6.4,'agreed','GBP','FY2025 ACR — CNC toolpath optimisation + scrap rate improvement',v_user
  WHERE NOT EXISTS (SELECT 1 FROM acr_target WHERE part_id=(SELECT id FROM part_master WHERE part_number='BRK-2001') AND supplier_id=v_sup101 AND target_year=2025);

  INSERT INTO acr_target (part_id,supplier_id,target_year,base_price,base_year,target_reduction_pct,target_price,status,currency,notes,created_by)
  SELECT (SELECT id FROM part_master WHERE part_number='STK-7001'),v_sup102,2025,32.15,2024,5.0,30.54,'open','GBP','FY2025 ACR — targeting forging die maintenance cost reduction + 5-axis cycle time',v_user
  WHERE NOT EXISTS (SELECT 1 FROM acr_target WHERE part_id=(SELECT id FROM part_master WHERE part_number='STK-7001') AND supplier_id=v_sup102 AND target_year=2025);

  INSERT INTO acr_target (part_id,supplier_id,target_year,base_price,base_year,target_reduction_pct,target_price,status,currency,notes,created_by)
  SELECT (SELECT id FROM part_master WHERE part_number='GBX-COV-002'),v_sup105,2025,26.80,2024,8.0,24.66,'open','GBP','FY2025 ACR — HPDC cycle time + overhead. Supplier investment in new 320T cell.',v_user
  WHERE NOT EXISTS (SELECT 1 FROM acr_target WHERE part_id=(SELECT id FROM part_master WHERE part_number='GBX-COV-002') AND supplier_id=v_sup105 AND target_year=2025);

  INSERT INTO acr_target (part_id,supplier_id,target_year,base_price,base_year,target_reduction_pct,target_price,status,currency,notes,created_by)
  SELECT (SELECT id FROM part_master WHERE part_number='BRK-SHK-001'),v_sup107,2025,9.85,2024,6.0,9.26,'open','GBP','FY2025 ACR — progressive die efficiency + e-coat bath sharing with adjacent line',v_user
  WHERE NOT EXISTS (SELECT 1 FROM acr_target WHERE part_id=(SELECT id FROM part_master WHERE part_number='BRK-SHK-001') AND supplier_id=v_sup107 AND target_year=2025);

  INSERT INTO acr_target (part_id,supplier_id,target_year,base_price,base_year,target_reduction_pct,target_price,status,currency,notes,created_by)
  SELECT (SELECT id FROM part_master WHERE part_number='ENG-CAM-004'),v_sup106,2025,17.45,2024,7.0,16.23,'open','GBP','FY2025 ACR — resin cost indexation + moulding cycle reduction target 48s',v_user
  WHERE NOT EXISTS (SELECT 1 FROM acr_target WHERE part_id=(SELECT id FROM part_master WHERE part_number='ENG-CAM-004') AND supplier_id=v_sup106 AND target_year=2025);

  INSERT INTO acr_target (part_id,supplier_id,target_year,base_price,base_year,target_reduction_pct,target_price,agreed_price,actual_reduction_pct,status,currency,notes,created_by)
  SELECT (SELECT id FROM part_master WHERE part_number='SEA-3001'),v_sup101,2025,35.10,2024,5.0,33.35,31.00,11.7,'agreed','GBP','FY2025 ACR — BOP recliner re-sourced. £4.10/part total saving vs 2024 baseline.',v_user
  WHERE NOT EXISTS (SELECT 1 FROM acr_target WHERE part_id=(SELECT id FROM part_master WHERE part_number='SEA-3001') AND supplier_id=v_sup101 AND target_year=2025);
END $$;

-- ============================================================
-- 6. ASSEMBLY BOMs — 3 Assemblies
-- ============================================================
DO $$
DECLARE
  v_user UUID;
  v_asm  INTEGER;
  v_sc   INTEGER;
BEGIN
  SELECT id INTO v_user FROM "user" WHERE email = 'avinash.bhosale@costlens.io';

  -- ── Assembly 1: Front Suspension Corner Module — SUV1 ──────────────
  IF NOT EXISTS (SELECT 1 FROM assembly_header WHERE assembly_number = 'ASM-FSM-001') THEN
    INSERT INTO assembly_header (assembly_number, description, program_id, currency, notes, created_by)
    VALUES ('ASM-FSM-001','Front Suspension Corner Module',
            (SELECT id FROM vehicle_program WHERE code='SUV1'),'GBP',
            'Complete corner assembly: shock bracket + control arm + knuckle + brake disc',v_user)
    RETURNING id INTO v_asm;

    -- Shock Bracket
    SELECT id INTO v_sc FROM should_cost_header WHERE part_id=(SELECT id FROM part_master WHERE part_number='BRK-SHK-001') AND status='published' ORDER BY version DESC LIMIT 1;
    INSERT INTO assembly_bom_line (assembly_header_id,part_id,should_cost_header_id,quantity,sort_order,notes)
    VALUES (v_asm,(SELECT id FROM part_master WHERE part_number='BRK-SHK-001'),v_sc,2,1,'LH + RH');

    -- Control Arm
    SELECT id INTO v_sc FROM should_cost_header WHERE part_id=(SELECT id FROM part_master WHERE part_number='SUS-CTL-003') AND status='published' ORDER BY version DESC LIMIT 1;
    INSERT INTO assembly_bom_line (assembly_header_id,part_id,should_cost_header_id,quantity,sort_order,notes)
    VALUES (v_asm,(SELECT id FROM part_master WHERE part_number='SUS-CTL-003'),v_sc,1,2,'LH only — mirror image');

    -- Steering Knuckle
    SELECT id INTO v_sc FROM should_cost_header WHERE part_id=(SELECT id FROM part_master WHERE part_number='STK-7001') AND status='published' ORDER BY version DESC LIMIT 1;
    INSERT INTO assembly_bom_line (assembly_header_id,part_id,should_cost_header_id,quantity,sort_order,notes)
    VALUES (v_asm,(SELECT id FROM part_master WHERE part_number='STK-7001'),v_sc,1,3,'Forged Al — LH');

    -- Brake Disc
    SELECT id INTO v_sc FROM should_cost_header WHERE part_id=(SELECT id FROM part_master WHERE part_number='BRK-2001') AND status='published' ORDER BY version DESC LIMIT 1;
    INSERT INTO assembly_bom_line (assembly_header_id,part_id,should_cost_header_id,quantity,sort_order,notes)
    VALUES (v_asm,(SELECT id FROM part_master WHERE part_number='BRK-2001'),v_sc,1,4,'Ventilated cast iron');
  END IF;

  -- ── Assembly 2: Engine Top End Module — SUV2 ────────────────────────
  IF NOT EXISTS (SELECT 1 FROM assembly_header WHERE assembly_number = 'ASM-ETE-002') THEN
    INSERT INTO assembly_header (assembly_number, description, program_id, currency, notes, created_by)
    VALUES ('ASM-ETE-002','Engine Top End Module',
            (SELECT id FROM vehicle_program WHERE code='SUV2'),'GBP',
            'Camshaft cover + turbo bracket + gearbox cover assembled as a module for engine build',v_user)
    RETURNING id INTO v_asm;

    SELECT id INTO v_sc FROM should_cost_header WHERE part_id=(SELECT id FROM part_master WHERE part_number='ENG-CAM-004') AND status='published' ORDER BY version DESC LIMIT 1;
    INSERT INTO assembly_bom_line (assembly_header_id,part_id,should_cost_header_id,quantity,sort_order,notes)
    VALUES (v_asm,(SELECT id FROM part_master WHERE part_number='ENG-CAM-004'),v_sc,1,1,'PA66-GF30 cam cover');

    SELECT id INTO v_sc FROM should_cost_header WHERE part_id=(SELECT id FROM part_master WHERE part_number='ENG-TRB-005') AND status='published' ORDER BY version DESC LIMIT 1;
    INSERT INTO assembly_bom_line (assembly_header_id,part_id,should_cost_header_id,quantity,sort_order,notes)
    VALUES (v_asm,(SELECT id FROM part_master WHERE part_number='ENG-TRB-005'),v_sc,1,2,'Turbo mounting bracket');

    SELECT id INTO v_sc FROM should_cost_header WHERE part_id=(SELECT id FROM part_master WHERE part_number='GBX-COV-002') AND status='published' ORDER BY version DESC LIMIT 1;
    INSERT INTO assembly_bom_line (assembly_header_id,part_id,should_cost_header_id,quantity,sort_order,notes)
    VALUES (v_asm,(SELECT id FROM part_master WHERE part_number='GBX-COV-002'),v_sc,1,3,'ADC12 gearbox side cover');
  END IF;

  -- ── Assembly 3: Door Inner Module — SUV1 ───────────────────────────
  IF NOT EXISTS (SELECT 1 FROM assembly_header WHERE assembly_number = 'ASM-DIM-003') THEN
    INSERT INTO assembly_header (assembly_number, description, program_id, currency, notes, created_by)
    VALUES ('ASM-DIM-003','Door Inner Module — LH Front',
            (SELECT id FROM vehicle_program WHERE code='SUV1'),'GBP',
            'Door outer panel + seat frame sub-assembly + wiring harness module',v_user)
    RETURNING id INTO v_asm;

    SELECT id INTO v_sc FROM should_cost_header WHERE part_id=(SELECT id FROM part_master WHERE part_number='DPN-1001') AND status='published' ORDER BY version DESC LIMIT 1;
    INSERT INTO assembly_bom_line (assembly_header_id,part_id,should_cost_header_id,quantity,sort_order,notes)
    VALUES (v_asm,(SELECT id FROM part_master WHERE part_number='DPN-1001'),v_sc,1,1,'Door outer panel LH');

    SELECT id INTO v_sc FROM should_cost_header WHERE part_id=(SELECT id FROM part_master WHERE part_number='WIR-1002') AND status='published' ORDER BY version DESC LIMIT 1;
    INSERT INTO assembly_bom_line (assembly_header_id,part_id,should_cost_header_id,quantity,sort_order,notes)
    VALUES (v_asm,(SELECT id FROM part_master WHERE part_number='WIR-1002'),v_sc,1,2,'Floor harness — feeds door zone');

    SELECT id INTO v_sc FROM should_cost_header WHERE part_id=(SELECT id FROM part_master WHERE part_number='LMP-4001') AND status='published' ORDER BY version DESC LIMIT 1;
    INSERT INTO assembly_bom_line (assembly_header_id,part_id,should_cost_header_id,quantity,sort_order,notes)
    VALUES (v_asm,(SELECT id FROM part_master WHERE part_number='LMP-4001'),v_sc,1,3,'LED headlamp — door zone integration');
  END IF;
END $$;

-- ============================================================
-- 7. CER ACCURACY LOGS — 12 Records
-- ============================================================
DO $$
DECLARE v_user UUID;
BEGIN
  SELECT id INTO v_user FROM "user" WHERE email = 'avinash.bhosale@costlens.io';

  -- Stamping parts — generally good accuracy (<10%)
  IF NOT EXISTS (SELECT 1 FROM cer_accuracy_log WHERE part_id=(SELECT id FROM part_master WHERE part_number='BRK-SHK-001')) THEN
    INSERT INTO cer_accuracy_log (process_type,country,part_weight_kg,material_name,cycle_time_sec,annual_volume,estimated_total,actual_settled,part_id,notes,settled_at,created_by)
    VALUES ('Stamping','India',1.85,'Cold Rolled Steel (CR4)',18,80000,8.42,8.87,
            (SELECT id FROM part_master WHERE part_number='BRK-SHK-001'),
            'CER estimate vs awarded price to Precision Stampings. 5.3% over — overhead slightly under-estimated.','2025-04-15',v_user);
  END IF;

  -- HPDC casting — moderate accuracy
  IF NOT EXISTS (SELECT 1 FROM cer_accuracy_log WHERE part_id=(SELECT id FROM part_master WHERE part_number='GBX-COV-002')) THEN
    INSERT INTO cer_accuracy_log (process_type,country,part_weight_kg,material_name,cycle_time_sec,annual_volume,estimated_total,actual_settled,part_id,notes,settled_at,created_by)
    VALUES ('Die Casting (Aluminium)','India',3.20,'Aluminium ADC12 Alloy',95,50000,22.65,24.50,
            (SELECT id FROM part_master WHERE part_number='GBX-COV-002'),
            'CER vs Endurance quote. 8.2% gap — die cycle time conservative at 95s, supplier quoted 120s.','2025-05-10',v_user);
  END IF;

  -- Forging — less accurate (complex process variability)
  IF NOT EXISTS (SELECT 1 FROM cer_accuracy_log WHERE part_id=(SELECT id FROM part_master WHERE part_number='SUS-CTL-003')) THEN
    INSERT INTO cer_accuracy_log (process_type,country,part_weight_kg,material_name,cycle_time_sec,annual_volume,estimated_total,actual_settled,part_id,notes,settled_at,created_by)
    VALUES ('Forging','India',2.45,'Aluminium 6082 T6',180,60000,32.18,37.90,
            (SELECT id FROM part_master WHERE part_number='SUS-CTL-003'),
            'CER vs Bharat Forge quote. 17.8% gap — die maintenance costs not captured in CER, complex 3-blow sequence.','2025-05-25',v_user);
  END IF;

  -- Injection moulding — good accuracy
  IF NOT EXISTS (SELECT 1 FROM cer_accuracy_log WHERE part_id=(SELECT id FROM part_master WHERE part_number='ENG-CAM-004')) THEN
    INSERT INTO cer_accuracy_log (process_type,country,part_weight_kg,material_name,cycle_time_sec,annual_volume,estimated_total,actual_settled,part_id,notes,settled_at,created_by)
    VALUES ('Injection Moulding','India',0.92,'Nylon PA66-GF30',55,70000,14.82,16.20,
            (SELECT id FROM part_master WHERE part_number='ENG-CAM-004'),
            'CER vs Minda quote. 9.3% gap — BOP (oil separator) procurement price differed.','2025-06-01',v_user);
  END IF;

  -- CNC machining — moderate accuracy
  IF NOT EXISTS (SELECT 1 FROM cer_accuracy_log WHERE part_id=(SELECT id FROM part_master WHERE part_number='ENG-TRB-005')) THEN
    INSERT INTO cer_accuracy_log (process_type,country,part_weight_kg,material_name,cycle_time_sec,annual_volume,estimated_total,actual_settled,part_id,notes,settled_at,created_by)
    VALUES ('Machining (3-axis CNC)','India',2.10,'Hot Rolled Steel (HR3)',380,45000,18.65,21.80,
            (SELECT id FROM part_master WHERE part_number='ENG-TRB-005'),
            'CER vs Mitra quote. 16.9% gap — setup time per batch not included, small volume (45k) increases burden.','2025-06-10',v_user);
  END IF;

  -- Pre-existing parts from seed_demo_data — add accuracy records
  INSERT INTO cer_accuracy_log (process_type,country,part_weight_kg,material_name,cycle_time_sec,annual_volume,estimated_total,actual_settled,part_id,notes,settled_at,created_by)
  SELECT 'Stamping','United Kingdom',7.20,'Cold Rolled Steel (CR4)',22,60000,16.50,18.13,
         (SELECT id FROM part_master WHERE part_number='DPN-1001'),
         'Door outer panel CER vs Sterling Precision incumbent. 9.9% gap — SG&A and UK overhead higher than model.','2025-01-20',v_user
  WHERE NOT EXISTS (SELECT 1 FROM cer_accuracy_log WHERE part_id=(SELECT id FROM part_master WHERE part_number='DPN-1001'));

  INSERT INTO cer_accuracy_log (process_type,country,part_weight_kg,material_name,cycle_time_sec,annual_volume,estimated_total,actual_settled,part_id,notes,settled_at,created_by)
  SELECT 'Die Casting (Aluminium)','India',3.50,'Aluminium ADC12 Alloy',88,60000,11.77,13.17,
         (SELECT id FROM part_master WHERE part_number='BRK-2001'),
         'Brake disc CER vs Sterling quote. 11.9% gap — pattern tooling and GG20 iron price variation.','2025-02-15',v_user
  WHERE NOT EXISTS (SELECT 1 FROM cer_accuracy_log WHERE part_id=(SELECT id FROM part_master WHERE part_number='BRK-2001'));

  INSERT INTO cer_accuracy_log (process_type,country,part_weight_kg,material_name,cycle_time_sec,annual_volume,estimated_total,actual_settled,part_id,notes,settled_at,created_by)
  SELECT 'Welding Assembly','United Kingdom',8.40,'Hot Rolled Steel (HR3)',210,60000,31.20,34.33,
         (SELECT id FROM part_master WHERE part_number='SEA-3001'),
         'Seat frame CER vs Sterling. 10.0% gap — recliner BOP purchase price mis-estimated by £0.70.','2025-03-10',v_user
  WHERE NOT EXISTS (SELECT 1 FROM cer_accuracy_log WHERE part_id=(SELECT id FROM part_master WHERE part_number='SEA-3001'));

  INSERT INTO cer_accuracy_log (process_type,country,part_weight_kg,material_name,cycle_time_sec,annual_volume,estimated_total,actual_settled,part_id,notes,settled_at,created_by)
  SELECT 'Machining (5-axis CNC)','India',3.60,'Aluminium 6082 T6',420,80000,28.50,32.15,
         (SELECT id FROM part_master WHERE part_number='STK-7001'),
         'Steering knuckle CER vs Mitra. 12.8% gap — 5-axis cycle time benchmark was optimistic vs actual supplier capability.','2025-03-25',v_user
  WHERE NOT EXISTS (SELECT 1 FROM cer_accuracy_log WHERE part_id=(SELECT id FROM part_master WHERE part_number='STK-7001'));

  INSERT INTO cer_accuracy_log (process_type,country,part_weight_kg,material_name,cycle_time_sec,annual_volume,estimated_total,actual_settled,part_id,notes,settled_at,created_by)
  SELECT 'Injection Moulding','India',4.20,'Polypropylene PP-GF20',62,60000,16.60,17.48,
         (SELECT id FROM part_master WHERE part_number='IPN-9001'),
         'IP substrate CER vs Motherson. 5.3% gap — volumetric freight cost slightly under-estimated.','2025-04-05',v_user
  WHERE NOT EXISTS (SELECT 1 FROM cer_accuracy_log WHERE part_id=(SELECT id FROM part_master WHERE part_number='IPN-9001'));

  INSERT INTO cer_accuracy_log (process_type,country,part_weight_kg,material_name,cycle_time_sec,annual_volume,estimated_total,actual_settled,part_id,notes,settled_at,created_by)
  SELECT 'Welding Assembly','India',6.20,'Stainless Steel SS409',185,50000,14.52,15.90,
         (SELECT id FROM part_master WHERE part_number='EXH-8001'),
         'Exhaust muffler CER. 9.5% gap — SS409 price was higher than model due to Ni surcharge Q1 2025.','2025-04-18',v_user
  WHERE NOT EXISTS (SELECT 1 FROM cer_accuracy_log WHERE part_id=(SELECT id FROM part_master WHERE part_number='EXH-8001'));

  INSERT INTO cer_accuracy_log (process_type,country,part_weight_kg,material_name,cycle_time_sec,annual_volume,estimated_total,actual_settled,part_id,notes,settled_at,created_by)
  SELECT 'Stamping','India',4.80,'Aluminium ADC12 Alloy',35,40000,19.25,20.65,
         (SELECT id FROM part_master WHERE part_number='BAT-6001'),
         'Battery cooling plate CER. 7.3% gap — CAB brazing furnace energy cost higher than benchmark.','2025-05-02',v_user
  WHERE NOT EXISTS (SELECT 1 FROM cer_accuracy_log WHERE part_id=(SELECT id FROM part_master WHERE part_number='BAT-6001'));
END $$;

-- ============================================================
-- 8. UPDATE EXISTING SHOULD-COST HEADERS WITH PROCESS PARAMS
-- ============================================================
UPDATE should_cost_header SET
  part_weight_kg=7.20, material_code='STL-CRC', manufacturing_country='United Kingdom',
  machine_type='Stamping (Progressive Die)', cycle_time_sec=22, labour_rate_hr=18.50,
  machine_rate_hr=45.00, scrap_rate_pct=3.5
WHERE part_id=(SELECT id FROM part_master WHERE part_number='DPN-1001') AND part_weight_kg IS NULL;

UPDATE should_cost_header SET
  part_weight_kg=9.50, material_code='STL-HRC', manufacturing_country='United Kingdom',
  machine_type='Die Casting (Aluminium)', cycle_time_sec=88, labour_rate_hr=18.50,
  machine_rate_hr=52.00, scrap_rate_pct=4.0
WHERE part_id=(SELECT id FROM part_master WHERE part_number='BRK-2001') AND part_weight_kg IS NULL;

UPDATE should_cost_header SET
  part_weight_kg=8.40, material_code='STL-HRC', manufacturing_country='United Kingdom',
  machine_type='Welding Assembly', cycle_time_sec=210, labour_rate_hr=18.50,
  machine_rate_hr=28.00, scrap_rate_pct=2.5
WHERE part_id=(SELECT id FROM part_master WHERE part_number='SEA-3001') AND part_weight_kg IS NULL;

UPDATE should_cost_header SET
  part_weight_kg=3.60, material_code='ALU-6082', manufacturing_country='India',
  machine_type='Machining (5-axis CNC)', cycle_time_sec=420, labour_rate_hr=5.50,
  machine_rate_hr=38.00, scrap_rate_pct=5.0, tooling_cost_total=180000, tooling_life_units=120000
WHERE part_id=(SELECT id FROM part_master WHERE part_number='STK-7001') AND part_weight_kg IS NULL;

UPDATE should_cost_header SET
  part_weight_kg=1.10, material_code='PPL-GF20', manufacturing_country='India',
  machine_type='Injection Moulding', cycle_time_sec=38, labour_rate_hr=4.50,
  machine_rate_hr=18.00, scrap_rate_pct=2.0, tooling_cost_total=62000, tooling_life_units=400000
WHERE part_id=(SELECT id FROM part_master WHERE part_number='HVC-5001') AND part_weight_kg IS NULL;

UPDATE should_cost_header SET
  part_weight_kg=4.80, material_code='ALU-ADC12', manufacturing_country='India',
  machine_type='Die Casting (Aluminium)', cycle_time_sec=72, labour_rate_hr=5.50,
  machine_rate_hr=30.00, scrap_rate_pct=4.5, tooling_cost_total=95000, tooling_life_units=150000
WHERE part_id=(SELECT id FROM part_master WHERE part_number='BAT-6001') AND part_weight_kg IS NULL;

UPDATE should_cost_header SET
  part_weight_kg=4.20, material_code='PPL-GF20', manufacturing_country='India',
  machine_type='Injection Moulding', cycle_time_sec=62, labour_rate_hr=4.50,
  machine_rate_hr=22.00, scrap_rate_pct=2.5, tooling_cost_total=115000, tooling_life_units=300000
WHERE part_id=(SELECT id FROM part_master WHERE part_number='IPN-9001') AND part_weight_kg IS NULL;

UPDATE should_cost_header SET
  part_weight_kg=6.20, material_code='STL-SS409', manufacturing_country='India',
  machine_type='Welding Assembly', cycle_time_sec=185, labour_rate_hr=4.50,
  machine_rate_hr=18.00, scrap_rate_pct=3.0, tooling_cost_total=28000, tooling_life_units=80000
WHERE part_id=(SELECT id FROM part_master WHERE part_number='EXH-8001') AND part_weight_kg IS NULL;

UPDATE should_cost_header SET
  part_weight_kg=1.85, material_code='COP-ETP', manufacturing_country='India',
  machine_type='Welding Assembly', cycle_time_sec=145, labour_rate_hr=4.50,
  machine_rate_hr=12.00, scrap_rate_pct=1.5, tooling_cost_total=18000, tooling_life_units=150000
WHERE part_id=(SELECT id FROM part_master WHERE part_number='WIR-1002') AND part_weight_kg IS NULL;

-- ============================================================
-- 9. COMPARISON SNAPSHOTS for key parts
-- ============================================================
DO $$
DECLARE
  v_user UUID; v_snap INTEGER;
  v_sc   INTEGER; v_q1   INTEGER; v_part INTEGER;
BEGIN
  SELECT id INTO v_user FROM "user" WHERE email = 'avinash.bhosale@costlens.io';

  -- Snapshot: DPN-1001 SC vs Sterling Quote
  SELECT id INTO v_part FROM part_master WHERE part_number = 'DPN-1001';
  SELECT id INTO v_sc   FROM should_cost_header WHERE part_id = v_part AND status = 'published' ORDER BY version DESC LIMIT 1;
  SELECT id INTO v_q1   FROM supplier_quote_header WHERE part_id = v_part AND supplier_id = (SELECT id FROM supplier WHERE code = 'SUP-101') ORDER BY version DESC LIMIT 1;
  IF v_sc IS NOT NULL AND v_q1 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM comparison_snapshot WHERE should_cost_header_id=v_sc AND supplier_quote_header_id=v_q1) THEN
    INSERT INTO comparison_snapshot (part_id,should_cost_header_id,supplier_quote_header_id,snapshot_name,total_should_cost,total_quote_price,total_variance,variance_pct,status,created_by)
    SELECT v_part,v_sc,v_q1,'DPN-1001 vs Sterling — Q1 2025 Review',
           sch.total_cost, sqh.total_price, sqh.total_price - sch.total_cost,
           ROUND((sqh.total_price - sch.total_cost)/sch.total_cost*100,2),'reviewed',v_user
    FROM should_cost_header sch, supplier_quote_header sqh
    WHERE sch.id=v_sc AND sqh.id=v_q1
    RETURNING id INTO v_snap;

    INSERT INTO comparison_detail (comparison_snapshot_id,cost_element,category,should_cost_value,quote_value,variance_pct,flag,sort_order)
    SELECT v_snap, scb.cost_element, scb.category, scb.value,
           COALESCE((SELECT sqb.value FROM supplier_quote_breakdown sqb JOIN supplier_quote_header sqh2 ON sqh2.id=sqb.supplier_quote_header_id WHERE sqh2.id=v_q1 AND sqb.cost_element=scb.cost_element LIMIT 1), scb.value),
           CASE WHEN scb.value > 0 THEN ROUND((COALESCE((SELECT sqb.value FROM supplier_quote_breakdown sqb JOIN supplier_quote_header sqh2 ON sqh2.id=sqb.supplier_quote_header_id WHERE sqh2.id=v_q1 AND sqb.cost_element=scb.cost_element LIMIT 1),scb.value) - scb.value)/scb.value*100,2) ELSE 0 END,
           CASE
             WHEN COALESCE((SELECT sqb.value FROM supplier_quote_breakdown sqb JOIN supplier_quote_header sqh2 ON sqh2.id=sqb.supplier_quote_header_id WHERE sqh2.id=v_q1 AND sqb.cost_element=scb.cost_element LIMIT 1),scb.value) > scb.value * 1.10 THEN 'over'
             WHEN COALESCE((SELECT sqb.value FROM supplier_quote_breakdown sqb JOIN supplier_quote_header sqh2 ON sqh2.id=sqb.supplier_quote_header_id WHERE sqh2.id=v_q1 AND sqb.cost_element=scb.cost_element LIMIT 1),scb.value) < scb.value * 0.95 THEN 'under'
             ELSE 'acceptable'
           END,
           scb.sort_order
    FROM should_cost_breakdown scb WHERE scb.should_cost_header_id = v_sc;
  END IF;

  -- Snapshot: BRK-2001 SC vs Sterling
  SELECT id INTO v_part FROM part_master WHERE part_number = 'BRK-2001';
  SELECT id INTO v_sc   FROM should_cost_header WHERE part_id = v_part AND status = 'published' ORDER BY version DESC LIMIT 1;
  SELECT id INTO v_q1   FROM supplier_quote_header WHERE part_id = v_part AND supplier_id = (SELECT id FROM supplier WHERE code = 'SUP-101') ORDER BY version DESC LIMIT 1;
  IF v_sc IS NOT NULL AND v_q1 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM comparison_snapshot WHERE should_cost_header_id=v_sc AND supplier_quote_header_id=v_q1) THEN
    INSERT INTO comparison_snapshot (part_id,should_cost_header_id,supplier_quote_header_id,snapshot_name,total_should_cost,total_quote_price,total_variance,variance_pct,status,created_by)
    SELECT v_part,v_sc,v_q1,'BRK-2001 Brake Disc — Cost Challenge Review',
           sch.total_cost, sqh.total_price, sqh.total_price - sch.total_cost,
           ROUND((sqh.total_price - sch.total_cost)/sch.total_cost*100,2),'open',v_user
    FROM should_cost_header sch, supplier_quote_header sqh
    WHERE sch.id=v_sc AND sqh.id=v_q1;
  END IF;

  -- Snapshot: GBX-COV-002 SC vs Endurance
  SELECT id INTO v_part FROM part_master WHERE part_number = 'GBX-COV-002';
  SELECT id INTO v_sc   FROM should_cost_header WHERE part_id = v_part AND status = 'published' ORDER BY version DESC LIMIT 1;
  SELECT id INTO v_q1   FROM supplier_quote_header WHERE part_id = v_part AND supplier_id = (SELECT id FROM supplier WHERE code = 'SUP-105') ORDER BY version DESC LIMIT 1;
  IF v_sc IS NOT NULL AND v_q1 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM comparison_snapshot WHERE should_cost_header_id=v_sc AND supplier_quote_header_id=v_q1) THEN
    INSERT INTO comparison_snapshot (part_id,should_cost_header_id,supplier_quote_header_id,snapshot_name,total_should_cost,total_quote_price,total_variance,variance_pct,status,created_by)
    SELECT v_part,v_sc,v_q1,'GBX-COV-002 vs Endurance — HPDC Challenge',
           sch.total_cost, sqh.total_price, sqh.total_price - sch.total_cost,
           ROUND((sqh.total_price - sch.total_cost)/sch.total_cost*100,2),'open',v_user
    FROM should_cost_header sch, supplier_quote_header sqh
    WHERE sch.id=v_sc AND sqh.id=v_q1;
  END IF;

  -- Snapshot: SUS-CTL-003 SC vs Bharat Forge
  SELECT id INTO v_part FROM part_master WHERE part_number = 'SUS-CTL-003';
  SELECT id INTO v_sc   FROM should_cost_header WHERE part_id = v_part AND status = 'published' ORDER BY version DESC LIMIT 1;
  SELECT id INTO v_q1   FROM supplier_quote_header WHERE part_id = v_part AND supplier_id = (SELECT id FROM supplier WHERE code = 'SUP-103') ORDER BY version DESC LIMIT 1;
  IF v_sc IS NOT NULL AND v_q1 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM comparison_snapshot WHERE should_cost_header_id=v_sc AND supplier_quote_header_id=v_q1) THEN
    INSERT INTO comparison_snapshot (part_id,should_cost_header_id,supplier_quote_header_id,snapshot_name,total_should_cost,total_quote_price,total_variance,variance_pct,status,created_by)
    SELECT v_part,v_sc,v_q1,'SUS-CTL-003 Control Arm — Forging Cost Challenge',
           sch.total_cost, sqh.total_price, sqh.total_price - sch.total_cost,
           ROUND((sqh.total_price - sch.total_cost)/sch.total_cost*100,2),'open',v_user
    FROM should_cost_header sch, supplier_quote_header sqh
    WHERE sch.id=v_sc AND sqh.id=v_q1;
  END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'Comprehensive demo seed complete.'; END $$;
