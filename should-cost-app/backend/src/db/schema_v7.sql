-- ============================================================
-- Schema V7 — Commodity prices, ACR targets, commodity templates,
--              assembly BOM, process parameters on should_cost_header
-- Run AFTER schema_v6.sql
-- ============================================================

-- ---------------------------------------------------------------
-- 1. Commodity / material price history
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS commodity_price (
  id             SERIAL PRIMARY KEY,
  material_name  VARCHAR(100) NOT NULL,
  material_code  VARCHAR(50),
  price_per_unit NUMERIC(12,4) NOT NULL,
  unit           VARCHAR(30)   NOT NULL DEFAULT 'per kg',
  currency       VARCHAR(10)   NOT NULL DEFAULT 'GBP',
  price_date     DATE          NOT NULL,
  source         VARCHAR(100)  DEFAULT 'Manual entry',
  notes          TEXT,
  created_by     UUID REFERENCES "user"(id),
  created_at     TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commodity_price_code   ON commodity_price(material_code);
CREATE INDEX IF NOT EXISTS idx_commodity_price_name   ON commodity_price(material_name);
CREATE INDEX IF NOT EXISTS idx_commodity_price_date   ON commodity_price(price_date DESC);

-- ---------------------------------------------------------------
-- 2. ACR (Annual Cost Reduction) targets
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS acr_target (
  id                    SERIAL PRIMARY KEY,
  part_id               INTEGER REFERENCES part_master(id),
  supplier_id           INTEGER REFERENCES supplier(id),
  target_year           INTEGER       NOT NULL,
  base_price            NUMERIC(12,4),
  base_year             INTEGER,
  target_reduction_pct  NUMERIC(5,2)  NOT NULL,
  target_price          NUMERIC(12,4),
  agreed_price          NUMERIC(12,4),
  actual_reduction_pct  NUMERIC(5,2),
  status                VARCHAR(30)   DEFAULT 'open',   -- open | agreed | missed | closed
  currency              VARCHAR(10)   DEFAULT 'GBP',
  notes                 TEXT,
  created_by            UUID REFERENCES "user"(id),
  created_at            TIMESTAMPTZ   DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acr_part     ON acr_target(part_id);
CREATE INDEX IF NOT EXISTS idx_acr_supplier ON acr_target(supplier_id);
CREATE INDEX IF NOT EXISTS idx_acr_year     ON acr_target(target_year);
CREATE INDEX IF NOT EXISTS idx_acr_status   ON acr_target(status);

-- ---------------------------------------------------------------
-- 3. Commodity-specific should-cost templates (pre-seeded)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS commodity_template (
  id             SERIAL PRIMARY KEY,
  commodity_name VARCHAR(100) NOT NULL UNIQUE,
  description    TEXT,
  elements       JSONB        NOT NULL,
  is_active      BOOLEAN      DEFAULT TRUE,
  created_at     TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commodity_template_active ON commodity_template(is_active);

-- ---------------------------------------------------------------
-- 4. Assembly BOM
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assembly_header (
  id               SERIAL PRIMARY KEY,
  assembly_number  VARCHAR(100) NOT NULL,
  description      TEXT,
  program_id       INTEGER REFERENCES vehicle_program(id),
  currency         VARCHAR(10)  DEFAULT 'GBP',
  notes            TEXT,
  created_by       UUID REFERENCES "user"(id),
  created_at       TIMESTAMPTZ  DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assembly_header_program ON assembly_header(program_id);

CREATE TABLE IF NOT EXISTS assembly_bom_line (
  id                    SERIAL PRIMARY KEY,
  assembly_header_id    INTEGER REFERENCES assembly_header(id) ON DELETE CASCADE,
  part_id               INTEGER REFERENCES part_master(id),
  should_cost_header_id INTEGER REFERENCES should_cost_header(id),
  quantity              NUMERIC(10,4) DEFAULT 1,
  sort_order            INTEGER       DEFAULT 0,
  notes                 TEXT
);

CREATE INDEX IF NOT EXISTS idx_assembly_bom_line_header    ON assembly_bom_line(assembly_header_id);
CREATE INDEX IF NOT EXISTS idx_assembly_bom_line_part      ON assembly_bom_line(part_id);
CREATE INDEX IF NOT EXISTS idx_assembly_bom_line_sc_header ON assembly_bom_line(should_cost_header_id);

-- ---------------------------------------------------------------
-- 5. Process parameters on should_cost_header
-- ---------------------------------------------------------------
ALTER TABLE should_cost_header
  ADD COLUMN IF NOT EXISTS part_weight_kg          NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS material_code           VARCHAR(50),
  ADD COLUMN IF NOT EXISTS manufacturing_country   VARCHAR(60),
  ADD COLUMN IF NOT EXISTS machine_type            VARCHAR(100),
  ADD COLUMN IF NOT EXISTS cycle_time_sec          NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS labour_rate_hr          NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS machine_rate_hr         NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS scrap_rate_pct          NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS tooling_cost_total      NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS tooling_life_units      INTEGER;

-- ---------------------------------------------------------------
-- 6. Tooling amortisation on should_cost_breakdown
-- ---------------------------------------------------------------
ALTER TABLE should_cost_breakdown
  ADD COLUMN IF NOT EXISTS is_tooling          BOOLEAN       DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tooling_total_cost  NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS tooling_life_units  INTEGER;

-- ================================================================
-- SEED DATA
-- ================================================================

-- ---------------------------------------------------------------
-- Commodity templates (6 automotive commodities)
-- Only insert if the table is empty to remain idempotent
-- ---------------------------------------------------------------
INSERT INTO commodity_template (commodity_name, description, elements)
SELECT * FROM (VALUES
  (
    'Stamped Steel',
    'Presswork / stamped steel parts including structural brackets, panels and body closures',
    '[
      {"cost_element": "Raw Material (HR/CR Steel)",  "category": "RAW_MATERIAL",   "typical_pct_min": 40, "typical_pct_max": 55, "basis": "Material price £/kg × part weight × (1 + scrap rate)"},
      {"cost_element": "Tooling Amortisation",        "category": "TOOLING",         "typical_pct_min":  3, "typical_pct_max":  8, "basis": "Tool cost ÷ tool life in pieces × annual volume"},
      {"cost_element": "Stamping / Press Operation",  "category": "MANUFACTURING",   "typical_pct_min": 15, "typical_pct_max": 25, "basis": "Press rate £/hr × cycle time"},
      {"cost_element": "Secondary Operations",        "category": "MANUFACTURING",   "typical_pct_min":  2, "typical_pct_max":  8, "basis": "Piercing, coining, trimming ops"},
      {"cost_element": "Surface Treatment / Coating", "category": "MANUFACTURING",   "typical_pct_min":  3, "typical_pct_max":  7, "basis": "E-coat, zinc plating, powder coat per part"},
      {"cost_element": "Manufacturing Overhead",      "category": "OVERHEAD",        "typical_pct_min":  8, "typical_pct_max": 15, "basis": "Absorbed as % of conversion cost"},
      {"cost_element": "Logistics / Packaging",       "category": "LOGISTICS",       "typical_pct_min":  2, "typical_pct_max":  5, "basis": "Inbound steel + outbound delivery per part"},
      {"cost_element": "Profit / Margin",             "category": "PROFIT",          "typical_pct_min":  4, "typical_pct_max":  8, "basis": "% of total cost"}
    ]'::jsonb
  ),
  (
    'Iron/Aluminium Casting',
    'Sand, die and gravity castings in grey iron, ductile iron and aluminium alloys',
    '[
      {"cost_element": "Raw Material (Metal Charge)", "category": "RAW_MATERIAL",   "typical_pct_min": 35, "typical_pct_max": 50, "basis": "Alloy price £/kg × shot weight × yield factor"},
      {"cost_element": "Pattern / Die Tooling",       "category": "TOOLING",         "typical_pct_min":  3, "typical_pct_max": 10, "basis": "Tooling amortised over program life volume"},
      {"cost_element": "Casting Process",             "category": "MANUFACTURING",   "typical_pct_min": 15, "typical_pct_max": 28, "basis": "Machine/furnace rate £/hr × cycle time"},
      {"cost_element": "Machining",                   "category": "MANUFACTURING",   "typical_pct_min":  8, "typical_pct_max": 18, "basis": "CNC rate £/hr × machining cycle time"},
      {"cost_element": "Surface Treatment",           "category": "MANUFACTURING",   "typical_pct_min":  1, "typical_pct_max":  5, "basis": "Shot blast, impregnation, anodise as applicable"},
      {"cost_element": "Manufacturing Overhead",      "category": "OVERHEAD",        "typical_pct_min":  8, "typical_pct_max": 15, "basis": "Absorbed overhead on conversion cost"},
      {"cost_element": "Logistics / Packaging",       "category": "LOGISTICS",       "typical_pct_min":  2, "typical_pct_max":  5, "basis": "Inbound metal + outbound delivery per casting"},
      {"cost_element": "Profit / Margin",             "category": "PROFIT",          "typical_pct_min":  4, "typical_pct_max":  8, "basis": "% of total cost"}
    ]'::jsonb
  ),
  (
    'CNC Machined',
    'Precision turned, milled and ground components from bar, plate or near-net forgings',
    '[
      {"cost_element": "Raw Material (Bar / Billet)",  "category": "RAW_MATERIAL",   "typical_pct_min": 25, "typical_pct_max": 45, "basis": "Material price £/kg × billet weight × buy-to-fly ratio"},
      {"cost_element": "Setup & Machining",            "category": "MANUFACTURING",   "typical_pct_min": 25, "typical_pct_max": 45, "basis": "CNC rate £/hr × cycle time (including setup amortisation)"},
      {"cost_element": "Secondary Operations",         "category": "MANUFACTURING",   "typical_pct_min":  2, "typical_pct_max":  8, "basis": "Heat treat, grinding, honing, broaching"},
      {"cost_element": "Inspection / CMM",             "category": "MANUFACTURING",   "typical_pct_min":  2, "typical_pct_max":  6, "basis": "First-article and in-process inspection cost per part"},
      {"cost_element": "Cutting Tools & Consumables",  "category": "MANUFACTURING",   "typical_pct_min":  2, "typical_pct_max":  5, "basis": "Tooling cost per part based on insert life"},
      {"cost_element": "Manufacturing Overhead",       "category": "OVERHEAD",        "typical_pct_min":  8, "typical_pct_max": 15, "basis": "Facility, maintenance, quality absorbed overhead"},
      {"cost_element": "Logistics / Packaging",        "category": "LOGISTICS",       "typical_pct_min":  2, "typical_pct_max":  4, "basis": "Inbound material + outbound delivery per part"},
      {"cost_element": "Profit / Margin",              "category": "PROFIT",          "typical_pct_min":  5, "typical_pct_max": 10, "basis": "% of total cost"}
    ]'::jsonb
  ),
  (
    'Injection Moulded Plastic',
    'Thermoplastic injection moulded parts including interior trim, functional housings and clips',
    '[
      {"cost_element": "Resin / Material",         "category": "RAW_MATERIAL",   "typical_pct_min": 30, "typical_pct_max": 50, "basis": "Resin price £/kg × shot weight × (1 + runner loss + scrap rate)"},
      {"cost_element": "Tooling Amortisation",     "category": "TOOLING",         "typical_pct_min":  5, "typical_pct_max": 15, "basis": "Mould tool cost ÷ tool life in shots"},
      {"cost_element": "Moulding Operation",       "category": "MANUFACTURING",   "typical_pct_min": 15, "typical_pct_max": 30, "basis": "Machine rate £/hr × cycle time ÷ cavities"},
      {"cost_element": "Assembly / Sub-assembly",  "category": "MANUFACTURING",   "typical_pct_min":  2, "typical_pct_max":  8, "basis": "Labour rate × assembly time for inserts, clips, hinges"},
      {"cost_element": "Colour / Finish",          "category": "MANUFACTURING",   "typical_pct_min":  1, "typical_pct_max":  5, "basis": "Paint, wrap, texture as applicable"},
      {"cost_element": "Manufacturing Overhead",   "category": "OVERHEAD",        "typical_pct_min":  8, "typical_pct_max": 14, "basis": "Absorbed overhead on conversion cost"},
      {"cost_element": "Logistics / Packaging",    "category": "LOGISTICS",       "typical_pct_min":  2, "typical_pct_max":  5, "basis": "Protective packaging + outbound freight per part"},
      {"cost_element": "Profit / Margin",          "category": "PROFIT",          "typical_pct_min":  4, "typical_pct_max":  8, "basis": "% of total cost"}
    ]'::jsonb
  ),
  (
    'Electronic Assembly',
    'Printed circuit board assemblies (PCBA), control modules and sensor units',
    '[
      {"cost_element": "Components BOM (BOP)",     "category": "BOP",             "typical_pct_min": 40, "typical_pct_max": 60, "basis": "Purchased components at standard cost (ICs, passives, connectors)"},
      {"cost_element": "PCB Bare Board",            "category": "RAW_MATERIAL",   "typical_pct_min":  3, "typical_pct_max":  8, "basis": "PCB cost per panel ÷ panels per board"},
      {"cost_element": "SMT Assembly",              "category": "MANUFACTURING",   "typical_pct_min": 10, "typical_pct_max": 20, "basis": "Pick-and-place + solder reflow rate per board"},
      {"cost_element": "Functional Test",           "category": "MANUFACTURING",   "typical_pct_min":  5, "typical_pct_max": 12, "basis": "EOL test rate £/hr × test duration per unit"},
      {"cost_element": "Firmware / Programming",    "category": "MANUFACTURING",   "typical_pct_min":  1, "typical_pct_max":  4, "basis": "Flash programming cost per unit"},
      {"cost_element": "Manufacturing Overhead",    "category": "OVERHEAD",        "typical_pct_min":  8, "typical_pct_max": 14, "basis": "EMS overhead absorption on value-add"},
      {"cost_element": "Logistics / Packaging",     "category": "LOGISTICS",       "typical_pct_min":  2, "typical_pct_max":  5, "basis": "Anti-static packaging + outbound freight per unit"},
      {"cost_element": "Profit / Margin",           "category": "PROFIT",          "typical_pct_min":  5, "typical_pct_max": 10, "basis": "% of total cost"}
    ]'::jsonb
  ),
  (
    'Rubber/Seal',
    'Compression and injection moulded rubber seals, gaskets, grommets and extrusions',
    '[
      {"cost_element": "Compound Material (Rubber)", "category": "RAW_MATERIAL",   "typical_pct_min": 25, "typical_pct_max": 40, "basis": "Compound price £/kg × part weight × (1 + flash scrap)"},
      {"cost_element": "Tooling Amortisation",        "category": "TOOLING",         "typical_pct_min":  3, "typical_pct_max":  8, "basis": "Mould tool cost ÷ expected tool life in shots"},
      {"cost_element": "Moulding Operation",          "category": "MANUFACTURING",   "typical_pct_min": 20, "typical_pct_max": 35, "basis": "Press rate £/hr × cure cycle time ÷ cavities"},
      {"cost_element": "Deflashing / Finishing",      "category": "MANUFACTURING",   "typical_pct_min":  5, "typical_pct_max": 12, "basis": "Manual or cryogenic deflash labour cost per part"},
      {"cost_element": "Test / Leak Check",           "category": "MANUFACTURING",   "typical_pct_min":  2, "typical_pct_max":  6, "basis": "Pressure / leak test equipment cost per part"},
      {"cost_element": "Manufacturing Overhead",      "category": "OVERHEAD",        "typical_pct_min":  8, "typical_pct_max": 14, "basis": "Absorbed overhead on conversion cost"},
      {"cost_element": "Logistics / Packaging",       "category": "LOGISTICS",       "typical_pct_min":  2, "typical_pct_max":  5, "basis": "Bulk tote or individual bag packaging + delivery"},
      {"cost_element": "Profit / Margin",             "category": "PROFIT",          "typical_pct_min":  4, "typical_pct_max":  8, "basis": "% of total cost"}
    ]'::jsonb
  )
) AS v(commodity_name, description, elements)
WHERE NOT EXISTS (SELECT 1 FROM commodity_template LIMIT 1)
ON CONFLICT (commodity_name) DO NOTHING;

-- ---------------------------------------------------------------
-- Commodity price seed — 6 common automotive materials (2024 GBP)
-- ---------------------------------------------------------------
INSERT INTO commodity_price (material_name, material_code, price_per_unit, unit, currency, price_date, source, notes)
VALUES
  ('Hot-Rolled Coil Steel (HRC)',  'STEEL-HRC',  0.5850, 'per kg', 'GBP', '2024-01-01', 'LME / CRU Index', 'Q1 2024 average European HRC benchmark'),
  ('Aluminium Alloy ADC12',        'AL-ADC12',   1.9200, 'per kg', 'GBP', '2024-01-01', 'LME Aluminium + premium', 'Die-cast grade with secondary alloy premium'),
  ('HDPE Resin (Injection Grade)', 'HDPE-INJ',   1.0500, 'per kg', 'GBP', '2024-01-01', 'ICIS Polymer Price', 'High-density polyethylene, natural grade'),
  ('Electrolytic Copper (Grade A)', 'CU-CATH',   7.4500, 'per kg', 'GBP', '2024-01-01', 'LME Copper 3M', 'LME cash settlement average January 2024'),
  ('Grey Cast Iron (GG25)',         'IRON-GG25',  0.4200, 'per kg', 'GBP', '2024-01-01', 'Foundry market rate', 'Including cupola melt and charge materials'),
  ('ABS Resin (Medium Impact)',     'ABS-MI',     1.3800, 'per kg', 'GBP', '2024-01-01', 'ICIS Polymer Price', 'Acrylonitrile-butadiene-styrene, natural pellet')
ON CONFLICT DO NOTHING;
