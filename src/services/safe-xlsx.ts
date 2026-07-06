/**
 * Safe spreadsheet PARSING via exceljs (lazy-loaded).
 * ------------------------------------------------------------------
 * `xlsx@0.18.x` has known prototype-pollution/ReDoS CVEs on its file-PARSE path,
 * so uploaded files are read with exceljs instead. Writing/export still uses
 * `xlsx` (safe path — we generate from our own data, never parse with it).
 * Returns sheets as arrays-of-arrays (header:1 shape) to match the old call sites.
 */

export interface ParsedWorkbook {
  sheetNames: string[];
  /** sheet name → rows as string|number cells (empty string for blank cells) */
  sheets: Record<string, (string | number)[][]>;
}

function cellValue(v: unknown): string | number {
  if (v == null) return '';
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (v instanceof Date) return v.toISOString();
  // exceljs rich values: formula results, rich text, hyperlinks
  const o = v as { result?: unknown; text?: string; richText?: { text: string }[]; hyperlink?: string };
  if (o.result !== undefined) return cellValue(o.result);
  if (typeof o.text === 'string') return o.text;
  if (Array.isArray(o.richText)) return o.richText.map(r => r.text).join('');
  return String(v);
}

export async function parseWorkbook(data: ArrayBuffer): Promise<ParsedWorkbook> {
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  const out: ParsedWorkbook = { sheetNames: [], sheets: {} };
  wb.eachSheet((ws) => {
    out.sheetNames.push(ws.name);
    const rows: (string | number)[][] = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const values: (string | number)[] = [];
      // row.values is 1-indexed (index 0 is empty)
      const raw = row.values as unknown[];
      for (let c = 1; c < raw.length; c++) values[c - 1] = cellValue(raw[c]);
      rows[rowNumber - 1] = values;
    });
    // compact holes from skipped empty rows
    out.sheets[ws.name] = rows.filter(r => r !== undefined && r.some(c => c !== ''));
  });
  return out;
}

/** CSV fallback for .csv uploads (no external parser needed for simple BOMs). */
export function parseCsv(text: string): (string | number)[][] {
  return text.split(/\r?\n/).filter(l => l.trim()).map(line => {
    const cells: string[] = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',') { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur);
    return cells.map(c => c.trim());
  });
}
