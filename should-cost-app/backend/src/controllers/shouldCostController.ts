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

  const breakdownIds = breakdownResult.rows.map((b) => b.id);
  let subitems: Array<{ breakdown_id: number }> = [];
  if (breakdownIds.length) {
    const subRes = await pool.query(
      `SELECT * FROM should_cost_subitem WHERE breakdown_id = ANY($1) ORDER BY breakdown_id, sort_order`,
      [breakdownIds]
    );
    subitems = subRes.rows;
  }
  const breakdown = breakdownResult.rows.map((b) => ({
    ...b,
    subitems: subitems.filter((s) => s.breakdown_id === b.id),
  }));

  // Version audit trail (P5) — table may not exist on older database volumes
  let auditRows: unknown[] = [];
  try {
    const auditRes = await pool.query(
      `SELECT a.*, u.full_name AS changed_by_name
       FROM should_cost_header_audit a
       LEFT JOIN "user" u ON u.id = a.changed_by
       WHERE a.should_cost_header_id = $1
       ORDER BY a.changed_at DESC`,
      [id]
    );
    auditRows = auditRes.rows;
  } catch {
    // table not yet created on this database volume
  }

  res.json({ header: headerResult.rows[0], breakdown, auditTrail: auditRows });
}

// POST /api/should-cost
export async function createShouldCost(req: Request, res: Response): Promise<void> {
  const dto = req.body as CreateShouldCostDto;

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

    // Audit entry (P5) — best-effort, table may not exist on older volumes
    try {
      await client.query(
        `INSERT INTO should_cost_header_audit
           (should_cost_header_id, changed_by, change_type, new_total_cost, new_status)
         VALUES ($1, $2, 'created', $3, 'draft')`,
        [header.id, req.user?.sub ?? null, totalCost]
      );
    } catch { /* table not yet created on this database volume */ }

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

// PATCH /api/should-cost/:id/process-params
export async function updateShouldCostProcessParams(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const {
    part_weight_kg, material_code, manufacturing_country, machine_type,
    cycle_time_sec, labour_rate_hr, machine_rate_hr, scrap_rate_pct,
    tooling_cost_total, tooling_life_units,
  } = req.body as Record<string, unknown>;

  try {
    const { rows, rowCount } = await pool.query(
      `UPDATE should_cost_header
       SET part_weight_kg         = $2,
           material_code          = $3,
           manufacturing_country  = $4,
           machine_type           = $5,
           cycle_time_sec         = $6,
           labour_rate_hr         = $7,
           machine_rate_hr        = $8,
           scrap_rate_pct         = $9,
           tooling_cost_total     = $10,
           tooling_life_units     = $11,
           updated_at             = NOW()
       WHERE id = $1 RETURNING *`,
      [
        id,
        part_weight_kg ?? null, material_code ?? null, manufacturing_country ?? null,
        machine_type ?? null, cycle_time_sec ?? null, labour_rate_hr ?? null,
        machine_rate_hr ?? null, scrap_rate_pct ?? null,
        tooling_cost_total ?? null, tooling_life_units ?? null,
      ]
    );
    if (rowCount === 0) { res.status(404).json({ error: 'Should-Cost not found' }); return; }
    res.json(rows[0]);
  } catch (err) {
    console.error('updateShouldCostProcessParams error', err);
    res.status(500).json({ error: 'Failed to update process parameters' });
  }
}

// PATCH /api/should-cost/:id/status
export async function updateShouldCostStatus(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { status, notes } = req.body as { status: string; notes?: string };
  const allowed = ['draft', 'published', 'archived'];
  if (!allowed.includes(status)) {
    res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const prev = await client.query(
      `SELECT status, total_cost FROM should_cost_header WHERE id = $1`,
      [id]
    );
    if (prev.rowCount === 0) { res.status(404).json({ error: 'Should-Cost not found' }); return; }

    const { rows } = await client.query(
      `UPDATE should_cost_header SET status = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [status, id]
    );

    // Audit entry (P5) — best-effort, table may not exist on older volumes
    try {
      await client.query(
        `INSERT INTO should_cost_header_audit
           (should_cost_header_id, changed_by, change_type,
            old_status, new_status, old_total_cost, new_total_cost, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $6, $7)`,
        [
          id, req.user?.sub ?? null,
          status === 'published' ? 'published' : status === 'archived' ? 'archived' : 'updated',
          prev.rows[0].status, status,
          prev.rows[0].total_cost,
          notes ?? null,
        ]
      );
    } catch { /* table not yet created on this database volume */ }

    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('updateShouldCostStatus error', err);
    res.status(500).json({ error: 'Failed to update status' });
  } finally {
    client.release();
  }
}
