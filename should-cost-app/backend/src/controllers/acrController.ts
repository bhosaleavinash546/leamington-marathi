import { Request, Response } from 'express';
import pool from '../db/pool';
import { writeAudit } from '../middleware/auditLog';

// GET /api/acr
// List all ACR targets. Optional query params: ?year=&supplierId=&partId=
// Joins with part_master and supplier for display names.
export async function listAcrTargets(req: Request, res: Response): Promise<void> {
  const { year, supplierId, partId } = req.query as {
    year?: string;
    supplierId?: string;
    partId?: string;
  };

  const conditions: string[] = [];
  const params: unknown[] = [];

  const add = (expr: string, val: unknown) => {
    params.push(val);
    conditions.push(expr.replace('?', `$${params.length}`));
  };

  if (year)       add('a.target_year = ?',  Number(year));
  if (supplierId) add('a.supplier_id = ?',  Number(supplierId));
  if (partId)     add('a.part_id = ?',      Number(partId));

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const { rows } = await pool.query(
      `SELECT
         a.*,
         p.part_number,
         p.description                AS part_description,
         s.name                       AS supplier_name,
         u.full_name                  AS created_by_name,
         -- Derived fields for convenience
         CASE
           WHEN a.base_price IS NOT NULL AND a.base_price > 0
           THEN ROUND(((a.base_price - COALESCE(a.agreed_price, a.target_price, a.base_price))
                       / a.base_price) * 100, 2)
           ELSE NULL
         END                          AS effective_reduction_pct
       FROM acr_target a
       LEFT JOIN part_master p ON p.id = a.part_id
       LEFT JOIN supplier    s ON s.id = a.supplier_id
       LEFT JOIN "user"      u ON u.id = a.created_by
       ${where}
       ORDER BY a.target_year DESC, s.name ASC, p.part_number ASC`,
      params
    );
    res.json(rows);
  } catch (err) {
    const pg = err as { code?: string };
    if (pg.code === '42P01' || pg.code === '42703') { res.json([]); return; }
    console.error('listAcrTargets error:', err);
    res.status(500).json({ error: 'Failed to retrieve ACR targets' });
  }
}

// GET /api/acr/summary
// Totals by year: counts, target vs actual savings.
export async function acrSummary(_req: Request, res: Response): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT
         a.target_year                                                            AS year,
         COUNT(*)                                                                 AS total_targets,
         COUNT(*) FILTER (WHERE a.status = 'agreed')                             AS achieved,
         COUNT(*) FILTER (WHERE a.status = 'missed')                             AS missed,
         COUNT(*) FILTER (WHERE a.status = 'open')                               AS open,
         -- Target saving = (base_price - target_price) × annual_volume
         -- Where annual_volume is sourced from the linked part's should_cost_header if available
         COALESCE(
           SUM(
             CASE
               WHEN a.base_price IS NOT NULL AND a.target_price IS NOT NULL
               THEN (a.base_price - a.target_price)
                    * COALESCE(sch.annual_volume, 10000)
               ELSE 0
             END
           ), 0
         )                                                                        AS total_target_saving,
         -- Actual saving = (base_price - agreed_price) × annual_volume, only for agreed targets
         COALESCE(
           SUM(
             CASE
               WHEN a.status = 'agreed'
                    AND a.base_price IS NOT NULL
                    AND a.agreed_price IS NOT NULL
               THEN (a.base_price - a.agreed_price)
                    * COALESCE(sch.annual_volume, 10000)
               ELSE 0
             END
           ), 0
         )                                                                        AS total_actual_saving
       FROM acr_target a
       LEFT JOIN (
         -- Pick the latest published or draft should_cost_header per part
         SELECT DISTINCT ON (part_id)
           part_id,
           annual_volume
         FROM should_cost_header
         ORDER BY part_id, version DESC
       ) sch ON sch.part_id = a.part_id
       GROUP BY a.target_year
       ORDER BY a.target_year DESC`
    );
    res.json(rows);
  } catch (err) {
    const pg = err as { code?: string };
    if (pg.code === '42P01' || pg.code === '42703') { res.json([]); return; }
    console.error('acrSummary error:', err);
    res.status(500).json({ error: 'Failed to retrieve ACR summary' });
  }
}

// POST /api/acr
// Create a new ACR target.
export async function createAcrTarget(req: Request, res: Response): Promise<void> {
  const {
    part_id,
    supplier_id,
    target_year,
    base_price,
    base_year,
    target_reduction_pct,
    target_price,
    currency,
    notes,
  } = req.body as {
    part_id?: number;
    supplier_id?: number;
    target_year: number;
    base_price?: number;
    base_year?: number;
    target_reduction_pct: number;
    target_price?: number;
    currency?: string;
    notes?: string;
  };

  if (!target_year || target_reduction_pct === undefined) {
    res.status(400).json({ error: 'target_year and target_reduction_pct are required' });
    return;
  }

  // Auto-calculate target_price from base_price if not provided
  const derivedTargetPrice =
    target_price ??
    (base_price != null
      ? parseFloat((base_price * (1 - target_reduction_pct / 100)).toFixed(4))
      : null);

  try {
    const { rows } = await pool.query(
      `INSERT INTO acr_target
         (part_id, supplier_id, target_year, base_price, base_year,
          target_reduction_pct, target_price, currency, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        part_id ?? null,
        supplier_id ?? null,
        target_year,
        base_price ?? null,
        base_year ?? null,
        target_reduction_pct,
        derivedTargetPrice,
        currency ?? 'GBP',
        notes ?? null,
        req.user?.sub ?? null,
      ]
    );
    const created = rows[0];
    writeAudit(req.user?.sub, 'CREATE', 'acr_target', created.id, req.body, req.ip).catch(() => {});
    res.status(201).json(created);
  } catch (err) {
    console.error('createAcrTarget error:', err);
    res.status(500).json({ error: 'Failed to create ACR target' });
  }
}

// PATCH /api/acr/:id
// Partial update: agreed_price, status, actual_reduction_pct, notes.
export async function updateAcrTarget(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { agreed_price, status, actual_reduction_pct, notes, target_price, target_reduction_pct } =
    req.body as {
      agreed_price?: number;
      status?: string;
      actual_reduction_pct?: number;
      notes?: string;
      target_price?: number;
      target_reduction_pct?: number;
    };

  const sets: string[] = [];
  const params: unknown[] = [];

  const add = (col: string, val: unknown) => {
    if (val !== undefined) {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    }
  };

  add('agreed_price',          agreed_price);
  add('status',                status);
  add('actual_reduction_pct',  actual_reduction_pct);
  add('notes',                 notes);
  add('target_price',          target_price);
  add('target_reduction_pct',  target_reduction_pct);

  if (sets.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  params.push(new Date());
  sets.push(`updated_at = $${params.length}`);
  params.push(id);

  try {
    const { rows } = await pool.query(
      `UPDATE acr_target SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'ACR target not found' });
      return;
    }
    const updated = rows[0];
    writeAudit(req.user?.sub, 'UPDATE', 'acr_target', updated.id, req.body, req.ip).catch(() => {});
    res.json(updated);
  } catch (err) {
    console.error('updateAcrTarget error:', err);
    res.status(500).json({ error: 'Failed to update ACR target' });
  }
}

// DELETE /api/acr/:id
export async function deleteAcrTarget(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    const { rowCount } = await pool.query(`DELETE FROM acr_target WHERE id = $1`, [id]);
    if (rowCount === 0) {
      res.status(404).json({ error: 'ACR target not found' });
      return;
    }
    writeAudit(req.user?.sub, 'DELETE', 'acr_target', id, {}, req.ip).catch(() => {});
    res.status(204).end();
  } catch (err) {
    console.error('deleteAcrTarget error:', err);
    res.status(500).json({ error: 'Failed to delete ACR target' });
  }
}
