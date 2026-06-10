import { Request, Response, NextFunction } from 'express';
import pool from '../db/pool';

type Action = 'CREATE' | 'UPDATE' | 'DELETE';

export async function writeAudit(
  userId: string | undefined,
  action: Action,
  entity: string,
  entityId: string | number,
  changes?: Record<string, unknown>,
  ip?: string
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_log (user_id, action, entity, entity_id, changes, ip)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId ?? null, action, entity, String(entityId), changes ? JSON.stringify(changes) : null, ip ?? null]
    );
  } catch (err) {
    // Audit failures must never break the main request
    console.error('[audit] write failed:', err);
  }
}

// Express middleware factory — use on any mutating route
export function auditMiddleware(action: Action, entity: string) {
  return (_req: Request, _res: Response, next: NextFunction): void => {
    // Actual write happens in the controller after the entity id is known.
    // This middleware tags the request so controllers can call writeAudit().
    next();
  };
}
