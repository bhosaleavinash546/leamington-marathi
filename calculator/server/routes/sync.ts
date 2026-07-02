import { Router, Request, Response } from 'express';
import db from '../db.js';

const router = Router();

const TEAM_KEY = process.env.TEAM_API_KEY;

function checkAuth(req: Request, res: Response): boolean {
  if (!TEAM_KEY) return true; // auth disabled if no key configured
  const provided = req.headers['x-team-key'];
  if (provided !== TEAM_KEY) {
    res.status(401).json({ error: 'Invalid team key' });
    return false;
  }
  return true;
}

// GET /api/sync/library — retrieve shared rate library
router.get('/library', (req: Request, res: Response) => {
  if (!checkAuth(req, res)) return;
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
router.put('/library', (req: Request, res: Response) => {
  if (!checkAuth(req, res)) return;
  const { library, updatedBy = 'anonymous' } = req.body as { library: unknown; updatedBy?: string };
  if (!library) { res.status(400).json({ error: 'library required' }); return; }
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO rate_library (id, data, updated_at, updated_by)
    VALUES ('default', ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at, updated_by=excluded.updated_by
  `).run(JSON.stringify(library), now, updatedBy);
  res.json({ ok: true, updatedAt: now });
});

// GET /api/sync/scenarios — list all team scenarios
router.get('/scenarios', (req: Request, res: Response) => {
  if (!checkAuth(req, res)) return;
  const rows = db.prepare('SELECT id, name, description, data, created_at, created_by FROM scenarios ORDER BY created_at DESC').all() as
    Array<{ id: string; name: string; description: string; data: string; created_at: string; created_by: string }>;
  const scenarios = rows.map(r => ({
    id: r.id, name: r.name, description: r.description,
    createdAt: r.created_at, createdBy: r.created_by,
    ...JSON.parse(r.data),
  }));
  res.json({ scenarios });
});

// POST /api/sync/scenarios — save or update a team scenario
router.post('/scenarios', (req: Request, res: Response) => {
  if (!checkAuth(req, res)) return;
  const { id, name, description = '', createdBy = 'anonymous', ...rest } = req.body as
    { id: string; name: string; description?: string; createdBy?: string; [k: string]: unknown };
  if (!id || !name) { res.status(400).json({ error: 'id and name required' }); return; }
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO scenarios (id, name, description, data, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, data=excluded.data
  `).run(id, name, description, JSON.stringify(rest), now, createdBy);
  res.json({ ok: true });
});

// DELETE /api/sync/scenarios/:id
router.delete('/scenarios/:id', (req: Request, res: Response) => {
  if (!checkAuth(req, res)) return;
  db.prepare('DELETE FROM scenarios WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
