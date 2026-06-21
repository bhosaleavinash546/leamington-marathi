import { Request, Response } from 'express';
import pool from '../db/pool';

// POST /api/cer/accuracy — log a CER estimate for accuracy tracking
export async function logAccuracy(req: Request, res: Response): Promise<void> {
  try {
    const {
      process_type,
      country,
      part_weight_kg,
      material_name,
      cycle_time_sec,
      annual_volume,
      estimated_total,
      part_id,
      should_cost_header_id,
      notes,
    } = req.body as {
      process_type?: string;
      country?: string;
      part_weight_kg?: number;
      material_name?: string;
      cycle_time_sec?: number;
      annual_volume?: number;
      estimated_total: number;
      part_id?: number;
      should_cost_header_id?: number;
      notes?: string;
    };

    if (estimated_total == null) {
      res.status(400).json({ error: 'estimated_total is required' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO cer_accuracy_log
         (process_type, country, part_weight_kg, material_name, cycle_time_sec, annual_volume,
          estimated_total, part_id, should_cost_header_id, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        process_type ?? null,
        country ?? null,
        part_weight_kg ?? null,
        material_name ?? null,
        cycle_time_sec ?? null,
        annual_volume ?? null,
        estimated_total,
        part_id ?? null,
        should_cost_header_id ?? null,
        notes ?? null,
        req.user?.sub ?? null,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[cerAccuracyController] logAccuracy error:', err);
    res.status(500).json({ error: 'Failed to log accuracy record' });
  }
}

// GET /api/cer/accuracy — list all accuracy logs with actuals where available
export async function listAccuracy(req: Request, res: Response): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT cal.*,
              p.part_number,
              CASE
                WHEN cal.actual_settled IS NOT NULL AND cal.estimated_total <> 0
                THEN ((cal.actual_settled - cal.estimated_total) / cal.estimated_total * 100)
                ELSE NULL
              END AS error_pct
       FROM cer_accuracy_log cal
       LEFT JOIN part_master p ON p.id = cal.part_id
       ORDER BY cal.created_at DESC`
    );

    res.json(result.rows);
  } catch (err) {
    const pg = err as { code?: string };
    if (pg.code === '42P01' || pg.code === '42703') { res.json([]); return; }
    console.error('[cerAccuracyController] listAccuracy error:', err);
    res.status(500).json({ error: 'Failed to fetch accuracy logs' });
  }
}

// PATCH /api/cer/accuracy/:id/actual — update actual settled price
export async function updateActual(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { actual_settled, notes } = req.body as {
      actual_settled: number;
      notes?: string;
    };

    if (actual_settled == null) {
      res.status(400).json({ error: 'actual_settled is required' });
      return;
    }

    const setClauses = ['actual_settled = $2', 'settled_at = NOW()'];
    const params: unknown[] = [id, actual_settled];

    if (notes !== undefined) {
      params.push(notes);
      setClauses.push(`notes = $${params.length}`);
    }

    const result = await pool.query(
      `UPDATE cer_accuracy_log SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );

    if (!result.rowCount) {
      res.status(404).json({ error: 'Accuracy log not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('[cerAccuracyController] updateActual error:', err);
    res.status(500).json({ error: 'Failed to update actual price' });
  }
}

// GET /api/cer/accuracy/summary — aggregate stats
export async function getAccuracySummary(req: Request, res: Response): Promise<void> {
  try {
    const overallRes = await pool.query(
      `SELECT
         COUNT(*)::int AS count_total,
         COUNT(actual_settled)::int AS count_with_actuals,
         AVG(
           CASE WHEN actual_settled IS NOT NULL AND estimated_total <> 0
                THEN (actual_settled - estimated_total) / estimated_total * 100
           END
         ) AS avg_error_pct,
         AVG(
           CASE WHEN actual_settled IS NOT NULL AND estimated_total <> 0
                THEN ABS((actual_settled - estimated_total) / estimated_total * 100)
           END
         ) AS avg_abs_error_pct
       FROM cer_accuracy_log`
    );

    const byProcessRes = await pool.query(
      `SELECT process_type,
              AVG(ABS((actual_settled - estimated_total) / estimated_total * 100)) AS avg_abs_error_pct
       FROM cer_accuracy_log
       WHERE actual_settled IS NOT NULL AND estimated_total <> 0 AND process_type IS NOT NULL
       GROUP BY process_type
       ORDER BY avg_abs_error_pct`
    );

    const byProcess = byProcessRes.rows;
    const best_process = byProcess.length > 0 ? byProcess[0].process_type : null;
    const worst_process = byProcess.length > 0 ? byProcess[byProcess.length - 1].process_type : null;

    const overall = overallRes.rows[0];

    res.json({
      count_total: overall.count_total,
      count_with_actuals: overall.count_with_actuals,
      avg_error_pct: overall.avg_error_pct != null ? Number(overall.avg_error_pct) : null,
      avg_abs_error_pct: overall.avg_abs_error_pct != null ? Number(overall.avg_abs_error_pct) : null,
      best_process,
      worst_process,
      by_process: byProcess,
    });
  } catch (err) {
    const pg = err as { code?: string };
    if (pg.code === '42P01' || pg.code === '42703') {
      res.json({ count_total: 0, count_with_actuals: 0, avg_error_pct: null, avg_abs_error_pct: null, best_process: null, worst_process: null, by_process: [] });
      return;
    }
    console.error('[cerAccuracyController] getAccuracySummary error:', err);
    res.status(500).json({ error: 'Failed to fetch accuracy summary' });
  }
}
