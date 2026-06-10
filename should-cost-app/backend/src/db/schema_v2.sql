-- ============================================================
-- Schema V2 — Phase 6 enhancements
-- Run AFTER schema.sql
-- ============================================================

-- ---------------------------------------------------------------
-- Vehicle hierarchy (22 automotive systems)
-- ---------------------------------------------------------------
CREATE TABLE vehicle_system (
  id         SERIAL PRIMARY KEY,
  code       VARCHAR(20)  NOT NULL UNIQUE,
  name       VARCHAR(200) NOT NULL,
  icon       VARCHAR(50),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE vehicle_subsystem (
  id         SERIAL PRIMARY KEY,
  system_id  INTEGER NOT NULL REFERENCES vehicle_system(id) ON DELETE CASCADE,
  code       VARCHAR(40)  NOT NULL UNIQUE,
  name       VARCHAR(200) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE vehicle_component (
  id           SERIAL PRIMARY KEY,
  subsystem_id INTEGER NOT NULL REFERENCES vehicle_subsystem(id) ON DELETE CASCADE,
  code         VARCHAR(60)  NOT NULL UNIQUE,
  name         VARCHAR(300) NOT NULL,
  sort_order   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_vsub_system    ON vehicle_subsystem(system_id);
CREATE INDEX idx_vcomp_subsystem ON vehicle_component(subsystem_id);

-- Link part_master to hierarchy
ALTER TABLE part_master
  ADD COLUMN IF NOT EXISTS system_id    INTEGER REFERENCES vehicle_system(id),
  ADD COLUMN IF NOT EXISTS subsystem_id INTEGER REFERENCES vehicle_subsystem(id),
  ADD COLUMN IF NOT EXISTS component_id INTEGER REFERENCES vehicle_component(id);

CREATE INDEX idx_part_system    ON part_master(system_id);
CREATE INDEX idx_part_subsystem ON part_master(subsystem_id);
CREATE INDEX idx_part_component ON part_master(component_id);

-- ---------------------------------------------------------------
-- OTP tokens (signup verification + password reset)
-- ---------------------------------------------------------------
CREATE TABLE otp_token (
  id         BIGSERIAL PRIMARY KEY,
  email      VARCHAR(255) NOT NULL,
  token      CHAR(6)      NOT NULL,
  purpose    VARCHAR(30)  NOT NULL,  -- 'signup' | 'reset_password'
  expires_at TIMESTAMPTZ  NOT NULL,
  used       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_otp_lookup ON otp_token(email, purpose, used);

-- Pending signups waiting for OTP verification
CREATE TABLE pending_signup (
  id            BIGSERIAL PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(255) NOT NULL,
  role_id       INTEGER NOT NULL REFERENCES role(id),
  supplier_id   INTEGER REFERENCES supplier(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '15 minutes'
);

-- ---------------------------------------------------------------
-- Multi-supplier comparison (compare N quotes for same part)
-- ---------------------------------------------------------------
CREATE TABLE multi_comparison (
  id                    SERIAL PRIMARY KEY,
  part_id               INTEGER NOT NULL REFERENCES part_master(id),
  should_cost_header_id INTEGER NOT NULL REFERENCES should_cost_header(id),
  name                  VARCHAR(255),
  currency              CHAR(3) NOT NULL DEFAULT 'USD',
  status                VARCHAR(30) NOT NULL DEFAULT 'open',
  created_by            UUID REFERENCES "user"(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE multi_comparison_entry (
  id                       SERIAL PRIMARY KEY,
  multi_comparison_id      INTEGER NOT NULL REFERENCES multi_comparison(id) ON DELETE CASCADE,
  supplier_quote_header_id INTEGER NOT NULL REFERENCES supplier_quote_header(id),
  rank                     INTEGER,
  recommendation           VARCHAR(30),  -- 'recommended' | 'negotiate' | 'reject'
  ai_notes                 TEXT,
  UNIQUE (multi_comparison_id, supplier_quote_header_id)
);

CREATE INDEX idx_mce_comparison ON multi_comparison_entry(multi_comparison_id);

-- ---------------------------------------------------------------
-- Quote comments / negotiation thread
-- ---------------------------------------------------------------
CREATE TABLE quote_comment (
  id                       SERIAL PRIMARY KEY,
  supplier_quote_header_id INTEGER NOT NULL REFERENCES supplier_quote_header(id) ON DELETE CASCADE,
  parent_id                INTEGER REFERENCES quote_comment(id),
  cost_element             VARCHAR(100),   -- NULL = header-level comment
  body                     TEXT NOT NULL,
  is_internal              BOOLEAN NOT NULL DEFAULT FALSE,
  created_by               UUID REFERENCES "user"(id),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_comment_quote ON quote_comment(supplier_quote_header_id);

-- ---------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------
CREATE TABLE audit_log (
  id        BIGSERIAL PRIMARY KEY,
  user_id   UUID REFERENCES "user"(id),
  action    VARCHAR(20)  NOT NULL,   -- CREATE | UPDATE | DELETE
  entity    VARCHAR(100) NOT NULL,
  entity_id VARCHAR(100) NOT NULL,
  changes   JSONB,
  ip        INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_entity ON audit_log(entity, entity_id);
CREATE INDEX idx_audit_user   ON audit_log(user_id);
CREATE INDEX idx_audit_ts     ON audit_log(created_at DESC);

-- ---------------------------------------------------------------
-- Currency exchange rates
-- ---------------------------------------------------------------
CREATE TABLE currency_rate (
  id             SERIAL PRIMARY KEY,
  from_currency  CHAR(3) NOT NULL,
  to_currency    CHAR(3) NOT NULL DEFAULT 'USD',
  rate           NUMERIC(14,6) NOT NULL,
  effective_date DATE NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (from_currency, to_currency, effective_date)
);

-- Seed some baseline rates
INSERT INTO currency_rate (from_currency, to_currency, rate, effective_date) VALUES
  ('EUR','USD', 1.080000, CURRENT_DATE),
  ('GBP','USD', 1.270000, CURRENT_DATE),
  ('INR','USD', 0.012000, CURRENT_DATE),
  ('MXN','USD', 0.059000, CURRENT_DATE),
  ('CNY','USD', 0.139000, CURRENT_DATE),
  ('JPY','USD', 0.006500, CURRENT_DATE);
