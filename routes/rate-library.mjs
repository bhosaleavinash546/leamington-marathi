// ─────────────────────────────────────────────────────────────────────────────
// Admin rate-library routes: view / upload / revert / roll back the company's
// custom cost data (materials, processes, regions, global constants). Gated by an
// ADMIN_EMAILS allowlist. The active library is merged over the built-in defaults
// and applied to every should-cost estimate.
//
// Versioning: cost_library_versions is APPEND-ONLY and the latest row is the
// active library. Every upload / revert / rollback appends a new row, giving a
// full audit trail (who / when / note) and one-click rollback.
// ─────────────────────────────────────────────────────────────────────────────
import { MATERIALS, PROCESSES, REGIONS, COST_CONSTANTS } from '../costing-engine.mjs';
import { validateLibrary, FIELD_SPECS, librarySummary, diffLibraries } from '../cost-library.mjs';
import { setActiveLibrary, getActiveCustom, getActiveMeta } from '../active-library.mjs';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const isAdmin = (req) => !!(req.user?.email && ADMIN_EMAILS.includes(req.user.email.toLowerCase()));

const DEFAULTS = () => ({ materials: MATERIALS, processes: PROCESSES, regions: REGIONS, constants: COST_CONSTANTS });

export function registerRateLibraryRoutes(app, { db, requireAuth }) {
  db.exec(`CREATE TABLE IF NOT EXISTS cost_library_versions (
    version   INTEGER PRIMARY KEY AUTOINCREMENT,
    data      TEXT NOT NULL,          -- JSON custom overrides ('{}' = built-in)
    summary   TEXT,                   -- JSON override counts
    action    TEXT NOT NULL,          -- 'upload' | 'revert' | 'rollback'
    note      TEXT,
    updatedBy TEXT,
    updatedAt TEXT NOT NULL
  )`);

  const latest = () => db.prepare('SELECT * FROM cost_library_versions ORDER BY version DESC LIMIT 1').get();
  const dataOf = (v) => { try { return JSON.parse(v.data); } catch { return {}; } };
  const append = (custom, action, note, by) => {
    const at = new Date().toISOString();
    const info = db.prepare('INSERT INTO cost_library_versions (data, summary, action, note, updatedBy, updatedAt) VALUES (?,?,?,?,?,?)')
      .run(JSON.stringify(custom || {}), JSON.stringify(librarySummary(custom || {})), action, note || null, by || null, at);
    setActiveLibrary(custom || {}, { updatedAt: at, updatedBy: by || null, version: info.lastInsertRowid });
    return info.lastInsertRowid;
  };

  // ── One-time migration from the old single-row store, if present ────────────
  try {
    const old = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cost_library'").get();
    if (old && !latest()) {
      const row = db.prepare('SELECT data, updatedBy, updatedAt FROM cost_library WHERE id = 1').get();
      if (row) {
        const at = row.updatedAt || new Date().toISOString();
        db.prepare('INSERT INTO cost_library_versions (data, summary, action, note, updatedBy, updatedAt) VALUES (?,?,?,?,?,?)')
          .run(row.data, JSON.stringify(librarySummary(JSON.parse(row.data))), 'upload', 'migrated from previous store', row.updatedBy, at);
      }
    }
  } catch (e) { console.log('[RateLibrary] migration warning:', e.message); }

  // Load the active (latest) version into the singleton at startup.
  try {
    const v = latest();
    if (v) { setActiveLibrary(dataOf(v), { updatedAt: v.updatedAt, updatedBy: v.updatedBy, version: v.version }); console.log(`[RateLibrary] Active version v${v.version} loaded.`); }
  } catch (e) { console.log('[RateLibrary] load warning:', e.message); }

  const requireAdmin = (req, res, next) => {
    if (!isAdmin(req)) return res.status(403).json({ error: ADMIN_EMAILS.length ? 'Admin access required.' : 'Rate-library admin is not configured. Set the ADMIN_EMAILS environment variable.' });
    next();
  };
  const meta = () => { const v = latest(); return { ...getActiveMeta(), version: v?.version ?? null }; };

  // Lightweight gate check for the UI (any authenticated user).
  app.get('/api/admin/rate-library/status', requireAuth, (req, res) => {
    res.json({ isAdmin: isAdmin(req), configured: ADMIN_EMAILS.length > 0, meta: meta() });
  });

  // Full view: field schema, built-in defaults, current custom overrides.
  app.get('/api/admin/rate-library', requireAuth, requireAdmin, (_req, res) => {
    res.json({ fieldSpecs: FIELD_SPECS, defaults: DEFAULTS(), custom: getActiveCustom(), meta: meta() });
  });

  // Version history (audit trail), newest first; the top row is active.
  app.get('/api/admin/rate-library/versions', requireAuth, requireAdmin, (_req, res) => {
    const rows = db.prepare('SELECT version, summary, action, note, updatedBy, updatedAt FROM cost_library_versions ORDER BY version DESC LIMIT 100').all();
    const activeVersion = rows[0]?.version ?? null;
    res.json({ versions: rows.map(r => ({ ...r, summary: JSON.parse(r.summary || '{}'), active: r.version === activeVersion })), activeVersion });
  });

  // Field-level diff of a version vs its predecessor (effective/merged values).
  app.get('/api/admin/rate-library/versions/:version/diff', requireAuth, requireAdmin, (req, res) => {
    const v = db.prepare('SELECT * FROM cost_library_versions WHERE version = ?').get(Number(req.params.version));
    if (!v) return res.status(404).json({ error: 'Version not found.' });
    const prev = db.prepare('SELECT * FROM cost_library_versions WHERE version < ? ORDER BY version DESC LIMIT 1').get(v.version);
    res.json({ version: v.version, comparedTo: prev?.version ?? 'built-in', changes: diffLibraries(prev ? dataOf(prev) : {}, dataOf(v)) });
  });

  // Upload / replace the custom library.
  app.post('/api/admin/rate-library', requireAuth, requireAdmin, (req, res) => {
    const { ok, errors, normalized } = validateLibrary(req.body?.custom);
    if (!ok) return res.status(400).json({ error: 'Validation failed — no changes saved.', errors });
    const version = append(normalized, 'upload', String(req.body?.note || '').slice(0, 200), req.user.email || req.user.id);
    res.json({ ok: true, version, meta: meta() });
  });

  // Revert to built-in defaults (recorded as a version for the audit trail).
  app.post('/api/admin/rate-library/revert', requireAuth, requireAdmin, (req, res) => {
    const version = append({}, 'revert', 'Reverted to built-in defaults', req.user.email || req.user.id);
    res.json({ ok: true, version, meta: meta() });
  });

  // Roll back to an earlier version (appends a copy so history stays append-only).
  app.post('/api/admin/rate-library/rollback', requireAuth, requireAdmin, (req, res) => {
    const target = db.prepare('SELECT * FROM cost_library_versions WHERE version = ?').get(Number(req.body?.version));
    if (!target) return res.status(404).json({ error: 'Version not found.' });
    const version = append(dataOf(target), 'rollback', `Rolled back to v${target.version}`, req.user.email || req.user.id);
    res.json({ ok: true, version, meta: meta() });
  });
}
