import { Request, Response } from 'express';
import pool from '../db/pool';
import { CreateComparisonDto } from '../models/types';

// GET /api/comparisons?partId=
export async function listComparisons(req: Request, res: Response): Promise<void> {
  const { partId } = req.query;
  const params: unknown[] = [];
  const where = partId ? `WHERE cs.part_id = $${(params.push(partId), params.length)}` : '';

  const { rows } = await pool.query(
    `SELECT cs.*, p.part_number, s.name AS supplier_name
     FROM comparison_snapshot cs
     JOIN part_master p ON p.id = cs.part_id
     JOIN supplier_quote_header sqh ON sqh.id = cs.supplier_quote_header_id
     JOIN supplier s ON s.id = sqh.supplier_id
     ${where}
     ORDER BY cs.created_at DESC`,
    params
  );
  res.json(rows);
}

// GET /api/comparisons/:id
export async function getComparison(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  const snapshotResult = await pool.query(
    `SELECT cs.*, p.part_number, s.name AS supplier_name
     FROM comparison_snapshot cs
     JOIN part_master p ON p.id = cs.part_id
     JOIN supplier_quote_header sqh ON sqh.id = cs.supplier_quote_header_id
     JOIN supplier s ON s.id = sqh.supplier_id
     WHERE cs.id = $1`,
    [id]
  );
  if (snapshotResult.rowCount === 0) {
    res.status(404).json({ error: 'Comparison not found' });
    return;
  }

  const detailResult = await pool.query(
    `SELECT * FROM comparison_detail WHERE comparison_snapshot_id = $1 ORDER BY sort_order`,
    [id]
  );

  const insightResult = await pool.query(
    `SELECT * FROM ai_insight WHERE comparison_snapshot_id = $1 ORDER BY generated_at DESC LIMIT 1`,
    [id]
  );

  res.json({
    snapshot: snapshotResult.rows[0],
    details: detailResult.rows,
    latestInsight: insightResult.rows[0] ?? null,
  });
}

// POST /api/comparisons — build a snapshot from SC + Quote headers
export async function createComparison(req: Request, res: Response): Promise<void> {
  const dto = req.body as CreateComparisonDto;

  // Load SC breakdown
  const scBreakdown = await pool.query(
    `SELECT cost_element, category, value, sort_order
     FROM should_cost_breakdown WHERE should_cost_header_id = $1 ORDER BY sort_order`,
    [dto.shouldCostHeaderId]
  );

  // Load Quote breakdown
  const quoteBreakdown = await pool.query(
    `SELECT cost_element, category, value, sort_order
     FROM supplier_quote_breakdown WHERE supplier_quote_header_id = $1 ORDER BY sort_order`,
    [dto.supplierQuoteHeaderId]
  );

  // Build a union of all cost elements
  const scMap = new Map<string, { category?: string; value: number; sortOrder: number }>();
  for (const row of scBreakdown.rows) {
    scMap.set(row.cost_element, { category: row.category, value: Number(row.value), sortOrder: row.sort_order });
  }

  const quoteMap = new Map<string, { category?: string; value: number; sortOrder: number }>();
  for (const row of quoteBreakdown.rows) {
    quoteMap.set(row.cost_element, { category: row.category, value: Number(row.value), sortOrder: row.sort_order });
  }

  const allElements = Array.from(new Set([...scMap.keys(), ...quoteMap.keys()]));

  const details = allElements.map((element, idx) => {
    const sc = scMap.get(element);
    const q  = quoteMap.get(element);
    const scVal  = sc?.value  ?? 0;
    const qVal   = q?.value   ?? 0;
    const variance = qVal - scVal;
    const variancePct = scVal !== 0 ? (variance / scVal) * 100 : null;
    const flag: 'over' | 'under' | 'acceptable' =
      variancePct === null ? 'acceptable'
      : variancePct > 10   ? 'over'
      : variancePct < -10  ? 'under'
      : 'acceptable';

    return {
      costElement: element,
      category: sc?.category ?? q?.category,
      shouldCostValue: scVal,
      quoteValue: qVal,
      variance,
      variancePct,
      flag,
      sortOrder: sc?.sortOrder ?? q?.sortOrder ?? idx,
    };
  });

  const totalShouldCost = details.reduce((s, d) => s + d.shouldCostValue, 0);
  const totalQuotePrice = details.reduce((s, d) => s + d.quoteValue, 0);
  const totalVariance   = totalQuotePrice - totalShouldCost;
  const variancePct     = totalShouldCost !== 0 ? (totalVariance / totalShouldCost) * 100 : 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const snapshotResult = await client.query(
      `INSERT INTO comparison_snapshot
         (part_id, should_cost_header_id, supplier_quote_header_id, snapshot_name,
          total_should_cost, total_quote_price, total_variance, variance_pct, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        dto.partId, dto.shouldCostHeaderId, dto.supplierQuoteHeaderId,
        dto.snapshotName ?? null, totalShouldCost, totalQuotePrice,
        totalVariance, variancePct, req.user?.sub,
      ]
    );
    const snapshot = snapshotResult.rows[0];

    for (const d of details) {
      await client.query(
        `INSERT INTO comparison_detail
           (comparison_snapshot_id, cost_element, category, should_cost_value,
            quote_value, variance_pct, flag, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [snapshot.id, d.costElement, d.category, d.shouldCostValue, d.quoteValue, d.variancePct, d.flag, d.sortOrder]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ snapshot, details });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('createComparison error', err);
    res.status(500).json({ error: 'Failed to create comparison' });
  } finally {
    client.release();
  }
}
