import crypto from 'crypto';
import pool from '../db/pool';

const OTP_EXPIRY_MINUTES = 10;

export function generateOtp(): string {
  // Cryptographically secure 6-digit OTP
  return String(crypto.randomInt(100_000, 999_999));
}

export async function saveOtp(
  email: string,
  otp: string,
  purpose: 'signup' | 'reset_password'
): Promise<void> {
  // Invalidate any previous unused OTPs for same email+purpose
  await pool.query(
    `UPDATE otp_token SET used = TRUE
     WHERE email = $1 AND purpose = $2 AND used = FALSE`,
    [email, purpose]
  );

  await pool.query(
    `INSERT INTO otp_token (email, token, purpose, expires_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '${OTP_EXPIRY_MINUTES} minutes')`,
    [email, otp, purpose]
  );
}

export async function verifyOtp(
  email: string,
  otp: string,
  purpose: 'signup' | 'reset_password'
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE otp_token
     SET used = TRUE
     WHERE email = $1 AND token = $2 AND purpose = $3
       AND used = FALSE AND expires_at > NOW()
     RETURNING id`,
    [email, otp, purpose]
  );
  return (result.rowCount ?? 0) > 0;
}
