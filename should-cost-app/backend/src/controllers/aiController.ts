import { Request, Response } from 'express';
import pool from '../db/pool';
import {
  generateInsights,
  streamClaude,
  buildComparisonPrompt,
  buildShouldCostPrompt,
  buildNLSearchPrompt,
  callClaude,
} from '../services/aiAgent';
import { ComparisonDetail } from '../models/types';

// POST /api/ai/insights  { snapshotId }
export async function generateSnapshotInsights(req: Request, res: Response): Promise<void> {
  const { snapshotId } = req.body as { snapshotId: number };

  const snapshotCheck = await pool.query(
    `SELECT id FROM comparison_snapshot WHERE id = $1`,
    [snapshotId]
  );
  if (snapshotCheck.rowCount === 0) {
    res.status(404).json({ error: 'Comparison snapshot not found' });
    return;
  }

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

// POST /api/ai/insights/stream  { snapshotId }  — Server-Sent Events streaming (P6)
export async function streamSnapshotInsights(req: Request, res: Response): Promise<void> {
  const { snapshotId } = req.body as { snapshotId: number };

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

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let fullText = '';
  try {
    for await (const token of streamClaude(buildComparisonPrompt(details))) {
      fullText += token;
      res.write(`data: ${JSON.stringify({ token })}\n\n`);
    }

    // Persist once streaming complete
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(fullText) as Record<string, unknown>; } catch { /* keep empty */ }

    const { rows } = await pool.query(
      `INSERT INTO ai_insight
         (comparison_snapshot_id, model_used, prompt_version, summary,
          flags, questions, recommendations, raw_response, generated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        snapshotId,
        process.env.ANTHROPIC_API_KEY ? (process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6') : 'mock',
        '2.0',
        parsed['summary'] ?? fullText,
        JSON.stringify(parsed['flags'] ?? []),
        JSON.stringify(parsed['questions'] ?? []),
        JSON.stringify(parsed['recommendations'] ?? []),
        JSON.stringify(parsed),
        req.user?.sub ?? null,
      ]
    );

    res.write(`data: ${JSON.stringify({ done: true, insight: rows[0] })}\n\n`);
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: String(err) })}\n\n`);
  } finally {
    res.end();
  }
}

// POST /api/ai/build-should-cost  { partDescription, commodity, annualVolume, currency, processNotes? }
// AI-assisted should-cost builder (P8)
export async function buildShouldCostWithAI(req: Request, res: Response): Promise<void> {
  const { partDescription, commodity, annualVolume, currency, processNotes } = req.body as {
    partDescription: string;
    commodity: string;
    annualVolume: number;
    currency: string;
    processNotes?: string;
  };

  if (!partDescription || !commodity || !annualVolume) {
    res.status(400).json({ error: 'partDescription, commodity, and annualVolume are required' });
    return;
  }

  try {
    const prompt = buildShouldCostPrompt(partDescription, commodity, annualVolume, currency ?? 'GBP', processNotes);
    const rawText = await callClaude(prompt);
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    res.json(parsed);
  } catch (err) {
    console.error('buildShouldCostWithAI error', err);
    res.status(500).json({ error: 'AI should-cost builder failed' });
  }
}

// POST /api/ai/nl-search  { question }  — natural-language query (P9)
const NL_SCHEMA_HINT = `
part_master(id, part_number, description, commodity, family_code, family_name)
supplier(id, code, name, country)
should_cost_header(id, part_id, version, status, total_cost, currency, annual_volume, valid_until, created_at)
should_cost_breakdown(id, should_cost_header_id, cost_element, category, value)
supplier_quote_header(id, part_id, supplier_id, version, status, total_price, currency, submitted_at)
comparison_snapshot(id, part_id, snapshot_name, total_should_cost, total_quote_price, total_variance, variance_pct, status)
negotiation_target(id, part_id, supplier_id, target_price, current_price, should_cost, currency, target_date, status, agreed_price)
`.trim();

export async function nlSearch(req: Request, res: Response): Promise<void> {
  const { question } = req.body as { question: string };
  if (!question?.trim()) {
    res.status(400).json({ error: 'question is required' });
    return;
  }

  try {
    const prompt = buildNLSearchPrompt(question, NL_SCHEMA_HINT);
    const rawText = await callClaude(prompt);
    const parsed = JSON.parse(rawText) as { sql: string; label: string };

    // Safety: only allow SELECT statements
    const sql = parsed.sql.trim();
    if (!/^SELECT\s/i.test(sql)) {
      res.status(400).json({ error: 'Only SELECT queries are permitted' });
      return;
    }

    const result = await pool.query(sql);
    res.json({ label: parsed.label, rows: result.rows, count: result.rowCount });
  } catch (err) {
    console.error('nlSearch error', err);
    res.status(500).json({ error: 'Natural-language search failed' });
  }
}

// GET /api/ai/insights/:snapshotId
export async function listInsights(req: Request, res: Response): Promise<void> {
  const { snapshotId } = req.params;
  const { rows } = await pool.query(
    `SELECT * FROM ai_insight WHERE comparison_snapshot_id = $1 ORDER BY generated_at DESC`,
    [snapshotId]
  );
  res.json(rows);
}
