// ─────────────────────────────────────────────────────────────────────────────
// Admin rate-library routes: view / upload / revert the company's custom cost
// data (materials, processes, regions, global constants). Gated by an
// ADMIN_EMAILS allowlist. The uploaded data is merged over the built-in defaults
// and applied to every should-cost estimate.
// ─────────────────────────────────────────────────────────────────────────────
import { MATERIALS, PROCESSES, REGIONS, COST_CONSTANTS } from '../costing-engine.mjs';
import { validateLibrary, FIELD_SPECS } from '../cost-library.mjs';
import { setActiveLibrary, getActiveCustom, getActiveMeta } from '../active-library.mjs';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const isAdmin = (req) => !!(req.user?.email && ADMIN_EMAILS.includes(req.user.email.toLowerCase()));

const DEFAULTS = () => ({ materials: MATERIALS, processes: PROCESSES, regions: REGIONS, constants: COST_CONSTANTS });

export function registerRateLibraryRoutes(app, { db, requireAuth }) {
  db.exec(`CREATE TABLE IF NOT EXISTS cost_library (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL,
    updatedBy TEXT,
    updatedAt TEXT NOT NULL
  )`);

  // Load any persisted custom library into the active singleton at startup.
  try {
    const row = db.prepare('SELECT data, updatedBy, updatedAt FROM cost_library WHERE id = 1').get();
    if (row) {
      const custom = JSON.parse(row.data);
      setActiveLibrary(custom, { updatedAt: row.updatedAt, updatedBy: row.updatedBy });
      console.log('[RateLibrary] Loaded custom rate library from DB.');
    }
  } catch (e) { console.log('[RateLibrary] load warning:', e.message); }

  const requireAdmin = (req, res, next) => {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: ADMIN_EMAILS.length ? 'Admin access required.' : 'Rate-library admin is not configured. Set the ADMIN_EMAILS environment variable.' });
    }
    next();
  };

  // Lightweight gate check for the UI (any authenticated user).
  app.get('/api/admin/rate-library/status', requireAuth, (req, res) => {
    res.json({ isAdmin: isAdmin(req), configured: ADMIN_EMAILS.length > 0, meta: getActiveMeta() });
  });

  // Full view: field schema, built-in defaults, current custom overrides.
  app.get('/api/admin/rate-library', requireAuth, requireAdmin, (_req, res) => {
    res.json({ fieldSpecs: FIELD_SPECS, defaults: DEFAULTS(), custom: getActiveCustom(), meta: getActiveMeta() });
  });

  // Upload / replace the custom library (merged over defaults on use).
  app.post('/api/admin/rate-library', requireAuth, requireAdmin, (req, res) => {
    const custom = req.body?.custom;
    const { ok, errors, normalized } = validateLibrary(custom);
    if (!ok) return res.status(400).json({ error: 'Validation failed — no changes saved.', errors });
    const updatedAt = new Date().toISOString();
    db.prepare(`INSERT INTO cost_library (id, data, updatedBy, updatedAt) VALUES (1, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET data = excluded.data, updatedBy = excluded.updatedBy, updatedAt = excluded.updatedAt`)
      .run(JSON.stringify(normalized), req.user.email || req.user.id, updatedAt);
    setActiveLibrary(normalized, { updatedAt, updatedBy: req.user.email || req.user.id });
    res.json({ ok: true, meta: getActiveMeta() });
  });

  // Revert to the built-in defaults (drop the custom library).
  app.post('/api/admin/rate-library/revert', requireAuth, requireAdmin, (_req, res) => {
    db.prepare('DELETE FROM cost_library WHERE id = 1').run();
    setActiveLibrary({}, {});
    res.json({ ok: true, meta: getActiveMeta() });
  });
}
