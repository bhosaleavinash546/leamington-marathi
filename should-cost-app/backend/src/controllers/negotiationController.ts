import { Request, Response } from 'express';
import pool from '../db/pool';

// GET /api/negotiations
export async function listNegotiations(req: Request, res: Response): Promise<void> {
  const { status } = req.query;
  const params: unknown[] = [];
  let where = '';
  if (status) { params.push(status); where = `WHERE nt.status = $1`; }

  try {
    const { rows } = await pool.query(
      `SELECT
         nt.*,
         p.part_number,
         p.description    AS part_description,
         s.name           AS supplier_name,
         u.full_name      AS owner_name
       FROM negotiation_target nt
       JOIN part_master p ON p.id = nt.part_id
       JOIN supplier    s ON s.id = nt.supplier_id
       LEFT JOIN "user" u ON u.id = nt.owner_id
       ${where}
       ORDER BY
         CASE nt.status WHEN 'open' THEN 0 WHEN 'stalled' THEN 1 WHEN 'agreed' THEN 2 ELSE 3 END,
         nt.target_date NULLS LAST`,
      params
    );
    res.json(rows);
  } catch (err) {
    const pg = err as { code?: string };
    if (pg.code === '42P01' || pg.code === '42703') { res.json([]); return; }
    console.error('listNegotiations error:', err);
    res.status(500).json({ error: 'Failed to retrieve negotiations' });
  }
}

// GET /api/negotiations/:id
export async function getNegotiation(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { rows } = await pool.query(
    `SELECT
       nt.*,
       p.part_number,
       p.description AS part_description,
       s.name        AS supplier_name,
       u.full_name   AS owner_name
     FROM negotiation_target nt
     JOIN part_master p ON p.id = nt.part_id
     JOIN supplier    s ON s.id = nt.supplier_id
     LEFT JOIN "user" u ON u.id = nt.owner_id
     WHERE nt.id = $1`,
    [id]
  );
  if (rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(rows[0]);
}

// POST /api/negotiations
export async function createNegotiation(req: Request, res: Response): Promise<void> {
  const {
    part_id, supplier_id, target_price, current_price, should_cost,
    currency, target_date, notes, owner_id,
  } = req.body as {
    part_id: number; supplier_id: number; target_price: number;
    current_price?: number; should_cost?: number; currency?: string;
    target_date?: string; notes?: string; owner_id?: string;
  };

  if (!part_id || !supplier_id || !target_price) {
    res.status(400).json({ error: 'part_id, supplier_id and target_price are required' });
    return;
  }

  const { rows } = await pool.query(
    `INSERT INTO negotiation_target
       (part_id, supplier_id, target_price, current_price, should_cost,
        currency, target_date, notes, owner_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      part_id, supplier_id, target_price,
      current_price ?? null, should_cost ?? null,
      currency ?? 'GBP', target_date ?? null,
      notes ?? null, owner_id ?? null, req.user?.sub ?? null,
    ]
  );
  res.status(201).json(rows[0]);
}

// PATCH /api/negotiations/:id
export async function updateNegotiation(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const {
    status, target_price, current_price, should_cost, target_date,
    notes, agreed_price, owner_id,
  } = req.body as {
    status?: string; target_price?: number; current_price?: number;
    should_cost?: number; target_date?: string; notes?: string;
    agreed_price?: number; owner_id?: string;
  };

  const sets: string[] = [];
  const params: unknown[] = [];

  const add = (col: string, val: unknown) => {
    if (val !== undefined) { params.push(val); sets.push(`${col} = $${params.length}`); }
  };

  add('status',        status);
  add('target_price',  target_price);
  add('current_price', current_price);
  add('should_cost',   should_cost);
  add('target_date',   target_date ?? null);
  add('notes',         notes);
  add('agreed_price',  agreed_price);
  add('owner_id',      owner_id);

  if (status === 'agreed' && agreed_price) {
    params.push(new Date());
    sets.push(`agreed_at = $${params.length}`);
  }

  if (sets.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }

  params.push(new Date()); sets.push(`updated_at = $${params.length}`);
  params.push(id);

  const { rows } = await pool.query(
    `UPDATE negotiation_target SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );
  if (rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(rows[0]);
}

// DELETE /api/negotiations/:id
export async function deleteNegotiation(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { rowCount } = await pool.query(`DELETE FROM negotiation_target WHERE id = $1`, [id]);
  if (rowCount === 0) { res.status(404).json({ error: 'Not found' }); return; }
  res.status(204).end();
}

// GET /api/negotiations/summary — pipeline KPIs
export async function negotiationSummary(req: Request, res: Response): Promise<void> {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*)                                           AS total,
       COUNT(*) FILTER (WHERE status = 'open')           AS open,
       COUNT(*) FILTER (WHERE status = 'agreed')         AS agreed,
       COUNT(*) FILTER (WHERE status = 'stalled')        AS stalled,
       COUNT(*) FILTER (WHERE target_date <= NOW() + INTERVAL '7 days' AND status = 'open') AS due_this_week,
       COALESCE(SUM((current_price - target_price) * 12000), 0) AS potential_annual_saving
     FROM negotiation_target`
  );
  res.json(rows[0]);
}
