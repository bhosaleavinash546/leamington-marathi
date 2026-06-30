import * as XLSX from 'xlsx';

/** One worksheet: a name, its array-of-arrays rows, and optional column widths (chars). */
export interface SheetSpec {
  name: string;
  rows: unknown[][];
  cols?: number[];
}

/** Build a workbook from AOA sheet specs — shared by every Excel exporter so the
 *  book_new / aoa_to_sheet / !cols / book_append_sheet boilerplate lives in one place. */
export function buildWorkbook(sheets: SheetSpec[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  for (const sh of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sh.rows);
    if (sh.cols) ws['!cols'] = sh.cols.map(wch => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, sh.name);
  }
  return wb;
}

/** Trigger a browser download of the workbook. */
export function downloadWorkbook(wb: XLSX.WorkBook, filename: string): void {
  XLSX.writeFile(wb, filename);
}

/** Serialise the workbook to an xlsx Blob (for callers that return a Blob rather than download). */
export function workbookBlob(wb: XLSX.WorkBook): Blob {
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
