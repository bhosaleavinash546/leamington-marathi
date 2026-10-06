/**
 * PCB Image → BOM should-cost as a professional Excel workbook (Oct 2026).
 *
 * The old export was an HTML page renamed .xls: Excel warned on opening, there were no tabs,
 * no styles a reader could trust and no charts. This is a real .xlsx in six tabs, from the
 * answer to the evidence:
 *   1 Summary            KPI tiles (delivered, ex-works, confidence, NRE), cost-composition donut,
 *                        key facts, top cost drivers, what to verify, what is excluded
 *   2 Cost Breakdown     the cost stack — ex-works subtotal and delivered total as live formulas
 *   3 Bill of Materials  every line, what priced it, the lines that need a quote, reconciliation
 *   4 Board & Assembly   board spec, bare-board build-up, assembly & test, photographs
 *   5 Countries          the board costed in each country, deltas, stacked bar chart
 *   6 Volume & Notes     volume curve (chart), one-time NRE, functional safety, checks, method
 * Design: docs/pcb/pcb-excel-report-2026-10.md (a UX design spec, then an audit of the result).
 *
 * The content comes from buildPcbaReport (pcba-report-data.ts) — the same model the PDF prints,
 * so the two never disagree. Nothing here prices anything: per-board figures are the analysis's;
 * totals, percentages and deltas are Excel formulas over those cells (with cached results, so
 * the file reads correctly before any recalculation). Charts are native (xlsx-charts.ts).
 */
import type ExcelJSType from 'exceljs';
import { buildPcbaReport, type PcbaAnalysisLike, type PcbaReport, type PcbaStackKey } from './pcba-report-data.js';
import { addCharts, type ChartSpec } from './xlsx-charts.js';
import { LOGO_PNG_BASE64 } from '../brand/logo-png.js';

export interface PcbWorkbookInput {
  analysis: PcbaAnalysisLike & { _volumeCurves?: Record<string, Array<{ qty: number; totalPerBoard: number }>> };
  partName?: string;
  annualVolume?: number | null;
  qualityGrade?: string | null;
  /** Display currency: figures are held in £ and multiplied by fx for display only. */
  currency?: { code: string; symbol: string; fx: number };
  photos?: Array<{ label: string; dataUrl: string; w: number; h: number }>;
  generatedAt?: Date;
}

// ── Design tokens (brand.json onLight) ───────────────────────────────────────
const C = {
  navy: '16325C', blue: '1D6FB8', violet: '6B3FA0', teal: '0D7D71', green: '2A7F50', amber: '99651A', red: 'B03A2E',
  slate: '3A4356', muted: '686F7D', page: 'F4F7FB', white: 'FFFFFF', line: 'DCE3EE', barNote: 'C8D7F0',
  blueT: 'E8F1FA', violetT: 'F1EBF8', tealT: 'E6F4F1', greenT: 'EAF6EF', amberT: 'FCF3E3', redT: 'FBECEA',
};
const FONT = 'Calibri';
const argb = (h: string) => 'FF' + h;
const fill = (h: string): ExcelJSType.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb(h) } });
const font = (size: number, color = C.slate, bold = false, italic = false): Partial<ExcelJSType.Font> => ({ name: FONT, size, color: { argb: argb(color) }, bold, italic });
const hair = (h = C.line): Partial<ExcelJSType.Border> => ({ style: 'hair', color: { argb: argb(h) } });
const L = (n: number) => { let s = ''; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };   // 0 → A

/** Slice / tile colours, fixed order (Summary composition = donut). */
const BUCKETS: Array<{ name: string; keys: PcbaStackKey[]; color: string }> = [
  { name: 'Components', keys: ['components'], color: C.navy },
  { name: 'EMS material burden', keys: ['burden'], color: C.blue },
  { name: 'Bare PCB fabrication', keys: ['fab'], color: C.teal },
  { name: 'Automotive grade', keys: ['autoFab', 'autoAsm'], color: C.violet },
  { name: 'Assembly & test', keys: ['asm', 'test'], color: 'D9822B' },
  { name: 'Energy, packaging & other', keys: ['other', 'rounding'], color: 'A9B4C4' },
  { name: 'Freight & UK duty', keys: ['freight', 'duty'], color: C.muted },
];
const SUBTITLE: Record<string, string> = {
  'Summary': 'Should-cost summary · per board',
  'Cost Breakdown': 'Cost breakdown · per board, ex-works and delivered',
  'Bill of Materials': 'Bill of materials · every line and what priced it',
  'Board & Assembly': 'Board & assembly · specification, build-up and photographs',
  'Countries': 'Build-country comparison · the same board in each country',
  'Volume & Notes': 'Volume, one-time costs & notes',
};
const SOURCE_STYLE: Record<string, [string, string]> = {
  'distributor (live)': [C.green, C.greenT], 'catalogue (distributor)': [C.green, C.greenT],
  'catalogue (estimate)': [C.blue, C.blueT], 'named-part range': [C.teal, C.tealT],
  'function range': [C.amber, C.amberT], 'class range': [C.amber, C.amberT], 'engineer': [C.violet, C.violetT],
};

export async function buildPcbWorkbook(inp: PcbWorkbookInput): Promise<Uint8Array> {
  const mod = await import('exceljs');
  const ExcelJS = ((mod as unknown as { default?: typeof ExcelJSType }).default ?? mod) as typeof ExcelJSType;
  const cur = inp.currency ?? { code: 'GBP', symbol: '£', fx: 1 };
  const fx = cur.fx || 1;
  const sym = cur.symbol.replace(/"/g, '');
  const m = (gbp: number) => Math.round(gbp * fx * 1e6) / 1e6;
  const fmtMoney = (n: number) => `${sym}${(n * fx).toFixed(2)}`;
  const rep0: PcbaReport = buildPcbaReport(inp.analysis, { partName: inp.partName, annualVolume: inp.annualVolume, qualityGrade: inp.qualityGrade, fmt: fmtMoney });
  // The model is shared with the PDF, whose sections are numbered; here they are tabs.
  const tabRef = (t: string) => t.replace(/see §1\b|the components row of §1/g, m0 => m0.startsWith('see') ? 'see Cost Breakdown' : 'the components row on Cost Breakdown')
    .replace(/in §1\b/g, 'on Cost Breakdown').replace(/see §3\b/g, 'see Bill of Materials').replace(/see §4\b/g, 'see Board & Assembly').replace(/see §6\b/g, 'see Volume & Notes');
  const rep: PcbaReport = { ...rep0, stack: rep0.stack.map(x => ({ ...x, basis: tabRef(x.basis) })), excluded: rep0.excluded.map(tabRef),
    drivers: rep0.drivers.map(tabRef), bomReconciliation: tabRef(rep0.bomReconciliation) };
  const NF = {
    money: `"${sym}"#,##0.00;-"${sym}"#,##0.00;"–"`,
    unit: `"${sym}"#,##0.0000`,
    ext: `[<0.01]"${sym}"0.0000;"${sym}"#,##0.00`,
    whole: `"${sym}"#,##0;-"${sym}"#,##0;"–"`,
    delta: `+"${sym}"#,##0.00;-"${sym}"#,##0.00;"${sym}"0.00`,
    tiny: `"${sym}"#,##0.00`,   // shown as £0.00, not "–": the analysis rounds freight to the penny and the basis says it is under one
    pct: '0.0%', dpct: '+0.0%;-0.0%;0.0%', count: '#,##0', vol: '#,##0" /yr"', wk: '0" wk"', factor: '0.000"×"',
  };
  const date = (inp.generatedAt ?? new Date()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const countryShort = rep.country.split(' (')[0];
  const meta = [`Build: ${countryShort}`, rep.annualVolume ? `Volume: ${rep.annualVolume.toLocaleString('en-GB')} boards/yr` : null,
    'Basis: delivered UK, duty paid', `Prepared: ${date}`, `Currency: ${cur.code} (${sym})`, rep.domainLabel].filter(Boolean).join('   ·   ');

  const wb = new ExcelJS.Workbook();
  wb.creator = 'CostVision'; wb.title = `${rep.partName} — PCB should-cost`; wb.company = 'CostVision';
  const logo = wb.addImage({ base64: LOGO_PNG_BASE64, extension: 'png' });
  const charts: ChartSpec[] = [];

  const sheet = (name: string, tab: string, widths: number[], landscape = true, fitHeight = 0, freeze?: number) => {
    const ws = wb.addWorksheet(name, {
      properties: { tabColor: { argb: argb(tab) }, defaultRowHeight: 18 },
      views: [freeze ? { state: 'frozen', ySplit: freeze, showGridLines: false, zoomScale: 100 } : { showGridLines: false, zoomScale: 100 }],
      pageSetup: { paperSize: 9, orientation: landscape ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: fitHeight,
        horizontalCentered: true, margins: { left: 0.4, right: 0.4, top: 0.55, bottom: 0.55, header: 0.25, footer: 0.25 } },
      headerFooter: { oddFooter: '&L&8CostVision · PCB should-cost&C&8&A&R&8Page &P of &N' },
    });
    ws.getColumn(1).width = 2;
    widths.forEach((w, i) => { ws.getColumn(i + 2).width = w; });
    const last = widths.length;   // index of last content column (B = 1)
    // Header band (rows 1–6).
    ws.getRow(1).height = 34; ws.getRow(2).height = 26; ws.getRow(3).height = 18; ws.getRow(4).height = 16; ws.getRow(5).height = 3; ws.getRow(6).height = 10;
    ws.addImage(logo, { tl: { col: 1.05, row: 0.18 }, ext: { width: 150, height: 31 }, editAs: 'oneCell' });
    const tag = ws.getCell(1, last + 1);
    tag.value = 'PCB should-cost report'; tag.font = font(9, C.muted); tag.alignment = { horizontal: 'right', vertical: 'middle' };
    const put = (r: number, v: string, f: Partial<ExcelJSType.Font>) => {
      ws.mergeCells(r, 2, r, last + 1);
      const c = ws.getCell(r, 2); c.value = v; c.font = f; c.alignment = { vertical: 'middle', horizontal: 'left' };
    };
    put(2, rep.partName, font(18, C.navy, true));
    put(3, SUBTITLE[name] ?? name, font(11, C.slate));
    put(4, meta, font(9, C.muted));
    for (let c = 1; c <= last + 1; c++) ws.getCell(5, c).fill = fill(C.navy);
    return { ws, last };
  };

  /** A navy section bar across columns [c0, c1] (1-based), with an optional right note / link. */
  const bar = (ws: ExcelJSType.Worksheet, r: number, c0: number, c1: number, title: string, note?: string, link?: string) => {
    ws.getRow(r).height = 22;
    const split = note ? Math.max(c0 + 1, c1 - Math.min(5, Math.floor((c1 - c0) / 2))) : c1;
    if (split > c0) ws.mergeCells(r, c0, r, note ? split - 1 : c1);
    const t = ws.getCell(r, c0); t.value = title; t.font = font(11, C.white, true); t.alignment = { vertical: 'middle', indent: 1 };
    for (let c = c0; c <= c1; c++) ws.getCell(r, c).fill = fill(C.navy);
    ws.getCell(r, c0).border = { left: { style: 'thick', color: { argb: argb(C.blue) } } };   // the same accent on every section
    if (note) {
      if (c1 > split) ws.mergeCells(r, split, r, c1);
      const n = ws.getCell(r, split);
      n.value = link ? { text: note, hyperlink: link } : note;
      n.font = { ...font(9, C.barNote), underline: !!link }; n.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
    }
  };
  const header = (ws: ExcelJSType.Worksheet, r: number, labels: Array<[number, string, boolean?]>) => {
    ws.getRow(r).height = 30;
    for (const [c, text, num] of labels) {
      const cell = ws.getCell(r, c); cell.value = text; cell.font = font(9.5, C.navy, true); cell.fill = fill(C.blueT);
      cell.alignment = { vertical: 'middle', horizontal: num ? 'right' : 'left', wrapText: true, indent: num ? 0 : 1 };
      cell.border = { bottom: { style: 'medium', color: { argb: argb(C.navy) } } };
    }
  };
  /** A wrapped note across [c0, c1]; row height from the text length. */
  const note = (ws: ExcelJSType.Worksheet, r: number, c0: number, c1: number, text: string, opts: { size?: number; color?: string; fillHex?: string; italic?: boolean; bold?: boolean } = {}) => {
    if (c1 > c0) ws.mergeCells(r, c0, r, c1);
    const cell = ws.getCell(r, c0);
    cell.value = text; cell.font = font(opts.size ?? 9, opts.color ?? C.muted, !!opts.bold, !!opts.italic);
    cell.alignment = { wrapText: true, vertical: 'top', indent: 1 };
    if (opts.fillHex) for (let c = c0; c <= c1; c++) ws.getCell(r, c).fill = fill(opts.fillHex);
    let w = 0; for (let c = c0; c <= c1; c++) w += ws.getColumn(c).width ?? 9;
    const lines = text.split('\n').reduce((t, part) => t + Math.max(1, Math.ceil((part.length * ((opts.size ?? 9) / 9)) / Math.max(10, w * 1.38))), 0);
    ws.getRow(r).height = Math.max(16, lines * 12.5 + 5);
  };
  const row = (ws: ExcelJSType.Worksheet, r: number, c0: number, c1: number, zebra: boolean) => {
    for (let c = c0; c <= c1; c++) {
      const cell = ws.getCell(r, c);
      cell.border = { bottom: hair() };
      if (zebra) cell.fill = fill(C.page);
      if (!cell.font) cell.font = font(10);
    }
  };
  const val = (ws: ExcelJSType.Worksheet, r: number, c: number, v: ExcelJSType.CellValue, numFmt?: string, f: Partial<ExcelJSType.Font> = font(10), align: 'left' | 'right' | 'center' = 'right') => {
    const cell = ws.getCell(r, c); cell.value = v; if (numFmt) cell.numFmt = numFmt; cell.font = f;
    cell.alignment = { vertical: 'middle', horizontal: align, indent: align === 'left' ? 1 : 0, wrapText: align === 'left' };
    return cell;
  };
  const formula = (f: string, result: number | string) => ({ formula: f, result } as ExcelJSType.CellFormulaValue);

  // Sheets in tab order; filled in dependency order below.
  const S = sheet('Summary', C.navy, Array(12).fill(12.5), true, 0);
  const CB = sheet('Cost Breakdown', C.blue, [5, 40, 12, 11, 16, 14, 62]);
  const BM = sheet('Bill of Materials', C.violet, [5, 14, 36, 20, 12, 7, 11, 12, 10, 22, 9], true, 0, 8);
  const BA = sheet('Board & Assembly', C.teal, [24, 10, 12, 12, 12, 3, 24, 10, 12, 12, 12]);
  BA.ws.pageSetup.printTitlesRow = '1:5';   // the photo page keeps the logo and title
  const CO = sheet('Countries', C.green, [5, 18, 13, 11, 12, 9, 12, 12, 12, 12, 9, 9, 9], true, 0, 8);

  const VN = sheet('Volume & Notes', C.amber, [16, 15, 15, 15, 3, 13, 13, 13, 13, 13, 13, 13]);
  // Every continuation page keeps the logo and title band (rows 1–5).
  for (const x of [S, CO, VN]) x.ws.pageSetup.printTitlesRow = '1:5';

  // ═══ 2. Cost Breakdown ═══════════════════════════════════════════════════
  const cb = CB.ws;
  bar(cb, 7, 2, 8, 'Cost stack per board', `${rep.country} build · delivered UK, duty paid`);
  header(cb, 8, [[2, '#'], [3, 'Line item'], [4, `${sym}/board`, true], [5, '% of delivered', true], [6, 'Share', false], [7, `${sym}/year`, true], [8, 'Basis']]);
  const cbRow = new Map<PcbaStackKey, number>();
  const first = 9;
  const n = rep.stack.length;
  const totalRow = first + n - 1;
  const volRow = totalRow + 4;
  const exwRow = first + rep.stack.findIndex(s => s.key === 'exWorks');
  let lineNo = 0;
  rep.stack.forEach((s, i) => {
    const r = first + i;
    cbRow.set(s.key, r);
    row(cb, r, 2, 8, i % 2 === 1);
    val(cb, r, 2, s.kind ? '' : ++lineNo, NF.count, font(9, C.muted), 'right');
    val(cb, r, 3, s.label, undefined, font(10, C.slate, !!s.kind), 'left');
    let v: ExcelJSType.CellValue = m(s.amount);
    if (s.key === 'exWorks') v = formula(`SUM(D${first}:D${r - 1})`, m(s.amount));
    if (s.key === 'delivered') v = formula(`D${exwRow}+SUM(D${exwRow + 1}:D${r - 1})`, m(s.amount));
    val(cb, r, 4, v, s.key === 'freight' ? NF.tiny : NF.money, font(10, C.slate, !!s.kind));
    val(cb, r, 5, formula(`IF($D$${totalRow}=0,0,D${r}/$D$${totalRow})`, s.amount / rep.total), NF.pct, font(10, C.slate, !!s.kind));
    if (!s.kind) val(cb, r, 6, formula(`E${r}`, s.amount / rep.total), ';;;');
    val(cb, r, 7, formula(`D${r}*$D$${volRow}`, m(s.amount) * (rep.annualVolume ?? 0)), NF.whole, font(10, C.slate, !!s.kind));
    val(cb, r, 8, s.basis, undefined, font(9, C.muted), 'left');
    if (s.kind === 'sub') for (let c = 2; c <= 8; c++) { const cell = cb.getCell(r, c); cell.fill = fill(C.blueT); cell.border = { top: { style: 'thin', color: { argb: argb(C.navy) } }, bottom: hair() }; }
    if (s.kind === 'total') for (let c = 2; c <= 8; c++) {
      const cell = cb.getCell(r, c); cell.fill = fill(C.navy); cell.font = { ...cell.font, color: { argb: argb(C.white) }, bold: true, size: c === 4 ? 12 : cell.font?.size };
      cell.border = { top: { style: 'double', color: { argb: argb(C.navy) } } };
    }
    cb.getRow(r).height = 20;
  });
  cb.addConditionalFormatting({ ref: `F${first}:F${totalRow - 1}`, rules: [{ type: 'dataBar', priority: 1, minLength: 0, maxLength: 100, gradient: false, color: { argb: argb(C.blue) }, cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }] } as unknown as ExcelJSType.ConditionalFormattingRule] });
  const engineCheck = totalRow + 1;
  note(cb, engineCheck, 3, 8, '', { size: 9 });
  cb.getCell(engineCheck, 3).value = formula(`IF(ABS(D${totalRow}-${m(rep.total)})<0.005,"✓ Matches the CostVision analysis total (${fmtMoney(rep.total)} per board).","Check: the total differs from the analysis (${fmtMoney(rep.total)}) — a figure above has been edited.")`, `✓ Matches the CostVision analysis total (${fmtMoney(rep.total)} per board).`);
  cb.getCell(engineCheck, 3).font = font(9, C.green, true);
  bar(cb, volRow - 1, 2, 8, 'Assumptions');
  row(cb, volRow, 2, 8, false);
  val(cb, volRow, 3, 'Annual volume (boards / year)', undefined, font(10), 'left');
  val(cb, volRow, 4, rep.annualVolume ?? 0, NF.vol, font(10, '0000FF'));
  val(cb, volRow, 8, `${sym}/year scales the per-board cost by this volume (blue = an input you can change). The per-board cost itself was priced at this volume — re-run the analysis to price another volume.`, undefined, font(9, C.muted), 'left');
  cb.getRow(volRow).height = 30;
  note(cb, volRow + 2, 2, 8, 'Components, bare board and assembly are supplier prices: the fabricator\'s and the EMS\'s overhead and margin are inside them, so no further overhead or margin is added. Ex-works = built, tested and packed at the factory gate; delivered adds freight to the UK and UK import duty.');
  const cbRef = (k: PcbaStackKey) => cbRow.get(k);

  // ═══ 3. Bill of Materials ════════════════════════════════════════════════
  const bm = BM.ws;
  bar(bm, 7, 2, 12, 'Bill of materials', `${rep.bom.length} lines · ${rep.bomPieces} parts · from the ${rep.bomOrigin}`);
  header(bm, 8, [[2, '#', true], [3, 'Ref des'], [4, 'Description'], [5, 'Part number'], [6, 'Package'], [7, 'Qty', true], [8, `Unit ${sym}`, true], [9, `Extended ${sym}`, true], [10, '% of comp.', true], [11, 'Priced from'], [12, 'Verify']]);
  const b0 = 9, bN = b0 + rep.bom.length - 1, bTot = bN + 1;
  rep.bom.forEach((l, i) => {
    const r = b0 + i;
    row(bm, r, 2, 12, i % 2 === 1);
    val(bm, r, 2, i + 1, NF.count, font(9, C.muted));
    val(bm, r, 3, l.ref || '—', undefined, font(10, l.ref ? C.slate : C.muted), 'left');
    val(bm, r, 4, l.description, undefined, font(10), 'left');
    val(bm, r, 5, l.partNumber || '—', undefined, font(10, l.partNumber ? C.slate : C.muted), 'left');
    val(bm, r, 6, l.pkg || '—', undefined, font(10, l.pkg ? C.slate : C.muted), 'left');
    val(bm, r, 7, l.qty, NF.count);
    val(bm, r, 8, m(l.unit), NF.unit);
    val(bm, r, 9, formula(`G${r}*H${r}`, m(l.ext)), NF.ext, font(10, C.slate, true));
    val(bm, r, 10, formula(`IF($I$${bTot}=0,0,I${r}/$I$${bTot})`, rep.bomTotal ? l.ext / rep.bomTotal : 0), NF.pct);
    const [fg, bg] = SOURCE_STYLE[l.source] ?? [C.muted, ''];
    const src = val(bm, r, 11, l.source, undefined, font(9, fg, true, l.source === 'not fitted'), 'left');
    if (bg) src.fill = fill(bg);
    if (l.verify) { const v = val(bm, r, 12, 'Quote', undefined, font(9, C.amber, true), 'center'); v.fill = fill(C.amberT); }
    bm.getRow(r).height = 20;
  });
  row(bm, bTot, 2, 12, false);
  val(bm, bTot, 4, 'Components total', undefined, font(10, C.white, true), 'left');
  val(bm, bTot, 7, formula(`SUBTOTAL(109,G${b0}:G${bN})`, rep.bomPieces), NF.count, font(10, C.white, true));
  val(bm, bTot, 9, formula(`SUBTOTAL(109,I${b0}:I${bN})`, m(rep.bomTotal)), NF.money, font(11, C.white, true));
  val(bm, bTot, 10, formula(`SUBTOTAL(109,J${b0}:J${bN})`, 1), NF.pct, font(10, C.white, true));
  for (let c = 2; c <= 12; c++) { const cell = bm.getCell(bTot, c); cell.fill = fill(C.navy); cell.border = { top: { style: 'double', color: { argb: argb(C.navy) } } }; }
  bm.getRow(bTot).height = 22;
  bm.autoFilter = { from: { row: 8, column: 2 }, to: { row: bN, column: 12 } };
  bm.pageSetup.printTitlesRow = '8:8';
  if (!rep.bom.some(l => l.ref)) bm.getColumn(3).hidden = true;   // no designators in this parts list
  if (rep.bom.length <= 30) bm.pageSetup.fitToHeight = 1;          // a short parts list prints on one page
  const rec = bTot + 2;
  bar(bm, rec, 2, 12, 'Reconciliation');
  const compRow = cbRef('components')!;
  const recRows: Array<[string, ExcelJSType.CellValue, string]> = [
    ['Lines total (above)', formula(`I${bTot}`, m(rep.bomTotal)), NF.money],
    ['Components row, Cost Breakdown', formula(`'Cost Breakdown'!D${compRow}`, m(rep.componentsAtCost)), NF.money],
    ['Difference', formula(`I${rec + 1}-I${rec + 2}`, m(rep.bomTotal - rep.componentsAtCost)), NF.delta],
  ];
  recRows.forEach(([label, v, f], i) => {
    const r = rec + 1 + i; row(bm, r, 2, 12, false);
    bm.mergeCells(r, 4, r, 8); val(bm, r, 4, label, undefined, font(10), 'left'); val(bm, r, 9, v, f, font(10, C.slate, i === 2));
  });
  const st = rec + 4; bm.mergeCells(st, 4, st, 12);
  val(bm, st, 4, formula(`IF(ABS(I${rec + 3})<0.01,"✓ The lines reconcile to the components row.","Check: rounding between the lines and the components row.")`, '✓ The lines reconcile to the components row.'), undefined, font(9, C.green, true), 'left');
  note(bm, st + 1, 2, 12, rep.bomReconciliation);
  note(bm, st + 2, 2, 12, rep.sourceKey.replace('Lines marked *', 'Lines marked "Quote"'));

  // ═══ 4. Board & Assembly ═════════════════════════════════════════════════
  const ba = BA.ws;
  bar(ba, 7, 2, 6, 'Board specification');
  bar(ba, 7, 8, 12, 'Bare-board build-up', `${sym}/board`);
  const specRows = rep.boardRows.filter(([k]) => k !== 'Bare-board build-up');
  specRows.forEach(([k, v], i) => {
    const r = 8 + i; row(ba, r, 2, 6, i % 2 === 1);
    val(ba, r, 2, k, undefined, font(9, C.muted), 'left');
    ba.mergeCells(r, 3, r, 6);
    const tagged = /\(measured\)/.test(v) ? 'measured' : /estimated/.test(v) ? 'estimated' : '';
    val(ba, r, 3, v, undefined, font(10, C.slate), 'left');
    if (tagged) ba.getCell(r, 3).value = { richText: [{ text: v.replace(/\s*\((measured|estimated from the photos)\)/, ''), font: font(10) }, { text: `   ${tagged}`, font: font(9, tagged === 'measured' ? C.green : C.amber, true) }] };
    ba.getRow(r).height = 20;
  });
  const fabParts = Object.entries((inp.analysis._selectedCountryBreakdown?.breakdown ?? {}) as Record<string, number>)
    .filter(([k, v]) => /^pcb(Base|Layers|Surface|Vias|HDI|Setup|Copper|Impedance)$/.test(k) && v > 0)
    .map(([k, v]) => [({ pcbBase: 'Base laminate & process', pcbLayers: 'Layers', pcbSurface: 'Surface finish', pcbVias: 'Vias & drilling', pcbHDI: 'HDI', pcbSetup: 'Set-up (per board)', pcbCopper: 'Heavy copper', pcbImpedance: 'Impedance control' } as Record<string, string>)[k] ?? k, v] as [string, number]);
  let r4 = 8;
  fabParts.forEach(([k, v], i) => { row(ba, r4, 8, 12, i % 2 === 1); ba.mergeCells(r4, 8, r4, 10); val(ba, r4, 8, k, undefined, font(10), 'left'); ba.mergeCells(r4, 11, r4, 12); val(ba, r4, 11, m(v), NF.money); r4++; });
  const fabSumRow = r4;
  const fabCB = cbRef('fab');
  const lines4: Array<[string, ExcelJSType.CellValue, boolean]> = [];
  if (fabParts.length) lines4.push(['Build-up items', formula(`SUM(K8:K${r4 - 1})`, m(fabParts.reduce((t, [, v]) => t + v, 0))), false]);
  if (fabCB && fabParts.length) lines4.push(['Rounding (items rounded to the penny)', formula(`'Cost Breakdown'!D${fabCB}-K${fabSumRow}`, m(rep.stack.find(s => s.key === 'fab')!.amount - fabParts.reduce((t, [, v]) => t + v, 0))), false]);
  const autoFabRow = cbRef('autoFab');
  if (autoFabRow) lines4.push(['+ Automotive fab grade', formula(`'Cost Breakdown'!D${autoFabRow}`, m(rep.stack.find(s => s.key === 'autoFab')!.amount)), false]);
  const fabTotal = (rep.stack.find(s => s.key === 'fab')?.amount ?? 0) + (rep.stack.find(s => s.key === 'autoFab')?.amount ?? 0);
  lines4.push(['= Bare PCB per board', formula(`'Cost Breakdown'!D${fabCB}${autoFabRow ? `+'Cost Breakdown'!D${autoFabRow}` : ''}`, m(fabTotal)), true]);
  lines4.forEach(([k, v, strong]) => {
    row(ba, r4, 8, 12, false); ba.mergeCells(r4, 8, r4, 10); val(ba, r4, 8, k, undefined, font(10, C.slate, strong), 'left');
    ba.mergeCells(r4, 11, r4, 12); val(ba, r4, 11, v, NF.money, font(10, C.slate, strong));
    if (strong) for (let c = 8; c <= 12; c++) { ba.getCell(r4, c).fill = fill(C.blueT); ba.getCell(r4, c).border = { top: { style: 'thin', color: { argb: argb(C.navy) } } }; }
    r4++;
  });
  // Assembly & test (£), under the build-up.
  r4 += 1;
  bar(ba, r4, 8, 12, 'Assembly & test', `${sym}/board`); r4++;
  const asmKeys: Array<[PcbaStackKey, string]> = [['asm', 'SMT / THT assembly'], ['test', 'Test & inspection (AOI, X-ray, ICT)'], ['autoAsm', 'Automotive assembly grade']];
  const asmStart = r4;
  for (const [k, label] of asmKeys) {
    const cr = cbRef(k); if (!cr) continue;
    row(ba, r4, 8, 12, (r4 - asmStart) % 2 === 1); ba.mergeCells(r4, 8, r4, 10); val(ba, r4, 8, label, undefined, font(10), 'left');
    ba.mergeCells(r4, 11, r4, 12); val(ba, r4, 11, formula(`'Cost Breakdown'!D${cr}`, m(rep.stack.find(s => s.key === k)!.amount)), NF.money); r4++;
  }
  ba.mergeCells(r4, 8, r4, 10); val(ba, r4, 8, '= Assembly & test per board', undefined, font(10, C.slate, true), 'left');
  ba.mergeCells(r4, 11, r4, 12); val(ba, r4, 11, formula(`SUM(K${asmStart}:K${r4 - 1})`, m(asmKeys.reduce((t, [k]) => t + (rep.stack.find(s => s.key === k)?.amount ?? 0), 0))), NF.money, font(10, C.slate, true));
  for (let c = 8; c <= 12; c++) { ba.getCell(r4, c).fill = fill(C.blueT); ba.getCell(r4, c).border = { top: { style: 'thin', color: { argb: argb(C.navy) } } }; }
  // Photographs: two across, aspect kept, never stretched.
  let pr = Math.max(8 + specRows.length, r4) + 2;
  const photos = (inp.photos ?? []).filter(p => p.dataUrl && /^data:image\/(png|jpe?g)/.test(p.dataUrl));
  if (photos.length) ba.getRow(pr - 1).addPageBreak();   // the photographs start a page: never split across one
  bar(ba, pr, 2, 12, `Source photographs (${photos.length})`, photos.length ? 'as uploaded for the analysis' : undefined); pr++;
  if (!photos.length) { note(ba, pr, 2, 12, rep.bomOrigin === 'photos' ? 'No photographs were kept with this analysis.' : `Costed from the ${rep.bomOrigin}; no photographs attached.`, { italic: true }); pr++; }
  // Two across, anchored on column boundaries (B and H — Excel and LibreOffice convert widths to
  // pixels differently, so a pixel grid drifts); two rows a page, never split by a page break.
  const PH_ROWS = 10, ROW_PT = 15;
  photos.forEach((p, i) => {
    const rowOfPhotos = Math.floor(i / 2);
    const top = pr + rowOfPhotos * (PH_ROWS + 2);
    if (rowOfPhotos > 0 && rowOfPhotos % 2 === 0 && i % 2 === 0) ba.getRow(top - 1).addPageBreak();
    for (let k = 0; k <= PH_ROWS + 1; k++) ba.getRow(top + k).height = ROW_PT;
    const maxW = 340, maxH = PH_ROWS * ROW_PT * (4 / 3) - 6;
    let w = maxW, h = maxW * (p.h / Math.max(1, p.w)); if (h > maxH) { h = maxH; w = maxH * (p.w / Math.max(1, p.h)); }
    const ext = /png/.test(p.dataUrl.slice(5, 16)) ? 'png' : 'jpeg';
    const id = wb.addImage({ base64: p.dataUrl.replace(/^data:image\/\w+;base64,/, ''), extension: ext as 'png' | 'jpeg' });
    const leftCol = i % 2 === 0 ? 1 : 7;   // B or H (0-based)
    ba.addImage(id, { tl: { col: leftCol + 0.05, row: top - 1 + 0.1 }, ext: { width: Math.round(w), height: Math.round(h) }, editAs: 'oneCell' });
    const cap = ba.getCell(top + PH_ROWS, leftCol + 1); cap.value = `Photo ${i + 1} · uploaded as "${p.label}"`; cap.font = font(9, C.muted);
  });

  // ═══ 5. Countries ════════════════════════════════════════════════════════
  const co = CO.ws;
  bar(co, 7, 2, 14, 'Build-country comparison', 'each row: this board built there, delivered UK, duty paid');
  header(co, 8, [[2, 'Rank', true], [3, 'Country'], [4, 'Components + EMS burden', true], [5, 'Bare board', true], [6, 'Assembly & test', true], [7, 'Other', true], [8, 'Ex-works', true], [9, 'Freight & duty', true], [10, 'Delivered', true], [11, `Δ vs ${countryShort}`, true], [12, 'Δ %', true], [13, 'Change'], [14, 'Lead']]);
  co.getCell(8, 14).alignment = { vertical: 'middle', horizontal: 'center' };
  const c0 = 9, cN = c0 + rep.countries.length - 1;
  const selIdx = rep.countries.findIndex(c => c.selected);
  const selRow = selIdx >= 0 ? c0 + selIdx : c0;
  rep.countries.forEach((c, i) => {
    const r = c0 + i;
    row(co, r, 2, 14, i % 2 === 1);
    val(co, r, 2, i + 1, NF.count, font(9, C.muted));
    val(co, r, 3, c.name, undefined, font(10, C.slate, c.selected), 'left');
    [c.components, c.fab, c.assembly, c.other].forEach((v, k) => val(co, r, 4 + k, m(v), NF.money));
    val(co, r, 8, formula(`SUM(D${r}:G${r})`, m(c.exWorks)), NF.money, font(10, C.slate, true));
    val(co, r, 9, m(c.logistics), NF.tiny);
    val(co, r, 10, formula(`H${r}+I${r}`, m(c.total)), NF.money, font(10, C.navy, true));
    val(co, r, 11, formula(`J${r}-$J$${selRow}`, m(c.delta)), NF.delta, font(10, c.delta < -0.004 ? C.green : c.delta > 0.004 ? C.red : C.slate, true));
    val(co, r, 12, formula(`IF($J$${selRow}=0,0,K${r}/$J$${selRow})`, rep.total ? c.delta / rep.total : 0), NF.dpct, font(10, c.delta < -0.004 ? C.green : c.delta > 0.004 ? C.red : C.slate));
    val(co, r, 13, formula(`IF(ROW()=${selRow},"costed",IF(K${r}<-0.004,"cheaper",IF(K${r}>0.004,"dearer","same")))`, c.selected ? 'costed' : c.delta < -0.004 ? 'cheaper' : c.delta > 0.004 ? 'dearer' : 'same'), undefined, font(9, c.selected ? C.navy : c.delta < -0.004 ? C.green : C.red, true), 'left');
    val(co, r, 14, c.leadWeeks ?? '', NF.wk, font(10, C.muted), 'center');   // not flush with the page edge
    if (c.selected) for (let k = 2; k <= 14; k++) { co.getCell(r, k).fill = fill(C.blueT); co.getCell(r, k).font = { ...co.getCell(r, k).font, bold: true }; }
    co.getRow(r).height = 20;
  });
  if (rep.countries.length) {
    const nr = cN + 1;
    co.getRow(nr).addPageBreak();   // the chart takes its own page: the table prints at a readable size
    note(co, nr, 2, 14, 'Components include the EMS material burden. "Other" is energy, ESD packaging and cost of quality (rework and scrap at the country\'s defect rate). Freight by sea is under a penny a board at this size and volume, so it shows as ' + sym + '0.00; UK import duty is 0% where the UK tariff for that origin is 0% (trade agreement). Δ: + dearer, − cheaper than the costed country.');
    charts.push({
      sheet: 'Countries', kind: 'bar', stacked: true, title: `Delivered cost per board by build country (${sym}) — highlighted: ${countryShort}, as costed`, reverseCats: true, legend: 'b', numFmt: `"${sym}"#,##0.00`, labels: 'none',
      series: [
        { name: 'Ex-works', catRef: `'Countries'!$C$${c0}:$C$${cN}`, cats: rep.countries.map(c => c.name), valRef: `'Countries'!$H$${c0}:$H$${cN}`, vals: rep.countries.map(c => m(c.exWorks)), color: C.navy,
          colors: rep.countries.map(c => (c.selected ? C.blue : C.navy)) },
        { name: 'Freight & UK duty', catRef: `'Countries'!$C$${c0}:$C$${cN}`, cats: rep.countries.map(c => c.name), valRef: `'Countries'!$I$${c0}:$I$${cN}`, vals: rep.countries.map(c => m(c.logistics)), color: 'A9B4C4' },
      ],
      from: { col: 1, row: nr + 1 }, to: { col: 14, row: nr + 1 + Math.max(16, rep.countries.length + 4) },
    });
  } else note(co, c0, 2, 14, 'Single-country costing: no comparison was run.', { italic: true });

  // ═══ 6. Volume & Notes (landscape: the curve table and its chart side by side) ═══
  const vn = VN.ws;
  let r6 = 7;
  const curves = inp.analysis._volumeCurves ?? {};
  const selId = rep.countryId;
  const others = rep.countries.filter(c => !c.selected).map(c => c.id);
  const ids = [selId, others[0], curves.gb && selId !== 'gb' && others[0] !== 'gb' ? 'gb' : undefined].filter((x): x is string => !!x && Array.isArray(curves[x]) && curves[x].length > 0);
  const nameOf = (id: string) => `${rep.countries.find(c => c.id === id)?.name ?? id.toUpperCase()}${id === selId ? ' (costed)' : id === 'gb' ? ' (onshore reference)' : ' (next cheapest)'}`;
  bar(vn, r6, 2, 13, 'Volume curve', ids.length ? 'delivered cost per board at each annual volume' : undefined); r6++;
  if (ids.length) {
    const qtys = curves[ids[0]].map(p => p.qty);
    header(vn, r6, [[2, 'Boards / year', true], ...ids.map((id, k) => [3 + k, nameOf(id), true] as [number, string, boolean])]);
    vn.getRow(r6).height = 42;
    const hRow = r6; r6++;
    const v0 = r6;
    const near = rep.annualVolume ? qtys.reduce((b2, q) => (Math.abs(q - rep.annualVolume!) < Math.abs(b2 - rep.annualVolume!) ? q : b2), qtys[0]) : -1;
    qtys.forEach((q, i) => {
      const r = v0 + i; row(vn, r, 2, 2 + ids.length, i % 2 === 1);
      val(vn, r, 2, q, NF.count, font(10, C.slate, q === near));
      ids.forEach((id, k) => { const p = curves[id].find(x => x.qty === q); val(vn, r, 3 + k, p ? m(p.totalPerBoard) : '', NF.money, font(10, C.slate, q === near)); });
      if (q === near) for (let c = 2; c <= 2 + ids.length; c++) vn.getCell(r, c).fill = fill(C.blueT);
    });
    const vN = v0 + qtys.length - 1;
    if (near > 0) note(vn, vN + 1, 2, 2 + Math.max(2, ids.length), `Highlighted: this analysis (${near.toLocaleString('en-GB')} boards a year).`, { size: 9 });
    const dash: Array<'solid' | 'dash' | 'sysDot'> = ['solid', 'dash', 'sysDot'];
    const colours = [C.navy, C.teal, C.muted];
    charts.push({
      sheet: 'Volume & Notes', kind: 'scatter', logX: true, xNumFmt: '#,##0', xMin: Math.min(...qtys), xMax: Math.max(...qtys), title: `Delivered cost per board vs annual volume (${sym}, volume on a log scale)`, legend: 'b',
      numFmt: `"${sym}"#,##0.00`, catTitle: 'Boards per year',
      series: ids.map((id, k) => ({ name: nameOf(id), catRef: '', cats: [], xRef: `'Volume & Notes'!$B$${v0}:$B$${vN}`, xs: qtys,
        valRef: `'Volume & Notes'!$${L(2 + k)}$${v0}:$${L(2 + k)}$${vN}`, vals: qtys.map(q => m(curves[id].find(x => x.qty === q)?.totalPerBoard ?? 0)), color: colours[k], dash: dash[k] })),
      from: { col: 6, row: hRow - 1 }, to: { col: 14, row: Math.max(vN + 2, hRow + 17) },
    });
    r6 = Math.max(vN + 3, hRow + 18);
  } else { note(vn, r6, 2, 13, 'Volume curve not run for this analysis.', { italic: true }); r6 += 2; }

  vn.getRow(r6 - 1).addPageBreak();   // the NRE table and the notes start a page: no total left alone
  bar(vn, r6, 2, 13, 'One-time automotive NRE', rep.nre.length ? 'not in the unit cost' : undefined); r6++;
  if (rep.nre.length) {
    header(vn, r6, [[2, 'Item'], [6, `One-time ${sym}`, true], [10, `Per board, year 1 (${sym})`, true]]); vn.mergeCells(r6, 2, r6, 5); vn.mergeCells(r6, 6, r6, 9); vn.mergeCells(r6, 10, r6, 13); r6++;
    const n0 = r6;
    rep.nre.forEach(([k, v], i) => {
      row(vn, r6, 2, 13, i % 2 === 1); vn.mergeCells(r6, 2, r6, 5); val(vn, r6, 2, k, undefined, font(10), 'left');
      vn.mergeCells(r6, 6, r6, 9); val(vn, r6, 6, m(v), NF.whole);
      vn.mergeCells(r6, 10, r6, 13); val(vn, r6, 10, formula(`IF('Cost Breakdown'!$D$${volRow}=0,0,F${r6}/'Cost Breakdown'!$D$${volRow})`, rep.annualVolume ? m(v) / rep.annualVolume : 0), NF.unit); r6++;
    });
    vn.mergeCells(r6, 2, r6, 5); val(vn, r6, 2, 'Total NRE', undefined, font(10, C.white, true), 'left');
    vn.mergeCells(r6, 6, r6, 9); val(vn, r6, 6, formula(`SUM(F${n0}:F${r6 - 1})`, m(rep.nreTotal)), NF.whole, font(10, C.white, true));
    vn.mergeCells(r6, 10, r6, 13); val(vn, r6, 10, formula(`SUM(J${n0}:J${r6 - 1})`, rep.annualVolume ? m(rep.nreTotal) / rep.annualVolume : 0), NF.unit, font(10, C.white, true));
    for (let c = 2; c <= 13; c++) vn.getCell(r6, c).fill = fill(C.navy);
    r6 += 2;
  } else { note(vn, r6, 2, 13, 'No automotive NRE: a general-grade board.', { italic: true }); r6 += 2; }

  const block = (title: string, lines: string[], empty: string, tint?: string) => {
    bar(vn, r6, 2, 13, title); r6++;
    if (!lines.length) { note(vn, r6, 2, 13, empty, { italic: true }); r6 += 2; return; }
    for (const t of lines) { note(vn, r6, 2, 13, `•  ${t}`, { size: 9.5, color: C.slate, fillHex: tint }); r6++; }
    r6++;
  };
  const sf = rep.safety;
  block('Functional safety (ISO 26262)', sf ? [
    `Costed as ${sf.costed}${sf.claimed ? ` — the photo classifier claimed ${sf.claimed}, not supported by the parts list` : ''}; quality grade ${sf.qualityGrade}.`,
    'An ASIL comes from the hazard analysis (HARA), not from a photograph — confirm it against the safety concept.',
    ...sf.notes, ...(sf.rationale ? [`Classifier's reading: ${sf.rationale}`] : []),
    ...(sf.functions.length ? [`Safety functions suggested by the classifier (unverified): ${sf.functions.join('; ')}`] : []),
  ] : [], 'Not a functional-safety board.');
  block('Analysis checks', rep.warnings, 'No checks raised.');
  block('Limitations stated by the AI photo reader', rep.limitations, 'None stated.');
  block('Method & sources', [
    'Every price is deterministic arithmetic in the CostVision engine; the AI only reads the photos and classifies — it never sets a price.',
    'Component prices: the dated offline catalogue (distributor listings and labelled engineering estimates) or, where a part is not catalogued, the tool\'s own range for that kind of part; breaks follow the parts bought (qty per board × boards).',
    `Fabrication, assembly, test, energy, packaging, cost of quality, freight and duty: country rate tables for ${countryShort} and each compared country (2026 rates).`,
    'Totals, percentages and deltas in this workbook are live formulas over the analysis figures.',
    'What the unit cost excludes (one-time NRE, Tier-1 margin, module housing) is listed on the Summary tab.',
  ], '');

  // ═══ 1. Summary ══════════════════════════════════════════════════════════
  const s = S.ws;
  const tiles: Array<{ c: number; label: string; v: ExcelJSType.CellValue; fmtS?: string; cap: string; color: string }> = [
    { c: 2, label: 'DELIVERED / BOARD', v: formula(`'Cost Breakdown'!D${totalRow}`, m(rep.total)), fmtS: NF.money, cap: `${countryShort} build · UK, duty paid`, color: C.navy },
    { c: 5, label: 'EX-WORKS / BOARD', v: formula(`'Cost Breakdown'!D${exwRow}`, m(rep.exWorks)), fmtS: NF.money, cap: `${countryShort} factory gate, packed`, color: C.navy },
    { c: 8, label: 'LIKELY RANGE', v: rep.confidence ? formula(`"${sym}"&TEXT(O9,"0.00")&" – ${sym}"&TEXT(P9,"0.00")`, `${fmtMoney(rep.confidence.low)} – ${fmtMoney(rep.confidence.high)}`) : 'n/a',
      cap: rep.confidence ? `${rep.confidence.label} confidence · ${rep.confidence.verifyCount} line${rep.confidence.verifyCount === 1 ? '' : 's'} to verify` : 'band not computed', color: C.amber },
    rep.nre.length
      ? { c: 11, label: 'ONE-TIME NRE', v: m(rep.nreTotal), fmtS: NF.whole, cap: 'PPAP · FMEA · DV/PV · audit — not in unit cost', color: C.navy }
      : { c: 11, label: 'BOM', v: `${rep.bom.length} lines · ${rep.bomPieces} parts`, cap: `from the ${rep.bomOrigin}`, color: C.navy },
  ];
  // NRE total cell on Volume & Notes: find it (the row labelled "Total NRE").
  let nreTotalRow = 0; vn.eachRow((rw, rn) => { if (rw.getCell(2).value === 'Total NRE') nreTotalRow = rn; });
  if (rep.nre.length) tiles[3].v = formula(`'Volume & Notes'!F${nreTotalRow}`, m(rep.nreTotal));
  s.getRow(7).height = 4; s.getRow(8).height = 16; s.getRow(9).height = 36; s.getRow(10).height = 16;
  for (const t of tiles) {
    for (let c = t.c; c < t.c + 3; c++) {
      s.getCell(7, c).fill = fill(t.color);
      for (let r = 8; r <= 10; r++) s.getCell(r, c).fill = fill(C.page);
    }
    for (let r = 7; r <= 10; r++) s.getCell(r, t.c + 2).border = { right: { style: 'medium', color: { argb: argb(C.white) } } };
    for (const [r, v, f, nf] of [[8, t.label, font(9, C.muted, true), undefined], [9, t.v, font(t.c === 8 ? 16 : 22, C.navy, true), t.fmtS], [10, t.cap, font(9, C.muted), undefined]] as Array<[number, ExcelJSType.CellValue, Partial<ExcelJSType.Font>, string | undefined]>) {
      s.mergeCells(r, t.c, r, t.c + 2);
      const cell = s.getCell(r, t.c); cell.value = v; cell.font = f; if (nf) cell.numFmt = nf;
      cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1, wrapText: r === 10 };
    }
  }
  s.getRow(10).height = 26;
  // The likely range's two ends, as numbers the tile's text is built from (hidden helper cells O9:P9).
  if (rep.confidence) {
    s.getCell(8, 15).value = 'Range low'; s.getCell(8, 16).value = 'Range high';
    s.getCell(9, 15).value = m(rep.confidence.low); s.getCell(9, 16).value = m(rep.confidence.high);
    s.getCell(9, 15).numFmt = NF.money; s.getCell(9, 16).numFmt = NF.money;
    s.getColumn(15).hidden = true; s.getColumn(16).hidden = true;
  }
  // Cost composition table (B:F) — it is the donut's legend.
  bar(s, 12, 2, 13, 'Cost composition', 'detail on the Cost Breakdown tab');
  header(s, 13, [[2, ''], [3, 'Cost element'], [5, `${sym}/board`, true], [6, '% of total', true]]);
  s.mergeCells(13, 3, 13, 4);
  const buckets = BUCKETS.map(b => ({ ...b, rows: b.keys.map(k => cbRef(k)).filter((x): x is number => !!x), amount: b.keys.reduce((t, k) => t + (rep.stack.find(x => x.key === k)?.amount ?? 0), 0) }))
    .filter(b => b.rows.length && Math.abs(b.amount) >= 0.005);
  const k0 = 14, kN = k0 + buckets.length - 1, kTot = kN + 1;
  buckets.forEach((b, i) => {
    const r = k0 + i; row(s, r, 2, 6, false);
    val(s, r, 2, '■', undefined, font(16, b.color), 'center');   // the donut's legend key
    s.mergeCells(r, 3, r, 4); val(s, r, 3, b.name, undefined, font(10), 'left');
    val(s, r, 5, formula(b.rows.map(x => `'Cost Breakdown'!D${x}`).join('+'), m(b.amount)), NF.money);
    val(s, r, 6, formula(`IF($E$${kTot}=0,0,E${r}/$E$${kTot})`, b.amount / rep.total), NF.pct);
    s.getRow(r).height = 20;
  });
  s.mergeCells(kTot, 3, kTot, 4); val(s, kTot, 3, 'Delivered per board', undefined, font(10, C.white, true), 'left');
  val(s, kTot, 5, formula(`SUM(E${k0}:E${kN})`, m(rep.total)), NF.money, font(11, C.white, true));
  val(s, kTot, 6, formula(`SUM(F${k0}:F${kN})`, 1), NF.pct, font(10, C.white, true));
  for (let c = 2; c <= 6; c++) s.getCell(kTot, c).fill = fill(C.navy);
  s.getRow(kTot).height = 22;
  // Page 1, under the composition table: the top cost drivers (what a director wants first).
  const td = kTot + 2;
  bar(s, td, 2, 6, 'Top cost drivers', 'all lines: Bill of Materials');
  header(s, td + 1, [[2, '#', true], [3, 'Line'], [5, `${sym}/board`, true], [6, '% of total', true]]);
  s.mergeCells(td + 1, 3, td + 1, 4);
  // The three that carry the most (the narrative names the same three); every line is on Bill of Materials.
  const top = rep.bom.map((l, i) => ({ l, i })).sort((a, b) => b.l.ext - a.l.ext).slice(0, 3);
  top.forEach(({ l, i }, k) => {
    const r = td + 2 + k; row(s, r, 2, 6, k % 2 === 1);
    val(s, r, 2, k + 1, NF.count, font(9, C.muted));
    const text = l.description + (l.verify ? '  ·  needs a quote' : '');
    s.mergeCells(r, 3, r, 4); val(s, r, 3, text, undefined, font(10, l.verify ? C.amber : C.slate, l.verify), 'left');
    if (l.verify) s.getCell(r, 3).fill = fill(C.amberT);
    s.getRow(r).height = text.length > 30 ? 30 : 20;
    val(s, r, 5, formula(`'Bill of Materials'!I${b0 + i}`, m(l.ext)), NF.money);
    val(s, r, 6, formula(`IF('Cost Breakdown'!$D$${totalRow}=0,0,E${r}/'Cost Breakdown'!$D$${totalRow})`, l.ext / rep.total), NF.pct);
  });
  const tdEnd = td + 1 + top.length;
  charts.push({
    sheet: 'Summary', kind: 'doughnut', title: `Delivered ${fmtMoney(rep.total)} per board`, holeSize: 60, labels: 'percent', legend: 'none', hideLabelBelow: 0.05,
    series: [{ name: 'Cost composition', catRef: `'Summary'!$C$${k0}:$C$${kN}`, cats: buckets.map(b => b.name), valRef: `'Summary'!$E$${k0}:$E$${kN}`, vals: buckets.map(b => m(b.amount)), colors: buckets.map(b => b.color) }],
    from: { col: 7, row: 12 }, to: { col: 13, row: tdEnd },
  });
  // Page 2: key facts and what to verify side by side, then what it tells you and the exclusions.
  const kf = tdEnd + 2;
  s.getRow(kf - 1).addPageBreak();
  bar(s, kf, 2, 6, 'Key facts');
  bar(s, kf, 7, 13, 'To verify');
  const facts: Array<[string, string]> = [
    ['Board', rep.domainLabel], ['Build country', rep.country], ['Annual volume', rep.annualVolume ? `${rep.annualVolume.toLocaleString('en-GB')} boards` : '—'],
    ['Parts list from', `${rep.bomOrigin} · ${rep.bom.length} lines · ${rep.bomPieces} parts`],
    ...rep.boardRows.filter(([k]) => /^(Size|Layers)$/.test(k)).map(([k, v]) => [k, v] as [string, string]),
    ...(rep.safety ? [['ISO 26262', `${rep.safety.costed} costed${rep.safety.claimed ? ` (claimed ${rep.safety.claimed})` : ''}`] as [string, string]] : []),
    ['Price engine', 'Deterministic — the AI never sets a price'],
  ];
  facts.forEach(([k, v], i) => {
    const r = kf + 1 + i; s.getRow(r).height = v.length > 40 ? 30 : 20;
    s.mergeCells(r, 2, r, 3); val(s, r, 2, k, undefined, font(9, C.muted), 'left'); s.getCell(r, 2).fill = fill(C.page);
    s.mergeCells(r, 4, r, 6); val(s, r, 4, v, undefined, font(10, C.slate), 'left'); s.getCell(r, 2).alignment = { vertical: 'middle', indent: 1 };
    for (let c = 2; c <= 6; c++) s.getCell(r, c).border = { bottom: hair() };
  });
  const verify = rep.confidence
    ? [`${rep.confidence.label} confidence — likely ${fmtMoney(rep.confidence.low)} to ${fmtMoney(rep.confidence.high)} per board.`,
       rep.confidence.verifyCount ? `${rep.confidence.verifyCount} line${rep.confidence.verifyCount === 1 ? '' : 's'} of ${fmtMoney(1)}+ priced from a range, not a quote (${fmtMoney(rep.confidence.verifyValue)}): see "Quote" on Bill of Materials.` : `Every line of ${fmtMoney(1)}+ has a distributor price behind it.`]
    : ['No confidence band was computed for this analysis.'];
  // Each verify bullet is a block of rows beside the facts (merged H:M), sized to its text.
  let vr = kf + 1;
  for (const t of verify) {
    const rowsNeeded = Math.max(1, Math.ceil(t.length / 70));
    if (rowsNeeded > 1) s.mergeCells(vr, 7, vr + rowsNeeded - 1, 13); else s.mergeCells(vr, 7, vr, 13);
    const c = s.getCell(vr, 7); c.value = `•  ${t}`; c.font = font(9.5, C.slate); c.alignment = { wrapText: true, vertical: 'top', indent: 1 };
    for (let r = vr; r < vr + rowsNeeded; r++) for (let k = 7; k <= 13; k++) s.getCell(r, k).fill = fill(C.amberT);
    vr += rowsNeeded;
  }
  let dr = Math.max(kf + 1 + facts.length, vr) + 1;
  bar(s, dr, 2, 13, 'What this tells you'); dr++;
  for (const d of rep.drivers) { note(s, dr, 2, 13, `•  ${d}`, { size: 10, color: C.slate }); dr++; }
  dr++;
  bar(s, dr, 2, 13, 'Not in this unit cost'); dr++;
  for (const t of rep.excluded) { note(s, dr, 2, 13, `•  ${t}`, { size: 9.5, color: C.slate, fillHex: C.page }); dr++; }

  // Print areas.
  // Print areas reach the last row of any chart anchored on the sheet (a chart below the table
  // outside the area made LibreOffice scale the page by the wrong box and clip the last column).
  for (const { ws, last } of [S, CB, BM, BA, CO, VN]) {
    const chartEnd = Math.max(0, ...charts.filter(c => c.sheet === ws.name).map(c => c.to.row));
    ws.pageSetup.printArea = `A1:${L(last + 1)}${Math.max(ws.rowCount, chartEnd)}`;
  }

  const raw = await wb.xlsx.writeBuffer();
  return addCharts(raw as ArrayBuffer, charts);
}
