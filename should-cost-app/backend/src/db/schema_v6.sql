-- ============================================================
-- Schema V6 — Negotiation tracker, audit trail, staleness
-- Run AFTER schema_v5.sql
-- ============================================================

-- ---------------------------------------------------------------
-- Negotiation target tracker (P2)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS negotiation_target (
  id              SERIAL PRIMARY KEY,
  part_id         INTEGER NOT NULL REFERENCES part_master(id),
  supplier_id     INTEGER NOT NULL REFERENCES supplier(id),
  target_price    NUMERIC(14,4) NOT NULL,
  current_price   NUMERIC(14,4),
  should_cost     NUMERIC(14,4),
  currency        CHAR(3)       NOT NULL DEFAULT 'GBP',
  target_date     DATE,
  status          VARCHAR(30)   NOT NULL DEFAULT 'open',   -- open|agreed|closed|stalled
  owner_id        UUID REFERENCES "user"(id),
  notes           TEXT,
  agreed_price    NUMERIC(14,4),
  agreed_at       TIMESTAMPTZ,
  created_by      UUID REFERENCES "user"(id),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_neg_target_part     ON negotiation_target(part_id);
CREATE INDEX IF NOT EXISTS idx_neg_target_supplier ON negotiation_target(supplier_id);
CREATE INDEX IF NOT EXISTS idx_neg_target_status   ON negotiation_target(status);

-- ---------------------------------------------------------------
-- Should-cost header audit trail (P5)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS should_cost_header_audit (
  id                    SERIAL PRIMARY KEY,
  should_cost_header_id INTEGER NOT NULL REFERENCES should_cost_header(id) ON DELETE CASCADE,
  changed_by            UUID REFERENCES "user"(id),
  changed_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  change_type           VARCHAR(30) NOT NULL,   -- created|updated|published|archived
  old_total_cost        NUMERIC(14,4),
  new_total_cost        NUMERIC(14,4),
  old_status            VARCHAR(30),
  new_status            VARCHAR(30),
  notes                 TEXT
);

CREATE INDEX IF NOT EXISTS idx_sc_audit_header ON should_cost_header_audit(should_cost_header_id);

-- Staleness: valid_until date on should_cost_header (P2 purchasing req)
ALTER TABLE should_cost_header ADD COLUMN IF NOT EXISTS valid_until DATE;
