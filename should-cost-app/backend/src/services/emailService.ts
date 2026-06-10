// Email service using nodemailer.
// In development the OTP is also printed to the console so you can test
// without a real SMTP account.  Set SMTP_* env vars for production.

import nodemailer from 'nodemailer';

interface OtpEmailPayload {
  to: string;
  otp: string;
  purpose: 'signup' | 'reset_password';
  name?: string;
}

function createTransporter() {
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  // Development fallback — logs to console; no real email sent
  return nodemailer.createTransport({ jsonTransport: true });
}

const transporter = createTransporter();
const FROM = process.env.EMAIL_FROM ?? '"CostLens Platform" <noreply@costlens.io>';

export async function sendOtpEmail({ to, otp, purpose, name }: OtpEmailPayload): Promise<void> {
  const subjectMap = {
    signup:         'Your CostLens verification code',
    reset_password: 'Reset your CostLens password',
  };

  const bodyMap = {
    signup:
      `Hi ${name ?? 'there'},\n\n` +
      `Your CostLens account verification code is:\n\n  ${otp}\n\n` +
      `This code expires in 10 minutes.\n\nIf you didn't request this, ignore this email.`,
    reset_password:
      `Hi ${name ?? 'there'},\n\n` +
      `Your password reset code is:\n\n  ${otp}\n\n` +
      `This code expires in 10 minutes.\n\nIf you didn't request this, contact support immediately.`,
  };

  const info = await transporter.sendMail({
    from:    FROM,
    to,
    subject: subjectMap[purpose],
    text:    bodyMap[purpose],
    html: `
      <div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f8fafc;border-radius:12px">
        <div style="background:#4f46e5;border-radius:8px;padding:16px 24px;margin-bottom:24px">
          <span style="color:#fff;font-size:20px;font-weight:700">CostLens</span>
        </div>
        <h2 style="color:#1a1a2e;margin:0 0 16px">${subjectMap[purpose]}</h2>
        <p style="color:#555">Hi ${name ?? 'there'},</p>
        <p style="color:#555">${purpose === 'signup' ? 'Use this code to verify your account:' : 'Use this code to reset your password:'}</p>
        <div style="background:#fff;border:2px solid #e8e8ef;border-radius:10px;padding:24px;text-align:center;margin:24px 0">
          <span style="font-size:40px;font-weight:800;letter-spacing:12px;color:#4f46e5">${otp}</span>
        </div>
        <p style="color:#888;font-size:13px">This code expires in 10 minutes.</p>
      </div>`,
  });

  if (process.env.NODE_ENV !== 'production') {
    // Always print to console in dev so you can test without SMTP
    console.log(`\n[emailService] OTP for ${to} → ${otp}\n`);
    const payload = (info as unknown as { message?: string }).message;
    if (payload) {
      console.log('[emailService] json transport payload:', payload);
    }
  }
}

export async function sendQuoteNotification(opts: {
  to: string;
  supplierName: string;
  partNumber: string;
  version: number;
}) {
  await transporter.sendMail({
    from: FROM,
    to:   opts.to,
    subject: `Quote submitted: ${opts.partNumber} v${opts.version}`,
    text: `${opts.supplierName} has submitted a new quote for part ${opts.partNumber} (version ${opts.version}).`,
  });
}
