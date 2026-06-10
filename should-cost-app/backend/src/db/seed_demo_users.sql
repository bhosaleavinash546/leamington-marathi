-- ============================================================
-- Seed: Demo Users for CostLens
-- Password for all accounts: "password"
-- Hash generated with bcrypt rounds=10
-- ============================================================
INSERT INTO "user" (email, password_hash, full_name, role_id)
SELECT
  'admin@costlens.io',
  '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
  'CostLens Admin',
  (SELECT id FROM role WHERE name = 'admin')
ON CONFLICT (email) DO NOTHING;

INSERT INTO "user" (email, password_hash, full_name, role_id)
SELECT
  'avinash.bhosale@costlens.io',
  '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
  'Avinash Bhosale',
  (SELECT id FROM role WHERE name = 'internal')
ON CONFLICT (email) DO NOTHING;

INSERT INTO "user" (email, password_hash, full_name, role_id)
SELECT
  'procurement@costlens.io',
  '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
  'Procurement Team',
  (SELECT id FROM role WHERE name = 'internal')
ON CONFLICT (email) DO NOTHING;
