import { Request, Response } from 'express';
import pool from '../db/pool';

// GET /api/supplier-scorecard — summary row per supplier
export async function listScorecard(req: Request, res: Response): Promise<void> {
  const { rows } = await pool.query(
    `SELECT
       s.id                                                            AS supplier_id,
       s.name                                                          AS supplier_name,
       s.country,
       COUNT(DISTINCT sqh.id)                                          AS total_quotes,
       COUNT(DISTINCT sqh.id) FILTER (WHERE sqh.status = 'accepted')  AS accepted_quotes,
       COUNT(DISTINCT sqh.id) FILTER (WHERE sqh.status = 'rejected')  AS rejected_quotes,
       COUNT(DISTINCT sqh.part_id)                                     AS unique_parts,
       ROUND(
         100.0 * COUNT(DISTINCT sqh.id) FILTER (WHERE sqh.status = 'accepted')
               / NULLIF(COUNT(DISTINCT sqh.id), 0), 1
       )                                                               AS win_rate_pct,
       ROUND(AVG(cs.variance_pct), 1)                                  AS avg_overpay_pct,
       ROUND(AVG(EXTRACT(EPOCH FROM (sqh.submitted_at - sqh.created_at))/86400), 1)
                                                                       AS avg_response_days,
       MAX(sqh.submitted_at)                                           AS last_quote_at
     FROM supplier s
     LEFT JOIN supplier_quote_header sqh ON sqh.supplier_id = s.id
     LEFT JOIN comparison_snapshot   cs  ON cs.supplier_quote_header_id = sqh.id
     WHERE s.is_active = TRUE
     GROUP BY s.id, s.name, s.country
     ORDER BY total_quotes DESC, s.name`
  );
  res.json(rows);
}

// GET /api/supplier-scorecard/:supplierId — detailed breakdown for one supplier
export async function getSupplierDetail(req: Request, res: Response): Promise<void> {
  const { supplierId } = req.params;

  const [supplierRes, quotesRes, partsRes, trendRes] = await Promise.all([
    pool.query(`SELECT * FROM supplier WHERE id = $1`, [supplierId]),

    pool.query(
      `SELECT
         sqh.id,
         p.part_number,
         p.description AS part_description,
         sqh.status,
         sqh.total_price,
         sqh.currency,
         sqh.submitted_at,
         cs.variance_pct,
         cs.total_variance
       FROM supplier_quote_header sqh
       JOIN part_master p ON p.id = sqh.part_id
       LEFT JOIN comparison_snapshot cs ON cs.supplier_quote_header_id = sqh.id
       WHERE sqh.supplier_id = $1
       ORDER BY sqh.submitted_at DESC
       LIMIT 20`,
      [supplierId]
    ),

    // Best-priced parts for this supplier
    pool.query(
      `SELECT
         p.part_number,
         p.description,
         MIN(sqh.total_price) AS best_price,
         sqh.currency,
         COUNT(*) AS quote_count
       FROM supplier_quote_header sqh
       JOIN part_master p ON p.id = sqh.part_id
       WHERE sqh.supplier_id = $1
       GROUP BY p.part_number, p.description, sqh.currency
       ORDER BY quote_count DESC
       LIMIT 10`,
      [supplierId]
    ),

    // Monthly quote volume trend (last 12 months)
    pool.query(
      `SELECT
         TO_CHAR(DATE_TRUNC('month', submitted_at), 'Mon YY') AS month,
         COUNT(*) AS quote_count
       FROM supplier_quote_header
       WHERE supplier_id = $1
         AND submitted_at >= NOW() - INTERVAL '12 months'
       GROUP BY DATE_TRUNC('month', submitted_at)
       ORDER BY DATE_TRUNC('month', submitted_at)`,
      [supplierId]
    ),
  ]);

  if (supplierRes.rowCount === 0) { res.status(404).json({ error: 'Supplier not found' }); return; }

  res.json({
    supplier: supplierRes.rows[0],
    recentQuotes: quotesRes.rows,
    topParts: partsRes.rows,
    monthlyTrend: trendRes.rows,
  });
}
