import { Request, Response } from 'express';
import pool from '../db/pool';
import { generateInsights } from '../services/aiAgent';
import { ComparisonDetail } from '../models/types';

interface MultiComparisonRow {
  cost_element: string;
  category?: string;
  should_cost_value: number;
  sort_order: number;
  [key: string]: unknown;
}

// GET /api/multi-comparison?partId=
export async function listMultiComparisons(req: Request, res: Response): Promise<void> {
  const { partId } = req.query;
  const where = partId ? `WHERE mc.part_id = $1` : '';
  const params = partId ? [partId] : [];
  const { rows } = await pool.query(
    `SELECT mc.*, p.part_number, sch.version AS sc_version
     FROM multi_comparison mc
     JOIN part_master p ON p.id = mc.part_id
     JOIN should_cost_header sch ON sch.id = mc.should_cost_header_id
     ${where} ORDER BY mc.created_at DESC`,
    params
  );
  res.json(rows);
}

// GET /api/multi-comparison/:id — full matrix
export async function getMultiComparison(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  const mcResult = await pool.query(
    `SELECT mc.*, p.part_number, sch.total_cost AS sc_total
     FROM multi_comparison mc
     JOIN part_master p ON p.id = mc.part_id
     JOIN should_cost_header sch ON sch.id = mc.should_cost_header_id
     WHERE mc.id = $1`,
    [id]
  );
  if (!mcResult.rowCount) { res.status(404).json({ error: 'Not found' }); return; }

  // Load entries with supplier info
  const entryResult = await pool.query(
    `SELECT mce.*, sqh.version, sqh.total_price, sqh.currency,
            s.name AS supplier_name, s.id AS supplier_id
     FROM multi_comparison_entry mce
     JOIN supplier_quote_header sqh ON sqh.id = mce.supplier_quote_header_id
     JOIN supplier s ON s.id = sqh.supplier_id
     WHERE mce.multi_comparison_id = $1
     ORDER BY mce.rank NULLS LAST`,
    [id]
  );

  // Load SC breakdown
  const scRows = await pool.query(
    `SELECT cost_element, category, value, sort_order
     FROM should_cost_breakdown WHERE should_cost_header_id = $1 ORDER BY sort_order`,
    [mcResult.rows[0].should_cost_header_id]
  );

  // Load all quote breakdowns in one query
  const quoteIds = entryResult.rows.map((e) => e.supplier_quote_header_id);
  const matrix: MultiComparisonRow[] = [];

  if (quoteIds.length > 0) {
    // Build element map from SC
    const scMap = new Map<string, { value: number; category?: string; sortOrder: number }>();
    for (const r of scRows.rows) {
      scMap.set(r.cost_element, { value: Number(r.value), category: r.category, sortOrder: r.sort_order });
    }

    const qbResult = await pool.query(
      `SELECT supplier_quote_header_id, cost_element, value
       FROM supplier_quote_breakdown
       WHERE supplier_quote_header_id = ANY($1)`,
      [quoteIds]
    );

    // Index quote values by [header_id][element]
    const qMap = new Map<number, Map<string, number>>();
    for (const r of qbResult.rows) {
      if (!qMap.has(r.supplier_quote_header_id)) qMap.set(r.supplier_quote_header_id, new Map());
      qMap.get(r.supplier_quote_header_id)!.set(r.cost_element, Number(r.value));
    }

    // Build all cost elements union
    const allElements = new Set<string>(scMap.keys());
    for (const qm of qMap.values()) for (const k of qm.keys()) allElements.add(k);

    for (const element of allElements) {
      const sc = scMap.get(element);
      const row: MultiComparisonRow = {
        cost_element:     element,
        category:         sc?.category,
        should_cost_value: sc?.value ?? 0,
        sort_order:        sc?.sortOrder ?? 999,
      };
      for (const entry of entryResult.rows) {
        const val = qMap.get(entry.supplier_quote_header_id)?.get(element) ?? 0;
        row[`q_${entry.supplier_id}`]            = val;
        row[`var_${entry.supplier_id}`]           = val - (sc?.value ?? 0);
        row[`var_pct_${entry.supplier_id}`]       =
          (sc?.value ?? 0) !== 0 ? ((val - (sc?.value ?? 0)) / (sc?.value ?? 0)) * 100 : 0;
      }
      matrix.push(row);
    }
    matrix.sort((a, b) => a.sort_order - b.sort_order);
  }

  res.json({
    comparison: mcResult.rows[0],
    entries:    entryResult.rows,
    matrix,
  });
}

// POST /api/multi-comparison
export async function createMultiComparison(req: Request, res: Response): Promise<void> {
  const { partId, shouldCostHeaderId, quoteHeaderIds, name, currency } = req.body as {
    partId: number; shouldCostHeaderId: number;
    quoteHeaderIds: number[]; name?: string; currency?: string;
  };

  if (!quoteHeaderIds?.length || quoteHeaderIds.length < 2) {
    res.status(400).json({ error: 'At least 2 supplier quotes are required' }); return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const mcResult = await client.query(
      `INSERT INTO multi_comparison (part_id, should_cost_header_id, name, currency, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [partId, shouldCostHeaderId, name ?? null, currency ?? 'USD', req.user?.sub]
    );
    const mc = mcResult.rows[0];

    for (const qid of quoteHeaderIds) {
      await client.query(
        `INSERT INTO multi_comparison_entry (multi_comparison_id, supplier_quote_header_id)
         VALUES ($1,$2)`,
        [mc.id, qid]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(mc);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('createMultiComparison error', err);
    res.status(500).json({ error: 'Failed to create multi-comparison' });
  } finally {
    client.release();
  }
}

// POST /api/multi-comparison/:id/ai — generate AI insight for multi-supplier
export async function generateMultiAI(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  const mcResult = await pool.query(
    `SELECT mc.should_cost_header_id FROM multi_comparison mc WHERE mc.id = $1`, [id]
  );
  if (!mcResult.rowCount) { res.status(404).json({ error: 'Not found' }); return; }

  // Build a synthetic comparison detail list from the matrix
  const scRows = await pool.query(
    `SELECT cost_element, category, value, sort_order
     FROM should_cost_breakdown WHERE should_cost_header_id = $1 ORDER BY sort_order`,
    [mcResult.rows[0].should_cost_header_id]
  );

  const details: ComparisonDetail[] = scRows.rows.map((r, idx) => ({
    id: idx,
    comparisonSnapshotId: parseInt(id),
    costElement: r.cost_element,
    category: r.category,
    shouldCostValue: Number(r.value),
    quoteValue: Number(r.value),
    variance: 0,
    variancePct: 0,
    flag: 'acceptable',
    sortOrder: r.sort_order,
  }));

  try {
    const insight = await generateInsights(parseInt(id), details, req.user?.sub);
    res.json(insight);
  } catch (err) {
    console.error('generateMultiAI error', err);
    res.status(500).json({ error: 'AI insight generation failed' });
  }
}
