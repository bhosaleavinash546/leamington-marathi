/**
 * Team sync: a shared rate library and a mirror of saved scenarios.
 *
 * Mounted behind requireAuth (server/index.ts). It used to be guarded only by
 * a team key, and with no key configured — the default, and always the case on
 * the Windows package — it let anyone who could reach the server read, add and
 * delete every user's saved costings. Now a signed-in user is always required;
 * the team key, when set, is an extra check on top rather than the only one.
 *
 * Scenarios belong to the user who saved them. Nobody can list, overwrite or
 * delete someone else's by knowing or guessing its id.
 */
import { Router, Response } from 'express';
import db from '../db.js';
import type { AuthenticatedRequest } from '../middleware/auth-middleware.js';

const router = Router();

/** Read at request time, not import time — an import-time read is how the
 *  .env load-order bug silently dropped this setting. */
function checkTeamKey(req: AuthenticatedRequest, res: Response): boolean {
  const teamKey = process.env.TEAM_API_KEY;
  if (!teamKey) return true;                        // sign-in alone is required
  if (req.headers['x-team-key'] !== teamKey) {
    res.status(401).json({ error: 'Invalid team key' });
    return false;
  }
  return true;
}

import { requireAdmin } from '../middleware/require-admin.js';

const owner = (req: AuthenticatedRequest): string => req.user!.userId;

// GET /api/sync/library — retrieve shared rate library
router.get('/library', (req: AuthenticatedRequest, res: Response) => {
  if (!checkTeamKey(req, res)) return;
  const row = db.prepare('SELECT data, updated_at, updated_by FROM rate_library WHERE id = ?').get('default') as
    { data: string; updated_at: string; updated_by: string } | undefined;
  if (!row) { res.json(null); return; }
  try {
    res.json({ library: JSON.parse(row.data), updatedAt: row.updated_at, updatedBy: row.updated_by });
  } catch {
    res.json(null);
  }
});

// PUT /api/sync/library — save shared rate library
// Admin only, like the rate-library editor: with no TEAM_API_KEY any self-registered account could
// replace the team's rates through this route (360 review).
router.put('/library', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
  if (!checkTeamKey(req, res)) return;
  // Who changed it comes from the session, not from a field the caller fills in.
  const updatedBy = req.user!.email;
  const { library } = req.body as { library: unknown };
  if (!library) { res.status(400).json({ error: 'library required' }); return; }
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO rate_library (id, data, updated_at, updated_by)
    VALUES ('default', ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at, updated_by=excluded.updated_by
  `).run(JSON.stringify(library), now, updatedBy);
  res.json({ ok: true, updatedAt: now });
});

// GET /api/sync/scenarios — the signed-in user's own scenarios
router.get('/scenarios', (req: AuthenticatedRequest, res: Response) => {
  if (!checkTeamKey(req, res)) return;
  const rows = db.prepare('SELECT id, name, description, data, created_at, created_by FROM scenarios WHERE created_by = ? ORDER BY created_at DESC').all(owner(req)) as
    Array<{ id: string; name: string; description: string; data: string; created_at: string; created_by: string }>;
  const scenarios = rows.map(r => ({
    id: r.id, name: r.name, description: r.description,
    createdAt: r.created_at, createdBy: r.created_by,
    ...JSON.parse(r.data),
  }));
  res.json({ scenarios });
});

// POST /api/sync/scenarios — save or update one of the signed-in user's scenarios
router.post('/scenarios', (req: AuthenticatedRequest, res: Response) => {
  if (!checkTeamKey(req, res)) return;
  // createdBy in the body is ignored: ownership is the session's.
  const { id, name, description = '', createdBy: _ignored, ...rest } = req.body as
    { id: string; name: string; description?: string; createdBy?: string; [k: string]: unknown };
  const createdBy = owner(req);
  if (!id || !name) { res.status(400).json({ error: 'id and name required' }); return; }
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO scenarios (id, name, description, data, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, data=excluded.data
      WHERE scenarios.created_by = excluded.created_by
  `).run(id, name, description, JSON.stringify(rest), now, createdBy);
  // An id that already belongs to someone else is left untouched, and the
  // caller is told rather than being answered "ok".
  const row = db.prepare('SELECT created_by FROM scenarios WHERE id = ?').get(id) as { created_by: string } | undefined;
  if (row && row.created_by !== createdBy) { res.status(409).json({ error: 'That scenario id belongs to another user' }); return; }
  res.json({ ok: true });
});

// DELETE /api/sync/scenarios/:id
router.delete('/scenarios/:id', (req: AuthenticatedRequest, res: Response) => {
  if (!checkTeamKey(req, res)) return;
  db.prepare('DELETE FROM scenarios WHERE id = ? AND created_by = ?').run(req.params.id, owner(req));
  res.json({ ok: true });
});

export default router;
