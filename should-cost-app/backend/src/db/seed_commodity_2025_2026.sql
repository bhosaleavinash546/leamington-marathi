-- ============================================================
-- Commodity Prices: Jul 2025 – Jun 2026
-- Extends the existing Jan–Jun 2025 baseline to current date.
-- Also deduplicates existing monthly entries (keeps lowest id
-- per material_code + price_date combination).
-- ============================================================

-- ── 1. Remove duplicates from existing data ───────────────────
DELETE FROM commodity_price
WHERE id NOT IN (
  SELECT MIN(id)
  FROM commodity_price
  GROUP BY material_code, price_date
);

-- ── 2. Helper block: insert Jul 2025 – Jun 2026 ───────────────
DO $$
DECLARE
  v_user UUID;
BEGIN
  SELECT id INTO v_user FROM "user" WHERE email = 'avinash.bhosale@costlens.io';

  -- ── HOT ROLLED STEEL (STL-HRC) ────────────────────────────────
  -- Decline H2 2025 (Chinese oversupply + demand weakness), gradual 2026 recovery
  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Hot Rolled Steel (HR3)','STL-HRC',0.7020,'per kg','GBP','2025-07-01','LME / Industry Index (simulated)','Steel: early demand softness as European auto output fell -3.2% YoY',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='STL-HRC' AND price_date='2025-07-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Hot Rolled Steel (HR3)','STL-HRC',0.6880,'per kg','GBP','2025-08-01','LME / Industry Index (simulated)','Steel: Chinese export volumes at record high, global HRC benchmark down',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='STL-HRC' AND price_date='2025-08-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Hot Rolled Steel (HR3)','STL-HRC',0.6720,'per kg','GBP','2025-09-01','LME / Industry Index (simulated)','Steel: September inventory build at service centres depressed spot',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='STL-HRC' AND price_date='2025-09-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Hot Rolled Steel (HR3)','STL-HRC',0.6580,'per kg','GBP','2025-10-01','LME / Industry Index (simulated)','Steel: continued pressure; EU safeguard tariff quota nearly exhausted',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='STL-HRC' AND price_date='2025-10-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Hot Rolled Steel (HR3)','STL-HRC',0.6472,'per kg','GBP','2025-11-01','LME / Industry Index (simulated)','Steel: year-low; mills implementing production cuts to support price',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='STL-HRC' AND price_date='2025-11-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Hot Rolled Steel (HR3)','STL-HRC',0.6452,'per kg','GBP','2025-12-01','LME / Industry Index (simulated)','Steel: price floor forming; restocking demand beginning Q1 2026',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='STL-HRC' AND price_date='2025-12-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Hot Rolled Steel (HR3)','STL-HRC',0.6582,'per kg','GBP','2026-01-01','LME / Industry Index (simulated)','Steel: Q1 re-stocking uplift; tariff announcement boosted domestic demand',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='STL-HRC' AND price_date='2026-01-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Hot Rolled Steel (HR3)','STL-HRC',0.6720,'per kg','GBP','2026-02-01','LME / Industry Index (simulated)','Steel: infrastructure spend announced; mill utilisation recovering to 78%',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='STL-HRC' AND price_date='2026-02-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Hot Rolled Steel (HR3)','STL-HRC',0.6882,'per kg','GBP','2026-03-01','LME / Industry Index (simulated)','Steel: GBP weakness (+1.4% USD/GBP) and OEM re-stocking lifted spot',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='STL-HRC' AND price_date='2026-03-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Hot Rolled Steel (HR3)','STL-HRC',0.7018,'per kg','GBP','2026-04-01','LME / Industry Index (simulated)','Steel: Q2 construction demand driving spot; scrap prices also firming',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='STL-HRC' AND price_date='2026-04-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Hot Rolled Steel (HR3)','STL-HRC',0.7182,'per kg','GBP','2026-05-01','LME / Industry Index (simulated)','Steel: auto OEM Q2 pull driven by EV model ramp; HRC back near year-ago level',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='STL-HRC' AND price_date='2026-05-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Hot Rolled Steel (HR3)','STL-HRC',0.7322,'per kg','GBP','2026-06-01','LME / Industry Index (simulated)','Steel: mid-year high; EU anti-dumping duties on Chinese HRC now in force',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='STL-HRC' AND price_date='2026-06-01');

  -- ── COLD ROLLED STEEL (STL-CRC) ───────────────────────────────
  -- Tracks HRC with ~£0.145 premium; tighter swings
  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Cold Rolled Steel (CR4)','STL-CRC',0.8452,'per kg','GBP','2025-07-01','LME / Industry Index (simulated)','CRC: premium over HRC holding at £0.143',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='STL-CRC' AND price_date='2025-07-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Cold Rolled Steel (CR4)','STL-CRC',0.8322,'per kg','GBP','2025-08-01','LME / Industry Index (simulated)','CRC: service-centre destocking continues; cold-rolling margin squeezed',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='STL-CRC' AND price_date='2025-08-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Cold Rolled Steel (CR4)','STL-CRC',0.8178,'per kg','GBP','2025-09-01','LME / Industry Index (simulated)','CRC: UK body-in-white demand softer; SLAB spread narrowing',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='STL-CRC' AND price_date='2025-09-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Cold Rolled Steel (CR4)','STL-CRC',0.8048,'per kg','GBP','2025-10-01','LME / Industry Index (simulated)','CRC: OEM shutdowns in Oct limited spot demand',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='STL-CRC' AND price_date='2025-10-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Cold Rolled Steel (CR4)','STL-CRC',0.7958,'per kg','GBP','2025-11-01','LME / Industry Index (simulated)','CRC: 2025 low; galvanised premium widening as zinc also fell',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='STL-CRC' AND price_date='2025-11-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Cold Rolled Steel (CR4)','STL-CRC',0.7932,'per kg','GBP','2025-12-01','LME / Industry Index (simulated)','CRC: price floor; mills restricting output, moderate Q1 2026 outlook',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='STL-CRC' AND price_date='2025-12-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Cold Rolled Steel (CR4)','STL-CRC',0.8048,'per kg','GBP','2026-01-01','LME / Industry Index (simulated)','CRC: Jan re-stocking; spot contracts firming at Tata Port Talbot',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='STL-CRC' AND price_date='2026-01-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Cold Rolled Steel (CR4)','STL-CRC',0.8178,'per kg','GBP','2026-02-01','LME / Industry Index (simulated)','CRC: automotive OEM call-off rates increasing post-January shutdown',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='STL-CRC' AND price_date='2026-02-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Cold Rolled Steel (CR4)','STL-CRC',0.8322,'per kg','GBP','2026-03-01','LME / Industry Index (simulated)','CRC: Tata EAF conversion delivering; domestic supply tighter = premium widening',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='STL-CRC' AND price_date='2026-03-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Cold Rolled Steel (CR4)','STL-CRC',0.8452,'per kg','GBP','2026-04-01','LME / Industry Index (simulated)','CRC: back to Jul-25 levels; GBP weakness making imports expensive',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='STL-CRC' AND price_date='2026-04-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Cold Rolled Steel (CR4)','STL-CRC',0.8598,'per kg','GBP','2026-05-01','LME / Industry Index (simulated)','CRC: tight domestic capacity; lead times extending to 10 weeks',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='STL-CRC' AND price_date='2026-05-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Cold Rolled Steel (CR4)','STL-CRC',0.8752,'per kg','GBP','2026-06-01','LME / Industry Index (simulated)','CRC: 2026 high; anti-dumping measures on Korean/Turkish imports imposed',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='STL-CRC' AND price_date='2026-06-01');

  -- ── ALUMINIUM ADC12 (ALU-ADC12) ───────────────────────────────
  -- Jul-Sep 2025 rise (EU tariffs, energy costs), Feb 2026 LME spike, then moderation
  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Aluminium ADC12 Alloy','ALU-ADC12',2.0420,'per kg','GBP','2025-07-01','LME / Industry Index (simulated)','Al: EU anti-dumping on Chinese secondary alloy imports lifting domestic price',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='ALU-ADC12' AND price_date='2025-07-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Aluminium ADC12 Alloy','ALU-ADC12',2.0752,'per kg','GBP','2025-08-01','LME / Industry Index (simulated)','Al: energy cost premium in European smelting widening AlSi alloy spread',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='ALU-ADC12' AND price_date='2025-08-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Aluminium ADC12 Alloy','ALU-ADC12',2.1108,'per kg','GBP','2025-09-01','LME / Industry Index (simulated)','Al: LME 3M touched $2,480/t; ADC12 premium over P1020 holding',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='ALU-ADC12' AND price_date='2025-09-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Aluminium ADC12 Alloy','ALU-ADC12',2.0952,'per kg','GBP','2025-10-01','LME / Industry Index (simulated)','Al: slight pullback as LME open interest reduced; scrap flows improving',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='ALU-ADC12' AND price_date='2025-10-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Aluminium ADC12 Alloy','ALU-ADC12',2.0682,'per kg','GBP','2025-11-01','LME / Industry Index (simulated)','Al: moderation; Chinese exports of secondary alloy resuming via third countries',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='ALU-ADC12' AND price_date='2025-11-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Aluminium ADC12 Alloy','ALU-ADC12',2.0522,'per kg','GBP','2025-12-01','LME / Industry Index (simulated)','Al: year-end destocking; buyers deferring to Jan. LME cash/3M contango wide',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='ALU-ADC12' AND price_date='2025-12-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Aluminium ADC12 Alloy','ALU-ADC12',2.0720,'per kg','GBP','2026-01-01','LME / Industry Index (simulated)','Al: Jan re-stocking; automotive HPDC demand up on EV structural parts',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='ALU-ADC12' AND price_date='2026-01-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Aluminium ADC12 Alloy','ALU-ADC12',2.2252,'per kg','GBP','2026-02-01','LME / Industry Index (simulated)','Al: SPIKE — LME short squeeze + GBP/USD move +2.1%; ADC12 spot jumped £0.17/kg in 2 wks',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='ALU-ADC12' AND price_date='2026-02-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Aluminium ADC12 Alloy','ALU-ADC12',2.1648,'per kg','GBP','2026-03-01','LME / Industry Index (simulated)','Al: partial normalisation post-Feb spike; physical premium stabilising',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='ALU-ADC12' AND price_date='2026-03-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Aluminium ADC12 Alloy','ALU-ADC12',2.1482,'per kg','GBP','2026-04-01','LME / Industry Index (simulated)','Al: steady; buyers locking in Q3 contracts at current levels',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='ALU-ADC12' AND price_date='2026-04-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Aluminium ADC12 Alloy','ALU-ADC12',2.1748,'per kg','GBP','2026-05-01','LME / Industry Index (simulated)','Al: structural auto parts demand strong; HPDC cell utilisation at 91%',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='ALU-ADC12' AND price_date='2026-05-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Aluminium ADC12 Alloy','ALU-ADC12',2.1852,'per kg','GBP','2026-06-01','LME / Industry Index (simulated)','Al: mid-2026 high on robust EV gigacast demand; UK foundry capacity tight',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='ALU-ADC12' AND price_date='2026-06-01');

  -- ── ALUMINIUM 6082 T6 (ALU-6082) ─────────────────────────────
  -- Similar to ADC12 with ~£0.15 premium; slightly more volatile (wrought)
  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Aluminium 6082 T6','ALU-6082',2.1982,'per kg','GBP','2025-07-01','LME / Industry Index (simulated)','Al 6082: wrought premium firm; billet tight in EU ex-Russian supply cut',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='ALU-6082' AND price_date='2025-07-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Aluminium 6082 T6','ALU-6082',2.2382,'per kg','GBP','2025-08-01','LME / Industry Index (simulated)','Al 6082: billet supply tight; forging demand strong from aerospace + EV',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='ALU-6082' AND price_date='2025-08-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Aluminium 6082 T6','ALU-6082',2.2682,'per kg','GBP','2025-09-01','LME / Industry Index (simulated)','Al 6082: 2025 peak; LME P1020 + T6 aging premium combining',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='ALU-6082' AND price_date='2025-09-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Aluminium 6082 T6','ALU-6082',2.2482,'per kg','GBP','2025-10-01','LME / Industry Index (simulated)','Al 6082: pullback; billet imports from Middle East increasing',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='ALU-6082' AND price_date='2025-10-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Aluminium 6082 T6','ALU-6082',2.2182,'per kg','GBP','2025-11-01','LME / Industry Index (simulated)','Al 6082: easing; aerospace destocking partially offsetting auto demand',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='ALU-6082' AND price_date='2025-11-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Aluminium 6082 T6','ALU-6082',2.1982,'per kg','GBP','2025-12-01','LME / Industry Index (simulated)','Al 6082: year-end dip; mills reduced output for Q4 maintenance',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='ALU-6082' AND price_date='2025-12-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Aluminium 6082 T6','ALU-6082',2.2252,'per kg','GBP','2026-01-01','LME / Industry Index (simulated)','Al 6082: Jan restocking; automotive forging schedules increasing',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='ALU-6082' AND price_date='2026-01-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Aluminium 6082 T6','ALU-6082',2.3682,'per kg','GBP','2026-02-01','LME / Industry Index (simulated)','Al 6082: SPIKE (LME short squeeze) — wrought premium amplified vs cast alloys',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='ALU-6082' AND price_date='2026-02-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Aluminium 6082 T6','ALU-6082',2.3082,'per kg','GBP','2026-03-01','LME / Industry Index (simulated)','Al 6082: partial retreat; hedged buyers re-entering spot market',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='ALU-6082' AND price_date='2026-03-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Aluminium 6082 T6','ALU-6082',2.2882,'per kg','GBP','2026-04-01','LME / Industry Index (simulated)','Al 6082: stable; T6 aging capacity addition by Hydro reducing lead times',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='ALU-6082' AND price_date='2026-04-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Aluminium 6082 T6','ALU-6082',2.3382,'per kg','GBP','2026-05-01','LME / Industry Index (simulated)','Al 6082: rising on EV control arm and knuckle demand; OEMs still converting to Al',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='ALU-6082' AND price_date='2026-05-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Aluminium 6082 T6','ALU-6082',2.3682,'per kg','GBP','2026-06-01','LME / Industry Index (simulated)','Al 6082: mid-2026 high; supply chain disruptions at Norwegian smelter',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='ALU-6082' AND price_date='2026-06-01');

  -- ── COPPER ETP (COP-ETP) ──────────────────────────────────────
  -- Most volatile; Jul-Sep 2025 rally (EV demand), Oct-Dec pullback, strong 2026 rally
  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Copper ETP','COP-ETP',7.8202,'per kg','GBP','2025-07-01','LME / Industry Index (simulated)','Cu: EV wiring harness demand surge; LME 3M up 2.4% in July',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='COP-ETP' AND price_date='2025-07-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Copper ETP','COP-ETP',7.9682,'per kg','GBP','2025-08-01','LME / Industry Index (simulated)','Cu: grid infrastructure spend accelerating; LME cash premium narrowed',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='COP-ETP' AND price_date='2025-08-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Copper ETP','COP-ETP',8.0522,'per kg','GBP','2025-09-01','LME / Industry Index (simulated)','Cu: 2025 peak; warehouse stocks at 5-year low, concentrate TC/RCs negative',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='COP-ETP' AND price_date='2025-09-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Copper ETP','COP-ETP',7.8852,'per kg','GBP','2025-10-01','LME / Industry Index (simulated)','Cu: USD strength (-1.8% GBP/USD) reversed some gains; profit-taking',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='COP-ETP' AND price_date='2025-10-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Copper ETP','COP-ETP',7.7252,'per kg','GBP','2025-11-01','LME / Industry Index (simulated)','Cu: macro uncertainty; US rate-hike fears pushed dollar higher, base metals lower',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='COP-ETP' AND price_date='2025-11-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Copper ETP','COP-ETP',7.6182,'per kg','GBP','2025-12-01','LME / Industry Index (simulated)','Cu: 2025 year-low in GBP; concentrate supply from Peru recovering',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='COP-ETP' AND price_date='2025-12-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Copper ETP','COP-ETP',7.8422,'per kg','GBP','2026-01-01','LME / Industry Index (simulated)','Cu: sharp recovery; GBP weakness +1.9% vs USD in Jan, EV outlook bullish',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='COP-ETP' AND price_date='2026-01-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Copper ETP','COP-ETP',8.0522,'per kg','GBP','2026-02-01','LME / Industry Index (simulated)','Cu: Feb spike alongside LME short squeeze; ETP rod premiums at record high',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='COP-ETP' AND price_date='2026-02-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Copper ETP','COP-ETP',8.2682,'per kg','GBP','2026-03-01','LME / Industry Index (simulated)','Cu: structural bull run; IEA revised upward 2026 copper demand forecast by 4%',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='COP-ETP' AND price_date='2026-03-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Copper ETP','COP-ETP',8.4252,'per kg','GBP','2026-04-01','LME / Industry Index (simulated)','Cu: 2026 high; grid electrification tenders in UK and EU boosting physical demand',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='COP-ETP' AND price_date='2026-04-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Copper ETP','COP-ETP',8.3952,'per kg','GBP','2026-05-01','LME / Industry Index (simulated)','Cu: slight easing as Chilean concentrate shipments improved; still elevated',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='COP-ETP' AND price_date='2026-05-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Copper ETP','COP-ETP',8.3252,'per kg','GBP','2026-06-01','LME / Industry Index (simulated)','Cu: mid-Jun consolidation; ETP rod demand robust, LME 3M at $9,850/t',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='COP-ETP' AND price_date='2026-06-01');

  -- ── POLYPROPYLENE PP-GF20 (PPL-GF20) ─────────────────────────
  -- Tracks crude oil; gradual decline H2 2025, modest 2026 recovery
  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Polypropylene PP-GF20','PPL-GF20',1.6952,'per kg','GBP','2025-07-01','ICIS / Market data (simulated)','PP: Brent crude softening -4% Jul; polymer margins under pressure',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='PPL-GF20' AND price_date='2025-07-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Polypropylene PP-GF20','PPL-GF20',1.6822,'per kg','GBP','2025-08-01','ICIS / Market data (simulated)','PP: demand softness in European auto; summer maintenance at crackers',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='PPL-GF20' AND price_date='2025-08-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Polypropylene PP-GF20','PPL-GF20',1.6682,'per kg','GBP','2025-09-01','ICIS / Market data (simulated)','PP: steady decline; Asian PP imports undercutting European spot by €120/t',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='PPL-GF20' AND price_date='2025-09-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Polypropylene PP-GF20','PPL-GF20',1.6552,'per kg','GBP','2025-10-01','ICIS / Market data (simulated)','PP: weakened by Brent at $72/bbl; OEM plant shutdowns reduced polymer pull',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='PPL-GF20' AND price_date='2025-10-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Polypropylene PP-GF20','PPL-GF20',1.6452,'per kg','GBP','2025-11-01','ICIS / Market data (simulated)','PP: approaching floor; propylene feedstock cost also lower',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='PPL-GF20' AND price_date='2025-11-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Polypropylene PP-GF20','PPL-GF20',1.6402,'per kg','GBP','2025-12-01','ICIS / Market data (simulated)','PP: 2025 low; producers reducing contract price for Jan to stimulate volume',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='PPL-GF20' AND price_date='2025-12-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Polypropylene PP-GF20','PPL-GF20',1.6502,'per kg','GBP','2026-01-01','ICIS / Market data (simulated)','PP: slight recovery; Brent up to $75 on OPEC+ cuts; spot firming',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='PPL-GF20' AND price_date='2026-01-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Polypropylene PP-GF20','PPL-GF20',1.6622,'per kg','GBP','2026-02-01','ICIS / Market data (simulated)','PP: plastic component call-offs from EV manufacturers driving demand',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='PPL-GF20' AND price_date='2026-02-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Polypropylene PP-GF20','PPL-GF20',1.6752,'per kg','GBP','2026-03-01','ICIS / Market data (simulated)','PP: cracker turnaround season tightening monomer; GF premium unchanged',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='PPL-GF20' AND price_date='2026-03-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Polypropylene PP-GF20','PPL-GF20',1.6882,'per kg','GBP','2026-04-01','ICIS / Market data (simulated)','PP: steady; global PP capacity additions in Asia moderating European spot',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='PPL-GF20' AND price_date='2026-04-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Polypropylene PP-GF20','PPL-GF20',1.7052,'per kg','GBP','2026-05-01','ICIS / Market data (simulated)','PP: back near Jun-25 baseline; Brent at $78 providing support',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='PPL-GF20' AND price_date='2026-05-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Polypropylene PP-GF20','PPL-GF20',1.7182,'per kg','GBP','2026-06-01','ICIS / Market data (simulated)','PP: modest premium as European demand improved; glass fibre surcharge +2%',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='PPL-GF20' AND price_date='2026-06-01');

  -- ── NYLON PA66-GF30 ───────────────────────────────────────────
  -- Jul-Sep 2025 rise (adipic acid supply squeeze), then easing, 2026 gradual climb
  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Nylon PA66-GF30','PA66-GF30',2.9282,'per kg','GBP','2025-07-01','ICIS / Market data (simulated)','PA66: adipic acid supply tight in Europe; Invista force majeure lifted but stock low',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='PA66-GF30' AND price_date='2025-07-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Nylon PA66-GF30','PA66-GF30',2.9522,'per kg','GBP','2025-08-01','ICIS / Market data (simulated)','PA66: supply constraint continuing; polymer prices rising vs H1 2025',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='PA66-GF30' AND price_date='2025-08-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Nylon PA66-GF30','PA66-GF30',2.9682,'per kg','GBP','2025-09-01','ICIS / Market data (simulated)','PA66: 2025 peak; auto-grade PA66 lead times extended to 14+ weeks',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='PA66-GF30' AND price_date='2025-09-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Nylon PA66-GF30','PA66-GF30',2.9482,'per kg','GBP','2025-10-01','ICIS / Market data (simulated)','PA66: easing as BASF Ludwigshafen caprolactam plant restarted',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='PA66-GF30' AND price_date='2025-10-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Nylon PA66-GF30','PA66-GF30',2.9222,'per kg','GBP','2025-11-01','ICIS / Market data (simulated)','PA66: normalising; spot back in line with contract. Benzene prices fell',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='PA66-GF30' AND price_date='2025-11-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Nylon PA66-GF30','PA66-GF30',2.9052,'per kg','GBP','2025-12-01','ICIS / Market data (simulated)','PA66: year-end softer; OEM production shutdowns reduced demand in Dec',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='PA66-GF30' AND price_date='2025-12-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Nylon PA66-GF30','PA66-GF30',2.9282,'per kg','GBP','2026-01-01','ICIS / Market data (simulated)','PA66: Jan recovery; auto OEMs restocking ahead of high-volume Q1 builds',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='PA66-GF30' AND price_date='2026-01-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Nylon PA66-GF30','PA66-GF30',2.9552,'per kg','GBP','2026-02-01','ICIS / Market data (simulated)','PA66: steady climb; benzene derivative costs rising, GF surcharge up £0.05/kg',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='PA66-GF30' AND price_date='2026-02-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Nylon PA66-GF30','PA66-GF30',2.9822,'per kg','GBP','2026-03-01','ICIS / Market data (simulated)','PA66: engineering polymer demand from EV thermal management components',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='PA66-GF30' AND price_date='2026-03-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Nylon PA66-GF30','PA66-GF30',3.0082,'per kg','GBP','2026-04-01','ICIS / Market data (simulated)','PA66: breached £3.00/kg threshold; appetite for longer-term contracts strong',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='PA66-GF30' AND price_date='2026-04-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Nylon PA66-GF30','PA66-GF30',3.0282,'per kg','GBP','2026-05-01','ICIS / Market data (simulated)','PA66: continuing rise; specialty GF grades tight from AGY/Johns Manville',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='PA66-GF30' AND price_date='2026-05-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Nylon PA66-GF30','PA66-GF30',3.0452,'per kg','GBP','2026-06-01','ICIS / Market data (simulated)','PA66: mid-2026 high; engineering polymer index up 4.7% vs Dec-25',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='PA66-GF30' AND price_date='2026-06-01');

  -- ── STAINLESS STEEL SS409 (STL-SS409) ────────────────────────
  -- Steady climb Jul 2025 - Mar 2026 (nickel recovery), then plateau
  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Stainless Steel SS409','STL-SS409',1.5682,'per kg','GBP','2025-07-01','LME / Industry Index (simulated)','SS409: Ni LME recovering from 2024 low; ferrochrome also firming',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='STL-SS409' AND price_date='2025-07-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Stainless Steel SS409','STL-SS409',1.5822,'per kg','GBP','2025-08-01','LME / Industry Index (simulated)','SS409: exhaust demand from hybrid vehicle ramp lifting specialist grades',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='STL-SS409' AND price_date='2025-08-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Stainless Steel SS409','STL-SS409',1.5982,'per kg','GBP','2025-09-01','LME / Industry Index (simulated)','SS409: Ni surcharge adjustment up 3.1%; ferritic grades following suite',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='STL-SS409' AND price_date='2025-09-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Stainless Steel SS409','STL-SS409',1.6122,'per kg','GBP','2025-10-01','LME / Industry Index (simulated)','SS409: climbing; Indonesian Ni pig iron production curtailed, benefitting LME',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='STL-SS409' AND price_date='2025-10-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Stainless Steel SS409','STL-SS409',1.6222,'per kg','GBP','2025-11-01','LME / Industry Index (simulated)','SS409: consolidation; Cr chemical prices stabilised after Oct surge',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='STL-SS409' AND price_date='2025-11-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Stainless Steel SS409','STL-SS409',1.6182,'per kg','GBP','2025-12-01','LME / Industry Index (simulated)','SS409: minor pullback; year-end service centre destocking of ferritic grades',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='STL-SS409' AND price_date='2025-12-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Stainless Steel SS409','STL-SS409',1.6282,'per kg','GBP','2026-01-01','LME / Industry Index (simulated)','SS409: Jan re-stocking; OEM exhaust module schedules firming for Q2',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='STL-SS409' AND price_date='2026-01-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Stainless Steel SS409','STL-SS409',1.6422,'per kg','GBP','2026-02-01','LME / Industry Index (simulated)','SS409: LME Ni spike drove brief surcharge; Outokumpu raised Q1 price',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='STL-SS409' AND price_date='2026-02-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Stainless Steel SS409','STL-SS409',1.6552,'per kg','GBP','2026-03-01','LME / Industry Index (simulated)','SS409: 2026 high; exhaust fabricator capacity tight, lead times to 8 weeks',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='STL-SS409' AND price_date='2026-03-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Stainless Steel SS409','STL-SS409',1.6622,'per kg','GBP','2026-04-01','LME / Industry Index (simulated)','SS409: plateau; Ni LME moderating slightly, price holding on physical tightness',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='STL-SS409' AND price_date='2026-04-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Stainless Steel SS409','STL-SS409',1.6602,'per kg','GBP','2026-05-01','LME / Industry Index (simulated)','SS409: largely flat; Chinese ferritic SS exports resuming, limiting upside',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='STL-SS409' AND price_date='2026-05-01');

  INSERT INTO commodity_price (material_name,material_code,price_per_unit,unit,currency,price_date,source,notes,created_by)
  SELECT 'Stainless Steel SS409','STL-SS409',1.6652,'per kg','GBP','2026-06-01','LME / Industry Index (simulated)','SS409: mid-2026; price stable at £1.665/kg. H2 outlook broadly flat.',v_user
  WHERE NOT EXISTS (SELECT 1 FROM commodity_price WHERE material_code='STL-SS409' AND price_date='2026-06-01');

END $$;

DO $$ BEGIN RAISE NOTICE 'Commodity price seed complete — Jul 2025 to Jun 2026 loaded for 8 materials.'; END $$;
