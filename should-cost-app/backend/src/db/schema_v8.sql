-- ============================================================
-- Schema V8 — Rate Reference Library + CSV Import Job
-- Run AFTER schema_v7.sql
-- ============================================================

-- ---------------------------------------------------------------
-- 1. Rate Reference Library: labour + machine rates by process × country
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_reference (
  id              SERIAL PRIMARY KEY,
  process_type    VARCHAR(100) NOT NULL,
  country         VARCHAR(100) NOT NULL,
  labour_rate_hr  NUMERIC(10,2) NOT NULL DEFAULT 0,
  machine_rate_hr NUMERIC(10,2) NOT NULL DEFAULT 0,
  overhead_pct    NUMERIC(5,2)  NOT NULL DEFAULT 15,
  scrap_rate_pct  NUMERIC(5,2)  NOT NULL DEFAULT 2,
  source          VARCHAR(200)  DEFAULT 'Industry benchmark 2024',
  effective_date  DATE          DEFAULT CURRENT_DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rate_ref_proc_country ON rate_reference(process_type, country);

-- ---------------------------------------------------------------
-- 2. CSV Import Job tracking
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS csv_import_job (
  id          SERIAL PRIMARY KEY,
  filename    VARCHAR(255),
  status      VARCHAR(20) DEFAULT 'pending',  -- pending|done|failed
  rows_total  INTEGER DEFAULT 0,
  rows_ok     INTEGER DEFAULT 0,
  rows_failed INTEGER DEFAULT 0,
  errors      JSONB,
  created_by  UUID REFERENCES "user"(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ================================================================
-- SEED DATA — Rate Reference Library (2024 industry benchmarks, USD/hr)
-- ================================================================
INSERT INTO rate_reference (process_type, country, labour_rate_hr, machine_rate_hr, overhead_pct, scrap_rate_pct, source, notes)
VALUES
  -- Stamping
  ('Stamping', 'UK',             28.00,  65.00, 18.00, 2.50, 'Industry benchmark 2024', 'UK automotive tier-1 presswork rates'),
  ('Stamping', 'Germany',        38.00,  80.00, 20.00, 2.00, 'Industry benchmark 2024', 'German OEM tier-1 stamping rates'),
  ('Stamping', 'China',           7.00,  35.00, 12.00, 3.00, 'Industry benchmark 2024', 'Yangtze/Pearl River Delta press shops'),
  ('Stamping', 'India',           4.00,  25.00, 10.00, 4.00, 'Industry benchmark 2024', 'Pune/Chennai automotive corridor'),
  ('Stamping', 'Czech Republic', 18.00,  55.00, 14.00, 2.50, 'Industry benchmark 2024', 'Central European automotive cluster'),
  ('Stamping', 'Poland',         16.00,  50.00, 13.00, 3.00, 'Industry benchmark 2024', 'Polish automotive supply chain'),
  ('Stamping', 'Mexico',          8.00,  40.00, 12.00, 3.00, 'Industry benchmark 2024', 'Bajio automotive corridor'),

  -- Die Casting (Aluminium)
  ('Die Casting (Aluminium)', 'UK',      28.00,  90.00, 18.00, 4.00, 'Industry benchmark 2024', 'UK aluminium die casting, HPDC'),
  ('Die Casting (Aluminium)', 'Germany', 38.00, 110.00, 20.00, 3.00, 'Industry benchmark 2024', 'German HPDC for powertrain parts'),
  ('Die Casting (Aluminium)', 'China',    7.00,  55.00, 12.00, 5.00, 'Industry benchmark 2024', 'Chinese die casting exports'),
  ('Die Casting (Aluminium)', 'India',    4.00,  40.00, 10.00, 6.00, 'Industry benchmark 2024', 'Indian aluminium foundries'),
  ('Die Casting (Aluminium)', 'Czech Republic', 18.00, 75.00, 15.00, 3.50, 'Industry benchmark 2024', 'Czech die casting plants'),
  ('Die Casting (Aluminium)', 'Poland',  16.00,  68.00, 14.00, 4.00, 'Industry benchmark 2024', 'Polish aluminium casting'),
  ('Die Casting (Aluminium)', 'Mexico',   8.00,  48.00, 12.00, 4.50, 'Industry benchmark 2024', 'Mexican light metal casting'),

  -- Machining (3-axis CNC)
  ('Machining (3-axis CNC)', 'UK',      30.00,  75.00, 20.00, 1.00, 'Industry benchmark 2024', 'UK CNC machining centres'),
  ('Machining (3-axis CNC)', 'Germany', 42.00,  95.00, 22.00, 1.00, 'Industry benchmark 2024', 'German precision machining'),
  ('Machining (3-axis CNC)', 'China',    8.00,  45.00, 12.00, 2.00, 'Industry benchmark 2024', 'Chinese machining facilities'),
  ('Machining (3-axis CNC)', 'India',    5.00,  30.00, 10.00, 2.50, 'Industry benchmark 2024', 'Indian CNC machining clusters'),
  ('Machining (3-axis CNC)', 'Czech Republic', 20.00, 60.00, 15.00, 1.50, 'Industry benchmark 2024', 'Czech precision engineering'),
  ('Machining (3-axis CNC)', 'Poland',  18.00,  55.00, 14.00, 1.50, 'Industry benchmark 2024', 'Polish machining SMEs'),
  ('Machining (3-axis CNC)', 'Mexico',   9.00,  42.00, 12.00, 2.00, 'Industry benchmark 2024', 'Mexican machining plants'),

  -- Machining (5-axis CNC)
  ('Machining (5-axis CNC)', 'UK',       35.00, 120.00, 22.00, 1.00, 'Industry benchmark 2024', 'UK 5-axis precision machining'),
  ('Machining (5-axis CNC)', 'Germany',  48.00, 150.00, 24.00, 1.00, 'Industry benchmark 2024', 'German 5-axis machining centres'),
  ('Machining (5-axis CNC)', 'China',    10.00,  80.00, 15.00, 1.50, 'Industry benchmark 2024', 'Chinese 5-axis machining'),
  ('Machining (5-axis CNC)', 'India',     6.00,  60.00, 12.00, 2.00, 'Industry benchmark 2024', 'Indian 5-axis machining'),
  ('Machining (5-axis CNC)', 'Czech Republic', 24.00, 100.00, 18.00, 1.00, 'Industry benchmark 2024', 'Czech 5-axis precision parts'),
  ('Machining (5-axis CNC)', 'Poland',   22.00,  90.00, 16.00, 1.00, 'Industry benchmark 2024', 'Polish 5-axis machining'),
  ('Machining (5-axis CNC)', 'Mexico',   12.00,  70.00, 14.00, 1.50, 'Industry benchmark 2024', 'Mexican 5-axis machining'),

  -- Injection Moulding
  ('Injection Moulding', 'UK',             25.00,  60.00, 16.00, 3.00, 'Industry benchmark 2024', 'UK plastics injection moulding'),
  ('Injection Moulding', 'Germany',        36.00,  75.00, 18.00, 2.50, 'Industry benchmark 2024', 'German injection moulding'),
  ('Injection Moulding', 'China',           6.00,  35.00, 10.00, 4.00, 'Industry benchmark 2024', 'Chinese injection moulding'),
  ('Injection Moulding', 'India',           3.00,  25.00,  8.00, 5.00, 'Industry benchmark 2024', 'Indian plastics moulding'),
  ('Injection Moulding', 'Czech Republic', 16.00,  50.00, 14.00, 3.00, 'Industry benchmark 2024', 'Czech plastics processing'),
  ('Injection Moulding', 'Poland',         14.00,  45.00, 13.00, 3.00, 'Industry benchmark 2024', 'Polish injection moulding'),
  ('Injection Moulding', 'Mexico',          7.00,  32.00, 11.00, 3.50, 'Industry benchmark 2024', 'Mexican plastics moulding'),

  -- Forging
  ('Forging', 'UK',             30.00,  85.00, 20.00, 5.00, 'Industry benchmark 2024', 'UK hot and warm forging'),
  ('Forging', 'Germany',        40.00, 100.00, 22.00, 4.00, 'Industry benchmark 2024', 'German forging industry'),
  ('Forging', 'China',           8.00,  50.00, 12.00, 6.00, 'Industry benchmark 2024', 'Chinese forging plants'),
  ('Forging', 'India',           5.00,  38.00, 10.00, 7.00, 'Industry benchmark 2024', 'Indian forging cluster (Rajkot/Ludhiana)'),
  ('Forging', 'Czech Republic', 20.00,  70.00, 16.00, 4.50, 'Industry benchmark 2024', 'Czech forging operations'),
  ('Forging', 'Poland',         18.00,  65.00, 15.00, 5.00, 'Industry benchmark 2024', 'Polish forging facilities'),
  ('Forging', 'Mexico',          9.00,  45.00, 12.00, 5.50, 'Industry benchmark 2024', 'Mexican forging plants'),

  -- Welding Assembly
  ('Welding Assembly', 'UK',             28.00, 30.00, 15.00, 1.00, 'Industry benchmark 2024', 'UK MIG/TIG welding assembly'),
  ('Welding Assembly', 'Germany',        38.00, 40.00, 18.00, 1.00, 'Industry benchmark 2024', 'German robotic and manual welding'),
  ('Welding Assembly', 'Czech Republic', 18.00, 35.00, 14.00, 1.50, 'Industry benchmark 2024', 'Czech welding assembly lines'),
  ('Welding Assembly', 'Poland',         16.00, 32.00, 13.00, 1.50, 'Industry benchmark 2024', 'Polish welding fabrication'),
  ('Welding Assembly', 'China',           7.00, 20.00, 10.00, 2.00, 'Industry benchmark 2024', 'Chinese welding assembly'),
  ('Welding Assembly', 'India',           4.00, 15.00,  9.00, 2.50, 'Industry benchmark 2024', 'Indian welding assembly'),
  ('Welding Assembly', 'Mexico',          8.00, 22.00, 11.00, 1.50, 'Industry benchmark 2024', 'Mexican welding assembly')

ON CONFLICT (process_type, country) DO NOTHING;
