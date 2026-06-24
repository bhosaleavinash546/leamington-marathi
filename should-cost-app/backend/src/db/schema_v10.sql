-- ============================================================
-- Schema V10 — Multi-tenancy: Organization foundation
-- Run AFTER schema_v9.sql
-- ============================================================

-- ---------------------------------------------------------------
-- Organization table
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organization (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(255) NOT NULL,
  slug        VARCHAR(100) NOT NULL UNIQUE,
  plan        VARCHAR(50)  NOT NULL DEFAULT 'starter',  -- starter|professional|enterprise
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  settings    JSONB        NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Default org for existing data
INSERT INTO organization (id, name, slug, plan)
VALUES ('00000000-0000-0000-0000-000000000001', 'CostLens Demo', 'costlens-demo', 'enterprise')
ON CONFLICT (slug) DO NOTHING;

-- Add org_id to user table (nullable for backward compat during migration)
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organization(id);

-- Assign all existing users to the default org
UPDATE "user" SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;

-- Add org_id to key domain tables (nullable during migration)
ALTER TABLE part_master          ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organization(id);
ALTER TABLE supplier             ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organization(id);
ALTER TABLE should_cost_header   ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organization(id);
ALTER TABLE negotiation_target   ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organization(id);
ALTER TABLE acr_target           ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organization(id);
ALTER TABLE commodity_price      ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organization(id);

-- Back-fill all existing rows to the default org
UPDATE part_master        SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE supplier           SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE should_cost_header SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE negotiation_target SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
ALTER TABLE negotiation_target ADD COLUMN IF NOT EXISTS annual_volume NUMERIC(12,2);
UPDATE acr_target         SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE commodity_price    SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;

-- Indexes for org-scoped queries
CREATE INDEX IF NOT EXISTS idx_part_master_org        ON part_master(org_id);
CREATE INDEX IF NOT EXISTS idx_supplier_org           ON supplier(org_id);
CREATE INDEX IF NOT EXISTS idx_should_cost_header_org ON should_cost_header(org_id);
CREATE INDEX IF NOT EXISTS idx_negotiation_target_org ON negotiation_target(org_id);
CREATE INDEX IF NOT EXISTS idx_acr_target_org         ON acr_target(org_id);
CREATE INDEX IF NOT EXISTS idx_commodity_price_org    ON commodity_price(org_id);
CREATE INDEX IF NOT EXISTS idx_user_org               ON "user"(org_id);

-- ---------------------------------------------------------------
-- Organization membership & invitation tracking
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS org_invitation (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organization(id),
  email       VARCHAR(255) NOT NULL,
  role        VARCHAR(50)  NOT NULL DEFAULT 'internal',
  invited_by  UUID REFERENCES "user"(id),
  token       VARCHAR(255) UNIQUE,
  accepted_at TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_invitation_org   ON org_invitation(org_id);
CREATE INDEX IF NOT EXISTS idx_org_invitation_email ON org_invitation(email);
CREATE INDEX IF NOT EXISTS idx_org_invitation_token ON org_invitation(token);
