import { Request, Response } from 'express';
import pool from '../db/pool';

// GET /api/rate-library
// Optional query params: ?process_type=&country=
export async function listRates(req: Request, res: Response): Promise<void> {
  try {
    const { process_type, country } = req.query;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (process_type) {
      params.push(process_type);
      conditions.push(`process_type ILIKE $${params.length}`);
    }
    if (country) {
      params.push(country);
      conditions.push(`country ILIKE $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT * FROM rate_reference ${where} ORDER BY process_type, country`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[rateLibrary] listRates error:', err);
    res.status(500).json({ error: 'Failed to fetch rates' });
  }
}

// POST /api/rate-library
export async function createRate(req: Request, res: Response): Promise<void> {
  try {
    const {
      process_type,
      country,
      labour_rate_hr,
      machine_rate_hr,
      overhead_pct,
      scrap_rate_pct,
      source,
      effective_date,
      notes,
    } = req.body as {
      process_type: string;
      country: string;
      labour_rate_hr: number;
      machine_rate_hr: number;
      overhead_pct?: number;
      scrap_rate_pct?: number;
      source?: string;
      effective_date?: string;
      notes?: string;
    };

    if (!process_type || !country || labour_rate_hr == null || machine_rate_hr == null) {
      res.status(400).json({ error: 'process_type, country, labour_rate_hr and machine_rate_hr are required' });
      return;
    }

    const result = await pool.query(
      `INSERT INTO rate_reference
         (process_type, country, labour_rate_hr, machine_rate_hr, overhead_pct, scrap_rate_pct, source, effective_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        process_type,
        country,
        labour_rate_hr,
        machine_rate_hr,
        overhead_pct ?? 15,
        scrap_rate_pct ?? 2,
        source ?? 'Manual entry',
        effective_date ?? null,
        notes ?? null,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err: unknown) {
    const pg = err as { code?: string };
    if (pg.code === '23505') {
      res.status(409).json({ error: 'Rate for this process_type + country already exists' });
      return;
    }
    console.error('[rateLibrary] createRate error:', err);
    res.status(500).json({ error: 'Failed to create rate' });
  }
}

// PATCH /api/rate-library/:id
export async function updateRate(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const fields = req.body as Record<string, unknown>;
    const allowed = ['process_type', 'country', 'labour_rate_hr', 'machine_rate_hr', 'overhead_pct', 'scrap_rate_pct', 'source', 'effective_date', 'notes'];

    const setClauses: string[] = [];
    const params: unknown[] = [];
    for (const key of allowed) {
      if (key in fields) {
        params.push(fields[key]);
        setClauses.push(`${key} = $${params.length}`);
      }
    }

    if (setClauses.length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    params.push(id);
    const result = await pool.query(
      `UPDATE rate_reference SET ${setClauses.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!result.rowCount) {
      res.status(404).json({ error: 'Rate not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err: unknown) {
    const pg = err as { code?: string };
    if (pg.code === '23505') {
      res.status(409).json({ error: 'Rate for this process_type + country already exists' });
      return;
    }
    console.error('[rateLibrary] updateRate error:', err);
    res.status(500).json({ error: 'Failed to update rate' });
  }
}

// DELETE /api/rate-library/:id
export async function deleteRate(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM rate_reference WHERE id = $1 RETURNING id', [id]);
    if (!result.rowCount) {
      res.status(404).json({ error: 'Rate not found' });
      return;
    }
    res.json({ deleted: true, id: result.rows[0].id });
  } catch (err) {
    console.error('[rateLibrary] deleteRate error:', err);
    res.status(500).json({ error: 'Failed to delete rate' });
  }
}

// GET /api/rate-library/process-types
export async function getProcessTypes(_req: Request, res: Response): Promise<void> {
  try {
    const result = await pool.query(
      'SELECT DISTINCT process_type FROM rate_reference ORDER BY process_type'
    );
    res.json(result.rows.map((r: { process_type: string }) => r.process_type));
  } catch (err) {
    console.error('[rateLibrary] getProcessTypes error:', err);
    res.status(500).json({ error: 'Failed to fetch process types' });
  }
}

// GET /api/rate-library/countries
export async function getCountries(_req: Request, res: Response): Promise<void> {
  try {
    const result = await pool.query(
      'SELECT DISTINCT country FROM rate_reference ORDER BY country'
    );
    res.json(result.rows.map((r: { country: string }) => r.country));
  } catch (err) {
    console.error('[rateLibrary] getCountries error:', err);
    res.status(500).json({ error: 'Failed to fetch countries' });
  }
}

// PATCH /api/rate-library/:id/validate — admin only
export async function validateRate(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { is_validated, validation_notes } = req.body as {
      is_validated: boolean;
      validation_notes?: string;
    };

    if (is_validated == null) {
      res.status(400).json({ error: 'is_validated is required' });
      return;
    }

    const result = await pool.query(
      `UPDATE rate_reference
       SET is_validated     = $2,
           validated_by     = $3,
           validated_at     = CASE WHEN $2 THEN NOW() ELSE NULL END,
           validation_notes = $4
       WHERE id = $1
       RETURNING *`,
      [id, is_validated, req.user?.sub ?? null, validation_notes ?? null]
    );

    if (!result.rowCount) {
      res.status(404).json({ error: 'Rate not found' });
      return;
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('[rateLibrary] validateRate error:', err);
    res.status(500).json({ error: 'Failed to validate rate' });
  }
}

// POST /api/rate-library/import — admin only
// Accepts text/plain body (CSV):
//   process_type,country,labour_rate_hr,machine_rate_hr,overhead_pct,scrap_rate_pct,source,notes
export async function importRatesCsv(req: Request, res: Response): Promise<void> {
  try {
    const raw = (req.body as Buffer).toString('utf-8');
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);

    let headerSkipped = false;
    let rows_ok = 0;
    let rows_failed = 0;
    const errors: Array<{ line: number; error: string }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip header row if it starts with 'process_type'
      if (!headerSkipped && line.toLowerCase().startsWith('process_type')) {
        headerSkipped = true;
        continue;
      }

      const cols = line.split(',');
      if (cols.length < 4) {
        rows_failed++;
        errors.push({ line: i + 1, error: 'Not enough columns (need at least 4)' });
        continue;
      }

      const process_type   = cols[0]?.trim();
      const country        = cols[1]?.trim();
      const labour_rate_hr = parseFloat(cols[2] ?? '');
      const machine_rate_hr= parseFloat(cols[3] ?? '');
      const overhead_pct   = cols[4] ? parseFloat(cols[4]) : 15;
      const scrap_rate_pct = cols[5] ? parseFloat(cols[5]) : 2;
      const source         = cols[6]?.trim() || 'CSV import';
      const notes          = cols[7]?.trim() || null;

      if (!process_type || !country || isNaN(labour_rate_hr) || isNaN(machine_rate_hr)) {
        rows_failed++;
        errors.push({ line: i + 1, error: 'Invalid or missing required fields (process_type, country, labour_rate_hr, machine_rate_hr)' });
        continue;
      }

      try {
        await pool.query(
          `INSERT INTO rate_reference
             (process_type, country, labour_rate_hr, machine_rate_hr, overhead_pct, scrap_rate_pct, source, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (process_type, country) DO UPDATE
             SET labour_rate_hr  = EXCLUDED.labour_rate_hr,
                 machine_rate_hr = EXCLUDED.machine_rate_hr,
                 overhead_pct    = EXCLUDED.overhead_pct,
                 scrap_rate_pct  = EXCLUDED.scrap_rate_pct,
                 source          = EXCLUDED.source,
                 notes           = EXCLUDED.notes`,
          [process_type, country, labour_rate_hr, machine_rate_hr,
           isNaN(overhead_pct) ? 15 : overhead_pct,
           isNaN(scrap_rate_pct) ? 2 : scrap_rate_pct,
           source, notes]
        );
        rows_ok++;
      } catch (rowErr) {
        rows_failed++;
        errors.push({ line: i + 1, error: String(rowErr) });
      }
    }

    res.json({
      rows_total: rows_ok + rows_failed,
      rows_ok,
      rows_failed,
      errors,
    });
  } catch (err) {
    console.error('[rateLibrary] importRatesCsv error:', err);
    res.status(500).json({ error: 'Failed to import CSV' });
  }
}
