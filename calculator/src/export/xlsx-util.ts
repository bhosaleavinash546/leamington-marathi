// xlsx is large (~430 KB) and only needed when a user exports. We load it
// dynamically so it stays out of the initial bundle as a lazy chunk; these
// helpers are therefore async. Types come from a type-only import (erased at
// build time, no runtime cost).
import type * as XLSXType from 'xlsx';

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
    const ws = XLSX.utils.aoa_to_sheet([['CostVision — AI Cost Intelligence'], [], ...sh.rows]);
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
