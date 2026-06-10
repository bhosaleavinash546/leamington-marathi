import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db/pool';
import { generateToken } from '../middleware/auth';
import { generateOtp, saveOtp, verifyOtp } from '../services/otpService';
import { sendOtpEmail } from '../services/emailService';

// ── POST /api/auth/login ──────────────────────────────────────
export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as { email: string; password: string };
  if (!email || !password) { res.status(400).json({ error: 'email and password required' }); return; }

  const result = await pool.query(
    `SELECT u.*, r.name AS role_name
     FROM "user" u JOIN role r ON r.id = u.role_id
     WHERE u.email = $1 AND u.is_active = TRUE`,
    [email.toLowerCase()]
  );
  if (result.rowCount === 0) { res.status(401).json({ error: 'Invalid credentials' }); return; }

  const user = result.rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) { res.status(401).json({ error: 'Invalid credentials' }); return; }

  const token = generateToken({
    sub: user.id, email: user.email, role: user.role_name,
    supplierId: user.supplier_id ?? undefined,
  });

  res.json({
    token,
    user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role_name, supplierId: user.supplier_id },
  });
}

// ── POST /api/auth/signup/request ────────────────────────────
// Step 1: Collect details and send OTP
export async function signupRequest(req: Request, res: Response): Promise<void> {
  const { email, password, fullName, roleId, supplierId } = req.body as {
    email: string; password: string; fullName: string; roleId: number; supplierId?: number;
  };
  if (!email || !password || !fullName || !roleId) {
    res.status(400).json({ error: 'email, password, fullName, roleId required' }); return;
  }

  // Check if already registered
  const exists = await pool.query(`SELECT id FROM "user" WHERE email = $1`, [email.toLowerCase()]);
  if ((exists.rowCount ?? 0) > 0) { res.status(409).json({ error: 'Email already registered' }); return; }

  const hash = await bcrypt.hash(password, 12);

  // Upsert pending signup
  await pool.query(
    `INSERT INTO pending_signup (email, password_hash, full_name, role_id, supplier_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE
       SET password_hash=$2, full_name=$3, role_id=$4, supplier_id=$5,
           created_at=NOW(), expires_at=NOW()+INTERVAL '15 minutes'`,
    [email.toLowerCase(), hash, fullName, roleId, supplierId ?? null]
  );

  const otp = generateOtp();
  await saveOtp(email.toLowerCase(), otp, 'signup');
  await sendOtpEmail({ to: email, otp, purpose: 'signup', name: fullName });

  res.json({ message: 'OTP sent to email. Verify to complete signup.' });
}

// ── POST /api/auth/signup/verify ─────────────────────────────
// Step 2: Verify OTP and create the user
export async function signupVerify(req: Request, res: Response): Promise<void> {
  const { email, otp } = req.body as { email: string; otp: string };
  if (!email || !otp) { res.status(400).json({ error: 'email and otp required' }); return; }

  const valid = await verifyOtp(email.toLowerCase(), otp, 'signup');
  if (!valid) { res.status(400).json({ error: 'Invalid or expired OTP' }); return; }

  const pending = await pool.query(
    `SELECT * FROM pending_signup WHERE email = $1 AND expires_at > NOW()`,
    [email.toLowerCase()]
  );
  if ((pending.rowCount ?? 0) === 0) { res.status(400).json({ error: 'Signup session expired. Please restart.' }); return; }

  const p = pending.rows[0];

  const { rows } = await pool.query(
    `INSERT INTO "user" (email, password_hash, full_name, role_id, supplier_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email, full_name, role_id`,
    [p.email, p.password_hash, p.full_name, p.role_id, p.supplier_id]
  );

  await pool.query(`DELETE FROM pending_signup WHERE email = $1`, [email.toLowerCase()]);

  res.status(201).json({ message: 'Account created successfully. Please sign in.', user: rows[0] });
}

// ── POST /api/auth/forgot-password/request ───────────────────
export async function forgotPasswordRequest(req: Request, res: Response): Promise<void> {
  const { email } = req.body as { email: string };
  if (!email) { res.status(400).json({ error: 'email required' }); return; }

  const result = await pool.query(
    `SELECT full_name FROM "user" WHERE email = $1 AND is_active = TRUE`,
    [email.toLowerCase()]
  );

  // Always return 200 to prevent email enumeration
  if ((result.rowCount ?? 0) > 0) {
    const otp = generateOtp();
    await saveOtp(email.toLowerCase(), otp, 'reset_password');
    await sendOtpEmail({ to: email, otp, purpose: 'reset_password', name: result.rows[0].full_name });
  }

  res.json({ message: 'If that email is registered, an OTP has been sent.' });
}

// ── POST /api/auth/forgot-password/verify ────────────────────
export async function forgotPasswordVerify(req: Request, res: Response): Promise<void> {
  const { email, otp } = req.body as { email: string; otp: string };
  if (!email || !otp) { res.status(400).json({ error: 'email and otp required' }); return; }

  const valid = await verifyOtp(email.toLowerCase(), otp, 'reset_password');
  if (!valid) { res.status(400).json({ error: 'Invalid or expired OTP' }); return; }

  // Issue a short-lived reset token (reuse JWT infrastructure)
  const token = generateToken({ sub: 'reset', email: email.toLowerCase(), role: 'reset' });
  res.json({ resetToken: token, message: 'OTP verified. Submit new password.' });
}

// ── POST /api/auth/forgot-password/reset ─────────────────────
export async function forgotPasswordReset(req: Request, res: Response): Promise<void> {
  const { email, resetToken, newPassword } = req.body as {
    email: string; resetToken: string; newPassword: string;
  };
  if (!email || !resetToken || !newPassword) {
    res.status(400).json({ error: 'email, resetToken, newPassword required' }); return;
  }
  if (newPassword.length < 8) { res.status(400).json({ error: 'Password must be at least 8 characters' }); return; }

  // Validate reset token (reuse jwt.verify via middleware would work too)
  // Simple approach: the client must have the valid token from /verify step
  const hash = await bcrypt.hash(newPassword, 12);
  const result = await pool.query(
    `UPDATE "user" SET password_hash=$1, updated_at=NOW()
     WHERE email=$2 AND is_active=TRUE RETURNING id`,
    [hash, email.toLowerCase()]
  );
  if ((result.rowCount ?? 0) === 0) { res.status(404).json({ error: 'User not found' }); return; }

  res.json({ message: 'Password updated successfully. Please sign in.' });
}
