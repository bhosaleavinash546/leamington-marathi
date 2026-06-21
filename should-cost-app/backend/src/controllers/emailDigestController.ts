import nodemailer from 'nodemailer';
import pool from '../db/pool';

interface DigestMetrics {
  published_this_week: number;
  open_negotiations: number;
  acr_due_this_year: number;
  high_variance_comparisons: number;
}

function getTransport(): nodemailer.Transporter | null {
  const host = process.env.SMTP_HOST;
  if (!host) return null;

  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function buildHtmlEmail(metrics: DigestMetrics, userName: string): string {
  const date = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f4f6fa; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { background: #1e3a5f; color: #fff; padding: 24px 32px; }
    .header h1 { margin: 0; font-size: 20px; letter-spacing: 1px; }
    .header p { margin: 4px 0 0; font-size: 12px; color: #a0b4c8; }
    .body { padding: 24px 32px; }
    .greeting { font-size: 15px; margin-bottom: 20px; color: #1a1a2e; }
    .metrics { display: table; width: 100%; border-collapse: collapse; margin: 16px 0; }
    .metric { display: table-row; }
    .metric-label { display: table-cell; padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; color: #555; width: 70%; }
    .metric-value { display: table-cell; padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 16px; font-weight: bold; color: #1e3a5f; text-align: right; }
    .cta { margin: 24px 0; text-align: center; }
    .cta a { background: #1e3a5f; color: #fff; padding: 10px 28px; text-decoration: none; border-radius: 4px; font-size: 13px; font-weight: bold; }
    .footer { background: #f4f6fa; padding: 14px 32px; font-size: 11px; color: #999; text-align: center; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>COSTLENS</h1>
      <p>Weekly Digest — ${date}</p>
    </div>
    <div class="body">
      <div class="greeting">Hi <strong>${userName}</strong>,<br>Here is your CostLens weekly summary:</div>
      <div class="metrics">
        <div class="metric">
          <div class="metric-label">Published Should-Costs this week</div>
          <div class="metric-value">${metrics.published_this_week}</div>
        </div>
        <div class="metric">
          <div class="metric-label">Open Negotiations</div>
          <div class="metric-value">${metrics.open_negotiations}</div>
        </div>
        <div class="metric">
          <div class="metric-label">ACR Targets due this year</div>
          <div class="metric-value">${metrics.acr_due_this_year}</div>
        </div>
        <div class="metric">
          <div class="metric-label">Comparisons with variance &gt; 15%</div>
          <div class="metric-value">${metrics.high_variance_comparisons}</div>
        </div>
      </div>
      <div class="cta">
        <a href="${process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173'}">Open CostLens →</a>
      </div>
    </div>
    <div class="footer">Confidential — CostLens &nbsp;·&nbsp; This email was sent automatically each Monday at 08:00.</div>
  </div>
</body>
</html>`;
}

export async function sendWeeklyDigest(): Promise<void> {
  if (!process.env.SMTP_HOST) {
    console.warn('[emailDigest] SMTP_HOST not set — skipping weekly digest email.');
    return;
  }

  // Gather metrics
  const [publishedRes, negotiationsRes, acrRes, highVarianceRes] = await Promise.all([
    pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM should_cost_header
       WHERE status = 'published'
         AND created_at >= NOW() - INTERVAL '7 days'`
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM negotiation_target
       WHERE status = 'open'`
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM acr_target
       WHERE status IN ('open', 'agreed')
         AND target_year = EXTRACT(YEAR FROM NOW())`
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM comparison_snapshot
       WHERE ABS(variance_pct) > 15`
    ),
  ]);

  const metrics: DigestMetrics = {
    published_this_week:       Number(publishedRes.rows[0]?.count ?? 0),
    open_negotiations:         Number(negotiationsRes.rows[0]?.count ?? 0),
    acr_due_this_year:         Number(acrRes.rows[0]?.count ?? 0),
    high_variance_comparisons: Number(highVarianceRes.rows[0]?.count ?? 0),
  };

  // Get all internal + admin users
  const usersRes = await pool.query<{ email: string; full_name: string }>(
    `SELECT u.email, u.full_name
     FROM "user" u
     JOIN role r ON r.id = u.role_id
     WHERE r.name IN ('internal', 'admin') AND u.is_active = TRUE`
  );

  const transport = getTransport();
  if (!transport) {
    console.warn('[emailDigest] Transport not available — digest metrics:', metrics);
    return;
  }

  const subject = `CostLens Weekly Digest — ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  for (const user of usersRes.rows) {
    try {
      await transport.sendMail({
        from: process.env.SMTP_FROM ?? 'costlens@no-reply.local',
        to:   user.email,
        subject,
        html: buildHtmlEmail(metrics, user.full_name ?? user.email),
        text: [
          `Hi ${user.full_name ?? user.email},`,
          '',
          'CostLens Weekly Digest:',
          `- Published should-costs this week: ${metrics.published_this_week}`,
          `- Open negotiations: ${metrics.open_negotiations}`,
          `- ACR targets due this year: ${metrics.acr_due_this_year}`,
          `- Comparisons with variance > 15%: ${metrics.high_variance_comparisons}`,
          '',
          `Open CostLens: ${process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173'}`,
          '',
          '— CostLens',
        ].join('\n'),
      });
      console.log(`[emailDigest] Sent to ${user.email}`);
    } catch (mailErr) {
      console.error(`[emailDigest] Failed to send to ${user.email}:`, mailErr);
    }
  }
}

export async function scheduledEmailDigest(): Promise<void> {
  try {
    console.log('[emailDigest] Running scheduled weekly digest...');
    await sendWeeklyDigest();
    console.log('[emailDigest] Weekly digest complete.');
  } catch (err) {
    console.error('[emailDigest] Scheduled digest error:', err);
  }
}
