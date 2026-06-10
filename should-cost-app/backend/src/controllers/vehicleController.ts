import { Request, Response } from 'express';
import pool from '../db/pool';

// GET /api/vehicle/systems
export async function getSystems(_req: Request, res: Response): Promise<void> {
  const { rows } = await pool.query(
    `SELECT * FROM vehicle_system ORDER BY sort_order`
  );
  res.json(rows);
}

// GET /api/vehicle/subsystems?systemId=
export async function getSubsystems(req: Request, res: Response): Promise<void> {
  const { systemId } = req.query;
  if (!systemId) { res.status(400).json({ error: 'systemId required' }); return; }
  const { rows } = await pool.query(
    `SELECT * FROM vehicle_subsystem WHERE system_id = $1 ORDER BY sort_order`,
    [systemId]
  );
  res.json(rows);
}

// GET /api/vehicle/components?subsystemId=
export async function getComponents(req: Request, res: Response): Promise<void> {
  const { subsystemId } = req.query;
  if (!subsystemId) { res.status(400).json({ error: 'subsystemId required' }); return; }
  const { rows } = await pool.query(
    `SELECT * FROM vehicle_component WHERE subsystem_id = $1 ORDER BY sort_order`,
    [subsystemId]
  );
  res.json(rows);
}

// GET /api/vehicle/parts?systemId=&subsystemId=&componentId=
export async function getFilteredParts(req: Request, res: Response): Promise<void> {
  const { systemId, subsystemId, componentId } = req.query;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (componentId) { params.push(componentId); conditions.push(`p.component_id = $${params.length}`); }
  else if (subsystemId) { params.push(subsystemId); conditions.push(`p.subsystem_id = $${params.length}`); }
  else if (systemId) { params.push(systemId); conditions.push(`p.system_id = $${params.length}`); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT p.*,
            vs.name AS system_name, vsub.name AS subsystem_name, vc.name AS component_name
     FROM part_master p
     LEFT JOIN vehicle_system    vs   ON vs.id   = p.system_id
     LEFT JOIN vehicle_subsystem vsub ON vsub.id = p.subsystem_id
     LEFT JOIN vehicle_component vc   ON vc.id   = p.component_id
     ${where}
     ORDER BY p.part_number`,
    params
  );
  res.json(rows);
}
