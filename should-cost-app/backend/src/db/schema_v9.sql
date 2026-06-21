-- Rate validation fields
ALTER TABLE rate_reference
  ADD COLUMN IF NOT EXISTS is_validated    BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS validated_by    UUID        REFERENCES "user"(id),
  ADD COLUMN IF NOT EXISTS validated_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS validation_notes TEXT;

-- Open-book: share a should-cost with a specific supplier for line-by-line response
CREATE TABLE IF NOT EXISTS should_cost_share (
  id                    SERIAL      PRIMARY KEY,
  should_cost_header_id INTEGER     NOT NULL REFERENCES should_cost_header(id) ON DELETE CASCADE,
  supplier_id           INTEGER     NOT NULL REFERENCES supplier(id)           ON DELETE CASCADE,
  shared_by             UUID        REFERENCES "user"(id),
  shared_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  message               TEXT,
  status                VARCHAR(20) NOT NULL DEFAULT 'open',  -- open | responded | closed
  UNIQUE(should_cost_header_id, supplier_id)
);
CREATE INDEX IF NOT EXISTS idx_sc_share_header ON should_cost_share(should_cost_header_id);
CREATE INDEX IF NOT EXISTS idx_sc_share_supplier ON should_cost_share(supplier_id);

-- Supplier line-by-line responses to a shared should-cost
CREATE TABLE IF NOT EXISTS should_cost_line_response (
  id             SERIAL       PRIMARY KEY,
  share_id       INTEGER      NOT NULL REFERENCES should_cost_share(id) ON DELETE CASCADE,
  breakdown_id   INTEGER      REFERENCES should_cost_breakdown(id)      ON DELETE CASCADE,
  response_text  TEXT,
  counter_value  NUMERIC(12,4),
  created_by     UUID         REFERENCES "user"(id),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(share_id, breakdown_id)
);
CREATE INDEX IF NOT EXISTS idx_sc_line_resp_share ON should_cost_line_response(share_id);

-- CER accuracy log: saves estimate + tracks actual settled price later
CREATE TABLE IF NOT EXISTS cer_accuracy_log (
  id                    SERIAL       PRIMARY KEY,
  process_type          VARCHAR(100),
  country               VARCHAR(100),
  part_weight_kg        NUMERIC(10,4),
  material_name         VARCHAR(200),
  cycle_time_sec        NUMERIC(10,2),
  annual_volume         INTEGER,
  estimated_total       NUMERIC(12,4) NOT NULL,
  actual_settled        NUMERIC(12,4),
  part_id               INTEGER      REFERENCES part_master(id),
  should_cost_header_id INTEGER      REFERENCES should_cost_header(id),
  notes                 TEXT,
  created_by            UUID         REFERENCES "user"(id),
  settled_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
