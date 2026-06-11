import cron from 'node-cron';
import nodemailer from 'nodemailer';
import pool from '../db/pool';
import { buildWeeklyDigestPrompt, callClaude } from './aiAgent';

function getTransport() {
  if (!process.env.SMTP_HOST) return null;
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

async function generateAndSendDigest(): Promise<void> {
  try {
    // Gather KPI data
    const [opRes, negRes, scRes, quoteRes] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)                                     AS open_opportunities,
           COALESCE(SUM(ABS(total_variance)), 0)        AS total_savings_identified,
           currency
         FROM comparison_snapshot
         WHERE status = 'open'
         GROUP BY currency
         ORDER BY total_savings_identified DESC
         LIMIT 1`
      ),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'open')   AS open_count,
           COUNT(*) FILTER (WHERE status = 'open' AND target_date <= NOW() + INTERVAL '7 days') AS due_this_week
         FROM negotiation_target`
      ),
      pool.query(
        `SELECT COUNT(*) AS stale FROM should_cost_header
         WHERE valid_until < NOW() OR (valid_until IS NULL AND created_at < NOW() - INTERVAL '12 months')`
      ),
      pool.query(
        `SELECT COUNT(*) AS new_quotes FROM supplier_quote_header
         WHERE submitted_at >= NOW() - INTERVAL '7 days'`
      ),
    ]);

    const opp    = opRes.rows[0]  ?? { open_opportunities: 0, total_savings_identified: 0, currency: 'GBP' };
    const neg    = negRes.rows[0] ?? { open_count: 0, due_this_week: 0 };
    const stale  = scRes.rows[0]  ?? { stale: 0 };
    const quotes = quoteRes.rows[0] ?? { new_quotes: 0 };

    const topRes = await pool.query(
      `SELECT p.part_number, s.name AS supplier_name, ABS(cs.total_variance) AS saving
       FROM comparison_snapshot cs
       JOIN part_master p ON p.id = cs.part_id
       JOIN supplier_quote_header sqh ON sqh.id = cs.supplier_quote_header_id
       JOIN supplier s ON s.id = sqh.supplier_id
       WHERE cs.status = 'open' AND cs.total_variance IS NOT NULL
       ORDER BY ABS(cs.total_variance) DESC
       LIMIT 1`
    );
    const topOpp = topRes.rows[0]
      ? { part: topRes.rows[0].part_number, supplier: topRes.rows[0].supplier_name, saving: Number(topRes.rows[0].saving) }
      : null;

    const prompt = buildWeeklyDigestPrompt({
      openOpportunities:        Number(opp.open_opportunities),
      totalSavingsIdentified:   Number(opp.total_savings_identified),
      negotiationsOpenThisWeek: Number(neg.open_count),
      negotiationsDueThisWeek:  Number(neg.due_this_week),
      staleShouldCosts:         Number(stale.stale),
      newQuotesThisWeek:        Number(quotes.new_quotes),
      topOpportunity:           topOpp,
      currency:                 String(opp.currency ?? 'GBP'),
    });

    const digestText = await callClaude(prompt);

    // Fetch all internal/admin user emails
    const usersRes = await pool.query(
      `SELECT u.email, u.full_name
       FROM "user" u
       JOIN role r ON r.id = u.role_id
       WHERE r.name IN ('internal','admin') AND u.is_active = TRUE`
    );

    const transport = getTransport();
    if (!transport) {
      console.log('[weeklyDigest] SMTP not configured — digest content:\n', digestText);
      return;
    }

    for (const user of usersRes.rows) {
      await transport.sendMail({
        from:    process.env.SMTP_FROM ?? 'costlens@no-reply.local',
        to:      user.email,
        subject: `CostLens Weekly Digest — ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`,
        text:    `Hi ${user.full_name},\n\nHere is your CostLens weekly summary:\n\n${digestText}\n\nLog in at ${process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173'}\n\n— CostLens AI`,
        html:    `<p>Hi <strong>${user.full_name}</strong>,</p>
<p>Here is your CostLens weekly summary:</p>
<pre style="font-family:sans-serif;line-height:1.6">${digestText}</pre>
<p><a href="${process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173'}">Open CostLens →</a></p>
<p style="color:#888;font-size:12px">— CostLens AI</p>`,
      });
    }

    console.log(`[weeklyDigest] Sent to ${usersRes.rowCount} users.`);
  } catch (err) {
    console.error('[weeklyDigest] Error:', err);
  }
}

// Schedule: Sunday 18:00 server time
export function startWeeklyDigest(): void {
  cron.schedule('0 18 * * 0', generateAndSendDigest, { timezone: 'Europe/London' });
  console.log('[weeklyDigest] Weekly digest scheduled — Sundays 18:00 London time.');
}

// Expose for manual trigger via admin endpoint
export { generateAndSendDigest };
