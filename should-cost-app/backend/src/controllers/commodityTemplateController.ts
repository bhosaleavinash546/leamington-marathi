import { Request, Response } from 'express';
import pool from '../db/pool';

// GET /api/commodity-templates
// Returns all active commodity templates (elements array included).
export async function listCommodityTemplates(req: Request, res: Response): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT id, commodity_name, description, elements, is_active, created_at
       FROM commodity_template
       WHERE is_active = TRUE
       ORDER BY commodity_name ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error('listCommodityTemplates error:', err);
    res.status(500).json({ error: 'Failed to retrieve commodity templates' });
  }
}

// GET /api/commodity-templates/:id
// Returns a single template by id, active or inactive.
export async function getCommodityTemplate(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT id, commodity_name, description, elements, is_active, created_at
       FROM commodity_template
       WHERE id = $1`,
      [id]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: 'Commodity template not found' });
      return;
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('getCommodityTemplate error:', err);
    res.status(500).json({ error: 'Failed to retrieve commodity template' });
  }
}
