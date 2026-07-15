/**
 * Workbook WRITING via exceljs — the write-side counterpart to safe-xlsx.ts
 * (which reads). Replaces the `xlsx` package (unpatched CVEs) everywhere.
 * Sheets are specified as arrays-of-arrays, matching how every call site
 * already builds its data.
 */

export interface SheetSpec {
  name: string;
  rows: (string | number | null | undefined)[][];
  /** column widths in characters (xlsx `wch` equivalent) */
  colWidths?: number[];
  /** solid-fill highlights: 0-based row/col into `rows`, ARGB color */
  fills?: { row: number; col: number; argb: string; bold?: boolean }[];
}

export async function downloadXlsx(filename: string, sheets: SheetSpec[]): Promise<void> {
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  for (const spec of sheets) {
    const ws = wb.addWorksheet(spec.name);
    ws.addRows(spec.rows.map(r => r.map(c => (c === undefined ? null : c))));
    if (spec.colWidths) {
      spec.colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    }
    for (const f of spec.fills ?? []) {
      const cell = ws.getCell(f.row + 1, f.col + 1);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: f.argb } };
      if (f.bold) cell.font = { ...(cell.font ?? {}), bold: true };
    }
  }
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** json_to_sheet equivalent: object rows → header row + value rows. */
export function objectsToAoa(rows: Record<string, unknown>[]): (string | number)[][] {
  if (!rows.length) return [[]];
  const headers = Object.keys(rows[0]);
  return [headers, ...rows.map(r => headers.map(h => {
    const v = r[h];
    return typeof v === 'number' ? v : v == null ? '' : String(v);
  }))];
}
