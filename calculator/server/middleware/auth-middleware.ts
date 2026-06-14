import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthenticatedRequest extends Request {
  user?: { userId: string; email: string; emailVerified: boolean };
}

// Fail fast at startup — never use a guessable secret in production
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET environment variable is not set. Set it in .env before starting the server.');
  }
  console.warn('⚠  JWT_SECRET not set — using insecure dev default. Set JWT_SECRET in .env for production.');
}
const _JWT_SECRET = JWT_SECRET ?? 'should-cost-dev-secret-DO-NOT-USE-IN-PRODUCTION';

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, _JWT_SECRET) as {
      userId: string;
      email: string;
      emailVerified: boolean;
    };
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function signToken(userId: string, email: string, emailVerified: boolean): string {
  return jwt.sign({ userId, email, emailVerified }, _JWT_SECRET, { expiresIn: '7d' });
}
