import { Request, Response } from 'express';
import pool from '../db/pool';

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
    console.error('listCommodityPrices error:', err);
    res.status(500).json({ error: 'Failed to retrieve commodity prices' });
  }
}

// GET /api/commodity-prices/summary
// Returns the single latest price per unique material_name.
export async function commodityPriceSummary(_req: Request, res: Response): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (cp.material_name)
         cp.id,
         cp.material_name,
         cp.material_code,
         cp.price_per_unit,
         cp.unit,
         cp.currency,
         cp.price_date,
         cp.source
       FROM commodity_price cp
       ORDER BY cp.material_name ASC, cp.price_date DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('commodityPriceSummary error:', err);
    res.status(500).json({ error: 'Failed to retrieve commodity price summary' });
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
