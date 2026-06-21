import { Request, Response } from 'express';
import pool from '../db/pool';

interface CsvError {
  row: number;
  reason: string;
}

/**
 * POST /api/import/parts
 * Accepts Content-Type: text/plain body (raw CSV text).
 * Expected columns (header row required): part_number, description, uom, commodity
 * Inserts into part_master using ON CONFLICT (part_number) DO NOTHING.
 */
export async function importPartsCsv(req: Request, res: Response): Promise<void> {
  try {
    const rawBody = req.body as Buffer | string;
    const csvText = Buffer.isBuffer(rawBody) ? rawBody.toString('utf-8') : String(rawBody ?? '');

    if (!csvText.trim()) {
      res.status(400).json({ error: 'Empty CSV body' });
      return;
    }

    const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

    if (lines.length < 2) {
      res.status(400).json({ error: 'CSV must have a header row and at least one data row' });
      return;
    }

    // Parse header
    const headerCols = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim());
    const colIndex: Record<string, number> = {};
    for (const required of ['part_number', 'description', 'uom', 'commodity']) {
      const idx = headerCols.indexOf(required);
      if (idx === -1) {
        res.status(400).json({ error: `CSV header missing required column: ${required}` });
        return;
      }
      colIndex[required] = idx;
    }

    const dataLines = lines.slice(1);
    let rows_total = dataLines.length;
    let rows_ok = 0;
    let rows_failed = 0;
    const errors: CsvError[] = [];

    for (let i = 0; i < dataLines.length; i++) {
      const rowNum = i + 2; // 1-based, accounting for header
      const cols = parseCsvLine(dataLines[i]);

      const part_number = cols[colIndex['part_number']]?.trim() ?? '';
      const description = cols[colIndex['description']]?.trim() ?? '';
      const uom         = cols[colIndex['uom']]?.trim() ?? '';
      const commodity   = cols[colIndex['commodity']]?.trim() ?? '';

      if (!part_number) {
        rows_failed++;
        errors.push({ row: rowNum, reason: 'part_number is empty' });
        continue;
      }

      try {
        const result = await pool.query(
          `INSERT INTO part_master (part_number, description, uom, commodity)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (part_number) DO NOTHING
           RETURNING id`,
          [part_number, description || null, uom || null, commodity || null]
        );

        if (result.rowCount && result.rowCount > 0) {
          rows_ok++;
        } else {
          // ON CONFLICT DO NOTHING — row skipped (already exists)
          rows_failed++;
          errors.push({ row: rowNum, reason: `part_number '${part_number}' already exists — skipped` });
        }
      } catch (dbErr) {
        rows_failed++;
        const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
        errors.push({ row: rowNum, reason: msg });
      }
    }

    rows_total = dataLines.length;

    res.json({
      rows_total,
      rows_ok,
      rows_failed,
      errors,
    });
  } catch (err) {
    console.error('[csvImport] importPartsCsv error:', err);
    res.status(500).json({ error: 'CSV import failed' });
  }
}

/**
 * Parse a single CSV line respecting double-quoted fields.
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          // Escaped quote ""
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}
