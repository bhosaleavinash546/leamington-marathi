import { Request, Response } from 'express';
import pool from '../db/pool';
import { CreateQuoteDto } from '../models/types';

// GET /api/quotes?partId=&supplierId=&status=
export async function listQuotes(req: Request, res: Response): Promise<void> {
  const { partId, supplierId, status } = req.query;
  const conditions: string[] = [];
  const params: unknown[] = [];

  // Supplier-role users are restricted to their own quotes by the isolateSupplier middleware,
  // but we also enforce it here as defence-in-depth.
  if (req.user?.role === 'supplier') {
    params.push(req.user.supplierId);
    conditions.push(`h.supplier_id = $${params.length}`);
  } else if (supplierId) {
    params.push(supplierId);
    conditions.push(`h.supplier_id = $${params.length}`);
  }

  if (partId)  { params.push(partId);  conditions.push(`h.part_id = $${params.length}`); }
  if (status)  { params.push(status);  conditions.push(`h.status = $${params.length}`); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT h.*, p.part_number, p.description AS part_description,
            s.name AS supplier_name, s.country AS supplier_country
     FROM supplier_quote_header h
     JOIN part_master p ON p.id = h.part_id
     JOIN supplier s ON s.id = h.supplier_id
     ${where}
     ORDER BY h.part_id, h.supplier_id, h.version DESC`,
    params
  );
  res.json(rows);
}

// GET /api/quotes/suppliers — list active suppliers (for internal quote entry)
export async function listSuppliers(_req: Request, res: Response): Promise<void> {
  const { rows } = await pool.query(
    `SELECT id, code, name, country FROM supplier
     WHERE is_active = TRUE ORDER BY name`
  );
  res.json(rows);
}

// GET /api/quotes/:id
export async function getQuote(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const headerResult = await pool.query(
    `SELECT h.*, p.part_number, s.name AS supplier_name
     FROM supplier_quote_header h
     JOIN part_master p ON p.id = h.part_id
     JOIN supplier s ON s.id = h.supplier_id
     WHERE h.id = $1`,
    [id]
  );
  if (headerResult.rowCount === 0) {
    res.status(404).json({ error: 'Quote not found' });
    return;
  }

  const header = headerResult.rows[0];

  // Suppliers may only read their own quote
  if (req.user?.role === 'supplier' && header.supplier_id !== req.user.supplierId) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  const breakdownResult = await pool.query(
    `SELECT * FROM supplier_quote_breakdown WHERE supplier_quote_header_id = $1 ORDER BY sort_order`,
    [id]
  );

  res.json({ header, breakdown: breakdownResult.rows });
}

// POST /api/quotes
export async function createQuote(req: Request, res: Response): Promise<void> {
  const dto = req.body as CreateQuoteDto;

  // Suppliers can only submit quotes for themselves
  if (req.user?.role === 'supplier' && dto.supplierId !== req.user.supplierId) {
    res.status(403).json({ error: 'Suppliers may only submit their own quotes' });
    return;
  }

  // Next version for this part + supplier combination
  const versionResult = await pool.query(
    `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
     FROM supplier_quote_header WHERE part_id = $1 AND supplier_id = $2`,
    [dto.partId, dto.supplierId]
  );
  const nextVersion: number = versionResult.rows[0].next_version;

  const totalPrice = dto.breakdown.reduce((sum, b) => sum + (b.value ?? 0), 0);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const headerResult = await client.query(
      `INSERT INTO supplier_quote_header
         (part_id, supplier_id, version, status, rfq_number, annual_volume, currency,
          total_price, validity_date, submitted_at, submitted_by)
       VALUES ($1, $2, $3, 'submitted', $4, $5, $6, $7, $8, NOW(), $9)
       RETURNING *`,
      [
        dto.partId, dto.supplierId, nextVersion, dto.rfqNumber,
        dto.annualVolume, dto.currency ?? 'USD', totalPrice,
        dto.validityDate ?? null, req.user?.sub,
      ]
    );
    const header = headerResult.rows[0];

    for (const item of dto.breakdown) {
      await client.query(
        `INSERT INTO supplier_quote_breakdown
           (supplier_quote_header_id, cost_element, category, value, basis, notes, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [header.id, item.costElement, item.category, item.value, item.basis, item.notes, item.sortOrder ?? 0]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ header, breakdown: dto.breakdown });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('createQuote error', err);
    res.status(500).json({ error: 'Failed to create Quote' });
  } finally {
    client.release();
  }
}

// PATCH /api/quotes/:id/status  (internal users only)
export async function updateQuoteStatus(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { status } = req.body as { status: string };
  const allowed = ['submitted', 'accepted', 'rejected', 'negotiating'];
  if (!allowed.includes(status)) {
    res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
    return;
  }

  const { rows } = await pool.query(
    `UPDATE supplier_quote_header SET status = $1, updated_at = NOW()
     WHERE id = $2 RETURNING *`,
    [status, id]
  );
  if (rows.length === 0) {
    res.status(404).json({ error: 'Quote not found' });
    return;
  }
  res.json(rows[0]);
}
