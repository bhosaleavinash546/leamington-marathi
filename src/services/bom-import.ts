/**
 * BOM file ingestion for PCB should-cost.
 * .xlsx parses locally via safe-xlsx (exceljs); .csv via a quote-aware splitter;
 * .pdf is passed through as base64 for server-side document reading.
 * Grids are compacted (≤300 rows × ≤14 cols, cells ≤80 chars) before upload —
 * the AI column-mapper needs shape, not bulk.
 */
import { parseWorkbook } from './safe-xlsx';

export type BomFilePayload =
  | { kind: 'rows'; rows: string[][]; sourceName: string }
  | { kind: 'pdf'; pdfBase64: string; sourceName: string };

const MAX_ROWS = 300;
const MAX_COLS = 14;
const MAX_CELL = 80;

export function compactGrid(grid: (string | number)[][]): string[][] {
  return grid
    .filter(r => Array.isArray(r) && r.some(c => String(c ?? '').trim() !== ''))
    .slice(0, MAX_ROWS)
    .map(r => r.slice(0, MAX_COLS).map(c => String(c ?? '').trim().slice(0, MAX_CELL)));
}

/** Quote-aware CSV split (handles commas inside quoted cells and "" escapes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',' || ch === ';' || ch === '\t') {
      // Accept comma/semicolon/tab separated exports alike.
      row.push(cell); cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}

export async function parseBomFile(file: File): Promise<BomFilePayload> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    const buf = await file.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buf);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return { kind: 'pdf', pdfBase64: btoa(binary), sourceName: file.name };
  }
  if (name.endsWith('.csv') || name.endsWith('.tsv') || file.type === 'text/csv') {
    const text = await file.text();
    return { kind: 'rows', rows: compactGrid(parseCsv(text)), sourceName: file.name };
  }
  if (name.endsWith('.xlsx') || name.endsWith('.xlsm') || file.type.includes('spreadsheet')) {
    const wb = await parseWorkbook(await file.arrayBuffer());
    const first = wb.sheetNames[0];
    const grid = first ? wb.sheets[first] : [];
    return { kind: 'rows', rows: compactGrid(grid || []), sourceName: file.name };
  }
  throw new Error('Unsupported BOM format — upload .xlsx, .csv or .pdf');
}
