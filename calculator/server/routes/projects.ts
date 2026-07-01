/**
 * Per-user project persistence API. Every route requires a valid JWT and is
 * scoped to req.user.userId via the projects store — a user only ever sees and
 * mutates their own projects.
 *
 *   GET    /api/projects            list mine (optional ?kind=)
 *   GET    /api/projects/:id        one of mine
 *   POST   /api/projects            create/update mine
 *   DELETE /api/projects/:id        delete mine
 */

import { Router, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import db from '../db.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth-middleware.js';
import {
  listProjects, getProject, saveProject, deleteProject, OwnershipError,
} from '../data/projects-store.js';

const router = Router();
router.use(requireAuth);
router.use(rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false }));

const uid = (req: AuthenticatedRequest) => req.user!.userId;

router.get('/', (req: AuthenticatedRequest, res: Response): void => {
  const kind = typeof req.query.kind === 'string' ? req.query.kind : undefined;
  res.json({ projects: listProjects(db, uid(req), kind) });
});

router.get('/:id', (req: AuthenticatedRequest, res: Response): void => {
  const p = getProject(db, uid(req), req.params.id);
  if (!p) { res.status(404).json({ error: 'not found' }); return; }
  res.json({ project: p });
});

router.post('/', (req: AuthenticatedRequest, res: Response): void => {
  const { id, kind, name, data } = req.body as { id?: string; kind?: string; name?: string; data?: unknown };
  if (!id || !kind || !name) { res.status(400).json({ error: 'id, kind and name are required' }); return; }
  try {
    const project = saveProject(db, uid(req), { id, kind, name, data }, new Date().toISOString());
    res.json({ ok: true, project });
  } catch (err) {
    if (err instanceof OwnershipError) { res.status(403).json({ error: 'project belongs to another user' }); return; }
    res.status(400).json({ error: (err as Error).message });
  }
});

router.delete('/:id', (req: AuthenticatedRequest, res: Response): void => {
  const removed = deleteProject(db, uid(req), req.params.id);
  if (!removed) { res.status(404).json({ error: 'not found' }); return; }
  res.json({ ok: true });
});

export default router;
