import { Router } from 'express';
import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import db from '../db.js';
import { sendOTPEmail } from '../utils/email.js';
import { signToken } from '../middleware/auth-middleware.js';

const router = Router();

// ─── Rate limiters ────────────────────────────────────────────────────────────

const signinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many sign-in attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3,
  message: { error: 'Too many OTP requests. Please wait 10 minutes before requesting another code.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const verifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: { error: 'Too many verification attempts.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BCRYPT_ROUNDS = 12;
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function generateOTP(): string {
  return String(crypto.randomInt(100000, 1000000));
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isStrongPassword(pw: string): boolean {
  // Min 8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/.test(pw);
}

async function storeOTP(email: string, otp: string, purpose: 'signup' | 'reset'): Promise<void> {
  // Invalidate previous unused OTPs for same email+purpose
  db.prepare(`UPDATE otp_tokens SET used = 1 WHERE email = ? AND purpose = ? AND used = 0`).run(email, purpose);

  const hash = await bcrypt.hash(otp, 8);
  const id = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS).toISOString();

  db.prepare(
    `INSERT INTO otp_tokens (id, email, otp_hash, purpose, expires_at, used, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
  ).run(id, email, hash, purpose, expiresAt, now.toISOString());
}

async function verifyOTP(email: string, otp: string, purpose: 'signup' | 'reset'): Promise<boolean> {
  const row = db
    .prepare(
      `SELECT id, otp_hash, expires_at FROM otp_tokens
       WHERE email = ? AND purpose = ? AND used = 0
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(email, purpose) as { id: string; otp_hash: string; expires_at: string } | undefined;

  if (!row) return false;
  if (new Date(row.expires_at) < new Date()) return false;

  const match = await bcrypt.compare(otp, row.otp_hash);
  if (match) {
    db.prepare(`UPDATE otp_tokens SET used = 1 WHERE id = ?`).run(row.id);
  }
  return match;
}

// ─── POST /api/auth/signup ────────────────────────────────────────────────────

router.post('/signup', otpLimiter, async (req: Request, res: Response): Promise<void> => {
  const { email, password, fullName, companyName = '' } = req.body as {
    email: string;
    password: string;
    fullName: string;
    companyName?: string;
  };

  if (!email || !password || !fullName) {
    res.status(400).json({ error: 'Email, password, and full name are required.' });
    return;
  }

  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'Please enter a valid email address.' });
    return;
  }

  if (!isStrongPassword(password)) {
    res.status(400).json({
      error:
        'Password must be at least 8 characters with uppercase, lowercase, a number, and a special character.',
    });
    return;
  }

  const existing = db.prepare(`SELECT id, email_verified FROM users WHERE email = ?`).get(email) as
    | { id: string; email_verified: number }
    | undefined;

  if (existing) {
    if (existing.email_verified) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }
    // Account exists but unverified — resend OTP
    const otp = generateOTP();
    await storeOTP(email, otp, 'signup');
    await sendOTPEmail(email, otp, 'signup', fullName);
    res.json({ message: 'Verification code resent. Please check your email.' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const id = crypto.randomUUID();

  db.prepare(
    `INSERT INTO users (id, email, password_hash, full_name, company_name, email_verified, failed_attempts, created_at)
     VALUES (?, ?, ?, ?, ?, 0, 0, ?)`,
  ).run(id, email.toLowerCase(), passwordHash, fullName.trim(), companyName.trim(), new Date().toISOString());

  const otp = generateOTP();
  await storeOTP(email.toLowerCase(), otp, 'signup');
  await sendOTPEmail(email, otp, 'signup', fullName);

  res.status(201).json({ message: 'Account created. Please check your email for a verification code.' });
});

// ─── POST /api/auth/signin ────────────────────────────────────────────────────

router.post('/signin', signinLimiter, async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as { email: string; password: string };

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const user = db
    .prepare(
      `SELECT id, email, password_hash, full_name, email_verified, failed_attempts, locked_until
       FROM users WHERE email = ?`,
    )
    .get(email.toLowerCase()) as
    | {
        id: string;
        email: string;
        password_hash: string;
        full_name: string;
        email_verified: number;
        failed_attempts: number;
        locked_until: string | null;
      }
    | undefined;

  if (!user) {
    // Timing-safe: still run bcrypt even on non-existent user
    await bcrypt.hash(password, 8);
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  // Check account lock
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000);
    res.status(423).json({
      error: `Account temporarily locked due to too many failed attempts. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.`,
    });
    return;
  }

  const valid = await bcrypt.compare(password, user.password_hash);

  if (!valid) {
    const newAttempts = user.failed_attempts + 1;
    if (newAttempts >= MAX_FAILED_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + LOCK_DURATION_MS).toISOString();
      db.prepare(`UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?`).run(
        newAttempts,
        lockedUntil,
        user.id,
      );
      res.status(423).json({ error: 'Too many failed attempts. Account locked for 15 minutes.' });
    } else {
      db.prepare(`UPDATE users SET failed_attempts = ? WHERE id = ?`).run(newAttempts, user.id);
      res
        .status(401)
        .json({
          error: `Invalid email or password. ${MAX_FAILED_ATTEMPTS - newAttempts} attempt${MAX_FAILED_ATTEMPTS - newAttempts !== 1 ? 's' : ''} remaining.`,
        });
    }
    return;
  }

  // Reset failed attempts on successful login
  db.prepare(`UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?`).run(user.id);

  if (!user.email_verified) {
    // Resend OTP for unverified account
    const otp = generateOTP();
    await storeOTP(user.email, otp, 'signup');
    await sendOTPEmail(user.email, otp, 'signup', user.full_name);
    res.status(403).json({
      error: 'Email not verified.',
      requiresVerification: true,
      email: user.email,
    });
    return;
  }

  const token = signToken(user.id, user.email, true);
  res.json({
    token,
    user: { id: user.id, email: user.email, fullName: user.full_name },
  });
});

// ─── POST /api/auth/verify-otp ────────────────────────────────────────────────

router.post('/verify-otp', verifyLimiter, async (req: Request, res: Response): Promise<void> => {
  const { email, otp, purpose } = req.body as {
    email: string;
    otp: string;
    purpose: 'signup' | 'reset';
  };

  if (!email || !otp || !purpose) {
    res.status(400).json({ error: 'Email, OTP, and purpose are required.' });
    return;
  }

  const match = await verifyOTP(email.toLowerCase(), otp.trim(), purpose);

  if (!match) {
    res.status(400).json({ error: 'Invalid or expired verification code. Please try again.' });
    return;
  }

  if (purpose === 'signup') {
    db.prepare(`UPDATE users SET email_verified = 1 WHERE email = ?`).run(email.toLowerCase());
    const user = db
      .prepare(`SELECT id, email, full_name FROM users WHERE email = ?`)
      .get(email.toLowerCase()) as { id: string; email: string; full_name: string } | undefined;

    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const token = signToken(user.id, user.email, true);
    res.json({
      token,
      user: { id: user.id, email: user.email, fullName: user.full_name },
    });
    return;
  }

  // Reset purpose — return a short-lived reset token (not a full JWT)
  const resetToken = crypto.randomBytes(32).toString('hex');
  // Store hashed reset token with 10-min expiry (reuse otp_tokens table)
  const hash = await bcrypt.hash(resetToken, 8);
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  db.prepare(
    `INSERT INTO otp_tokens (id, email, otp_hash, purpose, expires_at, used, created_at)
     VALUES (?, ?, ?, 'reset_token', ?, 0, ?)`,
  ).run(id, email.toLowerCase(), hash, expiresAt, new Date().toISOString());

  res.json({ resetToken, email });
});

// ─── POST /api/auth/forgot-password ──────────────────────────────────────────

router.post('/forgot-password', otpLimiter, async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body as { email: string };

  if (!email || !isValidEmail(email)) {
    res.status(400).json({ error: 'Please enter a valid email address.' });
    return;
  }

  const user = db
    .prepare(`SELECT id, full_name FROM users WHERE email = ?`)
    .get(email.toLowerCase()) as { id: string; full_name: string } | undefined;

  // Always return success (don't reveal whether email exists)
  if (user) {
    const otp = generateOTP();
    await storeOTP(email.toLowerCase(), otp, 'reset');
    await sendOTPEmail(email, otp, 'reset', user.full_name);
  }

  res.json({ message: 'If an account with that email exists, a password reset code has been sent.' });
});

// ─── POST /api/auth/reset-password ───────────────────────────────────────────

router.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
  const { email, resetToken, newPassword } = req.body as {
    email: string;
    resetToken: string;
    newPassword: string;
  };

  if (!email || !resetToken || !newPassword) {
    res.status(400).json({ error: 'All fields are required.' });
    return;
  }

  if (!isStrongPassword(newPassword)) {
    res.status(400).json({
      error:
        'Password must be at least 8 characters with uppercase, lowercase, a number, and a special character.',
    });
    return;
  }

  // Verify reset token
  const row = db
    .prepare(
      `SELECT id, otp_hash, expires_at FROM otp_tokens
       WHERE email = ? AND purpose = 'reset_token' AND used = 0
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(email.toLowerCase()) as { id: string; otp_hash: string; expires_at: string } | undefined;

  if (!row || new Date(row.expires_at) < new Date()) {
    res.status(400).json({ error: 'Reset session expired. Please start the process again.' });
    return;
  }

  const valid = await bcrypt.compare(resetToken, row.otp_hash);
  if (!valid) {
    res.status(400).json({ error: 'Invalid reset token.' });
    return;
  }

  // Mark token used + update password
  db.prepare(`UPDATE otp_tokens SET used = 1 WHERE id = ?`).run(row.id);

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  db.prepare(
    `UPDATE users SET password_hash = ?, failed_attempts = 0, locked_until = NULL WHERE email = ?`,
  ).run(passwordHash, email.toLowerCase());

  res.json({ message: 'Password reset successfully. You can now sign in.' });
});

// ─── POST /api/auth/resend-otp ────────────────────────────────────────────────

router.post('/resend-otp', otpLimiter, async (req: Request, res: Response): Promise<void> => {
  const { email, purpose } = req.body as { email: string; purpose: 'signup' | 'reset' };

  if (!email || !purpose) {
    res.status(400).json({ error: 'Email and purpose are required.' });
    return;
  }

  const user = db
    .prepare(`SELECT id, full_name FROM users WHERE email = ?`)
    .get(email.toLowerCase()) as { id: string; full_name: string } | undefined;

  if (!user) {
    res.json({ message: 'If an account exists, a new code has been sent.' });
    return;
  }

  const otp = generateOTP();
  await storeOTP(email.toLowerCase(), otp, purpose);
  await sendOTPEmail(email, otp, purpose, user.full_name);

  res.json({ message: 'New verification code sent. Please check your email.' });
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────

import { requireAuth } from '../middleware/auth-middleware.js';
import type { AuthenticatedRequest } from '../middleware/auth-middleware.js';

router.get('/me', requireAuth, (req: AuthenticatedRequest, res: Response): void => {
  const user = db
    .prepare(`SELECT id, email, full_name, company_name, created_at FROM users WHERE id = ?`)
    .get(req.user!.userId) as
    | { id: string; email: string; full_name: string; company_name: string; created_at: string }
    | undefined;

  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  res.json({ id: user.id, email: user.email, fullName: user.full_name, companyName: user.company_name, createdAt: user.created_at });
});

export default router;
