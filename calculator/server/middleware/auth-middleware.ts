import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthenticatedRequest extends Request {
  user?: { userId: string; email: string; emailVerified: boolean };
}

const JWT_SECRET = process.env.JWT_SECRET ?? 'should-cost-dev-secret-change-in-production';

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
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
  return jwt.sign({ userId, email, emailVerified }, JWT_SECRET, { expiresIn: '7d' });
}
