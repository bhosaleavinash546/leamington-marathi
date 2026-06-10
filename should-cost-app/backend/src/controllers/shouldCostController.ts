import { Request, Response } from 'express';
import pool from '../db/pool';
import { CreateShouldCostDto } from '../models/types';

// GET /api/should-cost?partId=&status=
export async function listShouldCosts(req: Request, res: Response): Promise<void> {
  const { partId, status } = req.query;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (partId) { params.push(partId); conditions.push(`h.part_id = $${params.length}`); }
  if (status) { params.push(status);  conditions.push(`h.status = $${params.length}`); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT h.*, p.part_number, p.description AS part_description
     FROM should_cost_header h
     JOIN part_master p ON p.id = h.part_id
     ${where}
     ORDER BY h.part_id, h.version DESC`,
    params
  );
  res.json(rows);
}

// GET /api/should-cost/:id
export async function getShouldCost(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const headerResult = await pool.query(
    `SELECT h.*, p.part_number, p.description AS part_description
     FROM should_cost_header h
     JOIN part_master p ON p.id = h.part_id
     WHERE h.id = $1`,
    [id]
  );
  if (headerResult.rowCount === 0) {
    res.status(404).json({ error: 'Should-Cost not found' });
    return;
  }

  const breakdownResult = await pool.query(
    `SELECT * FROM should_cost_breakdown WHERE should_cost_header_id = $1 ORDER BY sort_order`,
    [id]
  );

  res.json({ header: headerResult.rows[0], breakdown: breakdownResult.rows });
}

// POST /api/should-cost
export async function createShouldCost(req: Request, res: Response): Promise<void> {
  const dto = req.body as CreateShouldCostDto;

  // Determine next version for this part
  const versionResult = await pool.query(
    `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
     FROM should_cost_header WHERE part_id = $1`,
    [dto.partId]
  );
  const nextVersion: number = versionResult.rows[0].next_version;

  const totalCost = dto.breakdown.reduce((sum, b) => sum + (b.value ?? 0), 0);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const headerResult = await client.query(
      `INSERT INTO should_cost_header
         (part_id, version, status, annual_volume, currency, total_cost, notes, created_by)
       VALUES ($1, $2, 'draft', $3, $4, $5, $6, $7)
       RETURNING *`,
      [dto.partId, nextVersion, dto.annualVolume, dto.currency ?? 'USD', totalCost, dto.notes, req.user?.sub]
    );
    const header = headerResult.rows[0];

    for (const item of dto.breakdown) {
      await client.query(
        `INSERT INTO should_cost_breakdown
           (should_cost_header_id, cost_element, category, value, basis, notes, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [header.id, item.costElement, item.category, item.value, item.basis, item.notes, item.sortOrder ?? 0]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ header, breakdown: dto.breakdown });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('createShouldCost error', err);
    res.status(500).json({ error: 'Failed to create Should-Cost' });
  } finally {
    client.release();
  }
}

// PATCH /api/should-cost/:id/status
export async function updateShouldCostStatus(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { status } = req.body as { status: string };
  const allowed = ['draft', 'published', 'archived'];
  if (!allowed.includes(status)) {
    res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
    return;
  }

  const { rows } = await pool.query(
    `UPDATE should_cost_header SET status = $1, updated_at = NOW()
     WHERE id = $2 RETURNING *`,
    [status, id]
  );
  if (rows.length === 0) {
    res.status(404).json({ error: 'Should-Cost not found' });
    return;
  }
  res.json(rows[0]);
}
