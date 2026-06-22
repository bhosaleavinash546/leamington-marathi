-- ============================================================
-- Demo Data Expansion — 15 additional parts (→ 20 total new)
-- + 10 more negotiations (→ 20 total)
-- + 5 more ACR targets (→ 20 total)
-- + 8 more CER accuracy logs (→ 20 total)
-- + 2 more Assembly BOMs
-- All statements idempotent.
-- ============================================================

-- ============================================================
-- ADDITIONAL PARTS 6–20 + SHOULD-COSTS + QUOTES
-- ============================================================
DO $$
DECLARE
  v_sup101 INTEGER; v_sup102 INTEGER; v_sup103 INTEGER;
  v_sup104 INTEGER; v_sup105 INTEGER; v_sup106 INTEGER; v_sup107 INTEGER; v_sup109 INTEGER;
  v_part INTEGER; v_sc INTEGER; v_q1 INTEGER; v_q2 INTEGER;
  v_user UUID;
BEGIN
  SELECT id INTO v_sup101 FROM supplier WHERE code='SUP-101';
  SELECT id INTO v_sup102 FROM supplier WHERE code='SUP-102';
  SELECT id INTO v_sup103 FROM supplier WHERE code='SUP-103';
  SELECT id INTO v_sup104 FROM supplier WHERE code='SUP-104';
  SELECT id INTO v_sup105 FROM supplier WHERE code='SUP-105';
  SELECT id INTO v_sup106 FROM supplier WHERE code='SUP-106';
  SELECT id INTO v_sup107 FROM supplier WHERE code='SUP-107';
  SELECT id INTO v_sup109 FROM supplier WHERE code='SUP-109';
  SELECT id INTO v_user   FROM "user" WHERE email='avinash.bhosale@costlens.io';

  -- ── PART 6: Rear Axle Mounting Bracket (Stamped HSLA) ────────────
  IF NOT EXISTS (SELECT 1 FROM part_master WHERE part_number='SUS-RAB-006') THEN
    INSERT INTO part_master (part_number,description,uom,commodity,drawing_rev,program_id,family_code,family_name)
    VALUES ('SUS-RAB-006','Rear Axle Mounting Bracket — HSLA 420',
            'EA','Stampings','C',(SELECT id FROM vehicle_program WHERE code='SUV2'),'FAM-BRK','Suspension Brackets')
    RETURNING id INTO v_part;

    INSERT INTO should_cost_header (part_id,version,status,annual_volume,currency,total_cost,notes,program_id,
      part_weight_kg,material_code,manufacturing_country,machine_type,cycle_time_sec,
      labour_rate_hr,machine_rate_hr,scrap_rate_pct,tooling_cost_total,tooling_life_units,created_by)
    VALUES (v_part,1,'published',70000,'GBP',11.28,'HSLA 420 4mm gauge — transfer press, 3 ops, e-coat',
      (SELECT id FROM vehicle_program WHERE code='SUV2'),
      2.80,'STL-HRC','India','Transfer Press',28,4.50,14.00,3.2,65000,180000,v_user)
    RETURNING id INTO v_sc;

    INSERT INTO should_cost_breakdown (should_cost_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_sc,'HSLA 420 Steel (2.80 kg @ £0.82/kg)','RAW_MATERIAL',2.30,'£/part',1),
      (v_sc,'Scrap & Offal (3.2%)','RAW_MATERIAL',0.32,'Material × scrap',2),
      (v_sc,'Blank & Transfer Op1','MANUFACTURING',1.85,'Press £14/hr × 28s',3),
      (v_sc,'Form & Pierce Op2','MANUFACTURING',1.42,'Press £14/hr × 22s',4),
      (v_sc,'Flange & Restrike Op3','MANUFACTURING',0.98,'Press £12/hr × 18s',5),
      (v_sc,'E-Coat Treatment','MANUFACTURING',0.62,'Surface finish',6),
      (v_sc,'Factory Overhead (30%)','OVERHEAD',1.28,'% conversion',7),
      (v_sc,'SG&A (11%)','OVERHEAD',0.72,'% total',8),
      (v_sc,'Packaging','LOGISTICS',0.30,'Returnable tray',9),
      (v_sc,'Freight','LOGISTICS',0.38,'Road freight India',10),
      (v_sc,'Tooling Amortisation','TOOLING',0.36,'£65k ÷ 180k',11),
      (v_sc,'Profit (5%)','PROFIT',0.75,'5% of total',12);

    INSERT INTO supplier_quote_header (part_id,supplier_id,version,status,rfq_number,annual_volume,currency,total_price,validity_date,submitted_at,program_id)
    VALUES (v_part,v_sup107,1,'submitted','RFQ-2025-RAB-006',70000,'GBP',13.10,'2026-06-30',NOW()-'18 days'::INTERVAL,
            (SELECT id FROM vehicle_program WHERE code='SUV2')) RETURNING id INTO v_q1;
    INSERT INTO supplier_quote_breakdown (supplier_quote_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_q1,'HSLA Steel','RAW_MATERIAL',2.52,'£/part',1),(v_q1,'Scrap & Offal','RAW_MATERIAL',0.38,'£/part',2),
      (v_q1,'Op1 Blank & Transfer','MANUFACTURING',2.10,'£/part',3),(v_q1,'Op2 Form & Pierce','MANUFACTURING',1.65,'£/part',4),
      (v_q1,'Op3 Flange','MANUFACTURING',1.18,'£/part',5),(v_q1,'E-Coat','MANUFACTURING',0.75,'£/part',6),
      (v_q1,'Factory Overhead','OVERHEAD',1.55,'£/part',7),(v_q1,'SG&A','OVERHEAD',0.88,'£/part',8),
      (v_q1,'Packaging','LOGISTICS',0.35,'£/part',9),(v_q1,'Freight','LOGISTICS',0.45,'£/part',10),
      (v_q1,'Tooling','TOOLING',0.42,'£/part',11),(v_q1,'Profit','PROFIT',0.87,'£/part',12);

    INSERT INTO supplier_quote_header (part_id,supplier_id,version,status,rfq_number,annual_volume,currency,total_price,validity_date,submitted_at,program_id)
    VALUES (v_part,v_sup102,1,'submitted','RFQ-2025-RAB-006',70000,'GBP',12.15,'2026-06-30',NOW()-'11 days'::INTERVAL,
            (SELECT id FROM vehicle_program WHERE code='SUV2')) RETURNING id INTO v_q2;
    INSERT INTO supplier_quote_breakdown (supplier_quote_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_q2,'HSLA Steel','RAW_MATERIAL',2.38,'£/part',1),(v_q2,'Scrap & Offal','RAW_MATERIAL',0.34,'£/part',2),
      (v_q2,'Op1 Blank','MANUFACTURING',1.95,'£/part',3),(v_q2,'Op2 Form','MANUFACTURING',1.52,'£/part',4),
      (v_q2,'Op3 Flange','MANUFACTURING',1.08,'£/part',5),(v_q2,'E-Coat','MANUFACTURING',0.68,'£/part',6),
      (v_q2,'Factory Overhead','OVERHEAD',1.40,'£/part',7),(v_q2,'SG&A','OVERHEAD',0.80,'£/part',8),
      (v_q2,'Packaging','LOGISTICS',0.32,'£/part',9),(v_q2,'Freight','LOGISTICS',0.55,'£/part',10),
      (v_q2,'Tooling','TOOLING',0.38,'£/part',11),(v_q2,'Profit','PROFIT',0.75,'£/part',12);
  END IF;

  -- ── PART 7: Oil Pump Body (HPDC Aluminium) ───────────────────────
  IF NOT EXISTS (SELECT 1 FROM part_master WHERE part_number='ENG-OPB-007') THEN
    INSERT INTO part_master (part_number,description,uom,commodity,drawing_rev,program_id)
    VALUES ('ENG-OPB-007','Engine Oil Pump Body — ADC12 HPDC','EA','Castings','B',
            (SELECT id FROM vehicle_program WHERE code='SUV1')) RETURNING id INTO v_part;

    INSERT INTO should_cost_header (part_id,version,status,annual_volume,currency,total_cost,notes,program_id,
      part_weight_kg,material_code,manufacturing_country,machine_type,cycle_time_sec,
      labour_rate_hr,machine_rate_hr,scrap_rate_pct,tooling_cost_total,tooling_life_units,created_by)
    VALUES (v_part,1,'published',80000,'GBP',16.45,'ADC12 HPDC 160T — 3 CNC ops, pressure tested',
      (SELECT id FROM vehicle_program WHERE code='SUV1'),
      1.65,'ALU-ADC12','India','HPDC 160T + CNC',72,5.50,24.00,3.5,95000,200000,v_user)
    RETURNING id INTO v_sc;

    INSERT INTO should_cost_breakdown (should_cost_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_sc,'ADC12 Alloy (1.65 kg @ £1.96/kg)','RAW_MATERIAL',3.23,'LME Al + alloy',1),
      (v_sc,'Runner & Overflow (3.5%)','RAW_MATERIAL',0.38,'Shot weight loss',2),
      (v_sc,'HPDC 160T (72s cycle)','MANUFACTURING',4.80,'Machine £24/hr',3),
      (v_sc,'CNC Op10 — port machining','MANUFACTURING',1.62,'CNC £22/hr × 90s',4),
      (v_sc,'CNC Op20 — housing bore','MANUFACTURING',0.98,'CNC £22/hr × 55s',5),
      (v_sc,'Pressure Test (2 bar)','MANUFACTURING',0.38,'Test rig £/part',6),
      (v_sc,'Factory Overhead (35%)','OVERHEAD',1.72,'% conversion',7),
      (v_sc,'SG&A (9%)','OVERHEAD',0.82,'% total',8),
      (v_sc,'Packaging','LOGISTICS',0.28,'VCI bag + box',9),
      (v_sc,'Freight','LOGISTICS',0.35,'Road freight',10),
      (v_sc,'Die Tooling Amortisation','TOOLING',0.48,'£95k ÷ 200k',11),
      (v_sc,'Profit (5.5%)','PROFIT',0.75,'5.5% total',12);

    INSERT INTO supplier_quote_header (part_id,supplier_id,version,status,rfq_number,annual_volume,currency,total_price,validity_date,submitted_at,program_id)
    VALUES (v_part,v_sup105,1,'submitted','RFQ-2025-OPB-007',80000,'GBP',19.20,'2026-09-30',NOW()-'25 days'::INTERVAL,
            (SELECT id FROM vehicle_program WHERE code='SUV1')) RETURNING id INTO v_q1;
    INSERT INTO supplier_quote_breakdown (supplier_quote_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_q1,'ADC12 Alloy','RAW_MATERIAL',3.55,'£/part',1),(v_q1,'Runner & Overflow','RAW_MATERIAL',0.45,'£/part',2),
      (v_q1,'HPDC Casting','MANUFACTURING',5.55,'£/part',3),(v_q1,'CNC Op10','MANUFACTURING',1.92,'£/part',4),
      (v_q1,'CNC Op20','MANUFACTURING',1.18,'£/part',5),(v_q1,'Pressure Test','MANUFACTURING',0.45,'£/part',6),
      (v_q1,'Factory Overhead','OVERHEAD',2.08,'£/part',7),(v_q1,'SG&A','OVERHEAD',1.00,'£/part',8),
      (v_q1,'Packaging','LOGISTICS',0.32,'£/part',9),(v_q1,'Freight','LOGISTICS',0.42,'£/part',10),
      (v_q1,'Tooling','TOOLING',0.55,'£/part',11),(v_q1,'Profit','PROFIT',1.73,'£/part',12);

    INSERT INTO supplier_quote_header (part_id,supplier_id,version,status,rfq_number,annual_volume,currency,total_price,validity_date,submitted_at,program_id)
    VALUES (v_part,v_sup102,1,'submitted','RFQ-2025-OPB-007',80000,'GBP',17.85,'2026-09-30',NOW()-'14 days'::INTERVAL,
            (SELECT id FROM vehicle_program WHERE code='SUV1')) RETURNING id INTO v_q2;
    INSERT INTO supplier_quote_breakdown (supplier_quote_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_q2,'ADC12 Alloy','RAW_MATERIAL',3.38,'£/part',1),(v_q2,'Runner & Overflow','RAW_MATERIAL',0.40,'£/part',2),
      (v_q2,'HPDC Casting','MANUFACTURING',5.10,'£/part',3),(v_q2,'CNC Op10','MANUFACTURING',1.78,'£/part',4),
      (v_q2,'CNC Op20','MANUFACTURING',1.10,'£/part',5),(v_q2,'Pressure Test','MANUFACTURING',0.42,'£/part',6),
      (v_q2,'Factory Overhead','OVERHEAD',1.92,'£/part',7),(v_q2,'SG&A','OVERHEAD',0.92,'£/part',8),
      (v_q2,'Packaging','LOGISTICS',0.30,'£/part',9),(v_q2,'Freight','LOGISTICS',0.48,'£/part',10),
      (v_q2,'Tooling','TOOLING',0.52,'£/part',11),(v_q2,'Profit','PROFIT',1.53,'£/part',12);
  END IF;

  -- ── PART 8: ABS Sensor Bracket (Light Stamping) ──────────────────
  IF NOT EXISTS (SELECT 1 FROM part_master WHERE part_number='BRK-ABS-008') THEN
    INSERT INTO part_master (part_number,description,uom,commodity,drawing_rev,program_id)
    VALUES ('BRK-ABS-008','ABS Wheel Speed Sensor Bracket — CR2 Steel',
            'EA','Stampings','A',(SELECT id FROM vehicle_program WHERE code='SUV3'))
    RETURNING id INTO v_part;

    INSERT INTO should_cost_header (part_id,version,status,annual_volume,currency,total_cost,notes,program_id,
      part_weight_kg,material_code,manufacturing_country,machine_type,cycle_time_sec,
      labour_rate_hr,machine_rate_hr,scrap_rate_pct,tooling_cost_total,tooling_life_units,created_by)
    VALUES (v_part,1,'published',120000,'GBP',3.82,'Light gauge CR2 0.8mm — progressive die, zinc nickel plated',
      (SELECT id FROM vehicle_program WHERE code='SUV3'),
      0.28,'STL-CRC','India','Progressive Die',8,4.50,10.00,2.0,22000,500000,v_user)
    RETURNING id INTO v_sc;

    INSERT INTO should_cost_breakdown (should_cost_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_sc,'CR2 Steel Strip (0.28 kg @ £0.94/kg)','RAW_MATERIAL',0.26,'Coil price',1),
      (v_sc,'Scrap & Offal (2%)','RAW_MATERIAL',0.08,'Material × scrap',2),
      (v_sc,'Progressive Die Stamp (8s)','MANUFACTURING',0.88,'Press £10/hr',3),
      (v_sc,'Zinc-Nickel Plating','MANUFACTURING',0.52,'Barrel plating per kg',4),
      (v_sc,'Factory Overhead (28%)','OVERHEAD',0.58,'% conversion',5),
      (v_sc,'SG&A (10%)','OVERHEAD',0.32,'% total',6),
      (v_sc,'Packaging (bulk bag)','LOGISTICS',0.08,'Poly bag bulk pack',7),
      (v_sc,'Freight','LOGISTICS',0.18,'Road freight India',8),
      (v_sc,'Tooling Amortisation','TOOLING',0.04,'£22k ÷ 500k',9),
      (v_sc,'Profit (5%)','PROFIT',0.18,'5% of total',10);

    INSERT INTO supplier_quote_header (part_id,supplier_id,version,status,rfq_number,annual_volume,currency,total_price,validity_date,submitted_at,program_id)
    VALUES (v_part,v_sup107,1,'submitted','RFQ-2025-ABS-008',120000,'GBP',4.55,'2026-06-30',NOW()-'10 days'::INTERVAL,
            (SELECT id FROM vehicle_program WHERE code='SUV3')) RETURNING id INTO v_q1;
    INSERT INTO supplier_quote_breakdown (supplier_quote_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_q1,'CR2 Steel Strip','RAW_MATERIAL',0.30,'£/part',1),(v_q1,'Scrap','RAW_MATERIAL',0.10,'£/part',2),
      (v_q1,'Stamping','MANUFACTURING',1.05,'£/part',3),(v_q1,'Zn-Ni Plating','MANUFACTURING',0.65,'£/part',4),
      (v_q1,'Overhead','OVERHEAD',0.72,'£/part',5),(v_q1,'SG&A','OVERHEAD',0.40,'£/part',6),
      (v_q1,'Packaging','LOGISTICS',0.10,'£/part',7),(v_q1,'Freight','LOGISTICS',0.22,'£/part',8),
      (v_q1,'Tooling','TOOLING',0.05,'£/part',9),(v_q1,'Profit','PROFIT',0.96,'£/part',10);

    INSERT INTO supplier_quote_header (part_id,supplier_id,version,status,rfq_number,annual_volume,currency,total_price,validity_date,submitted_at,program_id)
    VALUES (v_part,v_sup102,1,'submitted','RFQ-2025-ABS-008',120000,'GBP',4.15,'2026-06-30',NOW()-'6 days'::INTERVAL,
            (SELECT id FROM vehicle_program WHERE code='SUV3')) RETURNING id INTO v_q2;
    INSERT INTO supplier_quote_breakdown (supplier_quote_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_q2,'CR2 Steel Strip','RAW_MATERIAL',0.28,'£/part',1),(v_q2,'Scrap','RAW_MATERIAL',0.09,'£/part',2),
      (v_q2,'Stamping','MANUFACTURING',0.95,'£/part',3),(v_q2,'Zn-Ni Plating','MANUFACTURING',0.60,'£/part',4),
      (v_q2,'Overhead','OVERHEAD',0.65,'£/part',5),(v_q2,'SG&A','OVERHEAD',0.35,'£/part',6),
      (v_q2,'Packaging','LOGISTICS',0.09,'£/part',7),(v_q2,'Freight','LOGISTICS',0.28,'£/part',8),
      (v_q2,'Tooling','TOOLING',0.04,'£/part',9),(v_q2,'Profit','PROFIT',0.82,'£/part',10);
  END IF;

  -- ── PART 9: Water Pump Housing (HPDC Aluminium) ──────────────────
  IF NOT EXISTS (SELECT 1 FROM part_master WHERE part_number='ENG-WPH-009') THEN
    INSERT INTO part_master (part_number,description,uom,commodity,drawing_rev,program_id)
    VALUES ('ENG-WPH-009','Water Pump Housing — ADC12 Die Cast',
            'EA','Castings','A',(SELECT id FROM vehicle_program WHERE code='SUV4'))
    RETURNING id INTO v_part;

    INSERT INTO should_cost_header (part_id,version,status,annual_volume,currency,total_cost,notes,program_id,
      part_weight_kg,material_code,manufacturing_country,machine_type,cycle_time_sec,
      labour_rate_hr,machine_rate_hr,scrap_rate_pct,tooling_cost_total,tooling_life_units,created_by)
    VALUES (v_part,1,'published',55000,'GBP',18.92,'ADC12 HPDC 250T — 4 CNC ops including impeller housing bore, helium leak tested',
      (SELECT id FROM vehicle_program WHERE code='SUV4'),
      2.10,'ALU-ADC12','India','HPDC 250T + CNC',88,5.50,26.00,4.0,115000,150000,v_user)
    RETURNING id INTO v_sc;

    INSERT INTO should_cost_breakdown (should_cost_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_sc,'ADC12 Alloy (2.10 kg @ £1.97/kg)','RAW_MATERIAL',4.14,'LME + premium',1),
      (v_sc,'Runner & Overflow (4%)','RAW_MATERIAL',0.55,'Shot weight loss',2),
      (v_sc,'HPDC 250T (88s)','MANUFACTURING',6.35,'Machine £26/hr',3),
      (v_sc,'CNC Op10 — impeller bore','MANUFACTURING',2.05,'CNC £22/hr',4),
      (v_sc,'CNC Op20 — coolant ports','MANUFACTURING',1.25,'CNC £22/hr',5),
      (v_sc,'CNC Op30 — face machine','MANUFACTURING',0.75,'CNC £22/hr',6),
      (v_sc,'Helium Leak Test','MANUFACTURING',0.48,'Test rig',7),
      (v_sc,'Factory Overhead (36%)','OVERHEAD',1.92,'% conversion',8),
      (v_sc,'SG&A (9%)','OVERHEAD',0.92,'% total',9),
      (v_sc,'Packaging','LOGISTICS',0.32,'VCI + box',10),
      (v_sc,'Freight','LOGISTICS',0.42,'Road freight',11),
      (v_sc,'Die Tooling','TOOLING',0.77,'£115k ÷ 150k',12),
      (v_sc,'Profit (5.5%)','PROFIT',0.82,'5.5% total',13);

    INSERT INTO supplier_quote_header (part_id,supplier_id,version,status,rfq_number,annual_volume,currency,total_price,validity_date,submitted_at,program_id)
    VALUES (v_part,v_sup105,1,'submitted','RFQ-2025-WPH-009',55000,'GBP',22.50,'2026-12-31',NOW()-'30 days'::INTERVAL,
            (SELECT id FROM vehicle_program WHERE code='SUV4')) RETURNING id INTO v_q1;
    INSERT INTO supplier_quote_breakdown (supplier_quote_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_q1,'ADC12 Alloy','RAW_MATERIAL',4.55,'£/part',1),(v_q1,'Runner & Overflow','RAW_MATERIAL',0.65,'£/part',2),
      (v_q1,'HPDC Casting','MANUFACTURING',7.30,'£/part',3),(v_q1,'CNC Op10','MANUFACTURING',2.40,'£/part',4),
      (v_q1,'CNC Op20','MANUFACTURING',1.48,'£/part',5),(v_q1,'CNC Op30','MANUFACTURING',0.90,'£/part',6),
      (v_q1,'Leak Test','MANUFACTURING',0.58,'£/part',7),(v_q1,'Overhead','OVERHEAD',2.30,'£/part',8),
      (v_q1,'SG&A','OVERHEAD',1.10,'£/part',9),(v_q1,'Packaging','LOGISTICS',0.38,'£/part',10),
      (v_q1,'Freight','LOGISTICS',0.50,'£/part',11),(v_q1,'Tooling','TOOLING',0.85,'£/part',12),(v_q1,'Profit','PROFIT',0.01,'£/part',13);

    INSERT INTO supplier_quote_header (part_id,supplier_id,version,status,rfq_number,annual_volume,currency,total_price,validity_date,submitted_at,program_id)
    VALUES (v_part,v_sup102,1,'negotiating','RFQ-2025-WPH-009',55000,'GBP',20.80,'2026-12-31',NOW()-'16 days'::INTERVAL,
            (SELECT id FROM vehicle_program WHERE code='SUV4')) RETURNING id INTO v_q2;
    INSERT INTO supplier_quote_breakdown (supplier_quote_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_q2,'ADC12 Alloy','RAW_MATERIAL',4.28,'£/part',1),(v_q2,'Runner & Overflow','RAW_MATERIAL',0.60,'£/part',2),
      (v_q2,'HPDC Casting','MANUFACTURING',6.80,'£/part',3),(v_q2,'CNC Op10','MANUFACTURING',2.20,'£/part',4),
      (v_q2,'CNC Op20','MANUFACTURING',1.35,'£/part',5),(v_q2,'CNC Op30','MANUFACTURING',0.82,'£/part',6),
      (v_q2,'Leak Test','MANUFACTURING',0.52,'£/part',7),(v_q2,'Overhead','OVERHEAD',2.08,'£/part',8),
      (v_q2,'SG&A','OVERHEAD',1.02,'£/part',9),(v_q2,'Packaging','LOGISTICS',0.35,'£/part',10),
      (v_q2,'Freight','LOGISTICS',0.62,'£/part',11),(v_q2,'Tooling','TOOLING',0.80,'£/part',12),(v_q2,'Profit','PROFIT',0.36,'£/part',13);
  END IF;

  -- ── PART 10: Door Hinge (Stamped & Machined) ─────────────────────
  IF NOT EXISTS (SELECT 1 FROM part_master WHERE part_number='BDY-DHG-010') THEN
    INSERT INTO part_master (part_number,description,uom,commodity,drawing_rev,program_id)
    VALUES ('BDY-DHG-010','Front Door Hinge Upper — Stamped & Machined Steel',
            'EA','Stampings','B',(SELECT id FROM vehicle_program WHERE code='SUV1'))
    RETURNING id INTO v_part;

    INSERT INTO should_cost_header (part_id,version,status,annual_volume,currency,total_cost,notes,program_id,
      part_weight_kg,material_code,manufacturing_country,machine_type,cycle_time_sec,
      labour_rate_hr,machine_rate_hr,scrap_rate_pct,tooling_cost_total,tooling_life_units,created_by)
    VALUES (v_part,1,'published',120000,'GBP',5.65,'S355 4mm — compound die, hinge pin bore reamed, galvanised',
      (SELECT id FROM vehicle_program WHERE code='SUV1'),
      0.65,'STL-HRC','India','Compound Die + Drilling',12,4.50,11.00,2.5,28000,400000,v_user)
    RETURNING id INTO v_sc;

    INSERT INTO should_cost_breakdown (should_cost_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_sc,'S355 Steel Blank (0.65 kg @ £0.87/kg)','RAW_MATERIAL',0.57,'£/part',1),
      (v_sc,'Scrap (2.5%)','RAW_MATERIAL',0.12,'Material × scrap',2),
      (v_sc,'Compound Die Stamp (12s)','MANUFACTURING',1.48,'Press £11/hr',3),
      (v_sc,'Hinge Pin Bore Ream','MANUFACTURING',0.55,'Drill press 8s',4),
      (v_sc,'Galvanising (electro)','MANUFACTURING',0.48,'Barrel zinc',5),
      (v_sc,'Hinge Pin (stainless, purchased)','BOP',0.85,'SS pin + cap',6),
      (v_sc,'Factory Overhead (28%)','OVERHEAD',0.52,'% conversion',7),
      (v_sc,'SG&A (10%)','OVERHEAD',0.32,'% total',8),
      (v_sc,'Packaging','LOGISTICS',0.12,'Bulk polybag',9),
      (v_sc,'Freight','LOGISTICS',0.22,'Road freight',10),
      (v_sc,'Tooling','TOOLING',0.07,'£28k ÷ 400k',11),
      (v_sc,'Profit (5%)','PROFIT',0.35,'5% of total',12);

    INSERT INTO supplier_quote_header (part_id,supplier_id,version,status,rfq_number,annual_volume,currency,total_price,validity_date,submitted_at,program_id)
    VALUES (v_part,v_sup107,1,'submitted','RFQ-2025-DHG-010',120000,'GBP',6.80,'2026-06-30',NOW()-'8 days'::INTERVAL,
            (SELECT id FROM vehicle_program WHERE code='SUV1')) RETURNING id INTO v_q1;
    INSERT INTO supplier_quote_breakdown (supplier_quote_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_q1,'S355 Steel','RAW_MATERIAL',0.62,'£/part',1),(v_q1,'Scrap','RAW_MATERIAL',0.14,'£/part',2),
      (v_q1,'Stamping','MANUFACTURING',1.78,'£/part',3),(v_q1,'Bore Ream','MANUFACTURING',0.68,'£/part',4),
      (v_q1,'Galvanising','MANUFACTURING',0.58,'£/part',5),(v_q1,'Hinge Pin','BOP',0.92,'£/part',6),
      (v_q1,'Overhead','OVERHEAD',0.65,'£/part',7),(v_q1,'SG&A','OVERHEAD',0.40,'£/part',8),
      (v_q1,'Packaging','LOGISTICS',0.14,'£/part',9),(v_q1,'Freight','LOGISTICS',0.28,'£/part',10),
      (v_q1,'Tooling','TOOLING',0.08,'£/part',11),(v_q1,'Profit','PROFIT',0.53,'£/part',12);

    INSERT INTO supplier_quote_header (part_id,supplier_id,version,status,rfq_number,annual_volume,currency,total_price,validity_date,submitted_at,program_id)
    VALUES (v_part,v_sup102,1,'submitted','RFQ-2025-DHG-010',120000,'GBP',6.25,'2026-06-30',NOW()-'5 days'::INTERVAL,
            (SELECT id FROM vehicle_program WHERE code='SUV1')) RETURNING id INTO v_q2;
    INSERT INTO supplier_quote_breakdown (supplier_quote_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_q2,'S355 Steel','RAW_MATERIAL',0.60,'£/part',1),(v_q2,'Scrap','RAW_MATERIAL',0.13,'£/part',2),
      (v_q2,'Stamping','MANUFACTURING',1.65,'£/part',3),(v_q2,'Bore Ream','MANUFACTURING',0.62,'£/part',4),
      (v_q2,'Galvanising','MANUFACTURING',0.52,'£/part',5),(v_q2,'Hinge Pin','BOP',0.88,'£/part',6),
      (v_q2,'Overhead','OVERHEAD',0.58,'£/part',7),(v_q2,'SG&A','OVERHEAD',0.36,'£/part',8),
      (v_q2,'Packaging','LOGISTICS',0.12,'£/part',9),(v_q2,'Freight','LOGISTICS',0.32,'£/part',10),
      (v_q2,'Tooling','TOOLING',0.07,'£/part',11),(v_q2,'Profit','PROFIT',0.40,'£/part',12);
  END IF;

  -- ── PART 11: Engine Mount Bracket (Heavy Stamping) ───────────────
  IF NOT EXISTS (SELECT 1 FROM part_master WHERE part_number='ENG-MTB-011') THEN
    INSERT INTO part_master (part_number,description,uom,commodity,drawing_rev,program_id)
    VALUES ('ENG-MTB-011','Engine Mount Bracket — HSLA 600 Heavy Stamping',
            'EA','Stampings','C',(SELECT id FROM vehicle_program WHERE code='SUV2'))
    RETURNING id INTO v_part;

    INSERT INTO should_cost_header (part_id,version,status,annual_volume,currency,total_cost,notes,program_id,
      part_weight_kg,material_code,manufacturing_country,machine_type,cycle_time_sec,
      labour_rate_hr,machine_rate_hr,scrap_rate_pct,tooling_cost_total,tooling_life_units,created_by)
    VALUES (v_part,1,'published',60000,'GBP',14.55,'HSLA 600 5mm — 2500T transfer press, 5 ops, cathodic e-coat',
      (SELECT id FROM vehicle_program WHERE code='SUV2'),
      3.50,'STL-HRC','India','Transfer Press 2500T',38,4.50,18.00,3.0,88000,150000,v_user)
    RETURNING id INTO v_sc;

    INSERT INTO should_cost_breakdown (should_cost_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_sc,'HSLA 600 Steel (3.50 kg @ £0.88/kg)','RAW_MATERIAL',3.08,'LME + HSLA premium',1),
      (v_sc,'Scrap & Offal (3%)','RAW_MATERIAL',0.42,'Material × scrap',2),
      (v_sc,'Blank & Op1 Pierce','MANUFACTURING',1.48,'Press £18/hr × 18s',3),
      (v_sc,'Op2 Form Draw','MANUFACTURING',1.88,'Press £18/hr × 28s',4),
      (v_sc,'Op3 Trim & Restrike','MANUFACTURING',1.28,'Press £16/hr × 22s',5),
      (v_sc,'Op4 Flange','MANUFACTURING',0.98,'Press £14/hr × 18s',6),
      (v_sc,'Cathodic E-Coat','MANUFACTURING',0.78,'Full immersion bath',7),
      (v_sc,'Factory Overhead (30%)','OVERHEAD',1.68,'% conversion',8),
      (v_sc,'SG&A (10%)','OVERHEAD',0.92,'% total',9),
      (v_sc,'Packaging','LOGISTICS',0.35,'Returnable stillage',10),
      (v_sc,'Freight','LOGISTICS',0.42,'Road freight',11),
      (v_sc,'Tooling','TOOLING',0.59,'£88k ÷ 150k',12),
      (v_sc,'Profit (5%)','PROFIT',0.69,'5% of total',13);

    INSERT INTO supplier_quote_header (part_id,supplier_id,version,status,rfq_number,annual_volume,currency,total_price,validity_date,submitted_at,program_id)
    VALUES (v_part,v_sup107,1,'submitted','RFQ-2025-MTB-011',60000,'GBP',17.20,'2026-09-30',NOW()-'22 days'::INTERVAL,
            (SELECT id FROM vehicle_program WHERE code='SUV2')) RETURNING id INTO v_q1;
    INSERT INTO supplier_quote_breakdown (supplier_quote_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_q1,'HSLA Steel','RAW_MATERIAL',3.38,'£/part',1),(v_q1,'Scrap','RAW_MATERIAL',0.52,'£/part',2),
      (v_q1,'Op1','MANUFACTURING',1.75,'£/part',3),(v_q1,'Op2','MANUFACTURING',2.18,'£/part',4),
      (v_q1,'Op3','MANUFACTURING',1.52,'£/part',5),(v_q1,'Op4','MANUFACTURING',1.18,'£/part',6),
      (v_q1,'E-Coat','MANUFACTURING',0.92,'£/part',7),(v_q1,'Overhead','OVERHEAD',2.02,'£/part',8),
      (v_q1,'SG&A','OVERHEAD',1.10,'£/part',9),(v_q1,'Packaging','LOGISTICS',0.42,'£/part',10),
      (v_q1,'Freight','LOGISTICS',0.50,'£/part',11),(v_q1,'Tooling','TOOLING',0.68,'£/part',12),
      (v_q1,'Profit','PROFIT',1.03,'£/part',13);

    INSERT INTO supplier_quote_header (part_id,supplier_id,version,status,rfq_number,annual_volume,currency,total_price,validity_date,submitted_at,program_id)
    VALUES (v_part,v_sup102,1,'submitted','RFQ-2025-MTB-011',60000,'GBP',15.80,'2026-09-30',NOW()-'14 days'::INTERVAL,
            (SELECT id FROM vehicle_program WHERE code='SUV2')) RETURNING id INTO v_q2;
    INSERT INTO supplier_quote_breakdown (supplier_quote_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_q2,'HSLA Steel','RAW_MATERIAL',3.20,'£/part',1),(v_q2,'Scrap','RAW_MATERIAL',0.48,'£/part',2),
      (v_q2,'Op1','MANUFACTURING',1.62,'£/part',3),(v_q2,'Op2','MANUFACTURING',2.02,'£/part',4),
      (v_q2,'Op3','MANUFACTURING',1.40,'£/part',5),(v_q2,'Op4','MANUFACTURING',1.08,'£/part',6),
      (v_q2,'E-Coat','MANUFACTURING',0.85,'£/part',7),(v_q2,'Overhead','OVERHEAD',1.85,'£/part',8),
      (v_q2,'SG&A','OVERHEAD',1.02,'£/part',9),(v_q2,'Packaging','LOGISTICS',0.38,'£/part',10),
      (v_q2,'Freight','LOGISTICS',0.55,'£/part',11),(v_q2,'Tooling','TOOLING',0.62,'£/part',12),
      (v_q2,'Profit','PROFIT',0.73,'£/part',13);
  END IF;

  -- ── PART 12: Rear Suspension Trailing Link (Forged Steel) ────────
  IF NOT EXISTS (SELECT 1 FROM part_master WHERE part_number='SUS-TLK-012') THEN
    INSERT INTO part_master (part_number,description,uom,commodity,drawing_rev,program_id)
    VALUES ('SUS-TLK-012','Rear Trailing Link — Forged EN19 Steel',
            'EA','Forgings','B',(SELECT id FROM vehicle_program WHERE code='SUV2'))
    RETURNING id INTO v_part;

    INSERT INTO should_cost_header (part_id,version,status,annual_volume,currency,total_cost,notes,program_id,
      part_weight_kg,material_code,manufacturing_country,machine_type,cycle_time_sec,
      labour_rate_hr,machine_rate_hr,scrap_rate_pct,tooling_cost_total,tooling_life_units,created_by)
    VALUES (v_part,1,'published',55000,'GBP',24.85,'EN19 closed-die forging — shot blast, 3-axis CNC eye ends, Magnaflux tested',
      (SELECT id FROM vehicle_program WHERE code='SUV2'),
      3.80,'STL-HRC','India','Forging + 3-axis CNC',160,5.50,28.00,4.5,145000,100000,v_user)
    RETURNING id INTO v_sc;

    INSERT INTO should_cost_breakdown (should_cost_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_sc,'EN19 Billet (3.80 kg @ £1.05/kg)','RAW_MATERIAL',3.99,'Steel billet price',1),
      (v_sc,'Flash Allowance (4.5%)','RAW_MATERIAL',0.62,'Forging flash loss',2),
      (v_sc,'Closed-Die Forging (160s)','MANUFACTURING',7.45,'Forging press £28/hr',3),
      (v_sc,'Shot Blast & Heat Treat','MANUFACTURING',0.85,'Batch normalise',4),
      (v_sc,'CNC Eye End Boring (×2)','MANUFACTURING',3.20,'3-axis CNC £20/hr × 300s',5),
      (v_sc,'Magnaflux NDT Test','MANUFACTURING',0.65,'100% inspection',6),
      (v_sc,'Rubber End Bushings (×2)','BOP',2.40,'Rubber-metal bushes purchased',7),
      (v_sc,'Factory Overhead (32%)','OVERHEAD',2.28,'% conversion',8),
      (v_sc,'SG&A (10%)','OVERHEAD',1.12,'% total',9),
      (v_sc,'Packaging','LOGISTICS',0.45,'Returnable rack',10),
      (v_sc,'Freight','LOGISTICS',0.55,'Road freight',11),
      (v_sc,'Forge Die Amortisation','TOOLING',1.45,'£145k ÷ 100k',12),
      (v_sc,'Profit (6%)','PROFIT',0.84,'6% of total',13);

    INSERT INTO supplier_quote_header (part_id,supplier_id,version,status,rfq_number,annual_volume,currency,total_price,validity_date,submitted_at,program_id)
    VALUES (v_part,v_sup103,1,'submitted','RFQ-2025-TLK-012',55000,'GBP',29.50,'2026-12-31',NOW()-'35 days'::INTERVAL,
            (SELECT id FROM vehicle_program WHERE code='SUV2')) RETURNING id INTO v_q1;
    INSERT INTO supplier_quote_breakdown (supplier_quote_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_q1,'EN19 Billet','RAW_MATERIAL',4.40,'£/part',1),(v_q1,'Flash Loss','RAW_MATERIAL',0.72,'£/part',2),
      (v_q1,'Forging','MANUFACTURING',8.55,'£/part',3),(v_q1,'Shot Blast & HT','MANUFACTURING',1.02,'£/part',4),
      (v_q1,'CNC Eye Ends','MANUFACTURING',3.72,'£/part',5),(v_q1,'NDT Test','MANUFACTURING',0.80,'£/part',6),
      (v_q1,'Bushings','BOP',2.65,'£/part',7),(v_q1,'Overhead','OVERHEAD',2.72,'£/part',8),
      (v_q1,'SG&A','OVERHEAD',1.32,'£/part',9),(v_q1,'Packaging','LOGISTICS',0.55,'£/part',10),
      (v_q1,'Freight','LOGISTICS',0.68,'£/part',11),(v_q1,'Die Amortisation','TOOLING',1.58,'£/part',12),
      (v_q1,'Profit','PROFIT',0.79,'£/part',13);

    INSERT INTO supplier_quote_header (part_id,supplier_id,version,status,rfq_number,annual_volume,currency,total_price,validity_date,submitted_at,program_id)
    VALUES (v_part,v_sup101,1,'submitted','RFQ-2025-TLK-012',55000,'GBP',32.80,'2026-12-31',NOW()-'28 days'::INTERVAL,
            (SELECT id FROM vehicle_program WHERE code='SUV2')) RETURNING id INTO v_q2;
    INSERT INTO supplier_quote_breakdown (supplier_quote_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_q2,'EN19 Billet','RAW_MATERIAL',4.65,'£/part',1),(v_q2,'Flash Loss','RAW_MATERIAL',0.78,'£/part',2),
      (v_q2,'Forging','MANUFACTURING',9.85,'£/part',3),(v_q2,'Shot Blast & HT','MANUFACTURING',1.15,'£/part',4),
      (v_q2,'CNC Eye Ends','MANUFACTURING',4.28,'£/part',5),(v_q2,'NDT Test','MANUFACTURING',0.95,'£/part',6),
      (v_q2,'Bushings','BOP',2.80,'£/part',7),(v_q2,'Overhead','OVERHEAD',3.25,'£/part',8),
      (v_q2,'SG&A','OVERHEAD',1.55,'£/part',9),(v_q2,'Packaging','LOGISTICS',0.62,'£/part',10),
      (v_q2,'Freight','LOGISTICS',0.95,'£/part',11),(v_q2,'Die Amortisation','TOOLING',1.68,'£/part',12),
      (v_q2,'Profit','PROFIT',0.34,'£/part',13);
  END IF;

  -- ── PART 13: Throttle Body Housing (PP-GF30 Injection) ───────────
  IF NOT EXISTS (SELECT 1 FROM part_master WHERE part_number='ENG-THR-013') THEN
    INSERT INTO part_master (part_number,description,uom,commodity,drawing_rev,program_id)
    VALUES ('ENG-THR-013','Throttle Body Housing — PP-GF30 Injection Moulded',
            'EA','Injection Moulding','A',(SELECT id FROM vehicle_program WHERE code='SUV3'))
    RETURNING id INTO v_part;

    INSERT INTO should_cost_header (part_id,version,status,annual_volume,currency,total_cost,notes,program_id,
      part_weight_kg,material_code,manufacturing_country,machine_type,cycle_time_sec,
      labour_rate_hr,machine_rate_hr,scrap_rate_pct,tooling_cost_total,tooling_life_units,created_by)
    VALUES (v_part,1,'published',65000,'GBP',8.92,'PP-GF30 350T IM — butterfly valve insert moulded, air leak tested at 1.5 bar',
      (SELECT id FROM vehicle_program WHERE code='SUV3'),
      0.38,'PPL-GF20','India','Injection Moulding 350T',32,4.50,16.00,2.0,52000,500000,v_user)
    RETURNING id INTO v_sc;

    INSERT INTO should_cost_breakdown (should_cost_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_sc,'PP-GF30 Resin (0.38 kg @ £1.72/kg)','RAW_MATERIAL',0.65,'Resin price',1),
      (v_sc,'Regrind & Scrap (2%)','RAW_MATERIAL',0.12,'Material × scrap',2),
      (v_sc,'Injection Moulding 350T (32s)','MANUFACTURING',2.42,'Press £16/hr',3),
      (v_sc,'Valve Insert Moulding','MANUFACTURING',0.55,'Automated insert feed',4),
      (v_sc,'Air Leak Test (1.5 bar)','MANUFACTURING',0.32,'100% end-of-line test',5),
      (v_sc,'Butterfly Valve Disc (Al, purchased)','BOP',2.50,'Al disc + shaft assembly',6),
      (v_sc,'Factory Overhead (26%)','OVERHEAD',0.98,'% conversion',7),
      (v_sc,'SG&A (9%)','OVERHEAD',0.52,'% total',8),
      (v_sc,'Packaging','LOGISTICS',0.18,'Individual bag',9),
      (v_sc,'Freight','LOGISTICS',0.28,'Road freight',10),
      (v_sc,'Tooling','TOOLING',0.10,'£52k ÷ 500k',11),
      (v_sc,'Profit (5%)','PROFIT',0.30,'5% of total',12);

    INSERT INTO supplier_quote_header (part_id,supplier_id,version,status,rfq_number,annual_volume,currency,total_price,validity_date,submitted_at,program_id)
    VALUES (v_part,v_sup106,1,'submitted','RFQ-2025-THR-013',65000,'GBP',10.85,'2026-06-30',NOW()-'12 days'::INTERVAL,
            (SELECT id FROM vehicle_program WHERE code='SUV3')) RETURNING id INTO v_q1;
    INSERT INTO supplier_quote_breakdown (supplier_quote_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_q1,'PP-GF30 Resin','RAW_MATERIAL',0.72,'£/part',1),(v_q1,'Regrind','RAW_MATERIAL',0.14,'£/part',2),
      (v_q1,'Injection Moulding','MANUFACTURING',2.85,'£/part',3),(v_q1,'Insert Moulding','MANUFACTURING',0.68,'£/part',4),
      (v_q1,'Leak Test','MANUFACTURING',0.40,'£/part',5),(v_q1,'Butterfly Valve','BOP',2.72,'£/part',6),
      (v_q1,'Overhead','OVERHEAD',1.22,'£/part',7),(v_q1,'SG&A','OVERHEAD',0.65,'£/part',8),
      (v_q1,'Packaging','LOGISTICS',0.22,'£/part',9),(v_q1,'Freight','LOGISTICS',0.35,'£/part',10),
      (v_q1,'Tooling','TOOLING',0.12,'£/part',11),(v_q1,'Profit','PROFIT',0.78,'£/part',12);

    INSERT INTO supplier_quote_header (part_id,supplier_id,version,status,rfq_number,annual_volume,currency,total_price,validity_date,submitted_at,program_id)
    VALUES (v_part,v_sup104,1,'submitted','RFQ-2025-THR-013',65000,'GBP',9.90,'2026-06-30',NOW()-'7 days'::INTERVAL,
            (SELECT id FROM vehicle_program WHERE code='SUV3')) RETURNING id INTO v_q2;
    INSERT INTO supplier_quote_breakdown (supplier_quote_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_q2,'PP-GF30 Resin','RAW_MATERIAL',0.68,'£/part',1),(v_q2,'Regrind','RAW_MATERIAL',0.13,'£/part',2),
      (v_q2,'Injection Moulding','MANUFACTURING',2.65,'£/part',3),(v_q2,'Insert Moulding','MANUFACTURING',0.62,'£/part',4),
      (v_q2,'Leak Test','MANUFACTURING',0.36,'£/part',5),(v_q2,'Butterfly Valve','BOP',2.62,'£/part',6),
      (v_q2,'Overhead','OVERHEAD',1.12,'£/part',7),(v_q2,'SG&A','OVERHEAD',0.58,'£/part',8),
      (v_q2,'Packaging','LOGISTICS',0.20,'£/part',9),(v_q2,'Freight','LOGISTICS',0.42,'£/part',10),
      (v_q2,'Tooling','TOOLING',0.11,'£/part',11),(v_q2,'Profit','PROFIT',0.41,'£/part',12);
  END IF;

  -- ── PART 14: Heat Shield (Stamped Stainless) ─────────────────────
  IF NOT EXISTS (SELECT 1 FROM part_master WHERE part_number='EXH-HSH-014') THEN
    INSERT INTO part_master (part_number,description,uom,commodity,drawing_rev,program_id)
    VALUES ('EXH-HSH-014','Catalytic Converter Heat Shield — Embossed SS409',
            'EA','Stampings','A',(SELECT id FROM vehicle_program WHERE code='SUV4'))
    RETURNING id INTO v_part;

    INSERT INTO should_cost_header (part_id,version,status,annual_volume,currency,total_cost,notes,program_id,
      part_weight_kg,material_code,manufacturing_country,machine_type,cycle_time_sec,
      labour_rate_hr,machine_rate_hr,scrap_rate_pct,tooling_cost_total,tooling_life_units,created_by)
    VALUES (v_part,1,'published',75000,'GBP',6.15,'SS409 0.5mm embossed double-skin shield — foam core, roll-formed flanges',
      (SELECT id FROM vehicle_program WHERE code='SUV4'),
      0.42,'STL-SS409','India','Stamping',14,4.50,10.00,3.0,18000,300000,v_user)
    RETURNING id INTO v_sc;

    INSERT INTO should_cost_breakdown (should_cost_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_sc,'SS409 Sheet (0.42 kg @ £1.52/kg)','RAW_MATERIAL',0.64,'MEPS SS index',1),
      (v_sc,'Scrap & Trim Loss (3%)','RAW_MATERIAL',0.18,'Material × scrap',2),
      (v_sc,'Blank & Emboss Press (14s)','MANUFACTURING',1.22,'Press £10/hr',3),
      (v_sc,'Roll Form Flanges','MANUFACTURING',0.65,'Roll former £8/hr × 12s',4),
      (v_sc,'Clip Assembly (×4)','MANUFACTURING',0.38,'Manual assembly',5),
      (v_sc,'Silica Foam Core','BOP',1.05,'Purchased formed foam insert',6),
      (v_sc,'Clips & Fasteners','BOP',0.28,'×4 stainless clips',7),
      (v_sc,'Factory Overhead (26%)','OVERHEAD',0.61,'% conversion',8),
      (v_sc,'SG&A (9%)','OVERHEAD',0.38,'% total',9),
      (v_sc,'Packaging (bulk)','LOGISTICS',0.12,'Stacked bulk pack',10),
      (v_sc,'Freight','LOGISTICS',0.22,'Road freight India',11),
      (v_sc,'Tooling','TOOLING',0.06,'£18k ÷ 300k',12),
      (v_sc,'Profit (5%)','PROFIT',0.36,'5% of total',13);

    INSERT INTO supplier_quote_header (part_id,supplier_id,version,status,rfq_number,annual_volume,currency,total_price,validity_date,submitted_at,program_id)
    VALUES (v_part,v_sup107,1,'submitted','RFQ-2025-HSH-014',75000,'GBP',7.40,'2026-06-30',NOW()-'9 days'::INTERVAL,
            (SELECT id FROM vehicle_program WHERE code='SUV4')) RETURNING id INTO v_q1;
    INSERT INTO supplier_quote_breakdown (supplier_quote_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_q1,'SS409 Sheet','RAW_MATERIAL',0.70,'£/part',1),(v_q1,'Scrap','RAW_MATERIAL',0.22,'£/part',2),
      (v_q1,'Blank & Emboss','MANUFACTURING',1.45,'£/part',3),(v_q1,'Roll Form','MANUFACTURING',0.78,'£/part',4),
      (v_q1,'Clip Assembly','MANUFACTURING',0.48,'£/part',5),(v_q1,'Foam Core','BOP',1.15,'£/part',6),
      (v_q1,'Clips','BOP',0.32,'£/part',7),(v_q1,'Overhead','OVERHEAD',0.75,'£/part',8),
      (v_q1,'SG&A','OVERHEAD',0.46,'£/part',9),(v_q1,'Packaging','LOGISTICS',0.14,'£/part',10),
      (v_q1,'Freight','LOGISTICS',0.28,'£/part',11),(v_q1,'Tooling','TOOLING',0.07,'£/part',12),
      (v_q1,'Profit','PROFIT',0.60,'£/part',13);

    INSERT INTO supplier_quote_header (part_id,supplier_id,version,status,rfq_number,annual_volume,currency,total_price,validity_date,submitted_at,program_id)
    VALUES (v_part,v_sup102,1,'negotiating','RFQ-2025-HSH-014',75000,'GBP',6.80,'2026-06-30',NOW()-'4 days'::INTERVAL,
            (SELECT id FROM vehicle_program WHERE code='SUV4')) RETURNING id INTO v_q2;
    INSERT INTO supplier_quote_breakdown (supplier_quote_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_q2,'SS409 Sheet','RAW_MATERIAL',0.66,'£/part',1),(v_q2,'Scrap','RAW_MATERIAL',0.20,'£/part',2),
      (v_q2,'Blank & Emboss','MANUFACTURING',1.35,'£/part',3),(v_q2,'Roll Form','MANUFACTURING',0.72,'£/part',4),
      (v_q2,'Clip Assembly','MANUFACTURING',0.42,'£/part',5),(v_q2,'Foam Core','BOP',1.10,'£/part',6),
      (v_q2,'Clips','BOP',0.30,'£/part',7),(v_q2,'Overhead','OVERHEAD',0.68,'£/part',8),
      (v_q2,'SG&A','OVERHEAD',0.42,'£/part',9),(v_q2,'Packaging','LOGISTICS',0.12,'£/part',10),
      (v_q2,'Freight','LOGISTICS',0.35,'£/part',11),(v_q2,'Tooling','TOOLING',0.06,'£/part',12),
      (v_q2,'Profit','PROFIT',0.42,'£/part',13);
  END IF;

  -- ── PART 15: Fuel Rail Mounting Bracket (5-axis CNC Aluminium) ───
  IF NOT EXISTS (SELECT 1 FROM part_master WHERE part_number='ENG-FRB-015') THEN
    INSERT INTO part_master (part_number,description,uom,commodity,drawing_rev,program_id)
    VALUES ('ENG-FRB-015','Fuel Rail Mounting Bracket — 5-axis CNC Al 6061',
            'EA','Machined Parts','B',(SELECT id FROM vehicle_program WHERE code='SUV5'))
    RETURNING id INTO v_part;

    INSERT INTO should_cost_header (part_id,version,status,annual_volume,currency,total_cost,notes,program_id,
      part_weight_kg,material_code,manufacturing_country,machine_type,cycle_time_sec,
      labour_rate_hr,machine_rate_hr,scrap_rate_pct,tooling_cost_total,tooling_life_units,created_by)
    VALUES (v_part,1,'published',50000,'GBP',22.45,'Al 6061-T6 bar — 5-axis CNC single setup, anodised hard coat',
      (SELECT id FROM vehicle_program WHERE code='SUV5'),
      0.85,'ALU-6082','India','Machining (5-axis CNC)',285,5.50,42.00,8.0,28000,80000,v_user)
    RETURNING id INTO v_sc;

    INSERT INTO should_cost_breakdown (should_cost_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_sc,'Al 6061 Bar Stock (0.85 kg @ £2.05/kg)','RAW_MATERIAL',1.74,'LME + 6061 premium',1),
      (v_sc,'Buy-to-Fly Loss (8%)','RAW_MATERIAL',0.95,'85% material removed',2),
      (v_sc,'5-Axis CNC (285s single setup)','MANUFACTURING',13.48,'5-axis £42/hr',3),
      (v_sc,'Deburr & Inspect','MANUFACTURING',0.65,'Manual deburr',4),
      (v_sc,'Hard Anodise (25 micron)','MANUFACTURING',1.25,'Anodise bath per part',5),
      (v_sc,'Factory Overhead (30%)','OVERHEAD',1.88,'% conversion',6),
      (v_sc,'SG&A (8%)','OVERHEAD',0.80,'% total',7),
      (v_sc,'Packaging','LOGISTICS',0.28,'Individual wrap',8),
      (v_sc,'Freight','LOGISTICS',0.42,'Road freight',9),
      (v_sc,'Fixture Amortisation','TOOLING',0.35,'£28k ÷ 80k',10),
      (v_sc,'Profit (5%)','PROFIT',0.65,'5% of total',11);

    INSERT INTO supplier_quote_header (part_id,supplier_id,version,status,rfq_number,annual_volume,currency,total_price,validity_date,submitted_at,program_id)
    VALUES (v_part,v_sup102,1,'submitted','RFQ-2025-FRB-015',50000,'GBP',26.20,'2026-12-31',NOW()-'20 days'::INTERVAL,
            (SELECT id FROM vehicle_program WHERE code='SUV5')) RETURNING id INTO v_q1;
    INSERT INTO supplier_quote_breakdown (supplier_quote_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_q1,'Al 6061 Bar','RAW_MATERIAL',1.92,'£/part',1),(v_q1,'Buy-to-Fly Loss','RAW_MATERIAL',1.08,'£/part',2),
      (v_q1,'5-Axis CNC','MANUFACTURING',15.50,'£/part',3),(v_q1,'Deburr','MANUFACTURING',0.80,'£/part',4),
      (v_q1,'Hard Anodise','MANUFACTURING',1.48,'£/part',5),(v_q1,'Overhead','OVERHEAD',2.22,'£/part',6),
      (v_q1,'SG&A','OVERHEAD',0.95,'£/part',7),(v_q1,'Packaging','LOGISTICS',0.32,'£/part',8),
      (v_q1,'Freight','LOGISTICS',0.52,'£/part',9),(v_q1,'Fixture Amortisation','TOOLING',0.40,'£/part',10),
      (v_q1,'Profit','PROFIT',1.01,'£/part',11);

    INSERT INTO supplier_quote_header (part_id,supplier_id,version,status,rfq_number,annual_volume,currency,total_price,validity_date,submitted_at,program_id)
    VALUES (v_part,v_sup101,1,'submitted','RFQ-2025-FRB-015',50000,'GBP',29.80,'2026-12-31',NOW()-'15 days'::INTERVAL,
            (SELECT id FROM vehicle_program WHERE code='SUV5')) RETURNING id INTO v_q2;
    INSERT INTO supplier_quote_breakdown (supplier_quote_header_id,cost_element,category,value,basis,sort_order) VALUES
      (v_q2,'Al 6061 Bar','RAW_MATERIAL',2.05,'£/part',1),(v_q2,'Buy-to-Fly Loss','RAW_MATERIAL',1.18,'£/part',2),
      (v_q2,'5-Axis CNC','MANUFACTURING',18.20,'£/part',3),(v_q2,'Deburr','MANUFACTURING',0.95,'£/part',4),
      (v_q2,'Hard Anodise','MANUFACTURING',1.65,'£/part',5),(v_q2,'Overhead','OVERHEAD',2.68,'£/part',6),
      (v_q2,'SG&A','OVERHEAD',1.18,'£/part',7),(v_q2,'Packaging','LOGISTICS',0.35,'£/part',8),
      (v_q2,'Freight','LOGISTICS',0.72,'£/part',9),(v_q2,'Fixture Amortisation','TOOLING',0.45,'£/part',10),
      (v_q2,'Profit','PROFIT',0.39,'£/part',11);
  END IF;

END $$;

-- ============================================================
-- ADDITIONAL NEGOTIATIONS (→ 20 total)
-- ============================================================
DO $$
DECLARE v_user UUID; v_own UUID;
BEGIN
  SELECT id INTO v_user FROM "user" WHERE email='avinash.bhosale@costlens.io';
  SELECT id INTO v_own  FROM "user" WHERE email='procurement@costlens.io';

  -- 11
  IF NOT EXISTS (SELECT 1 FROM negotiation_target WHERE part_id=(SELECT id FROM part_master WHERE part_number='SUS-RAB-006') AND supplier_id=(SELECT id FROM supplier WHERE code='SUP-107')) THEN
    INSERT INTO negotiation_target (part_id,supplier_id,target_price,current_price,should_cost,currency,target_date,status,owner_id,notes,created_by)
    VALUES ((SELECT id FROM part_master WHERE part_number='SUS-RAB-006'),(SELECT id FROM supplier WHERE code='SUP-107'),
      11.80,13.10,11.28,'GBP','2025-09-30','open',v_user,'Overhead and SG&A gap — challenging vs India benchmark. Transfer press rate flagged high.',v_user);
  END IF;

  -- 12
  IF NOT EXISTS (SELECT 1 FROM negotiation_target WHERE part_id=(SELECT id FROM part_master WHERE part_number='ENG-OPB-007') AND supplier_id=(SELECT id FROM supplier WHERE code='SUP-105')) THEN
    INSERT INTO negotiation_target (part_id,supplier_id,target_price,current_price,should_cost,currency,target_date,status,owner_id,notes,created_by)
    VALUES ((SELECT id FROM part_master WHERE part_number='ENG-OPB-007'),(SELECT id FROM supplier WHERE code='SUP-105'),
      17.50,19.20,16.45,'GBP','2025-10-31','open',v_own,'HPDC cycle time gap — 88s benchmark vs supplier quoting 110s. Die temperature management cited as constraint.',v_user);
  END IF;

  -- 13
  IF NOT EXISTS (SELECT 1 FROM negotiation_target WHERE part_id=(SELECT id FROM part_master WHERE part_number='BRK-ABS-008') AND supplier_id=(SELECT id FROM supplier WHERE code='SUP-107')) THEN
    INSERT INTO negotiation_target (part_id,supplier_id,target_price,current_price,should_cost,currency,target_date,status,owner_id,notes,agreed_price,agreed_at,created_by)
    VALUES ((SELECT id FROM part_master WHERE part_number='BRK-ABS-008'),(SELECT id FROM supplier WHERE code='SUP-107'),
      4.10,4.55,3.82,'GBP','2025-05-31','agreed',v_user,'ABS bracket — plating cost challenged via barrel plating vs rack plating. Agreed 9.9% saving.',4.10,'2025-05-28',v_user);
  END IF;

  -- 14
  IF NOT EXISTS (SELECT 1 FROM negotiation_target WHERE part_id=(SELECT id FROM part_master WHERE part_number='ENG-WPH-009') AND supplier_id=(SELECT id FROM supplier WHERE code='SUP-105')) THEN
    INSERT INTO negotiation_target (part_id,supplier_id,target_price,current_price,should_cost,currency,target_date,status,owner_id,notes,created_by)
    VALUES ((SELECT id FROM part_master WHERE part_number='ENG-WPH-009'),(SELECT id FROM supplier WHERE code='SUP-105'),
      20.50,22.50,18.92,'GBP','2025-11-30','open',v_own,'Water pump housing — 19% gap vs should-cost. 4-op CNC challenged, supplier justifying with tight bore tolerances on impeller.',v_user);
  END IF;

  -- 15
  IF NOT EXISTS (SELECT 1 FROM negotiation_target WHERE part_id=(SELECT id FROM part_master WHERE part_number='BDY-DHG-010') AND supplier_id=(SELECT id FROM supplier WHERE code='SUP-107')) THEN
    INSERT INTO negotiation_target (part_id,supplier_id,target_price,current_price,should_cost,currency,target_date,status,owner_id,notes,agreed_price,agreed_at,created_by)
    VALUES ((SELECT id FROM part_master WHERE part_number='BDY-DHG-010'),(SELECT id FROM supplier WHERE code='SUP-107'),
      5.90,6.80,5.65,'GBP','2025-04-30','agreed',v_user,'Door hinge — bore reaming disputed as separate op. Agreed compound operation with dedicated guide. £0.90 saving.',5.90,'2025-04-25',v_user);
  END IF;

  -- 16
  IF NOT EXISTS (SELECT 1 FROM negotiation_target WHERE part_id=(SELECT id FROM part_master WHERE part_number='ENG-MTB-011') AND supplier_id=(SELECT id FROM supplier WHERE code='SUP-107')) THEN
    INSERT INTO negotiation_target (part_id,supplier_id,target_price,current_price,should_cost,currency,target_date,status,owner_id,notes,created_by)
    VALUES ((SELECT id FROM part_master WHERE part_number='ENG-MTB-011'),(SELECT id FROM supplier WHERE code='SUP-107'),
      15.20,17.20,14.55,'GBP','2025-12-31','open',v_own,'Engine mount — HSLA forming challenged. 5-op transfer press vs 3-op progressive die benchmark. Quote 18% above SC.',v_user);
  END IF;

  -- 17
  IF NOT EXISTS (SELECT 1 FROM negotiation_target WHERE part_id=(SELECT id FROM part_master WHERE part_number='SUS-TLK-012') AND supplier_id=(SELECT id FROM supplier WHERE code='SUP-103')) THEN
    INSERT INTO negotiation_target (part_id,supplier_id,target_price,current_price,should_cost,currency,target_date,status,owner_id,notes,created_by)
    VALUES ((SELECT id FROM part_master WHERE part_number='SUS-TLK-012'),(SELECT id FROM supplier WHERE code='SUP-103'),
      26.50,29.50,24.85,'GBP','2026-01-31','stalled',v_user,'Trailing link — Bharat Forge stalled after requesting 15% tooling advance payment. Financial terms under commercial review.',v_user);
  END IF;

  -- 18
  IF NOT EXISTS (SELECT 1 FROM negotiation_target WHERE part_id=(SELECT id FROM part_master WHERE part_number='ENG-THR-013') AND supplier_id=(SELECT id FROM supplier WHERE code='SUP-106')) THEN
    INSERT INTO negotiation_target (part_id,supplier_id,target_price,current_price,should_cost,currency,target_date,status,owner_id,notes,agreed_price,agreed_at,created_by)
    VALUES ((SELECT id FROM part_master WHERE part_number='ENG-THR-013'),(SELECT id FROM supplier WHERE code='SUP-106'),
      9.50,10.85,8.92,'GBP','2025-06-30','agreed',v_user,'Throttle body — butterfly valve BOP re-sourced direct. Agreed 12.4% saving vs original Minda quote.',9.50,'2025-06-18',v_user);
  END IF;

  -- 19
  IF NOT EXISTS (SELECT 1 FROM negotiation_target WHERE part_id=(SELECT id FROM part_master WHERE part_number='EXH-HSH-014') AND supplier_id=(SELECT id FROM supplier WHERE code='SUP-102')) THEN
    INSERT INTO negotiation_target (part_id,supplier_id,target_price,current_price,should_cost,currency,target_date,status,owner_id,notes,created_by)
    VALUES ((SELECT id FROM part_master WHERE part_number='EXH-HSH-014'),(SELECT id FROM supplier WHERE code='SUP-102'),
      6.20,6.80,6.15,'GBP','2025-08-31','open',v_user,'Heat shield — SS409 material cost challenged vs MEPS index. Mitra quoting 10.6% above should-cost.',v_user);
  END IF;

  -- 20
  IF NOT EXISTS (SELECT 1 FROM negotiation_target WHERE part_id=(SELECT id FROM part_master WHERE part_number='ENG-FRB-015') AND supplier_id=(SELECT id FROM supplier WHERE code='SUP-102')) THEN
    INSERT INTO negotiation_target (part_id,supplier_id,target_price,current_price,should_cost,currency,target_date,status,owner_id,notes,created_by)
    VALUES ((SELECT id FROM part_master WHERE part_number='ENG-FRB-015'),(SELECT id FROM supplier WHERE code='SUP-102'),
      23.50,26.20,22.45,'GBP','2025-10-31','open',v_user,'Fuel rail bracket — 5-axis cycle time gap. Mitra quoting 315s vs our 285s benchmark. Toolpath optimisation requested.',v_user);
  END IF;
END $$;

-- ============================================================
-- ADDITIONAL ACR TARGETS (→ 20 total)
-- ============================================================
DO $$
DECLARE v_user UUID; v_sup102 INTEGER; v_sup103 INTEGER; v_sup105 INTEGER; v_sup106 INTEGER; v_sup107 INTEGER;
BEGIN
  SELECT id INTO v_user   FROM "user" WHERE email='avinash.bhosale@costlens.io';
  SELECT id INTO v_sup102 FROM supplier WHERE code='SUP-102';
  SELECT id INTO v_sup103 FROM supplier WHERE code='SUP-103';
  SELECT id INTO v_sup105 FROM supplier WHERE code='SUP-105';
  SELECT id INTO v_sup106 FROM supplier WHERE code='SUP-106';
  SELECT id INTO v_sup107 FROM supplier WHERE code='SUP-107';

  INSERT INTO acr_target (part_id,supplier_id,target_year,base_price,base_year,target_reduction_pct,target_price,status,currency,notes,created_by)
  SELECT (SELECT id FROM part_master WHERE part_number='SUS-RAB-006'),v_sup107,2025,13.10,2024,5.0,12.45,'open','GBP','FY2025 ACR — HSLA transfer press efficiency target',v_user
  WHERE NOT EXISTS (SELECT 1 FROM acr_target WHERE part_id=(SELECT id FROM part_master WHERE part_number='SUS-RAB-006') AND target_year=2025);

  INSERT INTO acr_target (part_id,supplier_id,target_year,base_price,base_year,target_reduction_pct,target_price,agreed_price,actual_reduction_pct,status,currency,notes,created_by)
  SELECT (SELECT id FROM part_master WHERE part_number='BRK-ABS-008'),v_sup107,2025,4.55,2024,10.0,4.10,4.10,9.9,'agreed','GBP','FY2025 ACR — plating process improvement fully achieved',v_user
  WHERE NOT EXISTS (SELECT 1 FROM acr_target WHERE part_id=(SELECT id FROM part_master WHERE part_number='BRK-ABS-008') AND target_year=2025);

  INSERT INTO acr_target (part_id,supplier_id,target_year,base_price,base_year,target_reduction_pct,target_price,status,currency,notes,created_by)
  SELECT (SELECT id FROM part_master WHERE part_number='ENG-OPB-007'),v_sup105,2025,19.20,2024,8.0,17.66,'open','GBP','FY2025 ACR — die cycling and CNC batch optimisation',v_user
  WHERE NOT EXISTS (SELECT 1 FROM acr_target WHERE part_id=(SELECT id FROM part_master WHERE part_number='ENG-OPB-007') AND target_year=2025);

  INSERT INTO acr_target (part_id,supplier_id,target_year,base_price,base_year,target_reduction_pct,target_price,agreed_price,actual_reduction_pct,status,currency,notes,created_by)
  SELECT (SELECT id FROM part_master WHERE part_number='BDY-DHG-010'),v_sup107,2025,6.80,2024,13.2,5.90,5.90,13.2,'agreed','GBP','FY2025 ACR — compounding boring op agreed, significant saving',v_user
  WHERE NOT EXISTS (SELECT 1 FROM acr_target WHERE part_id=(SELECT id FROM part_master WHERE part_number='BDY-DHG-010') AND target_year=2025);

  INSERT INTO acr_target (part_id,supplier_id,target_year,base_price,base_year,target_reduction_pct,target_price,agreed_price,actual_reduction_pct,status,currency,notes,created_by)
  SELECT (SELECT id FROM part_master WHERE part_number='ENG-THR-013'),v_sup106,2025,10.85,2024,12.0,9.55,9.50,12.4,'agreed','GBP','FY2025 ACR — BOP re-sourcing butterfly valve disc',v_user
  WHERE NOT EXISTS (SELECT 1 FROM acr_target WHERE part_id=(SELECT id FROM part_master WHERE part_number='ENG-THR-013') AND target_year=2025);
END $$;

-- ============================================================
-- ADDITIONAL CER ACCURACY LOGS (→ 20 total)
-- ============================================================
DO $$
DECLARE v_user UUID;
BEGIN
  SELECT id INTO v_user FROM "user" WHERE email='avinash.bhosale@costlens.io';

  IF NOT EXISTS (SELECT 1 FROM cer_accuracy_log WHERE part_id=(SELECT id FROM part_master WHERE part_number='SUS-RAB-006')) THEN
    INSERT INTO cer_accuracy_log (process_type,country,part_weight_kg,material_name,cycle_time_sec,annual_volume,estimated_total,actual_settled,part_id,notes,settled_at,created_by)
    VALUES ('Stamping','India',2.80,'Hot Rolled Steel (HR3)',28,70000,11.28,13.10,(SELECT id FROM part_master WHERE part_number='SUS-RAB-006'),
      'Rear axle bracket CER. 16.1% gap — transfer press rate higher than progressive die benchmark used in model.','2025-05-15',v_user);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cer_accuracy_log WHERE part_id=(SELECT id FROM part_master WHERE part_number='ENG-OPB-007')) THEN
    INSERT INTO cer_accuracy_log (process_type,country,part_weight_kg,material_name,cycle_time_sec,annual_volume,estimated_total,actual_settled,part_id,notes,settled_at,created_by)
    VALUES ('Die Casting (Aluminium)','India',1.65,'Aluminium ADC12 Alloy',72,80000,16.45,19.20,(SELECT id FROM part_master WHERE part_number='ENG-OPB-007'),
      'Oil pump body CER vs Endurance quote. 16.7% gap — 3-op CNC post-cast under-estimated complexity of porting.','2025-05-30',v_user);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cer_accuracy_log WHERE part_id=(SELECT id FROM part_master WHERE part_number='BRK-ABS-008')) THEN
    INSERT INTO cer_accuracy_log (process_type,country,part_weight_kg,material_name,cycle_time_sec,annual_volume,estimated_total,actual_settled,part_id,notes,settled_at,created_by)
    VALUES ('Stamping','India',0.28,'Cold Rolled Steel (CR4)',8,120000,3.82,4.55,(SELECT id FROM part_master WHERE part_number='BRK-ABS-008'),
      'ABS bracket CER. 19.1% gap — Zn-Ni plating cost higher than standard Zn barrel quoted in rate library.','2025-04-22',v_user);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cer_accuracy_log WHERE part_id=(SELECT id FROM part_master WHERE part_number='ENG-WPH-009')) THEN
    INSERT INTO cer_accuracy_log (process_type,country,part_weight_kg,material_name,cycle_time_sec,annual_volume,estimated_total,actual_settled,part_id,notes,settled_at,created_by)
    VALUES ('Die Casting (Aluminium)','India',2.10,'Aluminium ADC12 Alloy',88,55000,18.92,22.50,(SELECT id FROM part_master WHERE part_number='ENG-WPH-009'),
      'Water pump housing CER. 18.9% gap — 4-axis bore requirements add unmapped cost vs 3-axis CER benchmark.','2025-06-05',v_user);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cer_accuracy_log WHERE part_id=(SELECT id FROM part_master WHERE part_number='BDY-DHG-010')) THEN
    INSERT INTO cer_accuracy_log (process_type,country,part_weight_kg,material_name,cycle_time_sec,annual_volume,estimated_total,actual_settled,part_id,notes,settled_at,created_by)
    VALUES ('Stamping','India',0.65,'Hot Rolled Steel (HR3)',12,120000,5.65,6.80,(SELECT id FROM part_master WHERE part_number='BDY-DHG-010'),
      'Door hinge CER. 20.4% gap — separate bore ream op not captured; hinge pin BOP cost higher than estimated.','2025-05-08',v_user);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cer_accuracy_log WHERE part_id=(SELECT id FROM part_master WHERE part_number='ENG-MTB-011')) THEN
    INSERT INTO cer_accuracy_log (process_type,country,part_weight_kg,material_name,cycle_time_sec,annual_volume,estimated_total,actual_settled,part_id,notes,settled_at,created_by)
    VALUES ('Stamping','India',3.50,'Hot Rolled Steel (HR3)',38,60000,14.55,17.20,(SELECT id FROM part_master WHERE part_number='ENG-MTB-011'),
      'Engine mount bracket CER. 18.2% gap — HSLA 600 forming requires 5 ops not 3 ops assumed in parametric model.','2025-06-12',v_user);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cer_accuracy_log WHERE part_id=(SELECT id FROM part_master WHERE part_number='ENG-THR-013')) THEN
    INSERT INTO cer_accuracy_log (process_type,country,part_weight_kg,material_name,cycle_time_sec,annual_volume,estimated_total,actual_settled,part_id,notes,settled_at,created_by)
    VALUES ('Injection Moulding','India',0.38,'Polypropylene PP-GF20',32,65000,8.92,9.90,(SELECT id FROM part_master WHERE part_number='ENG-THR-013'),
      'Throttle body housing CER. 11.0% gap — butterfly valve disc BOP sourcing premium vs assumed standard Al disc.','2025-06-20',v_user);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cer_accuracy_log WHERE part_id=(SELECT id FROM part_master WHERE part_number='ENG-FRB-015')) THEN
    INSERT INTO cer_accuracy_log (process_type,country,part_weight_kg,material_name,cycle_time_sec,annual_volume,estimated_total,actual_settled,part_id,notes,settled_at,created_by)
    VALUES ('Machining (5-axis CNC)','India',0.85,'Aluminium 6082 T6',285,50000,22.45,26.20,(SELECT id FROM part_master WHERE part_number='ENG-FRB-015'),
      'Fuel rail bracket CER. 16.7% gap — 5-axis setup time and hard anodise bath cost both under-estimated.','2025-06-18',v_user);
  END IF;
END $$;

-- ============================================================
-- ADDITIONAL ASSEMBLY BOMs (→ 5 total)
-- ============================================================
DO $$
DECLARE v_user UUID; v_asm INTEGER; v_sc INTEGER;
BEGIN
  SELECT id INTO v_user FROM "user" WHERE email='avinash.bhosale@costlens.io';

  -- Assembly 4: Powertrain Ancillaries Module — SUV4
  IF NOT EXISTS (SELECT 1 FROM assembly_header WHERE assembly_number='ASM-PTR-004') THEN
    INSERT INTO assembly_header (assembly_number,description,program_id,currency,notes,created_by)
    VALUES ('ASM-PTR-004','Powertrain Ancillaries Module',
            (SELECT id FROM vehicle_program WHERE code='SUV4'),'GBP',
            'Turbo bracket + water pump housing + oil pump body — pre-assembled to engine before drop-in',v_user)
    RETURNING id INTO v_asm;

    SELECT id INTO v_sc FROM should_cost_header WHERE part_id=(SELECT id FROM part_master WHERE part_number='ENG-TRB-005') AND status='published' ORDER BY version DESC LIMIT 1;
    IF v_sc IS NOT NULL THEN INSERT INTO assembly_bom_line (assembly_header_id,part_id,should_cost_header_id,quantity,sort_order,notes) VALUES (v_asm,(SELECT id FROM part_master WHERE part_number='ENG-TRB-005'),v_sc,1,1,'Machined EN8 turbo bracket'); END IF;

    SELECT id INTO v_sc FROM should_cost_header WHERE part_id=(SELECT id FROM part_master WHERE part_number='ENG-WPH-009') AND status='published' ORDER BY version DESC LIMIT 1;
    IF v_sc IS NOT NULL THEN INSERT INTO assembly_bom_line (assembly_header_id,part_id,should_cost_header_id,quantity,sort_order,notes) VALUES (v_asm,(SELECT id FROM part_master WHERE part_number='ENG-WPH-009'),v_sc,1,2,'ADC12 water pump housing'); END IF;

    SELECT id INTO v_sc FROM should_cost_header WHERE part_id=(SELECT id FROM part_master WHERE part_number='ENG-OPB-007') AND status='published' ORDER BY version DESC LIMIT 1;
    IF v_sc IS NOT NULL THEN INSERT INTO assembly_bom_line (assembly_header_id,part_id,should_cost_header_id,quantity,sort_order,notes) VALUES (v_asm,(SELECT id FROM part_master WHERE part_number='ENG-OPB-007'),v_sc,1,3,'HPDC oil pump body'); END IF;

    SELECT id INTO v_sc FROM should_cost_header WHERE part_id=(SELECT id FROM part_master WHERE part_number='ENG-FRB-015') AND status='published' ORDER BY version DESC LIMIT 1;
    IF v_sc IS NOT NULL THEN INSERT INTO assembly_bom_line (assembly_header_id,part_id,should_cost_header_id,quantity,sort_order,notes) VALUES (v_asm,(SELECT id FROM part_master WHERE part_number='ENG-FRB-015'),v_sc,2,4,'Fuel rail brackets LH+RH'); END IF;

    SELECT id INTO v_sc FROM should_cost_header WHERE part_id=(SELECT id FROM part_master WHERE part_number='ENG-CAM-004') AND status='published' ORDER BY version DESC LIMIT 1;
    IF v_sc IS NOT NULL THEN INSERT INTO assembly_bom_line (assembly_header_id,part_id,should_cost_header_id,quantity,sort_order,notes) VALUES (v_asm,(SELECT id FROM part_master WHERE part_number='ENG-CAM-004'),v_sc,1,5,'PA66-GF30 camshaft cover'); END IF;
  END IF;

  -- Assembly 5: Exhaust System Module — SUV3
  IF NOT EXISTS (SELECT 1 FROM assembly_header WHERE assembly_number='ASM-EXH-005') THEN
    INSERT INTO assembly_header (assembly_number,description,program_id,currency,notes,created_by)
    VALUES ('ASM-EXH-005','Exhaust & Heat Management Module',
            (SELECT id FROM vehicle_program WHERE code='SUV3'),'GBP',
            'Exhaust muffler + heat shield assembly — complete rear exhaust module',v_user)
    RETURNING id INTO v_asm;

    SELECT id INTO v_sc FROM should_cost_header WHERE part_id=(SELECT id FROM part_master WHERE part_number='EXH-8001') AND status='published' ORDER BY version DESC LIMIT 1;
    IF v_sc IS NOT NULL THEN INSERT INTO assembly_bom_line (assembly_header_id,part_id,should_cost_header_id,quantity,sort_order,notes) VALUES (v_asm,(SELECT id FROM part_master WHERE part_number='EXH-8001'),v_sc,1,1,'SS409 muffler assembly'); END IF;

    SELECT id INTO v_sc FROM should_cost_header WHERE part_id=(SELECT id FROM part_master WHERE part_number='EXH-HSH-014') AND status='published' ORDER BY version DESC LIMIT 1;
    IF v_sc IS NOT NULL THEN INSERT INTO assembly_bom_line (assembly_header_id,part_id,should_cost_header_id,quantity,sort_order,notes) VALUES (v_asm,(SELECT id FROM part_master WHERE part_number='EXH-HSH-014'),v_sc,3,2,'Heat shields ×3 (cat + DPF + muffler zones)'); END IF;

    SELECT id INTO v_sc FROM should_cost_header WHERE part_id=(SELECT id FROM part_master WHERE part_number='ENG-THR-013') AND status='published' ORDER BY version DESC LIMIT 1;
    IF v_sc IS NOT NULL THEN INSERT INTO assembly_bom_line (assembly_header_id,part_id,should_cost_header_id,quantity,sort_order,notes) VALUES (v_asm,(SELECT id FROM part_master WHERE part_number='ENG-THR-013'),v_sc,1,3,'Throttle body upstream of CAT'); END IF;
  END IF;
END $$;

RAISE NOTICE 'Expansion seed complete — 20 parts, 20 negotiations, 20 ACR targets, 20 CER accuracy records.';
