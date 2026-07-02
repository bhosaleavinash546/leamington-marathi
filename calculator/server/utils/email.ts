import nodemailer from 'nodemailer';

export const SMTP_CONFIGURED = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const transporter = SMTP_CONFIGURED
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT ?? '587', 10),
      secure: (process.env.SMTP_PORT ?? '587') === '465',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;

function buildOTPEmail(otp: string, purpose: 'signup' | 'reset', name: string): string {
  const isSignup = purpose === 'signup';
  const title = isSignup ? 'Verify Your Email' : 'Reset Your Password';
  const action = isSignup ? 'confirm your email address' : 'reset your password';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.08);overflow:hidden">
        <tr>
          <td style="background:linear-gradient(135deg,#1a3a5c 0%,#1e4976 100%);padding:32px 40px">
            <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;letter-spacing:-.5px">Should-Cost</h1>
            <p style="margin:4px 0 0;color:#93c5fd;font-size:13px">Manufacturing Cost Intelligence</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px">
            <h2 style="margin:0 0 8px;color:#0f172a;font-size:22px;font-weight:700">${title}</h2>
            <p style="margin:0 0 28px;color:#64748b;font-size:15px">Hi ${name}, use the code below to ${action}. It expires in <strong>5 minutes</strong>.</p>
            <div style="background:#f8fafc;border:2px dashed #e2e8f0;border-radius:12px;padding:28px;text-align:center;margin:0 0 28px">
              <p style="margin:0 0 8px;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:1.5px;font-weight:600">Your OTP Code</p>
              <p style="margin:0;color:#1a3a5c;font-size:42px;font-weight:800;letter-spacing:12px;font-variant-numeric:tabular-nums">${otp}</p>
            </div>
            <p style="margin:0 0 8px;color:#94a3b8;font-size:13px">If you didn't request this, please ignore this email. Your account is safe.</p>
            <p style="margin:0;color:#94a3b8;font-size:13px">This code will expire in 5 minutes.</p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0">
            <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center">© ${new Date().getFullYear()} Should-Cost · Manufacturing Intelligence Platform</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendOTPEmail(
  email: string,
  otp: string,
  purpose: 'signup' | 'reset',
  name: string,
): Promise<void> {
  const subject =
    purpose === 'signup'
      ? `${otp} — Verify your email · Should-Cost`
      : `${otp} — Reset your password · Should-Cost`;

  if (!SMTP_CONFIGURED || !transporter) {
    // Development fallback: print OTP to console
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📧 OTP for ${email} [${purpose}]: ${otp}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    return;
  }

  await transporter.sendMail({
    from: `"Should-Cost" <${process.env.SMTP_USER}>`,
    to: email,
    subject,
    html: buildOTPEmail(otp, purpose, name),
  });
}
