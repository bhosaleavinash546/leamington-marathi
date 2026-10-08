// xlsx is large (~430 KB) and only needed when a user exports. We load it
// dynamically so it stays out of the initial bundle as a lazy chunk; these
// helpers are therefore async. Types come from a type-only import (erased at
// build time, no runtime cost).
import type * as XLSXType from 'xlsx';

/** A money cell: a NUMBER with a currency format (never the text "£25.34" — it cannot be summed). */
export interface MoneyCell { __cell: 'money'; v: number; sym: string }
/** A percentage cell: a fraction shown as a percent. */
export interface PctCell { __cell: 'pct'; v: number }
export const money = (v: number, sym: string): MoneyCell => ({ __cell: 'money', v: Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : 0, sym });
export const pctCell = (fraction: number): PctCell => ({ __cell: 'pct', v: Number.isFinite(fraction) ? fraction : 0 });
const isCell = (x: unknown): x is MoneyCell | PctCell => !!x && typeof x === 'object' && '__cell' in (x as object);

/** One worksheet: a name, its array-of-arrays rows, and optional column widths (chars). */
export interface SheetSpec {
  name: string;
  rows: unknown[][];
  cols?: number[];
}

/** Build a workbook from AOA sheet specs — shared by every Excel exporter so the
 *  book_new / aoa_to_sheet / !cols / book_append_sheet boilerplate lives in one place. */
export async function buildWorkbook(sheets: SheetSpec[]): Promise<XLSXType.WorkBook> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const sh of sheets) {
    // Brand every sheet. The .xlsx community build can't embed the logo image or
    // colour cells, so the wordmark is stamped as the first row of each sheet.
    const rows = [['CostVision — AI Cost Intelligence'], [], ...sh.rows];
    const typed: Array<{ r: number; c: number; cell: MoneyCell | PctCell }> = [];
    const plain = rows.map((row, r) => (row as unknown[]).map((x, c) => { if (isCell(x)) { typed.push({ r, c, cell: x }); return x.v; } return x; }));
    const ws = XLSX.utils.aoa_to_sheet(plain);
    for (const { r, c, cell } of typed) {
      const ref = XLSX.utils.encode_cell({ r, c });
      const target = ws[ref] as XLSXType.CellObject | undefined;
      if (!target) continue;
      target.t = 'n';
      // Sub-penny figures keep their digits (a tool change is £0.003 a part) rather than reading £0.00.
      target.z = cell.__cell === 'pct' ? '0.0%' : `"${cell.sym.replace(/"/g, '')}"#,##0.00${Math.abs(cell.v) > 0 && Math.abs(cell.v) < 0.01 ? '00' : ''}`;
    }
    if (sh.cols) ws['!cols'] = sh.cols.map(wch => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, sh.name);
  }
  return wb;
}

/** Trigger a browser download of the workbook. */
export async function downloadWorkbook(wb: XLSXType.WorkBook, filename: string): Promise<void> {
  const XLSX = await import('xlsx');
  XLSX.writeFile(wb, filename);
}

/** Serialise the workbook to an xlsx Blob (for callers that return a Blob rather than download). */
export async function workbookBlob(wb: XLSXType.WorkBook): Promise<Blob> {
  const XLSX = await import('xlsx');
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
