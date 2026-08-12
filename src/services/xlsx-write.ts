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

  // ── Professional template options (2026) ──────────────────────────────────
  // A plain grid of values is a data dump, not a deliverable. These turn a
  // SheetSpec into a branded, readable sheet without every call site
  // re-implementing exceljs styling.
  /** Branded title band above the table: big navy title + gold rule. */
  title?: string;
  /** Small grey line under the title (subject, date, provenance). */
  subtitle?: string;
  /** 0-based index into `rows` of the header row, styled navy/white + frozen. */
  headerRow?: number;
  /** Zebra-stripe the body rows below the header. */
  zebra?: boolean;
  /** Excel number formats per 0-based column, e.g. { 3: '#,##0.00' }. */
  numFmt?: Record<number, string>;
  /** Wrap text in these 0-based columns (long prose). */
  wrapCols?: number[];
  /** Add an autofilter across the header row. */
  autoFilter?: boolean;
  /** Colour a whole body row by a keyword found in any cell. */
  statusColors?: { match: string; argb: string; fontArgb?: string }[];
  /**
   * Pictures anchored to cells.
   *
   * A DFM finding's evidence is a RENDER of the faces that broke the rule, and
   * a workbook that carries the numbers but not the picture sends the reader
   * back to the PDF to see what the row is talking about. `row`/`col` are
   * 0-based into `rows` and are shifted by the title band automatically, so a
   * caller places an image against the data row it belongs to and does not
   * have to know how tall the branding is.
   */
  images?: Array<{
    /** `data:image/jpeg;base64,...` straight from the viewer. */
    dataUri: string;
    row: number;
    col: number;
    widthPx: number;
    heightPx: number;
  }>;
  /**
   * Explicit row heights in POINTS, keyed by 0-based index into `rows`.
   *
   * A picture is anchored to a cell and does not push anything out of the way,
   * so a row left at the default height gets a render lying across the ten rows
   * beneath it. A sheet carrying images has to make room for them.
   */
  rowHeights?: Record<number, number>;
}

const BRAND = {
  navy: 'FF0D1F33',
  gold: 'FFF59E0B',
  ink: 'FF1F2937',
  muted: 'FF6B7280',
  rule: 'FFD7E0EC',
  zebra: 'FFF6F8FB',
  white: 'FFFFFFFF',
};

export async function downloadXlsx(filename: string, sheets: SheetSpec[]): Promise<void> {
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'BrainSpark';
  wb.created = new Date();
  for (const spec of sheets) {
    const ws = wb.addWorksheet(spec.name, {
      views: [{ showGridLines: !spec.title }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    const width = Math.max(1, ...spec.rows.map(r => r.length));
    let offset = 0;

    // Branded title band — the difference between a deliverable and a dump.
    if (spec.title) {
      ws.mergeCells(1, 1, 1, width);
      const t = ws.getCell(1, 1);
      t.value = spec.title;
      t.font = { name: 'Calibri', size: 16, bold: true, color: { argb: BRAND.white } };
      t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.navy } };
      t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      ws.getRow(1).height = 30;
      offset = 1;
      if (spec.subtitle) {
        ws.mergeCells(2, 1, 2, width);
        const st = ws.getCell(2, 1);
        st.value = spec.subtitle;
        st.font = { name: 'Calibri', size: 9, italic: true, color: { argb: BRAND.muted } };
        st.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        ws.getRow(2).height = 16;
        offset = 2;
      }
      // gold rule under the band
      const ruleRow = offset + 1;
      ws.mergeCells(ruleRow, 1, ruleRow, width);
      ws.getCell(ruleRow, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.gold } };
      ws.getRow(ruleRow).height = 3;
      offset = ruleRow;
    }

    ws.addRows(spec.rows.map(r => r.map(c => (c === undefined ? null : c))));
    if (spec.colWidths) spec.colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    const headerAt = spec.headerRow !== undefined ? spec.headerRow + offset + 1 : null;
    if (headerAt) {
      const hr = ws.getRow(headerAt);
      hr.height = 22;
      hr.eachCell({ includeEmpty: true }, cell => {
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: BRAND.white } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.navy } };
        cell.alignment = { vertical: 'middle', wrapText: true };
        cell.border = { bottom: { style: 'thin', color: { argb: BRAND.gold } } };
      });
      ws.views = [{ state: 'frozen', ySplit: headerAt, showGridLines: !spec.title }];
      if (spec.autoFilter) {
        ws.autoFilter = { from: { row: headerAt, column: 1 }, to: { row: headerAt, column: width } };
      }
    }

    // Body styling: zebra, borders, wrap, number formats, status colouring.
    const firstBody = (headerAt ?? offset) + 1;
    for (let r = firstBody; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const rowText = (row.values as unknown[]).map(v => String(v ?? '')).join(' ').toLowerCase();
      const status = (spec.statusColors ?? []).find(sc => rowText.includes(sc.match.toLowerCase()));
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cell.font = { name: 'Calibri', size: 10, color: { argb: status?.fontArgb ?? BRAND.ink } };
        cell.alignment = { vertical: 'top', wrapText: spec.wrapCols?.includes(col - 1) ?? false };
        cell.border = { bottom: { style: 'hair', color: { argb: BRAND.rule } } };
        if (status) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: status.argb } };
        else if (spec.zebra && (r - firstBody) % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.zebra } };
        const fmt = spec.numFmt?.[col - 1];
        if (fmt && typeof cell.value === 'number') cell.numFmt = fmt;
      });
    }

    for (const f of spec.fills ?? []) {
      const cell = ws.getCell(f.row + offset + 1, f.col + 1);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: f.argb } };
      if (f.bold) cell.font = { ...(cell.font ?? {}), bold: true };
    }

    // Room for the pictures, before they are placed.
    for (const [idx, h] of Object.entries(spec.rowHeights ?? {})) {
      ws.getRow(Number(idx) + offset + 1).height = h;
    }

    // Pictures last: they float over the grid, so nothing above needs to know
    // about them. A malformed data URI is skipped rather than allowed to take
    // the whole workbook down — the numbers are the part that must arrive.
    for (const img of spec.images ?? []) {
      const comma = img.dataUri.indexOf(',');
      if (comma < 0) continue;
      const header = img.dataUri.slice(0, comma);
      const base64 = img.dataUri.slice(comma + 1);
      const extension = /png/i.test(header) ? 'png' : 'jpeg';
      try {
        const id = wb.addImage({ base64, extension });
        ws.addImage(id, {
          // `tl` is zero-based in exceljs's own frame, and `offset` counts the
          // rows the title band inserted — so a caller's row 0 is the first row
          // of `rows` in both cases.
          tl: { col: img.col, row: img.row + offset },
          ext: { width: img.widthPx, height: img.heightPx },
          editAs: 'oneCell',
        });
      } catch { /* one bad picture must not lose the workbook */ }
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
