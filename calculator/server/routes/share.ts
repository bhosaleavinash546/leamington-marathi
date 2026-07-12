/**
 * Read-only costing share links.
 *
 *   POST /api/share        (auth)  save a costing summary → { id, url }
 *   GET  /api/share/:id    (public) fetch a shared summary (view-only page uses it)
 *
 * Payloads are summaries (name, total, band, 8-bucket breakdown) — never the
 * full input set — and expire after 90 days.
 */
import { Router, type Response } from 'express';
import { randomBytes } from 'crypto';
import db from '../db.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth-middleware.js';

const router = Router();
const MAX_PAYLOAD = 64 * 1024;
const TTL_DAYS = 90;

router.post('/', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const { payload, partName } = req.body as { payload?: unknown; partName?: string };
  if (!payload || typeof payload !== 'object') { res.status(400).json({ error: 'payload object required' }); return; }
  const json = JSON.stringify(payload);
  if (json.length > MAX_PAYLOAD) { res.status(413).json({ error: 'payload too large for a share link' }); return; }
  const id = randomBytes(9).toString('base64url');
  const now = new Date();
  const expires = new Date(now.getTime() + TTL_DAYS * 86400_000);
  db.prepare(`INSERT INTO shared_costings (id, part_name, payload, created_by, created_at, expires_at)
              VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, String(partName ?? '').slice(0, 200), json, req.user!.email, now.toISOString(), expires.toISOString());
  res.json({ id, expiresAt: expires.toISOString() });
});

router.get('/:id', (req, res: Response): void => {
  const row = db.prepare('SELECT payload, part_name, created_at, expires_at FROM shared_costings WHERE id = ?')
    .get(req.params.id) as { payload: string; part_name: string; created_at: string; expires_at: string } | undefined;
  if (!row) { res.status(404).json({ error: 'Share link not found' }); return; }
  if (new Date(row.expires_at).getTime() < Date.now()) { res.status(410).json({ error: 'Share link expired' }); return; }
  res.json({ partName: row.part_name, createdAt: row.created_at, expiresAt: row.expires_at, payload: JSON.parse(row.payload) });
});

export default router;
