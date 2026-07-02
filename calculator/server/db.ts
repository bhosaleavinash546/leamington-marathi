import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'should-cost.db');

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS rate_library (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL DEFAULT 'system'
  );

  CREATE TABLE IF NOT EXISTS scenarios (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL DEFAULT 'system'
  );

  -- Per-user saved projects (SW configs, universal scenarios, PCB analyses, …)
  CREATE TABLE IF NOT EXISTS projects (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    kind       TEXT NOT NULL,
    name       TEXT NOT NULL,
    data       TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_projects_user_kind ON projects(user_id, kind);

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    company_name TEXT NOT NULL DEFAULT '',
    email_verified INTEGER NOT NULL DEFAULT 0,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL
  );

  -- Admin edits to individual rate cells (layered over the active library).
  CREATE TABLE IF NOT EXISTS rate_overrides (
    id         TEXT PRIMARY KEY,   -- table|rowId|field
    tbl        TEXT NOT NULL,
    row_id     TEXT NOT NULL,
    field      TEXT NOT NULL,
    value      REAL NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL DEFAULT ''
  );

  -- Simple key/value app settings (e.g. which rate source is active).
  CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS otp_tokens (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    otp_hash TEXT NOT NULL,
    purpose TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_tokens(email, purpose);
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

  CREATE TABLE IF NOT EXISTS material_price_overrides (
    material_id TEXT PRIMARY KEY,
    price_per_kg REAL NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual',
    fetched_at TEXT NOT NULL,
    confidence TEXT NOT NULL DEFAULT 'Medium'
  );

  CREATE TABLE IF NOT EXISTS price_fetch_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fetched_at TEXT NOT NULL,
    source TEXT NOT NULL,
    updated_count INTEGER NOT NULL DEFAULT 0,
    error TEXT
  );

  CREATE TABLE IF NOT EXISTS supplier_quotes (
    id TEXT PRIMARY KEY,
    scenario_id TEXT NOT NULL,
    supplier_name TEXT NOT NULL,
    supplier_country TEXT NOT NULL DEFAULT '',
    unit_price REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'GBP',
    moq INTEGER NOT NULL DEFAULT 1,
    lead_time_weeks INTEGER,
    validity_date TEXT,
    tooling_cost REAL NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    attachments TEXT NOT NULL DEFAULT '[]',
    created_by TEXT NOT NULL DEFAULT 'system',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_quotes_scenario ON supplier_quotes(scenario_id);

  CREATE TABLE IF NOT EXISTS bom_items (
    id TEXT PRIMARY KEY,
    parent_scenario_id TEXT NOT NULL,
    child_scenario_id TEXT,
    item_name TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 1,
    unit_cost_override REAL,
    notes TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_bom_parent ON bom_items(parent_scenario_id);
  CREATE INDEX IF NOT EXISTS idx_bom_child  ON bom_items(child_scenario_id);
`);

// ── Migrations for existing databases (CREATE IF NOT EXISTS won't add columns) ──
function ensureColumn(table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some(c => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}
ensureColumn('users', 'role', "role TEXT NOT NULL DEFAULT 'user'");

// ── Bootstrap admins from env (comma-separated emails) ─────────────────────────
export const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean),
);

/** Promote a user to admin if their email is in ADMIN_EMAILS. Safe to call any time. */
export function promoteAdminIfListed(email: string): void {
  const e = email.trim().toLowerCase();
  if (ADMIN_EMAILS.has(e)) db.prepare('UPDATE users SET role = ? WHERE lower(email) = ?').run('admin', e);
}

// Apply once at startup for accounts that already exist; auth also re-applies on
// signup/signin so an admin who registers later is promoted without a restart.
for (const e of ADMIN_EMAILS) promoteAdminIfListed(e);

export default db;
