import { Request, Response } from 'express';
import pool from '../db/pool';

// GET /api/should-cost/norms
// Aggregate: for each unique p.commodity, compute avg total_cost, min, max, count of published SCs
export async function getPartFamilyNorms(req: Request, res: Response): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT
         p.commodity,
         COUNT(sch.id)::int AS count,
         AVG(sch.total_cost) AS avg_total,
         MIN(sch.total_cost) AS min_total,
         MAX(sch.total_cost) AS max_total,
         AVG(
           CASE WHEN sch.part_weight_kg IS NOT NULL AND sch.part_weight_kg > 0
                THEN sch.total_cost / sch.part_weight_kg
           END
         ) AS avg_cost_per_kg
       FROM should_cost_header sch
       JOIN part_master p ON p.id = sch.part_id
       WHERE sch.status = 'published' AND p.commodity IS NOT NULL
       GROUP BY p.commodity
       ORDER BY count DESC`
    );

    res.json(result.rows);
  } catch (err) {
    const pg = err as { code?: string };
    if (pg.code === '42P01' || pg.code === '42703') { res.json([]); return; }
    console.error('[partFamilyNormsController] getPartFamilyNorms error:', err);
    res.status(500).json({ error: 'Failed to fetch part family norms' });
  }
}

// GET /api/should-cost/norms/:commodity
// Same but filtered to one commodity — returns individual SCs for drilling down
export async function getCommodityDetail(req: Request, res: Response): Promise<void> {
  try {
    const { commodity } = req.params;

    const result = await pool.query(
      `SELECT
         sch.id,
         p.part_number,
         sch.version,
         sch.total_cost,
         sch.currency,
         sch.annual_volume,
         sch.part_weight_kg,
         CASE WHEN sch.part_weight_kg IS NOT NULL AND sch.part_weight_kg > 0
              THEN sch.total_cost / sch.part_weight_kg
         END AS cost_per_kg,
         sch.created_at
       FROM should_cost_header sch
       JOIN part_master p ON p.id = sch.part_id
       WHERE sch.status = 'published' AND p.commodity ILIKE $1
       ORDER BY sch.created_at DESC`,
      [commodity]
    );

    res.json(result.rows);
  } catch (err) {
    const pg = err as { code?: string };
    if (pg.code === '42P01' || pg.code === '42703') { res.json([]); return; }
    console.error('[partFamilyNormsController] getCommodityDetail error:', err);
    res.status(500).json({ error: 'Failed to fetch commodity detail' });
  }
}
