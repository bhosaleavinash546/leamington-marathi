-- ============================================================
-- Schema V3: Vehicle Programs + Current Live Price
-- Run after schema.sql and schema_v2.sql
-- ============================================================

-- Vehicle programs (SUV1-SUV5 etc.)
CREATE TABLE IF NOT EXISTS vehicle_program (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(20) UNIQUE NOT NULL,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  model_year  INTEGER,
  platform    VARCHAR(50),
  segment     VARCHAR(50),
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Current live price: what the company actually pays the incumbent supplier today
CREATE TABLE IF NOT EXISTS current_price_header (
  id               SERIAL PRIMARY KEY,
  part_id          INTEGER NOT NULL REFERENCES part_master(id),
  program_id       INTEGER REFERENCES vehicle_program(id),
  version          INTEGER NOT NULL DEFAULT 1,
  status           VARCHAR(30) DEFAULT 'active',   -- active | superseded
  total_cost       NUMERIC(14,4) NOT NULL,
  currency         CHAR(3) DEFAULT 'USD',
  supplier_name    VARCHAR(200),
  annual_volume    NUMERIC(12,2),
  effective_date   DATE,
  notes            TEXT,
  created_by       UUID REFERENCES "user"(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (part_id, version)
);

-- Line-item breakdown of current live price
-- category values: RAW_MATERIAL | BOP | MANUFACTURING | OVERHEAD | LOGISTICS | TOOLING | PROFIT
CREATE TABLE IF NOT EXISTS current_price_breakdown (
  id                      SERIAL PRIMARY KEY,
  current_price_header_id INTEGER NOT NULL REFERENCES current_price_header(id) ON DELETE CASCADE,
  cost_element            VARCHAR(100) NOT NULL,
  category                VARCHAR(50)  DEFAULT 'UNCATEGORIZED',
  value                   NUMERIC(14,4) NOT NULL DEFAULT 0,
  basis                   VARCHAR(100),
  notes                   TEXT,
  sort_order              INTEGER DEFAULT 0
);

-- Add program FK to existing tables
ALTER TABLE part_master          ADD COLUMN IF NOT EXISTS program_id INTEGER REFERENCES vehicle_program(id);
ALTER TABLE should_cost_header   ADD COLUMN IF NOT EXISTS program_id INTEGER REFERENCES vehicle_program(id);
ALTER TABLE supplier_quote_header ADD COLUMN IF NOT EXISTS program_id INTEGER REFERENCES vehicle_program(id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_vp_code           ON vehicle_program(code);
CREATE INDEX IF NOT EXISTS idx_cph_part          ON current_price_header(part_id);
CREATE INDEX IF NOT EXISTS idx_cph_program       ON current_price_header(program_id);
CREATE INDEX IF NOT EXISTS idx_cpb_header        ON current_price_breakdown(current_price_header_id);
CREATE INDEX IF NOT EXISTS idx_part_program      ON part_master(program_id);
CREATE INDEX IF NOT EXISTS idx_sch_program       ON should_cost_header(program_id);
CREATE INDEX IF NOT EXISTS idx_sqh_program       ON supplier_quote_header(program_id);
