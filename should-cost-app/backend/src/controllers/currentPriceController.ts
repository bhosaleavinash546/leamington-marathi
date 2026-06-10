import { Request, Response } from 'express';
import pool from '../db/pool';

export async function getLatestCurrentPrice(req: Request, res: Response) {
  const { partId } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (cph.part_id)
              cph.id, cph.part_id, cph.version, cph.total_cost, cph.currency,
              cph.supplier_name, cph.annual_volume, cph.effective_date, cph.notes,
              cph.status, cph.created_at
       FROM   current_price_header cph
       WHERE  cph.part_id = $1
       ORDER  BY cph.part_id, cph.version DESC`,
      [partId],
    );
    if (!rows.length) return res.status(404).json({ error: 'No current price found for this part' });

    const header = rows[0];
    const { rows: breakdown } = await pool.query(
      `SELECT id, cost_element, category, value, basis, notes, sort_order
       FROM   current_price_breakdown
       WHERE  current_price_header_id = $1
       ORDER  BY sort_order, id`,
      [header.id],
    );
    res.json({ ...header, breakdown });
  } catch (err) {
    console.error('getLatestCurrentPrice', err);
    res.status(500).json({ error: 'Failed to load current price' });
  }
}

export async function createCurrentPrice(req: Request, res: Response) {
  const {
    part_id, program_id, total_cost, currency = 'USD',
    supplier_name, annual_volume, effective_date, notes,
    breakdown = [],
  } = req.body as {
    part_id: number; program_id?: number; total_cost: number; currency?: string;
    supplier_name?: string; annual_volume?: number; effective_date?: string;
    notes?: string;
    breakdown: { cost_element: string; category?: string; value: number; basis?: string; sort_order?: number; }[];
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Supersede previous versions
    await client.query(
      `UPDATE current_price_header SET status = 'superseded' WHERE part_id = $1`,
      [part_id],
    );

    // Get next version
    const { rows: vr } = await client.query(
      `SELECT COALESCE(MAX(version), 0) + 1 AS next FROM current_price_header WHERE part_id = $1`,
      [part_id],
    );
    const version = vr[0].next;

    const { rows: hdr } = await client.query(
      `INSERT INTO current_price_header
         (part_id, program_id, version, total_cost, currency, supplier_name, annual_volume, effective_date, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [part_id, program_id ?? null, version, total_cost, currency,
       supplier_name ?? null, annual_volume ?? null, effective_date ?? null,
       notes ?? null, (req as any).user?.id ?? null],
    );
    const headerId = hdr[0].id;

    for (const [i, b] of breakdown.entries()) {
      await client.query(
        `INSERT INTO current_price_breakdown
           (current_price_header_id, cost_element, category, value, basis, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [headerId, b.cost_element, b.category ?? 'UNCATEGORIZED', b.value, b.basis ?? null, b.sort_order ?? i],
      );
    }

    await client.query('COMMIT');
    res.status(201).json(hdr[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('createCurrentPrice', err);
    res.status(500).json({ error: 'Failed to save current price' });
  } finally {
    client.release();
  }
}

export async function listCurrentPrices(req: Request, res: Response) {
  const { programId, partId } = req.query;
  try {
    const conditions: string[] = ["cph.status = 'active'"];
    const params: unknown[] = [];
    if (programId) { params.push(programId); conditions.push(`cph.program_id = $${params.length}`); }
    if (partId)    { params.push(partId);    conditions.push(`cph.part_id = $${params.length}`); }

    const { rows } = await pool.query(
      `SELECT cph.id, cph.part_id, cph.version, cph.total_cost, cph.currency,
              cph.supplier_name, cph.effective_date, cph.status,
              pm.part_number, pm.description
       FROM   current_price_header cph
       JOIN   part_master pm ON pm.id = cph.part_id
       WHERE  ${conditions.join(' AND ')}
       ORDER  BY pm.part_number`,
      params,
    );
    res.json(rows);
  } catch (err) {
    console.error('listCurrentPrices', err);
    res.status(500).json({ error: 'Failed to list current prices' });
  }
}
