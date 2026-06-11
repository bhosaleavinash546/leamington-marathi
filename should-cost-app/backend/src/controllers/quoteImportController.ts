import { Request, Response } from 'express';
import pool from '../db/pool';

interface CsvRow {
  part_number: string;
  rfq_number: string;
  supplier_code: string;
  supplier_name: string;
  supplier_country: string;
  annual_volume: string;
  currency: string;
  validity_date: string;
  cost_element: string;
  category: string;
  value: string;
  basis: string;
}

const REQUIRED_COLS = [
  'part_number','rfq_number','supplier_code','supplier_name',
  'annual_volume','currency','cost_element','category','value',
];

function parseCsv(raw: string): { headers: string[]; rows: CsvRow[] } {
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
  if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row');

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const rows: CsvRow[] = lines.slice(1)
    .filter((l) => l.trim() !== '')
    .map((line) => {
      const vals = line.split(',').map((v) => v.trim());
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
      return obj as unknown as CsvRow;
    });
  return { headers, rows };
}

export async function importQuotes(req: Request, res: Response) {
  try {
    const csvText: string = req.body?.csv;
    if (!csvText) return res.status(400).json({ error: 'No CSV data provided (send { csv: "..." })' });

    const { headers, rows } = parseCsv(csvText);

    // Validate header columns
    const missing = REQUIRED_COLS.filter((c) => !headers.includes(c));
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing columns: ${missing.join(', ')}` });
    }

    // Group rows into individual quotes by (part_number, supplier_code, rfq_number)
    const quoteMap = new Map<string, { meta: CsvRow; lines: CsvRow[] }>();
    for (const row of rows) {
      const key = `${row.part_number}||${row.supplier_code}||${row.rfq_number}`;
      if (!quoteMap.has(key)) quoteMap.set(key, { meta: row, lines: [] });
      quoteMap.get(key)!.lines.push(row);
    }

    const client = await pool.connect();
    const imported: string[] = [];
    const errors: string[] = [];

    try {
      await client.query('BEGIN');

      for (const [key, { meta, lines }] of quoteMap) {
        try {
          // 1. Resolve part
          const partRes = await client.query(
            `SELECT id FROM part_master WHERE part_number = $1`, [meta.part_number]
          );
          if (partRes.rowCount === 0) {
            errors.push(`Row skipped — part not found: "${meta.part_number}"`);
            continue;
          }
          const partId = partRes.rows[0].id;

          // 2. Upsert supplier
          await client.query(
            `INSERT INTO supplier (code, name, country)
             VALUES ($1, $2, $3)
             ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name`,
            [meta.supplier_code, meta.supplier_name, meta.supplier_country || null]
          );
          const supRes = await client.query(
            `SELECT id FROM supplier WHERE code = $1`, [meta.supplier_code]
          );
          const supplierId = supRes.rows[0].id;

          // 3. Determine next version for this part+supplier
          const versionRes = await client.query(
            `SELECT COALESCE(MAX(version), 0) + 1 AS next_v
             FROM supplier_quote_header
             WHERE part_id = $1 AND supplier_id = $2`,
            [partId, supplierId]
          );
          const version = versionRes.rows[0].next_v;

          // 4. Compute total
          const total = lines.reduce((s, r) => s + (parseFloat(r.value) || 0), 0);

          // 5. Insert quote header
          const qRes = await client.query(
            `INSERT INTO supplier_quote_header
               (part_id, supplier_id, version, status, rfq_number,
                annual_volume, currency, total_price, validity_date, submitted_at)
             VALUES ($1,$2,$3,'submitted',$4,$5,$6,$7,$8,NOW())
             RETURNING id`,
            [
              partId, supplierId, version,
              meta.rfq_number || null,
              meta.annual_volume ? parseFloat(meta.annual_volume) : null,
              meta.currency || 'GBP',
              parseFloat(total.toFixed(4)),
              meta.validity_date || null,
            ]
          );
          const qId = qRes.rows[0].id;

          // 6. Insert breakdown rows
          for (let i = 0; i < lines.length; i++) {
            const ln = lines[i];
            if (!ln.cost_element || ln.value === '') continue;
            await client.query(
              `INSERT INTO supplier_quote_breakdown
                 (supplier_quote_header_id, cost_element, category, value, basis, sort_order)
               VALUES ($1,$2,$3,$4,$5,$6)`,
              [
                qId,
                ln.cost_element,
                ln.category || 'UNCATEGORIZED',
                parseFloat(ln.value) || 0,
                ln.basis || null,
                i,
              ]
            );
          }

          imported.push(`${meta.part_number} / ${meta.supplier_name} / ${meta.rfq_number} (v${version})`);
        } catch (err) {
          errors.push(`Failed for key "${key}": ${(err as Error).message}`);
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({ imported: imported.length, created: imported, errors });
  } catch (err) {
    console.error('[quoteImport] error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
}

export async function downloadTemplate(_req: Request, res: Response) {
  const template = [
    'part_number,rfq_number,supplier_code,supplier_name,supplier_country,annual_volume,currency,validity_date,cost_element,category,value,basis',
    'PN-001-A,RFQ-2024-001,SUP-099,Example Supplier Ltd.,India,10000,GBP,2025-12-31,Raw Material,RAW_MATERIAL,2.4500,$/kg',
    'PN-001-A,RFQ-2024-001,SUP-099,Example Supplier Ltd.,India,10000,GBP,2025-12-31,Bought-Out Parts,BOP,0.8800,$/EA',
    'PN-001-A,RFQ-2024-001,SUP-099,Example Supplier Ltd.,India,10000,GBP,2025-12-31,Direct Labor,MANUFACTURING,1.2300,$/hr',
    'PN-001-A,RFQ-2024-001,SUP-099,Example Supplier Ltd.,India,10000,GBP,2025-12-31,Manufacturing Overhead,OVERHEAD,0.9400,% of labor',
    'PN-001-A,RFQ-2024-001,SUP-099,Example Supplier Ltd.,India,10000,GBP,2025-12-31,Tooling Amortisation,TOOLING,0.3200,$/EA',
    'PN-001-A,RFQ-2024-001,SUP-099,Example Supplier Ltd.,India,10000,GBP,2025-12-31,Logistics / Freight,LOGISTICS,0.2100,$/EA',
    'PN-001-A,RFQ-2024-001,SUP-099,Example Supplier Ltd.,India,10000,GBP,2025-12-31,Profit / Margin,PROFIT,0.4800,% of total',
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="costlens_quote_template.csv"');
  res.send(template);
}
