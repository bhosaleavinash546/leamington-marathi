import { Request, Response } from 'express';
import pool from '../db/pool';
import { updateTodaysPrices } from '../services/commodityPriceService';

// GET /api/commodity-prices
// List all entries, optional ?material= filter (matches material_name ILIKE).
// Returns latest price per material when no filter is supplied.
export async function listCommodityPrices(req: Request, res: Response): Promise<void> {
  const { material } = req.query as { material?: string };
  try {
    const params: unknown[] = [];
    const where = material
      ? (params.push(`%${material}%`), `WHERE cp.material_name ILIKE $1`)
      : '';

    const { rows } = await pool.query(
      `SELECT
         cp.id,
         cp.material_name,
         cp.material_code,
         cp.price_per_unit,
         cp.unit,
         cp.currency,
         cp.price_date,
         cp.source,
         cp.notes,
         cp.created_at,
         u.full_name AS created_by_name
       FROM commodity_price cp
       LEFT JOIN "user" u ON u.id = cp.created_by
       ${where}
       ORDER BY cp.material_name ASC, cp.price_date DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    const pg = err as { code?: string };
    if (pg.code === '42P01' || pg.code === '42703') { res.json([]); return; }
    console.error('listCommodityPrices error:', err);
    res.status(500).json({ error: 'Failed to retrieve commodity prices' });
  }
}

// GET /api/commodity-prices/summary
// Returns the latest price per material with change_pct vs prior entry.
export async function commodityPriceSummary(_req: Request, res: Response): Promise<void> {
  try {
    const { rows } = await pool.query(
      `WITH latest AS (
         SELECT DISTINCT ON (material_code)
           id, material_name, material_code, price_per_unit, unit, currency, price_date, source
         FROM commodity_price
         WHERE material_code IS NOT NULL
         ORDER BY material_code, price_date DESC, id DESC
       ),
       prev AS (
         SELECT DISTINCT ON (cp.material_code)
           cp.material_code, cp.price_per_unit AS prev_price
         FROM commodity_price cp
         JOIN latest l ON l.material_code = cp.material_code
         WHERE cp.price_date < l.price_date
         ORDER BY cp.material_code, cp.price_date DESC, cp.id DESC
       )
       SELECT
         l.id,
         l.material_name,
         l.material_code,
         l.price_per_unit                                           AS latest_price,
         l.unit,
         l.currency,
         l.price_date                                               AS latest_date,
         l.source,
         p.prev_price,
         CASE WHEN p.prev_price IS NOT NULL AND p.prev_price > 0
              THEN ROUND((l.price_per_unit - p.prev_price) / p.prev_price * 100, 2)
              ELSE NULL END                                         AS change_pct
       FROM latest l
       LEFT JOIN prev p ON p.material_code = l.material_code
       ORDER BY l.material_name ASC`
    );
    res.json(rows);
  } catch (err) {
    const pg = err as { code?: string };
    if (pg.code === '42P01' || pg.code === '42703') { res.json([]); return; }
    console.error('commodityPriceSummary error:', err);
    res.status(500).json({ error: 'Failed to retrieve commodity price summary' });
  }
}

// POST /api/commodity-prices/refresh
// Trigger an immediate daily price update for all tracked materials.
export async function refreshCommodityPrices(_req: Request, res: Response): Promise<void> {
  try {
    const result = await updateTodaysPrices();
    res.json({ success: true, ...result, refreshed_at: new Date().toISOString() });
  } catch (err) {
    console.error('refreshCommodityPrices error:', err);
    res.status(500).json({ error: 'Price refresh failed' });
  }
}

// GET /api/commodity-prices/history/:materialCode
// Price history for a specific material_code over the last 24 months.
export async function commodityPriceHistory(req: Request, res: Response): Promise<void> {
  const { materialCode } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT
         cp.id,
         cp.material_name,
         cp.material_code,
         cp.price_per_unit,
         cp.unit,
         cp.currency,
         cp.price_date,
         cp.source,
         cp.notes,
         cp.created_at
       FROM commodity_price cp
       WHERE cp.material_code = $1
         AND cp.price_date >= CURRENT_DATE - INTERVAL '24 months'
       ORDER BY cp.price_date ASC`,
      [materialCode]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'No price history found for material code: ' + materialCode });
      return;
    }
    res.json(rows);
  } catch (err) {
    const pg = err as { code?: string };
    if (pg.code === '42P01' || pg.code === '42703') { res.json([]); return; }
    console.error('commodityPriceHistory error:', err);
    res.status(500).json({ error: 'Failed to retrieve commodity price history' });
  }
}

// POST /api/commodity-prices
// Create a new commodity price entry.
export async function createCommodityPrice(req: Request, res: Response): Promise<void> {
  const {
    material_name,
    material_code,
    price_per_unit,
    unit,
    currency,
    price_date,
    source,
    notes,
  } = req.body as {
    material_name: string;
    material_code?: string;
    price_per_unit: number;
    unit?: string;
    currency?: string;
    price_date: string;
    source?: string;
    notes?: string;
  };

  if (!material_name || price_per_unit === undefined || !price_date) {
    res.status(400).json({ error: 'material_name, price_per_unit and price_date are required' });
    return;
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO commodity_price
         (material_name, material_code, price_per_unit, unit, currency, price_date, source, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        material_name,
        material_code ?? null,
        price_per_unit,
        unit ?? 'per kg',
        currency ?? 'GBP',
        price_date,
        source ?? 'Manual entry',
        notes ?? null,
        req.user?.sub ?? null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('createCommodityPrice error:', err);
    res.status(500).json({ error: 'Failed to create commodity price entry' });
  }
}
