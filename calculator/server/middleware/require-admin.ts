/**
 * Gate a route to admins only. Runs AFTER requireAuth (which sets req.user),
 * then looks up the user's role in the database. Keeps roles out of the JWT so
 * a role change takes effect immediately, without waiting for the token to expire.
 */
import type { Response, NextFunction } from 'express';
import db from '../db.js';
import type { AuthenticatedRequest } from './auth-middleware.js';

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const userId = req.user?.userId;
  if (!userId) { res.status(401).json({ error: 'Authentication required' }); return; }
  const row = db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as { role?: string } | undefined;
  if (row?.role !== 'admin') { res.status(403).json({ error: 'Admin access required' }); return; }
  next();
}
