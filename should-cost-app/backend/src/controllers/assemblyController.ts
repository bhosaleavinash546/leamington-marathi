import { Request, Response } from 'express';
import pool from '../db/pool';

// GET /api/assembly
// List all assembly headers with program name and line count.
export async function listAssemblies(req: Request, res: Response): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT
         ah.id,
         ah.assembly_number,
         ah.description,
         ah.currency,
         ah.notes,
         ah.created_at,
         ah.updated_at,
         vp.name                  AS program_name,
         vp.code                  AS program_code,
         u.full_name              AS created_by_name,
         COUNT(abl.id)::integer   AS line_count
       FROM assembly_header ah
       LEFT JOIN vehicle_program vp ON vp.id = ah.program_id
       LEFT JOIN "user"          u  ON u.id  = ah.created_by
       LEFT JOIN assembly_bom_line abl ON abl.assembly_header_id = ah.id
       GROUP BY ah.id, vp.name, vp.code, u.full_name
       ORDER BY ah.updated_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('listAssemblies error:', err);
    res.status(500).json({ error: 'Failed to retrieve assemblies' });
  }
}

// GET /api/assembly/:id
// Get assembly header with BOM lines joined to part_master and should_cost_header.
// Computes assembly_total_cost = SUM(should_cost_header.total_cost × quantity).
export async function getAssembly(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    // Header
    const headerResult = await pool.query(
      `SELECT
         ah.*,
         vp.name       AS program_name,
         vp.code       AS program_code,
         u.full_name   AS created_by_name
       FROM assembly_header ah
       LEFT JOIN vehicle_program vp ON vp.id = ah.program_id
       LEFT JOIN "user"          u  ON u.id  = ah.created_by
       WHERE ah.id = $1`,
      [id]
    );

    if (headerResult.rowCount === 0) {
      res.status(404).json({ error: 'Assembly not found' });
      return;
    }

    // BOM lines with enrichment
    const linesResult = await pool.query(
      `SELECT
         abl.id,
         abl.assembly_header_id,
         abl.part_id,
         abl.should_cost_header_id,
         abl.quantity,
         abl.sort_order,
         abl.notes,
         p.part_number,
         p.description                                                          AS part_description,
         p.commodity,
         sch.total_cost                                                         AS unit_should_cost,
         sch.currency                                                           AS should_cost_currency,
         sch.version                                                            AS should_cost_version,
         sch.status                                                             AS should_cost_status,
         ROUND(sch.total_cost * abl.quantity, 4)                               AS line_total_cost
       FROM assembly_bom_line abl
       LEFT JOIN part_master         p   ON p.id   = abl.part_id
       LEFT JOIN should_cost_header  sch ON sch.id = abl.should_cost_header_id
       WHERE abl.assembly_header_id = $1
       ORDER BY abl.sort_order ASC, abl.id ASC`,
      [id]
    );

    // Rolled-up total
    const totalResult = await pool.query(
      `SELECT COALESCE(SUM(sch.total_cost * abl.quantity), 0) AS assembly_total_cost
       FROM assembly_bom_line abl
       JOIN should_cost_header sch ON sch.id = abl.should_cost_header_id
       WHERE abl.assembly_header_id = $1`,
      [id]
    );

    res.json({
      ...headerResult.rows[0],
      assembly_total_cost: totalResult.rows[0]?.assembly_total_cost ?? 0,
      lines: linesResult.rows,
    });
  } catch (err) {
    console.error('getAssembly error:', err);
    res.status(500).json({ error: 'Failed to retrieve assembly' });
  }
}

// POST /api/assembly
// Create a new assembly header.
export async function createAssembly(req: Request, res: Response): Promise<void> {
  const { assembly_number, description, program_id, currency, notes } = req.body as {
    assembly_number: string;
    description?: string;
    program_id?: number;
    currency?: string;
    notes?: string;
  };

  if (!assembly_number) {
    res.status(400).json({ error: 'assembly_number is required' });
    return;
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO assembly_header
         (assembly_number, description, program_id, currency, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        assembly_number,
        description ?? null,
        program_id ?? null,
        currency ?? 'GBP',
        notes ?? null,
        req.user?.sub ?? null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('createAssembly error:', err);
    res.status(500).json({ error: 'Failed to create assembly' });
  }
}

// POST /api/assembly/:id/lines
// Add a BOM line to an assembly.
export async function addAssemblyLine(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { part_id, should_cost_header_id, quantity, sort_order, notes } = req.body as {
    part_id?: number;
    should_cost_header_id?: number;
    quantity?: number;
    sort_order?: number;
    notes?: string;
  };

  if (!part_id && !should_cost_header_id) {
    res.status(400).json({ error: 'At least one of part_id or should_cost_header_id is required' });
    return;
  }

  try {
    // Verify parent exists
    const { rowCount: headerExists } = await pool.query(
      `SELECT 1 FROM assembly_header WHERE id = $1`,
      [id]
    );
    if (headerExists === 0) {
      res.status(404).json({ error: 'Assembly not found' });
      return;
    }

    const { rows } = await pool.query(
      `INSERT INTO assembly_bom_line
         (assembly_header_id, part_id, should_cost_header_id, quantity, sort_order, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        Number(id),
        part_id ?? null,
        should_cost_header_id ?? null,
        quantity ?? 1,
        sort_order ?? 0,
        notes ?? null,
      ]
    );

    // Touch parent updated_at
    await pool.query(
      `UPDATE assembly_header SET updated_at = NOW() WHERE id = $1`,
      [id]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('addAssemblyLine error:', err);
    res.status(500).json({ error: 'Failed to add assembly BOM line' });
  }
}

// DELETE /api/assembly/:id/lines/:lineId
// Remove a specific BOM line.
export async function deleteAssemblyLine(req: Request, res: Response): Promise<void> {
  const { id, lineId } = req.params;
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM assembly_bom_line WHERE id = $1 AND assembly_header_id = $2`,
      [lineId, id]
    );
    if (rowCount === 0) {
      res.status(404).json({ error: 'BOM line not found' });
      return;
    }
    // Touch parent updated_at
    await pool.query(`UPDATE assembly_header SET updated_at = NOW() WHERE id = $1`, [id]);
    res.status(204).end();
  } catch (err) {
    console.error('deleteAssemblyLine error:', err);
    res.status(500).json({ error: 'Failed to delete assembly BOM line' });
  }
}

// DELETE /api/assembly/:id
// Delete entire assembly (cascade removes lines).
export async function deleteAssembly(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM assembly_header WHERE id = $1`,
      [id]
    );
    if (rowCount === 0) {
      res.status(404).json({ error: 'Assembly not found' });
      return;
    }
    res.status(204).end();
  } catch (err) {
    console.error('deleteAssembly error:', err);
    res.status(500).json({ error: 'Failed to delete assembly' });
  }
}
