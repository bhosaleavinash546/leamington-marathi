import { Request, Response } from 'express';
import pool from '../db/pool';

export async function listPrograms(req: Request, res: Response) {
  try {
    const { rows } = await pool.query<{
      id: number; code: string; name: string; description: string;
      model_year: number; platform: string; segment: string;
      is_active: boolean; part_count: string;
    }>(`
      SELECT vp.*,
             COUNT(pm.id)::TEXT AS part_count
      FROM   vehicle_program vp
      LEFT JOIN part_master pm ON pm.program_id = vp.id
      WHERE  vp.is_active = TRUE
      GROUP BY vp.id
      ORDER BY vp.code
    `);
    res.json(rows);
  } catch (err) {
    console.error('listPrograms', err);
    res.status(500).json({ error: 'Failed to load programs' });
  }
}

export async function getProgram(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT vp.*,
              COUNT(DISTINCT pm.id)::TEXT                           AS part_count,
              COUNT(DISTINCT sch.id) FILTER (WHERE sch.status='published')::TEXT AS sc_count,
              COUNT(DISTINCT sqh.id)::TEXT                          AS quote_count
       FROM   vehicle_program vp
       LEFT JOIN part_master          pm  ON pm.program_id  = vp.id
       LEFT JOIN should_cost_header   sch ON sch.program_id = vp.id
       LEFT JOIN supplier_quote_header sqh ON sqh.program_id = vp.id
       WHERE  vp.id = $1
       GROUP BY vp.id`,
      [id],
    );
    if (!rows.length) return res.status(404).json({ error: 'Program not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('getProgram', err);
    res.status(500).json({ error: 'Failed to load program' });
  }
}

export async function listPartsByProgram(req: Request, res: Response) {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT pm.id, pm.part_number, pm.description, pm.commodity,
              vs.name  AS system_name,
              vss.name AS subsystem_name,
              vc.name  AS component_name,
              (SELECT COUNT(*) FROM should_cost_header   WHERE part_id = pm.id AND status = 'published') AS sc_count,
              (SELECT COUNT(*) FROM current_price_header WHERE part_id = pm.id)                           AS cp_count,
              (SELECT COUNT(*) FROM supplier_quote_header WHERE part_id = pm.id)                          AS quote_count
       FROM   part_master pm
       LEFT JOIN vehicle_component  vc  ON vc.id  = pm.component_id
       LEFT JOIN vehicle_subsystem  vss ON vss.id = pm.subsystem_id
       LEFT JOIN vehicle_system     vs  ON vs.id  = pm.system_id
       WHERE  pm.program_id = $1
       ORDER BY vs.name, vss.name, pm.part_number`,
      [id],
    );
    res.json(rows);
  } catch (err) {
    console.error('listPartsByProgram', err);
    res.status(500).json({ error: 'Failed to load parts' });
  }
}
