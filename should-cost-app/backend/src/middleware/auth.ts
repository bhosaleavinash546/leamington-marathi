import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JwtPayload } from '../models/types';
import { resolveJwtSecret } from '../config/env';

// Extend Express Request so downstream handlers can read req.user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

// Resolved once at module load. In production this throws if the secret is
// missing/placeholder; in dev it falls back with a loud warning.
const JWT_SECRET = resolveJwtSecret();

// ---------------------------------------------------------------
// requireAuth — verifies the Bearer token in Authorization header.
// Attaches decoded payload to req.user on success.
// ---------------------------------------------------------------
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ---------------------------------------------------------------
// requireRole — factory that returns middleware enforcing a role.
// Call AFTER requireAuth.
//
// Usage:
//   router.post('/...', requireAuth, requireRole('internal'), handler)
// ---------------------------------------------------------------
export function requireRole(...roles: Array<'admin' | 'internal' | 'supplier'>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthenticated' });
      return;
    }
    if (!roles.includes(req.user.role as 'admin' | 'internal' | 'supplier')) {
      res.status(403).json({
        error: `Role '${req.user.role}' is not authorised for this resource. Required: ${roles.join(' | ')}`,
      });
      return;
    }
    next();
  };
}

// ---------------------------------------------------------------
// Supplier isolation guard — suppliers may only see their own data.
// Place AFTER requireAuth when a route exposes supplier-specific data.
// ---------------------------------------------------------------
export function isolateSupplier(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role === 'supplier') {
    const requestedSupplierId = Number(req.params.supplierId ?? req.query.supplierId);
    if (requestedSupplierId && requestedSupplierId !== req.user.supplierId) {
      res.status(403).json({ error: 'Suppliers may only access their own data' });
      return;
    }
  }
  next();
}

// ---------------------------------------------------------------
// generateToken — used in the auth/login route (not shown in full)
// ---------------------------------------------------------------
export function generateToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: (process.env.JWT_EXPIRES_IN ?? '8h') as jwt.SignOptions['expiresIn'],
  });
}
