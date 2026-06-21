import { Request, Response } from 'express';
import pool from '../db/pool';

interface DiffLine {
  cost_element: string;
  category: string;
  v1_value: number;
  v2_value: number;
  delta: number;
  delta_pct: number;
}

// GET /api/should-cost/diff?partId=X&v1=1&v2=2
export async function compareVersions(req: Request, res: Response): Promise<void> {
  try {
    const { partId, v1, v2 } = req.query;

    if (!partId || !v1 || !v2) {
      res.status(400).json({ error: 'partId, v1 and v2 query parameters are required' });
      return;
    }

    const headersRes = await pool.query(
      `SELECT * FROM should_cost_header
       WHERE part_id = $1 AND version IN ($2, $3)
       ORDER BY version`,
      [partId, v1, v2]
    );

    if (headersRes.rowCount === 0) {
      res.status(404).json({ error: 'No should-cost versions found for this part' });
      return;
    }

    const headers = headersRes.rows;
    const h1 = headers.find((h) => String(h.version) === String(v1));
    const h2 = headers.find((h) => String(h.version) === String(v2));

    if (!h1 || !h2) {
      res.status(404).json({ error: `Could not find versions v${v1} and/or v${v2} for part ${partId}` });
      return;
    }

    // Fetch breakdowns for both headers
    const [bd1Res, bd2Res] = await Promise.all([
      pool.query(
        `SELECT scb.*, COALESCE(
           json_agg(json_build_object('name', ssi.name, 'value', ssi.value, 'basis', ssi.basis, 'sort_order', ssi.sort_order)
             ORDER BY ssi.sort_order) FILTER (WHERE ssi.id IS NOT NULL),
           '[]'::json
         ) AS subitems
         FROM should_cost_breakdown scb
         LEFT JOIN should_cost_subitem ssi ON ssi.breakdown_id = scb.id
         WHERE scb.should_cost_header_id = $1
         GROUP BY scb.id
         ORDER BY scb.sort_order, scb.id`,
        [h1.id]
      ),
      pool.query(
        `SELECT scb.*, COALESCE(
           json_agg(json_build_object('name', ssi.name, 'value', ssi.value, 'basis', ssi.basis, 'sort_order', ssi.sort_order)
             ORDER BY ssi.sort_order) FILTER (WHERE ssi.id IS NOT NULL),
           '[]'::json
         ) AS subitems
         FROM should_cost_breakdown scb
         LEFT JOIN should_cost_subitem ssi ON ssi.breakdown_id = scb.id
         WHERE scb.should_cost_header_id = $1
         GROUP BY scb.id
         ORDER BY scb.sort_order, scb.id`,
        [h2.id]
      ),
    ]);

    const bd1 = bd1Res.rows;
    const bd2 = bd2Res.rows;

    // Build maps by cost_element for easy diff lookup
    const bd1Map = new Map<string, { value: number; category: string }>();
    for (const row of bd1) {
      bd1Map.set(String(row.cost_element), {
        value: Number(row.value ?? 0),
        category: String(row.category ?? ''),
      });
    }

    const bd2Map = new Map<string, { value: number; category: string }>();
    for (const row of bd2) {
      bd2Map.set(String(row.cost_element), {
        value: Number(row.value ?? 0),
        category: String(row.category ?? ''),
      });
    }

    // Collect all cost elements from both versions
    const allElements = new Set<string>([...bd1Map.keys(), ...bd2Map.keys()]);

    const diff: DiffLine[] = [];
    for (const element of allElements) {
      const r1 = bd1Map.get(element);
      const r2 = bd2Map.get(element);
      const v1_value = r1?.value ?? 0;
      const v2_value = r2?.value ?? 0;
      const delta = v2_value - v1_value;
      const delta_pct = v1_value !== 0 ? (delta / v1_value) * 100 : v2_value !== 0 ? 100 : 0;
      diff.push({
        cost_element: element,
        category: r1?.category ?? r2?.category ?? '',
        v1_value,
        v2_value,
        delta,
        delta_pct,
      });
    }

    // Sort by |delta| descending so biggest movers first
    diff.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    const v1_total = Number(h1.total_cost ?? 0);
    const v2_total = Number(h2.total_cost ?? 0);
    const total_delta = v2_total - v1_total;
    const total_delta_pct = v1_total !== 0 ? (total_delta / v1_total) * 100 : v2_total !== 0 ? 100 : 0;

    res.json({
      v1: { header: h1, breakdown: bd1 },
      v2: { header: h2, breakdown: bd2 },
      diff,
      summary: {
        v1_total,
        v2_total,
        total_delta,
        total_delta_pct,
      },
    });
  } catch (err) {
    console.error('[versionDiffController] compareVersions error:', err);
    res.status(500).json({ error: 'Failed to compare versions' });
  }
}

// GET /api/should-cost/versions/:partId — lists all versions for a given part_id
export async function listVersionsForPart(req: Request, res: Response): Promise<void> {
  try {
    const { partId } = req.params;

    const result = await pool.query(
      `SELECT id, version, status, total_cost, currency, created_at
       FROM should_cost_header
       WHERE part_id = $1
       ORDER BY version DESC`,
      [partId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('[versionDiffController] listVersionsForPart error:', err);
    res.status(500).json({ error: 'Failed to list versions' });
  }
}
