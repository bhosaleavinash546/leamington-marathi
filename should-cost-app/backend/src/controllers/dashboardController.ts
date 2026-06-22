import { Request, Response } from 'express';
import pool from '../db/pool';

export async function getDashboard(_req: Request, res: Response): Promise<void> {
  try {
    // ── Part coverage ─────────────────────────────────────────────────────────
    const partCoverageResult = await pool.query(`
      SELECT
        COUNT(DISTINCT p.id)                                        AS total_parts,
        COUNT(DISTINCT sch.part_id)                                 AS parts_with_should_cost,
        COUNT(DISTINCT CASE WHEN sch.status = 'published' THEN sch.part_id END)
                                                                    AS parts_with_published_sc
      FROM part_master p
      LEFT JOIN should_cost_header sch ON sch.part_id = p.id
    `);
    const pc = partCoverageResult.rows[0];
    const total_parts              = Number(pc.total_parts)              ?? 0;
    const parts_with_should_cost   = Number(pc.parts_with_should_cost)   ?? 0;
    const parts_with_published_sc  = Number(pc.parts_with_published_sc)  ?? 0;
    const parts_without_sc         = total_parts - parts_with_should_cost;

    // ── Quote pipeline ────────────────────────────────────────────────────────
    const quoteResult = await pool.query(`
      SELECT
        COUNT(*)                                                     AS total_quotes,
        COUNT(*) FILTER (WHERE status = 'submitted')                 AS quotes_pending_review,
        COUNT(*) FILTER (WHERE status = 'negotiating')               AS quotes_negotiating,
        COUNT(*) FILTER (WHERE status = 'accepted')                  AS quotes_accepted
      FROM supplier_quote_header
    `);
    const qr = quoteResult.rows[0];
    const total_quotes          = Number(qr.total_quotes)          ?? 0;
    const quotes_pending_review = Number(qr.quotes_pending_review) ?? 0;
    const quotes_negotiating    = Number(qr.quotes_negotiating)    ?? 0;
    const quotes_accepted       = Number(qr.quotes_accepted)       ?? 0;

    // ── Comparisons ───────────────────────────────────────────────────────────
    const compResult = await pool.query(`
      SELECT
        COUNT(*)                                                     AS total_comparisons,
        COUNT(*) FILTER (WHERE status = 'open')                      AS open_comparisons,
        COUNT(*) FILTER (WHERE ABS(COALESCE(variance_pct, 0)) > 15) AS high_variance_comparisons
      FROM comparison_snapshot
    `);
    const cr = compResult.rows[0];
    const total_comparisons        = Number(cr.total_comparisons)        ?? 0;
    const open_comparisons         = Number(cr.open_comparisons)         ?? 0;
    const high_variance_comparisons = Number(cr.high_variance_comparisons) ?? 0;

    // ── Negotiations (may not exist) ──────────────────────────────────────────
    let open_negotiations         = 0;
    let stalled_negotiations      = 0;
    let negotiations_due_this_week = 0;
    let potential_annual_saving   = 0;
    let agreed_saving_ytd         = 0;

    try {
      const negResult = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'open')     AS open_negotiations,
          COUNT(*) FILTER (WHERE status = 'stalled')  AS stalled_negotiations,
          COUNT(*) FILTER (
            WHERE status NOT IN ('agreed', 'closed', 'cancelled')
            AND target_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
          )                                            AS negotiations_due_this_week,
          COALESCE(SUM(
            CASE WHEN status NOT IN ('agreed', 'closed', 'cancelled')
                      AND target_price IS NOT NULL AND current_price IS NOT NULL
                 THEN (current_price - target_price)
                 ELSE 0 END
          ), 0)                                        AS potential_annual_saving,
          COALESCE(SUM(
            CASE WHEN status = 'agreed'
                      AND agreed_price IS NOT NULL AND current_price IS NOT NULL
                 THEN (current_price - agreed_price)
                 ELSE 0 END
          ), 0)                                        AS agreed_saving_ytd
        FROM negotiation_target
      `);
      const nr = negResult.rows[0];
      open_negotiations          = Number(nr.open_negotiations)          ?? 0;
      stalled_negotiations       = Number(nr.stalled_negotiations)       ?? 0;
      negotiations_due_this_week = Number(nr.negotiations_due_this_week) ?? 0;
      potential_annual_saving    = Number(nr.potential_annual_saving)    ?? 0;
      agreed_saving_ytd          = Number(nr.agreed_saving_ytd)          ?? 0;
    } catch {
      // negotiation_target table does not exist — leave defaults
    }

    // ── ACR (may not exist) ───────────────────────────────────────────────────
    let acr_targets_this_year  = 0;
    let acr_achieved_this_year = 0;

    try {
      const acrResult = await pool.query(`
        SELECT
          COUNT(*)                                       AS acr_targets_this_year,
          COUNT(*) FILTER (WHERE status = 'agreed')     AS acr_achieved_this_year
        FROM acr_target
        WHERE target_year = EXTRACT(YEAR FROM CURRENT_DATE)
      `);
      const ar = acrResult.rows[0];
      acr_targets_this_year  = Number(ar.acr_targets_this_year)  ?? 0;
      acr_achieved_this_year = Number(ar.acr_achieved_this_year) ?? 0;
    } catch {
      // acr_target table does not exist — leave defaults
    }

    // ── Recent comparisons ────────────────────────────────────────────────────
    const recentCompResult = await pool.query(`
      SELECT
        cs.id,
        p.part_number,
        s.name          AS supplier_name,
        cs.variance_pct,
        cs.total_variance,
        cs.status,
        cs.created_at
      FROM comparison_snapshot cs
      JOIN part_master          p   ON p.id  = cs.part_id
      JOIN supplier_quote_header sqh ON sqh.id = cs.supplier_quote_header_id
      JOIN supplier              s   ON s.id  = sqh.supplier_id
      ORDER BY cs.created_at DESC
      LIMIT 6
    `);
    const recent_comparisons = recentCompResult.rows;

    // ── Recent quotes ─────────────────────────────────────────────────────────
    const recentQuoteResult = await pool.query(`
      SELECT
        sqh.id,
        p.part_number,
        s.name       AS supplier_name,
        sqh.total_price,
        sqh.currency,
        sqh.status,
        sqh.submitted_at
      FROM supplier_quote_header sqh
      JOIN part_master p ON p.id = sqh.part_id
      JOIN supplier   s  ON s.id = sqh.supplier_id
      ORDER BY sqh.submitted_at DESC NULLS LAST
      LIMIT 6
    `);
    const recent_quotes = recentQuoteResult.rows;

    // ── Build alerts ──────────────────────────────────────────────────────────
    const alerts: Array<{
      type: 'warning' | 'info' | 'danger';
      message: string;
      link: string;
      count: number;
    }> = [];

    if (quotes_pending_review > 0) {
      alerts.push({
        type: 'warning',
        message: `${quotes_pending_review} supplier quote(s) awaiting review`,
        link: '/quotes',
        count: quotes_pending_review,
      });
    }
    if (negotiations_due_this_week > 0) {
      alerts.push({
        type: 'danger',
        message: `${negotiations_due_this_week} negotiation(s) due this week`,
        link: '/negotiations',
        count: negotiations_due_this_week,
      });
    }
    if (stalled_negotiations > 0) {
      alerts.push({
        type: 'warning',
        message: `${stalled_negotiations} negotiation(s) stalled — needs attention`,
        link: '/negotiations',
        count: stalled_negotiations,
      });
    }
    if (parts_without_sc > 0) {
      alerts.push({
        type: 'info',
        message: `${parts_without_sc} part(s) have no should-cost model`,
        link: '/should-costs',
        count: parts_without_sc,
      });
    }
    if (high_variance_comparisons > 0) {
      alerts.push({
        type: 'danger',
        message: `${high_variance_comparisons} comparison(s) with >15% variance flagged`,
        link: '/comparisons',
        count: high_variance_comparisons,
      });
    }

    res.json({
      total_parts,
      parts_with_should_cost,
      parts_with_published_sc,
      parts_without_sc,
      total_quotes,
      quotes_pending_review,
      quotes_negotiating,
      quotes_accepted,
      total_comparisons,
      open_comparisons,
      high_variance_comparisons,
      open_negotiations,
      stalled_negotiations,
      negotiations_due_this_week,
      potential_annual_saving,
      agreed_saving_ytd,
      acr_targets_this_year,
      acr_achieved_this_year,
      alerts,
      recent_comparisons,
      recent_quotes,
    });
  } catch (err) {
    console.error('[dashboardController] getDashboard error:', err);
    res.status(500).json({ error: 'Failed to load dashboard data' });
  }
}
