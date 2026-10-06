import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import db from '../db.js';

export interface AuthenticatedRequest extends Request {
  user?: { userId: string; email: string; emailVerified: boolean };
}

// Fail fast at startup — never use a guessable secret in production
// The .env.example placeholder counts as unset: accepting it in production let anyone who read the
// example forge sessions (360 review, Oct 2026). A short secret is warned about, not refused.
const RAW_JWT_SECRET = process.env.JWT_SECRET;
const JWT_SECRET = RAW_JWT_SECRET && !/^replace-with/i.test(RAW_JWT_SECRET) ? RAW_JWT_SECRET : undefined;
if (RAW_JWT_SECRET && !JWT_SECRET) console.warn('⚠  JWT_SECRET is the .env.example placeholder — treated as unset.');
else if (JWT_SECRET && JWT_SECRET.length < 32) console.warn('⚠  JWT_SECRET is shorter than 32 characters — use a long random secret.');
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET environment variable is not set. Set it in .env before starting the server.');
  }
  console.warn('⚠  JWT_SECRET not set — using insecure dev default. Set JWT_SECRET in .env for production.');
}
const _JWT_SECRET = JWT_SECRET ?? 'should-cost-dev-secret-DO-NOT-USE-IN-PRODUCTION';

/** Whether sessions are signed with a real secret. The health check and the
 *  startup banner report THIS, so they cannot disagree with the middleware. */
export const JWT_SECRET_CONFIGURED = !!JWT_SECRET;

/**
 * A valid signature is not enough: the user must still exist, and the session
 * must not predate a revocation.
 *
 * This used to trust the token alone for its full seven days. A deleted user
 * kept working, a password reset left every stolen session alive, and a token
 * for a user who never existed was accepted (C1, M4). Now every request reads
 * the user row — one indexed SQLite lookup — and takes the email and verified
 * flag from it, not from the token.
 */
/** Every 401 below means "this browser's sign-in is no good": the page clears
 *  it and goes to sign-in on this code, instead of each screen showing its own
 *  "Analysis failed: …" while still greeting the user by name. */
export const SESSION_INVALID = 'SESSION_INVALID';

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Sign in to continue.', code: SESSION_INVALID });
    return;
  }

  const token = header.slice(7);
  let payload: { userId: string; iat?: number };
  try {
    payload = jwt.verify(token, _JWT_SECRET) as { userId: string; iat?: number };
  } catch {
    res.status(401).json({ error: 'Your sign-in has expired. Sign in again.', code: SESSION_INVALID });
    return;
  }

  const user = db.prepare('SELECT id, email, email_verified, sessions_valid_from FROM users WHERE id = ?')
    .get(payload.userId) as
    | { id: string; email: string; email_verified: number; sessions_valid_from: number | null }
    | undefined;
  if (!user) {
    res.status(401).json({ error: 'This account no longer exists. Sign in again.', code: SESSION_INVALID });
    return;
  }
  if (user.sessions_valid_from != null && (payload.iat ?? 0) < user.sessions_valid_from) {
    res.status(401).json({ error: 'This session was signed out. Sign in again.', code: SESSION_INVALID });
    return;
  }
  req.user = { userId: user.id, email: user.email, emailVerified: !!user.email_verified };
  next();
}

/** End every session this user has open, including the caller's. Seconds, to
 *  match the token's `iat`. */
export function revokeSessions(userId: string): void {
  db.prepare('UPDATE users SET sessions_valid_from = ? WHERE id = ?').run(Math.floor(Date.now() / 1000), userId);
}

export function signToken(userId: string, email: string, emailVerified: boolean): string {
  return jwt.sign({ userId, email, emailVerified }, _JWT_SECRET, { expiresIn: '7d' });
}
