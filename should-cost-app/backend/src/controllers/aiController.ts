import { Request, Response } from 'express';
import pool from '../db/pool';
import { generateInsights } from '../services/aiAgent';
import { ComparisonDetail } from '../models/types';

// POST /api/ai/insights  { snapshotId }
export async function generateSnapshotInsights(req: Request, res: Response): Promise<void> {
  const { snapshotId } = req.body as { snapshotId: number };

  // Verify snapshot exists
  const snapshotCheck = await pool.query(
    `SELECT id FROM comparison_snapshot WHERE id = $1`,
    [snapshotId]
  );
  if (snapshotCheck.rowCount === 0) {
    res.status(404).json({ error: 'Comparison snapshot not found' });
    return;
  }

  // Load details
  const detailResult = await pool.query(
    `SELECT * FROM comparison_detail WHERE comparison_snapshot_id = $1 ORDER BY sort_order`,
    [snapshotId]
  );

  const details: ComparisonDetail[] = detailResult.rows.map((r) => ({
    id: r.id,
    comparisonSnapshotId: r.comparison_snapshot_id,
    costElement: r.cost_element,
    category: r.category,
    shouldCostValue: Number(r.should_cost_value),
    quoteValue: Number(r.quote_value),
    variance: Number(r.variance),
    variancePct: r.variance_pct !== null ? Number(r.variance_pct) : undefined,
    flag: r.flag,
    sortOrder: r.sort_order,
  }));

  try {
    const insightPayload = await generateInsights(snapshotId, details, req.user?.sub);

    const { rows } = await pool.query(
      `INSERT INTO ai_insight
         (comparison_snapshot_id, model_used, prompt_version, summary,
          flags, questions, recommendations, raw_response, generated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        insightPayload.comparisonSnapshotId,
        insightPayload.modelUsed,
        insightPayload.promptVersion,
        insightPayload.summary,
        JSON.stringify(insightPayload.flags ?? []),
        JSON.stringify(insightPayload.questions ?? []),
        JSON.stringify(insightPayload.recommendations ?? []),
        JSON.stringify(insightPayload.rawResponse ?? {}),
        insightPayload.generatedBy ?? null,
      ]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('generateSnapshotInsights error', err);
    res.status(500).json({ error: 'AI insight generation failed' });
  }
}

// GET /api/ai/insights/:snapshotId  — list all insights for a snapshot
export async function listInsights(req: Request, res: Response): Promise<void> {
  const { snapshotId } = req.params;
  const { rows } = await pool.query(
    `SELECT * FROM ai_insight WHERE comparison_snapshot_id = $1 ORDER BY generated_at DESC`,
    [snapshotId]
  );
  res.json(rows);
}
