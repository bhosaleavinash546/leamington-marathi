-- ============================================================
-- Should-Cost vs Supplier Quotes — PostgreSQL Schema
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------
-- Role & User
-- ---------------------------------------------------------------
CREATE TABLE role (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(50) NOT NULL UNIQUE,   -- 'internal' | 'supplier' | 'admin'
  description TEXT
);

CREATE TABLE "user" (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(255) NOT NULL,
  role_id       INTEGER NOT NULL REFERENCES role(id),
  supplier_id   INTEGER,                      -- FK added after supplier table
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------
-- Part Master
-- ---------------------------------------------------------------
CREATE TABLE part_master (
  id           SERIAL PRIMARY KEY,
  part_number  VARCHAR(100) NOT NULL UNIQUE,
  description  TEXT,
  uom          VARCHAR(30),                   -- unit of measure
  commodity    VARCHAR(100),
  drawing_rev  VARCHAR(20),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------
-- Supplier
-- ---------------------------------------------------------------
CREATE TABLE supplier (
  id           SERIAL PRIMARY KEY,
  code         VARCHAR(50) NOT NULL UNIQUE,
  name         VARCHAR(255) NOT NULL,
  country      VARCHAR(100),
  contact_name VARCHAR(255),
  contact_email VARCHAR(255),
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add FK from user to supplier (nullable — only supplier-role users have it)
ALTER TABLE "user" ADD CONSTRAINT fk_user_supplier
  FOREIGN KEY (supplier_id) REFERENCES supplier(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------
-- Should-Cost Header (one record = one costed BOM line / part)
-- ---------------------------------------------------------------
CREATE TABLE should_cost_header (
  id              SERIAL PRIMARY KEY,
  part_id         INTEGER NOT NULL REFERENCES part_master(id),
  version         INTEGER NOT NULL DEFAULT 1,
  status          VARCHAR(30) NOT NULL DEFAULT 'draft',  -- draft|published|archived
  annual_volume   NUMERIC(12,2),
  currency        CHAR(3) NOT NULL DEFAULT 'USD',
  total_cost      NUMERIC(14,4) GENERATED ALWAYS AS (
                    -- computed column placeholder; real sum comes from app layer
                    NULL
                  ) STORED,
  notes           TEXT,
  created_by      UUID REFERENCES "user"(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (part_id, version)
);

-- Remove generated column (PostgreSQL requires explicit expression — keep it simple)
ALTER TABLE should_cost_header DROP COLUMN total_cost;
ALTER TABLE should_cost_header ADD COLUMN total_cost NUMERIC(14,4);

-- ---------------------------------------------------------------
-- Should-Cost Breakdown (cost elements per header)
-- ---------------------------------------------------------------
CREATE TABLE should_cost_breakdown (
  id                    SERIAL PRIMARY KEY,
  should_cost_header_id INTEGER NOT NULL REFERENCES should_cost_header(id) ON DELETE CASCADE,
  cost_element          VARCHAR(100) NOT NULL,  -- e.g. Raw Material, Labor, Overhead ...
  category              VARCHAR(50),             -- material | labor | overhead | logistics | profit
  value                 NUMERIC(14,4) NOT NULL DEFAULT 0,
  basis                 VARCHAR(100),            -- $/kg, $/hr, % of cost ...
  notes                 TEXT,
  sort_order            INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_sc_breakdown_header ON should_cost_breakdown(should_cost_header_id);

-- ---------------------------------------------------------------
-- Supplier Quote Header (versioned)
-- ---------------------------------------------------------------
CREATE TABLE supplier_quote_header (
  id              SERIAL PRIMARY KEY,
  part_id         INTEGER NOT NULL REFERENCES part_master(id),
  supplier_id     INTEGER NOT NULL REFERENCES supplier(id),
  version         INTEGER NOT NULL DEFAULT 1,
  status          VARCHAR(30) NOT NULL DEFAULT 'submitted',  -- submitted|accepted|rejected|negotiating
  rfq_number      VARCHAR(100),
  annual_volume   NUMERIC(12,2),
  currency        CHAR(3) NOT NULL DEFAULT 'USD',
  total_price     NUMERIC(14,4),
  validity_date   DATE,
  submitted_at    TIMESTAMPTZ,
  submitted_by    UUID REFERENCES "user"(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (part_id, supplier_id, version)
);

-- ---------------------------------------------------------------
-- Supplier Quote Breakdown
-- ---------------------------------------------------------------
CREATE TABLE supplier_quote_breakdown (
  id                       SERIAL PRIMARY KEY,
  supplier_quote_header_id INTEGER NOT NULL REFERENCES supplier_quote_header(id) ON DELETE CASCADE,
  cost_element             VARCHAR(100) NOT NULL,
  category                 VARCHAR(50),
  value                    NUMERIC(14,4) NOT NULL DEFAULT 0,
  basis                    VARCHAR(100),
  notes                    TEXT,
  sort_order               INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_sq_breakdown_header ON supplier_quote_breakdown(supplier_quote_header_id);

-- ---------------------------------------------------------------
-- Comparison Snapshot (links one SC version to one Quote version)
-- ---------------------------------------------------------------
CREATE TABLE comparison_snapshot (
  id                       SERIAL PRIMARY KEY,
  part_id                  INTEGER NOT NULL REFERENCES part_master(id),
  should_cost_header_id    INTEGER NOT NULL REFERENCES should_cost_header(id),
  supplier_quote_header_id INTEGER NOT NULL REFERENCES supplier_quote_header(id),
  snapshot_name            VARCHAR(255),
  total_should_cost        NUMERIC(14,4),
  total_quote_price        NUMERIC(14,4),
  total_variance           NUMERIC(14,4),   -- quote - should_cost
  variance_pct             NUMERIC(8,4),    -- (variance / should_cost) * 100
  status                   VARCHAR(30) NOT NULL DEFAULT 'open',  -- open|reviewed|closed
  created_by               UUID REFERENCES "user"(id),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_snapshot_part ON comparison_snapshot(part_id);

-- ---------------------------------------------------------------
-- Comparison Detail (element-level variance)
-- ---------------------------------------------------------------
CREATE TABLE comparison_detail (
  id                      SERIAL PRIMARY KEY,
  comparison_snapshot_id  INTEGER NOT NULL REFERENCES comparison_snapshot(id) ON DELETE CASCADE,
  cost_element            VARCHAR(100) NOT NULL,
  category                VARCHAR(50),
  should_cost_value       NUMERIC(14,4) NOT NULL DEFAULT 0,
  quote_value             NUMERIC(14,4) NOT NULL DEFAULT 0,
  variance                NUMERIC(14,4) GENERATED ALWAYS AS (quote_value - should_cost_value) STORED,
  variance_pct            NUMERIC(8,4),
  flag                    VARCHAR(30),  -- 'over' | 'under' | 'acceptable'
  sort_order              INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_comp_detail_snapshot ON comparison_detail(comparison_snapshot_id);

-- ---------------------------------------------------------------
-- AI Insight (one record per snapshot + agent run)
-- ---------------------------------------------------------------
CREATE TABLE ai_insight (
  id                     SERIAL PRIMARY KEY,
  comparison_snapshot_id INTEGER NOT NULL REFERENCES comparison_snapshot(id) ON DELETE CASCADE,
  model_used             VARCHAR(100),
  prompt_version         VARCHAR(20) NOT NULL DEFAULT '1.0',
  summary                TEXT,
  flags                  JSONB,     -- array of { element, reason, severity }
  questions              JSONB,     -- array of clarifying question strings
  recommendations        JSONB,     -- array of recommended actions
  raw_response           JSONB,     -- full LLM response stored for audit
  generated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by           UUID REFERENCES "user"(id)
);

CREATE INDEX idx_ai_insight_snapshot ON ai_insight(comparison_snapshot_id);

-- ---------------------------------------------------------------
-- Seed data
-- ---------------------------------------------------------------
INSERT INTO role (name, description) VALUES
  ('admin',    'Full system access'),
  ('internal', 'Internal cost engineers and procurement'),
  ('supplier', 'Supplier portal access — read own quotes only');

-- Demo part
INSERT INTO part_master (part_number, description, uom, commodity, drawing_rev) VALUES
  ('PN-001-A', 'Machined Aluminum Bracket', 'EA', 'Machined Parts', 'C'),
  ('PN-002-B', 'Stamped Steel Bracket',     'EA', 'Stampings',      'B');

-- Demo supplier
INSERT INTO supplier (code, name, country, contact_name, contact_email) VALUES
  ('SUP-001', 'Acme Precision Parts', 'India',  'Rajesh Kumar',  'rajesh@acme.example'),
  ('SUP-002', 'Global Forge Ltd',     'Mexico', 'Maria Reyes',   'maria@globalforge.example');
