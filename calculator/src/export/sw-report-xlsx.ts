/**
 * Software should-cost Excel workbook — the 360° report as a live, auditable workbook (plan
 * docs/plans/sw-report-360-plan-2026-10-14.md §5, Oct 2026). It draws the SAME report model as the PDF
 * (src/engine/sw-report-model.ts), so the two cannot disagree.
 *
 * Totals are formulas, not pasted numbers, in one chain a reviewer can follow and change:
 *   Rates (hub mid / senior → blend → × source × burden → loaded £/PM; tool seat; maintenance weights × discount factors)
 *     → Module detail (per module: nominal PM × calibration × reuse × ASIL → bucket PM × rate × share = development £;
 *        verification, integration, cyber, calibration, ML as fractions of development; tools = engineer-years × seat;
 *        maintenance = base × Σ weight × discount; IP = £/yr × Σ discount over the production years)
 *     → Module register (every module × every cost element) → domain sheets → Cost build-up → Summary.
 * Royalties, cloud, homologation and the fixed cloud platform enter as the engine's values (labelled). Every formula
 * carries the engine's figure as its cached result, so the file reads correctly before recalculation; the Checks sheet
 * recomputes each total against the engine's value and shows ✓ / ✗ (LibreOffice recalculation: 0 errors, all ✓).
 *
 * Money is written in the report currency (the engine's £ × the page FX), so every formula stays linear. Brand light
 * theme (src/brand/brand.json), Calibri, logo on every sheet, frozen headers, native charts (xlsx-charts.ts).
 */
import type ExcelJSType from 'exceljs';
import { resolveRateLibrary } from '../engine/sw-rate-library.js';
import { swRateBasis, SW_DEV_SOURCE_LABEL, SW_MC_RANGE_BY_GRADE, SW_MAINT_FULL_YEARS, SW_MAINT_TAIL, SW_POST_EOP_SHARE,
  SW_DEFAULT_DEVELOPMENT_MONTHS, SW_TOOL_SEAT_GBP, SW_DEV_SPLIT, type SWEvidenceGrade } from '../engine/sw-should-cost.js';
import { SW_REPORT_PROFILES, type SWReportModel, type SWReportDomain } from '../engine/sw-report-model.js';
import { SKELETON_W, SKELETON_H, SKELETON_H_NO_LEGEND } from './sw-report-skeleton.js';
import type { RasterImage } from './svg-raster.js';
import { addCharts, type ChartSpec } from './xlsx-charts.js';
import { LOGO_PNG_BASE64 } from '../brand/logo-png.js';
import { localiseReportText } from './money-text.js';

const C = {
  navy: '16325C', blue: '1D6FB8', violet: '6B3FA0', teal: '0D7D71', green: '2A7F50', amber: '99651A', red: 'B03A2E',
  slate: '3A4356', muted: '686F7D', page: 'F4F7FB', white: 'FFFFFF', line: 'DCE3EE', barNote: 'C8D7F0',
  blueT: 'E8F1FA', violetT: 'F1EBF8', tealT: 'E6F4F1', greenT: 'EAF6EF', amberT: 'FCF3E3', redT: 'FBECEA',
};
/** Chart colours (validated, see sw-report-pdf.ts): NRE blue / lifecycle amber; five series for spend. */
const NRE = C.blue, LIFE = C.amber;
const SERIES = ['1D6FB8', 'D9822B', '6B3FA0', '2A9D8F', 'B03A2E'];
const GRADE_C: Record<SWEvidenceGrade, [string, string]> = {
  entered: [C.teal, C.tealT], calibrated: [C.blue, C.blueT], sourced: [C.green, C.greenT], estimate: [C.amber, C.amberT], unsourced: [C.red, C.redT],
};
const GRADE_NAME: Record<string, string> = { entered: 'Your figure', calibrated: 'Calibrated', sourced: 'Published source', estimate: 'Labelled estimate', unsourced: 'Unsourced catalogue' };
const FONT = 'Calibri';
const argb = (h: string) => 'FF' + h;
const fill = (h: string): ExcelJSType.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb(h) } });
const font = (size: number, color = C.slate, bold = false, italic = false): Partial<ExcelJSType.Font> => ({ name: FONT, size, color: { argb: argb(color) }, bold, italic });
const hair = (h = C.line): Partial<ExcelJSType.Border> => ({ style: 'hair', color: { argb: argb(h) } });
/** 0 → A */
export const colL = (n: number) => { let s = ''; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
/** 1-based column → letter. */
const A = (c: number) => colL(c - 1);
const q = (sheet: string) => `'${sheet.replace(/'/g, "''")}'`;

export interface SWWorkbookOptions { images?: Map<string, RasterImage> }

export async function buildSWReportWorkbook(md: SWReportModel, opt: SWWorkbookOptions = {}): Promise<Uint8Array> {
  const mod = await import('exceljs');
  const ExcelJS = ((mod as unknown as { default?: typeof ExcelJSType }).default ?? mod) as typeof ExcelJSType;
  const req = md.request, r = md.result, s = r.summary, p = r.inputs;
  const fx = req.currency.perGbp || 1, sym = req.currency.sym.replace(/"/g, '');
  const X = (gbp: number) => gbp * fx;   // £ → report currency
  const NF = {
    money: `"${sym}"#,##0;-"${sym}"#,##0;"–"`, money2: `"${sym}"#,##0.00;-"${sym}"#,##0.00;"–"`,
    M: `"${sym}"#,##0.0,,"M";-"${sym}"#,##0.0,,"M";"–"`, pct: '0.0%', pm: '#,##0.0', count: '#,##0', f3: '0.000', f2: '0.00', f4: '0.0000',
    delta: `+"${sym}"#,##0.0,,"M";-"${sym}"#,##0.0,,"M";"${sym}"0.0M`,
  };
  const images = opt.images ?? new Map<string, RasterImage>();
  // Money in TEXT follows the report currency (review H6).
  const T = (t: string) => localiseReportText(t, fx, sym);
  const prof = SW_REPORT_PROFILES[md.profile];
  const date = req.generatedAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const meta = [`${req.hubLabel} hub`, `${p.annualProductionVolume.toLocaleString('en-GB')} vehicles / yr × ${p.programLifeYears} yr`,
    SW_DEV_SOURCE_LABEL[p.devSource], `Prepared ${date}`, `Currency ${req.currency.code} (${sym})`,
    req.meta?.reference ? `Ref. ${req.meta.reference}` : '', req.meta?.confidentiality ?? ''].filter(Boolean).join('   ·   ');

  const wb = new ExcelJS.Workbook();
  wb.creator = req.meta?.preparedBy || 'CostVision'; wb.title = `${req.title} — software should-cost (${prof.label})`; wb.company = 'CostVision';
  wb.calcProperties = { fullCalcOnLoad: true };
  const logo = wb.addImage({ base64: LOGO_PNG_BASE64, extension: 'png' });
  const charts: ChartSpec[] = [];
  const sheets: Array<{ ws: ExcelJSType.Worksheet; last: number; title: string }> = [];

  const sheet = (name: string, tab: string, widths: number[], subtitle: string, opts: { landscape?: boolean; freeze?: number; freezeCol?: number } = {}) => {
    const ws = wb.addWorksheet(name, {
      properties: { tabColor: { argb: argb(tab) }, defaultRowHeight: 18 },
      views: [opts.freeze ? { state: 'frozen', ySplit: opts.freeze, xSplit: opts.freezeCol ?? 0, showGridLines: false, zoomScale: 100 } : { showGridLines: false, zoomScale: 100 }],
      pageSetup: { paperSize: 9, orientation: opts.landscape === false ? 'portrait' : 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
        horizontalCentered: true, margins: { left: 0.4, right: 0.4, top: 0.55, bottom: 0.55, header: 0.25, footer: 0.25 } },
      headerFooter: { oddFooter: `&L&8CostVision · software should-cost${req.meta?.confidentiality ? ` · ${req.meta.confidentiality.replace(/&/g, '&&')}` : ''}&C&8&A&R&8Page &P of &N` },
    });
    ws.getColumn(1).width = 2;
    widths.forEach((w, i) => { ws.getColumn(i + 2).width = w; });
    const last = widths.length;
    ws.getRow(1).height = 34; ws.getRow(2).height = 26; ws.getRow(3).height = 18; ws.getRow(4).height = 16; ws.getRow(5).height = 3; ws.getRow(6).height = 10;
    ws.addImage(logo, { tl: { col: 1.05, row: 0.18 }, ext: { width: 150, height: 31 }, editAs: 'oneCell' });
    const tag = ws.getCell(1, last + 1); tag.value = `Software should-cost · ${prof.label}`; tag.font = font(9, C.muted); tag.alignment = { horizontal: 'right', vertical: 'middle' };
    const put = (row: number, v: string, f: Partial<ExcelJSType.Font>) => {
      ws.mergeCells(row, 2, row, last + 1);
      const c = ws.getCell(row, 2); c.value = v; c.font = f; c.alignment = { vertical: 'middle', horizontal: 'left' };
    };
    put(2, req.title, font(18, C.navy, true)); put(3, subtitle, font(11, C.slate)); put(4, meta, font(9, C.muted));
    for (let c = 1; c <= last + 1; c++) ws.getCell(5, c).fill = fill(C.navy);
    ws.pageSetup.printTitlesRow = '1:5';
    sheets.push({ ws, last, title: subtitle });
    return { ws, last };
  };
  const bar = (ws: ExcelJSType.Worksheet, row: number, c0: number, c1: number, title: string, noteText?: string) => {
    ws.getRow(row).height = 22;
    const split = noteText ? Math.max(c0 + 1, c1 - Math.min(5, Math.floor((c1 - c0) / 2))) : c1;
    if (split > c0) ws.mergeCells(row, c0, row, noteText ? split - 1 : c1);
    const t = ws.getCell(row, c0); t.value = title; t.font = font(11, C.white, true); t.alignment = { vertical: 'middle', indent: 1 };
    for (let c = c0; c <= c1; c++) ws.getCell(row, c).fill = fill(C.navy);
    ws.getCell(row, c0).border = { left: { style: 'thick', color: { argb: argb(C.blue) } } };
    if (noteText) {
      if (c1 > split) ws.mergeCells(row, split, row, c1);
      const n = ws.getCell(row, split); n.value = noteText; n.font = font(9, C.barNote); n.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
    }
  };
  const header = (ws: ExcelJSType.Worksheet, row: number, labels: Array<[number, string, boolean?]>) => {
    ws.getRow(row).height = 30;
    for (const [c, text, isNum] of labels) {
      const cell = ws.getCell(row, c); cell.value = text; cell.font = font(9.5, C.navy, true); cell.fill = fill(C.blueT);
      cell.alignment = { vertical: 'middle', horizontal: isNum ? 'right' : 'left', wrapText: true, indent: isNum ? 0 : 1 };
      cell.border = { bottom: { style: 'medium', color: { argb: argb(C.navy) } } };
    }
  };
  const note = (ws: ExcelJSType.Worksheet, row: number, c0: number, c1: number, text: string, o: { size?: number; color?: string; fillHex?: string; italic?: boolean; bold?: boolean } = {}) => {
    if (c1 > c0) ws.mergeCells(row, c0, row, c1);
    const cell = ws.getCell(row, c0);
    text = T(text);
    cell.value = text; cell.font = font(o.size ?? 9, o.color ?? C.muted, !!o.bold, !!o.italic);
    cell.alignment = { wrapText: true, vertical: 'top', indent: 1 };
    if (o.fillHex) for (let c = c0; c <= c1; c++) ws.getCell(row, c).fill = fill(o.fillHex);
    let w = 0; for (let c = c0; c <= c1; c++) w += ws.getColumn(c).width ?? 9;
    const lines = text.split('\n').reduce((t, part) => t + Math.max(1, Math.ceil((part.length * ((o.size ?? 9) / 9)) / Math.max(10, w * 1.3))), 0);
    ws.getRow(row).height = Math.max(16, lines * 12.5 + 5);
  };
  const zebra = (ws: ExcelJSType.Worksheet, row: number, c0: number, c1: number, z: boolean) => {
    for (let c = c0; c <= c1; c++) { const cell = ws.getCell(row, c); cell.border = { bottom: hair() }; if (z) cell.fill = fill(C.page); }
  };
  const val = (ws: ExcelJSType.Worksheet, row: number, c: number, v: ExcelJSType.CellValue, numFmt?: string, f: Partial<ExcelJSType.Font> = font(10), align: 'left' | 'right' | 'center' = 'right') => {
    const cell = ws.getCell(row, c); cell.value = typeof v === 'string' ? T(v) : v; if (numFmt) cell.numFmt = numFmt; cell.font = f;
    cell.alignment = { vertical: 'middle', horizontal: align, indent: align === 'left' ? 1 : 0, wrapText: align === 'left' };
    return cell;
  };
  const F = (f: string, result: number | string): ExcelJSType.CellFormulaValue => ({ formula: f, result } as ExcelJSType.CellFormulaValue);
  const strong = (ws: ExcelJSType.Worksheet, row: number, c0: number, c1: number) => {
    for (let c = c0; c <= c1; c++) { const cell = ws.getCell(row, c); cell.font = { ...(cell.font ?? font(10)), bold: true, color: { argb: argb(C.navy) } }; cell.border = { top: { style: 'thin', color: { argb: argb(C.navy) } }, bottom: { style: 'thin', color: { argb: argb(C.navy) } } }; cell.fill = fill(C.blueT); }
  };
  const picture = (ws: ExcelJSType.Worksheet, key: string, col: number, row: number, widthPx: number, legend = true): number => {
    const img = images.get(key);
    const h = Math.round(widthPx * (legend ? SKELETON_H : SKELETON_H_NO_LEGEND) / SKELETON_W);
    if (!img) { note(ws, row, col, col + 4, 'Vehicle skeleton picture not rendered in this export.', { italic: true }); return 2; }
    const id = wb.addImage({ base64: img.dataUrl.replace(/^data:image\/\w+;base64,/, ''), extension: 'png' });
    ws.addImage(id, { tl: { col: col - 1 + 0.05, row: row - 1 + 0.1 }, ext: { width: widthPx, height: h }, editAs: 'oneCell' });
    return Math.ceil(h / 20) + 1;   // rows used at 15 pt ≈ 20 px
  };
const cachedNum = (ws: ExcelJSType.Worksheet, rr: number, c: number) => { const v = ws.getCell(rr, c).value; return typeof v === 'number' ? v : Number((v as ExcelJSType.CellFormulaValue | null)?.result ?? 0); };
  const has = (id: string) => md.sections.some(x => x.id === id);
  const v = md.profile;
  const want = {
    domains: v === 'vehicle' || v === 'domain', architecture: has('architecture'), spend: v === 'vehicle', unit: v === 'vehicle' || v === 'executive',
    hubs: has('hubs'), countries: has('hubs') && v !== 'executive', risk: has('risk'), evidence: has('evidence') || v === 'vehicle', makebuy: v === 'vehicle' || v === 'supplier',
    scope: has('scope'), assumptions: v === 'vehicle' || v === 'supplier',
  };

  // ── Sheets in tab order ───────────────────────────────────────────────────────────────────────────────────────────
  const COVER = sheet('Cover', C.navy, Array(12).fill(12.5), `Software should-cost report · ${prof.label}`, { landscape: true });
  const TOC = sheet('Contents', C.navy, [6, 36, 70], 'Contents · every sheet, what it holds');
  const SUM = sheet('Summary', C.navy, Array(12).fill(12.5), md.slice.isWhole ? 'Executive summary' : 'Summary · a slice of the vehicle costing');
  const ARCH = want.architecture ? sheet('Architecture', C.teal, [6, 30, 12, 10, 60, 40], 'E/E architecture · where the software runs') : null;
  const BUILD = sheet('Cost build-up', C.blue, [34, 16, 16, 16, 10, 50], 'Cost build-up · cost elements → engineering → lifecycle → total (live formulas)');
  const DOM = want.domains ? md.domains.map(d => ({ d, ...sheet(domainSheetName(d), C.violet, [40, 7, 11, 9, 8, 9, 14, 14, 14, 10], `${d.label} · domain`, { freeze: 0 }) })) : [];
  const REG = sheet('Module register', C.blue, [40, 26, 6, 11, 9, 8, 9, 13, 13, 13, 13, 13, 13, 14, 13, 13, 13, 14, 14, 9], 'Module register · every module × every cost element (formulas on Module detail)', { freeze: 8, freezeCol: 2 });
  const DET = sheet('Module detail', C.blue, [40, 10, 10, 8, 8, 9, 7, 9, 7, 9, 8, 8, 8, 8, 8, 8, 8, 8, 12, 13, 7, 13, 7, 12, 7, 12, 7, 12, 7, 12, 9, 13, 13, 7, 13, 13, 13, 13, 13, 14, 14, 14, 13],
    'Module detail · the effort chain and every cost line per module, as formulas on Rates', { freeze: 8, freezeCol: 2 });
  const RATES = sheet('Rates', C.green, [40, 16, 16, 64], 'Rates and programme inputs · the cost chain follows these cells; royalties, cloud, hubs and risk stay at the engine\'s values');
  const UNIT = want.unit ? sheet('Unit economics', C.amber, [44, 16, 18, 18, 40], 'Unit economics · the figures purchasing compares (formulas)') : null;
  const SPEND = want.spend ? sheet('Spend by year', C.amber, [12, 14, 14, 14, 14, 14, 15, 15], 'Spend by year · nominal, development → production → service', { freeze: 8 }) : null;
  const HUBS = want.hubs ? sheet('Hubs', C.green, [30, 12, 14, 14, 14, 15, 13, 15], 'Every engineering hub · the same scope re-costed at each') : null;
  const CTRY = want.countries ? sheet('Countries', C.green, [26, 24, 16, 70], 'Every manufacturing country → its software hub', { freeze: 8 }) : null;
  const RISK = want.risk ? sheet('Risk', C.red, [40, 15, 15, 15, 15, 15], 'Risk · Monte Carlo band and one-at-a-time sensitivity') : null;
  const MB = want.makebuy ? sheet('Make or buy', C.violet, [36, 16, 16, 16, 16, 40], 'Make or buy · and the supplier quote check') : null;
  const EVI = want.evidence ? sheet('Evidence', C.teal, [52, 14, 18, 15, 70], 'Evidence · every costed line with its grade and basis', { freeze: 0 }) : null;
  const ASM = want.assumptions ? sheet('Assumptions', C.teal, [40, 100], 'Assumptions, your figures and calibration priorities') : null;
  const SCOPE = want.scope ? sheet('Scope', C.slate, [44, 34, 70], 'Scope · exclusions, catalogue gaps and limitations') : null;
  const CHK = sheet('Checks', C.green, [64, 18, 18, 14, 10], 'Checks · every total recomputed against the engine (✓ / ✗)', { freeze: 8 });

  const checks: Array<{ label: string; formula: string; result: number; engine: number }> = [];
  const check = (label: string, formula: string, engine: number) => checks.push({ label, formula, result: engine, engine });

  // ── Rates ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  const R = RATES.ws, RN = q(R.name);
  const lib = resolveRateLibrary(p.rateLibrary);
  const hubBook = lib.hubRates[p.region];
  const c0 = md.modules[0]?.result.chain ?? r.modules[0]?.chain;
  const typed = !!(p.baseRateGBP && p.baseRateGBP > 0);
  let row = 7;
  const rate: Record<string, string> = {};
  const input = (key: string, label: string, value: ExcelJSType.CellValue, numFmt: string, basis: string, isInput = true) => {
    row++;
    val(R, row, 2, label, undefined, font(10), 'left');
    const cell = val(R, row, 3, value, numFmt, font(10, isInput ? C.blue : C.slate, !isInput));
    if (isInput) cell.fill = fill(C.blueT);
    val(R, row, 5, basis, undefined, font(9, C.muted), 'left');
    zebra(R, row, 2, 5, false);
    rate[key] = `${RN}!$C$${row}`;
    return `C${row}`;
  };
  bar(R, ++row, 2, 5, 'Hub engineering rate', 'blue cells are inputs');
  input('hub', 'Engineering hub', req.hubLabel, '@', `rate book ${req.bookVersion}`, false);
  const midC = input('mid', 'Mid engineer, per person-month', X(hubBook?.mid.value ?? 0), NF.money, 'salary + statutory on-cost ÷ productive hours × 152 h (book)');
  const senC = input('senior', 'Senior engineer, per person-month', X(hubBook?.senior.value ?? 0), NF.money, 'book');
  const shC = input('share', 'Senior share of the team', p.teamSeniorFraction, NF.pct, 'programme input');
  const blendC = typed ? input('blend', 'Hub rate (your typed rate)', X(p.baseRateGBP!), NF.money, 'your figure for this hub — replaces the book blend')
    : input('blend', 'Hub rate (mid / senior blend)', F(`${senC}*${shC}+${midC}*(1-${shC})`, X(c0?.engineerRate ?? 0)), NF.money, '= senior × share + mid × (1 − share)', false);
  const srcC = input('src', `Development-source price (${SW_DEV_SOURCE_LABEL[p.devSource]})`, c0?.devSourceMult ?? 1, NF.f4, p.devSource === 'OEM_Internal' ? 'in-house' : 'efficiency ÷ (1 − supplier margin)');
  let burC: string;
  if (p.burden) {
    const e = input('emp', 'Burden: employment layer %', p.burden.employmentPct, '0.0', 'pension top-up, bonus, benefits');
    const co = input('co', 'Burden: company layer %', p.burden.companyPct, '0.0', 'site, IT, management, non-project time');
    const ca = input('cap', 'Burden: capital layer %', p.burden.capitalPct, '0.0', 'workstations, labs');
    burC = input('burden', 'Engineering burden (×)', F(`(1+${e}/100)*(1+${co}/100)*(1+${ca}/100)`, c0?.overhead ?? 1), NF.f4, '= Π (1 + layer)', false);
  } else burC = input('burden', 'Engineering burden (×)', p.overheadMultiplier, NF.f4, 'a single overhead saved with this configuration');
  input('loaded', 'Loaded rate, per person-month', F(`${blendC}*${srcC}*${burC}`, X(c0?.loadedRate ?? 0)), NF.money, '= hub rate × source × burden', false);
  input('sched', 'Schedule-compression penalty (×)', c0?.schedPenalty ?? 1, NF.f4, '1 = nominal schedule');
  row++;
  bar(R, ++row, 2, 5, 'Programme');
  input('vol', 'Annual production volume', p.annualProductionVolume, NF.count, 'vehicles a year');
  const lifeC = input('life', 'Production life, years', p.programLifeYears, '0', 'programme input');
  input('rec', 'NRE recovery window, years', Math.max(1, p.costRecoveryYears ?? p.programLifeYears), '0', 'per-vehicle NRE is spread over it');
  const discC = input('disc', 'Discount rate %', p.discountRatePct ?? 0, '0.0', '0 = nominal money');
  input('maintOn', 'Maintenance included (1 / 0)', p.includeMaintenanceCost ? 1 : 0, '0', 'programme switch');
  input('seat', 'Development tools, per engineer-seat-year', X(p.toolSeatGBPPerYear ?? SW_TOOL_SEAT_GBP), NF.money, 'CostVision estimate unless typed');
  const devmC = input('devm', 'Development window, months', p.developmentMonths ?? SW_DEFAULT_DEVELOPMENT_MONTHS, '0', 'tools are paid over it');
  input('toolDisc', 'Tool discount factor', F(`IF(${discC}=0,1,(1-(1+${discC}/100)^(-${devmC}/12))/(${discC}/100)/(${devmC}/12))`, c0?.toolDiscount ?? 1), NF.f4, '= annuity factor ÷ years (1 at 0 %)', false);
  row++;
  bar(R, ++row, 2, 5, 'Maintenance profile and discounting');
  const fullC = input('full', 'Years at full maintenance after SOP', SW_MAINT_FULL_YEARS, '0', 'then the tail');
  const tailC = input('tail', 'Tail share', SW_MAINT_TAIL, NF.pct, 'of the full rate');
  input('post', 'Security support after the last build, years', md.postSupportYears, '0', 'UN R155 post-production duty');
  const pshC = input('postShare', 'Security support share of the tail team', p.postProductionSupportShare ?? SW_POST_EOP_SHARE, NF.pct, 'CostVision assumption');
  const escC = input('esc', 'Wage escalation % a year', p.wageEscalationPct ?? 0, '0.0', '0 = real terms');
  row++;
  header(R, ++row, [[2, 'Programme year after SOP'], [3, 'Maintenance weight', true], [4, 'Discount factor', true], [5, 'Licence year (1 / 0)']]);
  const nYears = p.programLifeYears + md.postSupportYears;
  const y0 = row + 1;
  for (let i = 1; i <= Math.max(nYears, p.programLifeYears); i++) {
    row++;
    val(R, row, 2, i, '0', font(10), 'left');
    val(R, row, 3, F(`IF(B${row}<=${fullC},1,${tailC})*IF(B${row}>${lifeC},${pshC},1)*(1+${escC}/100)^(B${row}-1)`, 0), NF.f3);
    val(R, row, 4, F(`IF(${discC}=0,1,1/(1+${discC}/100)^B${row})`, 1), NF.f4);
    val(R, row, 5, F(`IF(B${row}<=${lifeC},1,0)`, i <= p.programLifeYears ? 1 : 0), '0', font(10), 'right');
    zebra(R, row, 2, 5, i % 2 === 0);
  }
  const y1 = row;
  // cached results for the weights
  const wts = Array.from({ length: y1 - y0 + 1 }, (_, i) => (i < SW_MAINT_FULL_YEARS ? 1 : SW_MAINT_TAIL) * (i >= p.programLifeYears ? (p.postProductionSupportShare ?? SW_POST_EOP_SHARE) : 1) * Math.pow(1 + (p.wageEscalationPct ?? 0) / 100, i));
  const dfs = Array.from({ length: y1 - y0 + 1 }, (_, i) => ((p.discountRatePct ?? 0) > 0 ? 1 / Math.pow(1 + (p.discountRatePct ?? 0) / 100, i + 1) : 1));
  for (let i = y0; i <= y1; i++) { (R.getCell(i, 3).value as ExcelJSType.CellFormulaValue).result = wts[i - y0]; (R.getCell(i, 4).value as ExcelJSType.CellFormulaValue).result = dfs[i - y0]; }
  row++;
  input('maintPV', 'Σ weight × discount (maintenance years)', F(`SUMPRODUCT(C${y0}:C${y1},D${y0}:D${y1})`, wts.reduce((a, w, i) => a + w * dfs[i], 0)), NF.f4, 'multiplies each module\'s yearly maintenance base', false);
  input('licPV', 'Σ discount over the production years (licences)', F(`SUMPRODUCT(D${y0}:D${y1},E${y0}:E${y1})`, dfs.slice(0, p.programLifeYears).reduce((a, b) => a + b, 0)), NF.f4, 'multiplies each module\'s IP licence a year', false);
  row++;
  bar(R, ++row, 2, 5, 'Development split of the costed effort (fixed)');
  const split: Record<string, string> = {};
  for (const [k, lab] of [['requirements', 'Requirements'], ['architecture', 'Architecture'], ['algorithmDev', 'Algorithms (× complexity)'], ['implementation', 'Implementation (× implementation complexity)'], ['safetyCompliance', 'Functional safety (× safety-reuse scale)']] as const) {
    input(`split-${k}`, lab, SW_DEV_SPLIT[k], NF.pct, 'share of development person-months'); split[k] = rate[`split-${k}`];
  }
  input('implW', 'Implementation complexity weight', 0.15, NF.f2, 'implementation factor = 1 + (complexity − 1) × weight');
  check('Loaded rate = engine', rate.loaded, X(c0?.loadedRate ?? 0));
  check('Hub rate = engine', rate.blend, X(c0?.engineerRate ?? 0));
  if (req.hubRate) {
    row++; bar(R, ++row, 2, 5, 'Hub rate build-up and sources');
    row++; note(R, row, 2, 5, req.hubRate.build + (req.hubRate.median ? `\n${req.hubRate.median}` : '') + `\nRate confidence: ${req.hubRate.confidence}.`, { size: 9.5, color: C.slate });
    row++; header(R, row, [[2, 'Figure'], [3, 'Source'], [5, 'Page']]);
    for (const [a, b, c] of req.hubRate.sources) {
      row++; R.mergeCells(row, 3, row, 4);
      val(R, row, 2, a, undefined, font(9.5), 'left'); val(R, row, 3, b, undefined, font(9), 'left');
      const link = val(R, row, 5, c ? { text: c, hyperlink: c } : '', undefined, { ...font(8.5, C.blue), underline: !!c }, 'left'); void link;
      R.getRow(row).height = 30; zebra(R, row, 2, 5, false);
    }
  }
  row++; bar(R, ++row, 2, 5, 'Rate basis — what these figures were priced on');
  for (const [k, vv] of swRateBasis(p)) { row++; val(R, row, 2, k, undefined, font(9.5, C.navy, true), 'left'); R.mergeCells(row, 3, row, 5); val(R, row, 3, vv, undefined, font(9), 'left'); R.getRow(row).height = Math.max(18, Math.ceil(vv.length / 110) * 13 + 4); zebra(R, row, 2, 5, false); }

  // ── Module detail ─────────────────────────────────────────────────────────────────────────────────────────────────
  const D = DET.ws, DN = q(D.name);
  const dcols = ['Module', 'Domain', 'Effort basis', 'Nominal PM', 'Calib.', 'Reuse', 'Effective PM', 'ASIL ×', 'Dev PM', 'Complexity', 'Impl. ×', 'Safety ×', 'Share',
    'Req. PM', 'Arch. PM', 'Algo. PM', 'Impl. PM', 'Safety PM', 'Effort rate', 'Development', 'Verif. %', 'Verification', 'Integ. %', 'Integration', 'Cyber %', 'Cybersecurity',
    'Calib. %', 'Calibration', 'ML %', 'ML data', 'Eng.-years', 'Tools', 'Engineering (NRE)', 'Maint. %/yr', 'Maint. base / yr', 'Maintenance', 'IP / yr', 'IP licences',
    'Royalties (engine)', 'Cloud (engine)', 'Lifecycle', 'Module total', 'Engine total'];
  bar(D, 7, 2, dcols.length + 1, 'Every module: inputs (blue), formulas (black), engine values (grey italic)', `effort rate = Rates loaded × schedule`);
  header(D, 8, dcols.map((h, i) => [i + 2, h, i >= 3] as [number, string, boolean]));
  const col: Record<string, number> = {};
  dcols.forEach((h, i) => { col[h] = i + 2; });
  const ref = (h: string, rr: number) => `${A(col[h])}${rr}`;
  const detRow = new Map<string, number>();
  const ordered = md.domains.flatMap(d => d.moduleIds.map(id => md.modules.find(m => m.id === id)!)).filter(Boolean);
  ordered.forEach((m, i) => {
    const rr = 9 + i; detRow.set(m.id, rr);
    const x = m.result, c = x.chain;
    const inp = (h: string, value: number, nf: string) => { const cell = val(D, rr, col[h], value, nf, font(10, C.blue)); cell.fill = fill(C.blueT); };
    const fm = (h: string, f: string, result: number, nf: string) => val(D, rr, col[h], F(f, result), nf);
    const eng = (h: string, value: number, nf: string) => val(D, rr, col[h], value, nf, font(10, C.muted, false, true));
    val(D, rr, col['Module'], m.name + (m.custom ? ' (your module)' : ''), undefined, font(10, C.navy, true), 'left');
    val(D, rr, col['Domain'], m.categoryLabel, undefined, font(9), 'left');
    val(D, rr, col['Effort basis'], x.effortBasis === 'custom' ? 'your PM' : x.effortBasis === 'size' ? 'COCOMO (KSLOC)' : m.custom ? 'your module' : 'catalogue', undefined, font(9), 'left');
    inp('Nominal PM', c.nominalPM, NF.pm); inp('Calib.', c.effortCal, NF.f3); inp('Reuse', c.reuseFactor, NF.f2);
    fm('Effective PM', `${ref('Nominal PM', rr)}*${ref('Calib.', rr)}*${ref('Reuse', rr)}`, c.effectivePM, NF.pm);
    inp('ASIL ×', c.asilDev, NF.f2);
    fm('Dev PM', `${ref('Effective PM', rr)}*${ref('ASIL ×', rr)}`, c.devPM, NF.pm);
    inp('Complexity', c.complexity, NF.f2);
    fm('Impl. ×', `1+(${ref('Complexity', rr)}-1)*${rate.implW}`, c.implComplexity, NF.f3);
    inp('Safety ×', c.safetyScale, NF.f3); inp('Share', c.share, NF.f3);
    fm('Req. PM', `${ref('Dev PM', rr)}*${split.requirements}`, c.bucketPM.requirements, NF.pm);
    fm('Arch. PM', `${ref('Dev PM', rr)}*${split.architecture}`, c.bucketPM.architecture, NF.pm);
    fm('Algo. PM', `${ref('Dev PM', rr)}*${split.algorithmDev}*${ref('Complexity', rr)}`, c.bucketPM.algorithmDev, NF.pm);
    fm('Impl. PM', `${ref('Dev PM', rr)}*${split.implementation}*${ref('Impl. ×', rr)}`, c.bucketPM.implementation, NF.pm);
    fm('Safety PM', `${ref('Dev PM', rr)}*${split.safetyCompliance}*${ref('Safety ×', rr)}`, c.bucketPM.safetyCompliance, NF.pm);
    fm('Effort rate', `${rate.loaded}*${rate.sched}`, X(c.effortRate), NF.money);
    fm('Development', `SUM(${ref('Req. PM', rr)}:${ref('Safety PM', rr)})*${ref('Effort rate', rr)}*${ref('Share', rr)}`, X(x.development.total), NF.money);
    const frac = (pctH: string, moneyH: string, value: number, result: number) => { inp(pctH, value, NF.pct); fm(moneyH, `${ref('Development', rr)}*${ref(pctH, rr)}`, X(result), NF.money); };
    frac('Verif. %', 'Verification', c.testFrac, x.testing.total);
    frac('Integ. %', 'Integration', c.integrationFrac, x.integrationCost);
    frac('Cyber %', 'Cybersecurity', c.cyberPct, x.cybersecCost);
    frac('Calib. %', 'Calibration', c.calibrationFrac, x.calibrationCost);
    frac('ML %', 'ML data', c.mlFrac, x.mlDataCost);
    fm('Eng.-years', `(${['Development', 'Verification', 'Integration', 'Cybersecurity', 'Calibration', 'ML data'].map(h => ref(h, rr)).join('+')})/${ref('Share', rr)}/${rate.loaded}/12`, c.engineerYears, NF.f2);
    fm('Tools', `${ref('Eng.-years', rr)}*${rate.seat}*${rate.toolDisc}*${ref('Share', rr)}`, X(x.toolchainCost), NF.money);
    fm('Engineering (NRE)', `${['Development', 'Verification', 'Integration', 'Cybersecurity', 'Calibration', 'ML data', 'Tools'].map(h => ref(h, rr)).join('+')}`, X(x.totalNonRecurring), NF.money);
    inp('Maint. %/yr', c.maintPct / 100, NF.pct);
    fm('Maint. base / yr', `(${ref('Development', rr)}+${ref('Verification', rr)}+${ref('Integration', rr)})/${ref('Share', rr)}*${ref('Maint. %/yr', rr)}`, X(c.maintBase), NF.money);
    fm('Maintenance', `${ref('Maint. base / yr', rr)}*${rate.maintPV}*${ref('Share', rr)}*${rate.maintOn}`, X(x.maintenanceCost), NF.money);
    const ipYear = c.share > 0 ? (x.yearly.licences[0] ?? 0) / c.share : 0;
    const ipPV = m.evidence.filter(e => e.kind === 'licences').reduce((a, e) => a + e.amount, 0);
    inp('IP / yr', X(ipYear), NF.money);
    fm('IP licences', `${ref('IP / yr', rr)}*${rate.licPV}*${ref('Share', rr)}`, X(ipPV), NF.money);
    eng('Royalties (engine)', X(x.licensingCost - ipPV), NF.money);
    eng('Cloud (engine)', X(x.cloudCost), NF.money);
    fm('Lifecycle', `${ref('Maintenance', rr)}+${ref('IP licences', rr)}+${ref('Royalties (engine)', rr)}+${ref('Cloud (engine)', rr)}`, X(x.totalLifecycle), NF.money);
    fm('Module total', `${ref('Engineering (NRE)', rr)}+${ref('Lifecycle', rr)}`, X(x.grandTotal), NF.money).font = font(10, C.navy, true);
    eng('Engine total', X(x.grandTotal), NF.money);
    zebra(D, rr, 2, dcols.length + 1, i % 2 === 1);
    check(`${m.name}: development £ (effort chain × rate)`, `${DN}!${ref('Development', rr)}`, X(x.development.total));
    check(`${m.name}: module total`, `${DN}!${ref('Module total', rr)}`, X(x.grandTotal));
  });
  const detLast = 9 + ordered.length - 1;
  note(D, detLast + 2, 2, 20, 'Blue cells are the engine\'s inputs for each module (catalogue nominal effort, reuse, ASIL and complexity factors, fractions, IP £ a year); black cells are formulas on them and on the Rates sheet; grey italic cells are the engine\'s own values (royalties per vehicle and cloud per connected vehicle-year, whose volume rules are on Unit economics). Engine total is printed beside the formula total so a reviewer sees both.', { size: 9 });

  // ── Module register ───────────────────────────────────────────────────────────────────────────────────────────────
  const G = REG.ws, GN = q(G.name);
  const gcols: Array<[string, boolean]> = [['Module', false], ['Domain', false], ['ASIL', false], ['Complexity', false], ['Reuse', false], ['CAL', false], ['PM', true],
    ['Development', true], ['Verification', true], ['Integration', true], ['Cybersecurity', true], ['Calibration + ML', true], ['Tools', true], ['Engineering (NRE)', true],
    ['Maintenance', true], ['Licences + royalties', true], ['Cloud', true], ['Lifecycle', true], ['Total', true], ['Share', true]];
  bar(G, 7, 2, gcols.length + 1, 'Every module × every cost element', 'each cell is a formula on Module detail');
  header(G, 8, gcols.map(([h, n], i) => [i + 2, h, n] as [number, string, boolean]));
  const gc: Record<string, number> = {}; gcols.forEach(([h], i) => { gc[h] = i + 2; });
  const gref = (h: string, rr: number) => `${A(gc[h])}${rr}`;
  const regRow = new Map<string, number>();
  const regTotRow = 9 + ordered.length;
  ordered.forEach((m, i) => {
    const rr = 9 + i, dr = detRow.get(m.id)!; regRow.set(m.id, rr);
    const x = m.result;
    val(G, rr, gc['Module'], m.name + (m.custom ? ' (your module)' : ''), undefined, font(10, C.navy), 'left');
    val(G, rr, gc['Domain'], m.categoryLabel, undefined, font(9), 'left');
    val(G, rr, gc['ASIL'], x.asilUsed, undefined, font(10), 'center'); val(G, rr, gc['Complexity'], x.complexityUsed, undefined, font(9), 'left');
    val(G, rr, gc['Reuse'], x.reuseUsed, undefined, font(9), 'left'); val(G, rr, gc['CAL'], x.calUsed === 'none' ? '—' : x.calUsed, undefined, font(9), 'center');
    val(G, rr, gc['PM'], x.effortPersonMonths, NF.pm);
    const link = (h: string, f: string, res: number) => val(G, rr, gc[h], F(f, X(res)), NF.money);
    link('Development', `${DN}!${ref('Development', dr)}`, x.development.total);
    link('Verification', `${DN}!${ref('Verification', dr)}`, x.testing.total);
    link('Integration', `${DN}!${ref('Integration', dr)}`, x.integrationCost);
    link('Cybersecurity', `${DN}!${ref('Cybersecurity', dr)}`, x.cybersecCost);
    link('Calibration + ML', `${DN}!${ref('Calibration', dr)}+${DN}!${ref('ML data', dr)}`, x.calibrationCost + x.mlDataCost);
    link('Tools', `${DN}!${ref('Tools', dr)}`, x.toolchainCost);
    link('Engineering (NRE)', `SUM(${gref('Development', rr)}:${gref('Tools', rr)})`, x.totalNonRecurring);
    link('Maintenance', `${DN}!${ref('Maintenance', dr)}`, x.maintenanceCost);
    link('Licences + royalties', `${DN}!${ref('IP licences', dr)}+${DN}!${ref('Royalties (engine)', dr)}`, x.licensingCost);
    link('Cloud', `${DN}!${ref('Cloud (engine)', dr)}`, x.cloudCost);
    link('Lifecycle', `SUM(${gref('Maintenance', rr)}:${gref('Cloud', rr)})`, x.totalLifecycle);
    link('Total', `${gref('Engineering (NRE)', rr)}+${gref('Lifecycle', rr)}`, x.grandTotal).font = font(10, C.navy, true);
    val(G, rr, gc['Share'], F(`${gref('Total', rr)}/$${A(gc['Total'])}$${regTotRow + 3}`, x.grandTotal / Math.max(1, s.grandTotal)), NF.pct);
    zebra(G, rr, 2, gcols.length + 1, i % 2 === 1);
  });
  // Totals, programme items, grand total.
  const moneyCols = gcols.filter(([, n]) => n).map(([h]) => h).filter(h => h !== 'Share');
  const sumOf = (h: string) => md.modules.reduce((a, m) => {
    const x = m.result;
    return a + ({ PM: x.effortPersonMonths, Development: x.development.total, Verification: x.testing.total, Integration: x.integrationCost, Cybersecurity: x.cybersecCost,
      'Calibration + ML': x.calibrationCost + x.mlDataCost, Tools: x.toolchainCost, 'Engineering (NRE)': x.totalNonRecurring, Maintenance: x.maintenanceCost,
      'Licences + royalties': x.licensingCost, Cloud: x.cloudCost, Lifecycle: x.totalLifecycle, Total: x.grandTotal } as Record<string, number>)[h];
  }, 0);
  val(G, regTotRow, 2, 'All modules in this report', undefined, font(10, C.navy, true), 'left');
  for (const h of moneyCols) val(G, regTotRow, gc[h], F(`SUM(${A(gc[h])}9:${A(gc[h])}${regTotRow - 1})`, h === 'PM' ? sumOf(h) : X(sumOf(h))), h === 'PM' ? NF.pm : NF.money);
  strong(G, regTotRow, 2, gcols.length + 1);
  const homo = md.slice.isWhole ? s.totalHomologation : 0;
  const fixedCloud = md.slice.isWhole ? md.programmeItems.find(x => x.label.startsWith('Cloud platform'))?.amount ?? 0 : 0;
  val(G, regTotRow + 1, 2, md.slice.isWhole ? 'Homologation (R155 / R156 / ISO 26262) — programme-level, engine value' : 'Programme-level items stay with the vehicle costing', undefined, font(9.5, C.muted, false, true), 'left');
  val(G, regTotRow + 1, gc['Engineering (NRE)'], X(homo), NF.money, font(10, C.muted, false, true));
  val(G, regTotRow + 1, gc['Total'], F(`${gref('Engineering (NRE)', regTotRow + 1)}`, X(homo)), NF.money);
  val(G, regTotRow + 2, 2, fixedCloud ? 'Cloud platform (fixed) — programme-level, your figure' : 'Cloud platform (fixed) — none entered', undefined, font(9.5, C.muted, false, true), 'left');
  val(G, regTotRow + 2, gc['Cloud'], X(fixedCloud), NF.money, font(10, C.muted, false, true));
  val(G, regTotRow + 2, gc['Lifecycle'], F(gref('Cloud', regTotRow + 2), X(fixedCloud)), NF.money);
  val(G, regTotRow + 2, gc['Total'], F(gref('Lifecycle', regTotRow + 2), X(fixedCloud)), NF.money);
  const grand = regTotRow + 3;
  val(G, grand, 2, md.slice.isWhole ? 'Programme total' : 'This report', undefined, font(11, C.navy, true), 'left');
  for (const h of ['Engineering (NRE)', 'Lifecycle', 'Total']) val(G, grand, gc[h], F(`SUM(${A(gc[h])}${regTotRow}:${A(gc[h])}${regTotRow + 2})`,
    X((h === 'Total' ? md.slice.total : h === 'Lifecycle' ? md.slice.lifecycle : md.slice.nre))), NF.money);
  strong(G, grand, 2, gcols.length + 1);
  const GT = `${GN}!$${A(gc['Total'])}$${grand}`, GNRE = `${GN}!$${A(gc['Engineering (NRE)'])}$${grand}`, GLIFE = `${GN}!$${A(gc['Lifecycle'])}$${grand}`;
  check(md.slice.isWhole ? 'Programme total' : 'This report\'s total', GT, X(md.slice.total));
  check('Engineering (NRE)', GNRE, X(md.slice.nre));
  check('Lifecycle', GLIFE, X(md.slice.lifecycle));
  G.autoFilter = { from: { row: 8, column: 2 }, to: { row: regTotRow - 1, column: gcols.length + 1 } };

  // ── Cost build-up ─────────────────────────────────────────────────────────────────────────────────────────────────
  const B = BUILD.ws, BN = q(B.name);
  bar(B, 7, 2, 7, 'From each cost element to the total', 'every figure is a formula on Module register');
  header(B, 8, [[2, 'Cost element'], [3, 'Amount', true], [4, 'Waterfall base', true], [5, 'Waterfall step', true], [6, 'Share', true], [7, 'Basis']]);
  const tot = (h: string) => `${GN}!$${A(gc[h])}$${regTotRow}`;
  const items: Array<[string, string, number, string, 'nre' | 'life' | 'sub']> = [
    ['Development', tot('Development'), s.totalDevelopment, 'effort chain × loaded rate', 'nre'],
    ['Verification', tot('Verification'), s.totalTesting, 'SIL / MIL / HIL / regression / pen test / scenarios', 'nre'],
    ['Integration', tot('Integration'), s.totalIntegration, 'fraction of development', 'nre'],
    ['Cybersecurity', tot('Cybersecurity'), s.totalCybersecurity, 'by ISO/SAE 21434 CAL', 'nre'],
    ['Calibration and ML data', tot('Calibration + ML'), s.totalCalibration + s.totalMLData, 'fractions of development', 'nre'],
    ['Development tools', tot('Tools'), s.totalToolchain, 'engineer-years × seat', 'nre'],
    ['Homologation', `${GN}!$${A(gc['Engineering (NRE)'])}$${regTotRow + 1}`, homo, 'programme-level (engine value)', 'nre'],
  ];
  const sliceSum = (k: (m: (typeof md.modules)[number]) => number) => md.modules.reduce((a, m) => a + k(m), 0);
  if (!md.slice.isWhole) {
    const vals = [sliceSum(m => m.result.development.total), sliceSum(m => m.result.testing.total), sliceSum(m => m.result.integrationCost), sliceSum(m => m.result.cybersecCost),
      sliceSum(m => m.result.calibrationCost + m.result.mlDataCost), sliceSum(m => m.result.toolchainCost), 0];
    items.forEach((it, i) => { it[2] = vals[i]; });
  }
  const life: Array<[string, string, number, string]> = [
    ['Maintenance', tot('Maintenance'), md.slice.isWhole ? s.totalMaintenance : sliceSum(m => m.result.maintenanceCost), 'production years + security support'],
    ['Licences and royalties', tot('Licences + royalties'), md.slice.isWhole ? s.totalLicensing : sliceSum(m => m.result.licensingCost), 'IP a year + per-vehicle royalties'],
    ['Cloud', `${tot('Cloud')}+${GN}!$${A(gc['Cloud'])}$${regTotRow + 2}`, md.slice.isWhole ? s.totalCloud : sliceSum(m => m.result.cloudCost), 'per connected vehicle-year + fixed platform'],
  ];
  let br = 8, cum = 0;
  const firstEl = br + 1;
  for (const [lab, f, vv, basis] of items) {
    br++; val(B, br, 2, lab, undefined, font(10), 'left'); val(B, br, 3, F(f, X(vv)), NF.money);
    val(B, br, 4, F(br === firstEl ? '0' : `D${br - 1}+E${br - 1}`, X(cum)), NF.money, font(9, C.muted)); val(B, br, 5, F(`C${br}`, X(vv)), NF.money, font(9, C.muted));
    val(B, br, 7, basis, undefined, font(9, C.muted), 'left'); zebra(B, br, 2, 7, false); cum += vv;
  }
  const nreRow = ++br;
  val(B, br, 2, 'Engineering (NRE)', undefined, font(10, C.navy, true), 'left'); val(B, br, 3, F(`SUM(C${firstEl}:C${br - 1})`, X(md.slice.nre)), NF.money);
  val(B, br, 4, 0, NF.money, font(9, C.muted)); val(B, br, 5, F(`C${br}`, X(md.slice.nre)), NF.money, font(9, C.muted)); strong(B, br, 2, 7);
  const lifeFirst = br + 1;
  for (const [lab, f, vv, basis] of life) {
    br++; val(B, br, 2, lab, undefined, font(10), 'left'); val(B, br, 3, F(f, X(vv)), NF.money);
    val(B, br, 4, F(br === lifeFirst ? `C${nreRow}` : `D${br - 1}+E${br - 1}`, X(cum)), NF.money, font(9, C.muted)); val(B, br, 5, F(`C${br}`, X(vv)), NF.money, font(9, C.muted));
    val(B, br, 7, basis, undefined, font(9, C.muted), 'left'); zebra(B, br, 2, 7, false); cum += vv;
  }
  const lifeRow = ++br;
  val(B, br, 2, 'Lifecycle', undefined, font(10, C.navy, true), 'left'); val(B, br, 3, F(`SUM(C${lifeFirst}:C${br - 1})`, X(md.slice.lifecycle)), NF.money);
  val(B, br, 4, F(`C${nreRow}`, X(md.slice.nre)), NF.money, font(9, C.muted)); val(B, br, 5, F(`C${br}`, X(md.slice.lifecycle)), NF.money, font(9, C.muted)); strong(B, br, 2, 7);
  const totRow = ++br;
  val(B, br, 2, md.slice.isWhole ? 'Programme total' : 'This report', undefined, font(11, C.navy, true), 'left'); val(B, br, 3, F(`C${nreRow}+C${lifeRow}`, X(md.slice.total)), NF.money);
  val(B, br, 4, 0, NF.money, font(9, C.muted)); val(B, br, 5, F(`C${br}`, X(md.slice.total)), NF.money, font(9, C.muted)); strong(B, br, 2, 7);
  for (let i = firstEl; i <= totRow; i++) val(B, i, 6, F(`C${i}/$C$${totRow}`, cachedNum(B, i, 3) / (cachedNum(B, totRow, 3) || 1)), NF.pct);
  const BT = `${BN}!$C$${totRow}`, BNRE = `${BN}!$C$${nreRow}`, BLIFE = `${BN}!$C$${lifeRow}`;
  check('Cost build-up total = module register total', BT, X(md.slice.total));
  const wfCats = Array.from({ length: totRow - firstEl + 1 }, (_, i) => String(B.getCell(firstEl + i, 2).value));
  const wfBase = Array.from({ length: totRow - firstEl + 1 }, (_, i) => { const c = B.getCell(firstEl + i, 4).value; return typeof c === 'number' ? c : Number((c as ExcelJSType.CellFormulaValue).result ?? 0); });
  const wfStep = Array.from({ length: totRow - firstEl + 1 }, (_, i) => Number(((B.getCell(firstEl + i, 5).value as ExcelJSType.CellFormulaValue).result) ?? 0));
  charts.push({ sheet: B.name, kind: 'bar', title: 'Waterfall: cost elements → engineering → lifecycle → total', stacked: true, reverseCats: true, numFmt: NF.M, legend: 'none',
    series: [
      { name: 'Base', catRef: `${BN}!$B$${firstEl}:$B$${totRow}`, cats: wfCats, valRef: `${BN}!$D$${firstEl}:$D$${totRow}`, vals: wfBase, color: 'FFFFFF' },
      { name: 'Amount', catRef: `${BN}!$B$${firstEl}:$B$${totRow}`, cats: wfCats, valRef: `${BN}!$E$${firstEl}:$E$${totRow}`, vals: wfStep,
        colors: wfCats.map((_, i) => (firstEl + i === nreRow || firstEl + i === lifeRow || firstEl + i === totRow ? C.navy : firstEl + i < nreRow ? NRE : LIFE)) },
    ],
    from: { col: 1, row: totRow + 1 }, to: { col: 7, row: totRow + 24 } });
  note(B, totRow + 26, 2, 7, 'Waterfall: the white bar is the running base; each coloured step is one cost element (blue engineering, amber lifecycle, navy subtotals).', { italic: true });

  // ── Domains ───────────────────────────────────────────────────────────────────────────────────────────────────────
  const domTotalRef = new Map<string, string>();
  for (const { d, ws } of DOM) {
    let dr = 7;
    const DNm = q(ws.name);
    bar(ws, dr, 2, 11, `${d.label}`, `${(d.share * 100).toFixed(1)} % of the vehicle`);
    dr += 1;
    const used = picture(ws, `domain-${d.category}`, 2, dr + 1, 760);
    dr += used + 1;
    note(ws, dr, 2, 11, `The components this domain's modules run on, coloured by the highest ASIL among them. Runs on: ${d.components.map(n => `${n} ${md.components.find(c => c.no === n)?.label ?? ''}`).join(' · ')}.`, { italic: true });
    dr += 2;
    header(ws, dr, [[2, 'Module'], [3, 'ASIL'], [4, 'Complexity'], [5, 'Reuse'], [6, 'CAL'], [7, 'PM', true], [8, 'Engineering (NRE)', true], [9, 'Lifecycle', true], [10, 'Total', true], [11, 'Of domain', true]]);
    const first = dr + 1;
    const mods = d.moduleIds.map(id => md.modules.find(m => m.id === id)!);
    mods.forEach((m, i) => {
      dr++; const rr = regRow.get(m.id)!; const x = m.result;
      val(ws, dr, 2, m.name + (m.custom ? ' (your module)' : ''), undefined, font(10), 'left');
      val(ws, dr, 3, x.asilUsed, undefined, font(10), 'center'); val(ws, dr, 4, x.complexityUsed, undefined, font(9), 'left');
      val(ws, dr, 5, x.reuseUsed, undefined, font(9), 'left'); val(ws, dr, 6, x.calUsed === 'none' ? '—' : x.calUsed, undefined, font(9), 'center');
      val(ws, dr, 7, F(`${GN}!${gref('PM', rr)}`, x.effortPersonMonths), NF.pm);
      val(ws, dr, 8, F(`${GN}!${gref('Engineering (NRE)', rr)}`, X(x.totalNonRecurring)), NF.money);
      val(ws, dr, 9, F(`${GN}!${gref('Lifecycle', rr)}`, X(x.totalLifecycle)), NF.money);
      val(ws, dr, 10, F(`${GN}!${gref('Total', rr)}`, X(x.grandTotal)), NF.money);
      zebra(ws, dr, 2, 11, i % 2 === 1);
    });
    const last = dr; dr++;
    val(ws, dr, 2, 'Domain total', undefined, font(10, C.navy, true), 'left');
    val(ws, dr, 7, F(`SUM(G${first}:G${last})`, d.effortPM), NF.pm);
    for (const [c, vv] of [[8, d.nre], [9, d.lifecycle], [10, d.total]] as Array<[number, number]>) val(ws, dr, c, F(`SUM(${A(c)}${first}:${A(c)}${last})`, X(vv)), NF.money);
    strong(ws, dr, 2, 11);
    for (let i = first; i <= dr; i++) val(ws, i, 11, F(`J${i}/$J$${dr}`, cachedNum(ws, i, 10) / (cachedNum(ws, dr, 10) || 1)), NF.pct);
    domTotalRef.set(d.category, `${DNm}!$J$${dr}`);
    check(`${d.label}: domain total`, `${DNm}!$J$${dr}`, X(d.total));
    charts.push({ sheet: ws.name, kind: 'bar', title: 'Modules: engineering and lifecycle', stacked: true, reverseCats: true, numFmt: NF.M, legend: 'b',
      series: [
        { name: 'Engineering (NRE)', catRef: `${DNm}!$B$${first}:$B$${last}`, cats: mods.map(m => m.name), valRef: `${DNm}!$H$${first}:$H$${last}`, vals: mods.map(m => X(m.result.totalNonRecurring)), color: NRE },
        { name: 'Lifecycle', catRef: `${DNm}!$B$${first}:$B$${last}`, cats: mods.map(m => m.name), valRef: `${DNm}!$I$${first}:$I$${last}`, vals: mods.map(m => X(m.result.totalLifecycle)), color: LIFE },
      ], from: { col: 1, row: dr + 1 }, to: { col: 11, row: dr + 3 + Math.max(10, mods.length * 2) } });
    dr += 4 + Math.max(10, mods.length * 2);
    bar(ws, dr, 2, 11, 'What drives it'); dr++;
    const asil = (['QM', 'A', 'B', 'C', 'D'] as const).filter(a => d.asilMix[a]).map(a => `${d.asilMix[a]} × ${a === 'QM' ? 'QM' : 'ASIL ' + a}`).join(', ');
    for (const t of [`Largest: ${d.largest.map(x => `${x.name} (${(x.share * 100).toFixed(1)} %)`).join('; ')}.`, `Safety level: ${asil}. Reuse: ${Object.entries(d.reuseMix).map(([k, n]) => `${n} × ${k}`).join(', ')}.`,
      ...(d.excluded.length ? [`Not in scope in this domain: ${d.excluded.map(e => `${e.name} — ${e.reason}`).join('; ')}.`] : [])]) { note(ws, dr, 2, 11, `•  ${t}`, { size: 10, color: C.slate }); dr++; }
  }

  // ── Summary ───────────────────────────────────────────────────────────────────────────────────────────────────────
  const S = SUM.ws, SN = q(S.name);
  const tile = (c0: number, label: string, f: string, result: number, nf: string, sub: string) => {
    S.mergeCells(8, c0, 8, c0 + 2); S.mergeCells(9, c0, 9, c0 + 2); S.mergeCells(10, c0, 10, c0 + 2);
    const a = S.getCell(8, c0); a.value = label.toUpperCase(); a.font = font(8.5, C.muted, true); a.alignment = { indent: 1, vertical: 'bottom' };
    const b = S.getCell(9, c0); b.value = F(f, result); b.numFmt = nf; b.font = font(20, C.navy, true); b.alignment = { indent: 1, vertical: 'middle', horizontal: 'left' };
    const c = S.getCell(10, c0); c.value = sub; c.font = font(8.5, C.muted); c.alignment = { indent: 1, vertical: 'top', wrapText: true };
    for (let rr = 8; rr <= 10; rr++) for (let k = c0; k <= c0 + 2; k++) S.getCell(rr, k).fill = fill(C.page);
  };
  S.getRow(8).height = 20; S.getRow(9).height = 34; S.getRow(10).height = 28;
  const recC = rate.rec, volR = rate.vol, lifeR = rate.life;
  tile(2, md.slice.isWhole ? 'Programme total' : 'This report', BT, X(md.slice.total), NF.M, md.slice.isWhole ? `over ${s.horizonYears} years from SOP` : `${(md.slice.share * 100).toFixed(1)} % of the vehicle`);
  tile(5, 'Per vehicle', md.slice.isWhole ? `${BNRE}/(${volR}*${recC})+${BLIFE}/(${volR}*${lifeR})` : `${BT}/(${volR}*${lifeR})`, X(md.slice.isWhole ? s.perVehicle : md.slice.total / (p.annualProductionVolume * p.programLifeYears)), NF.money, md.slice.isWhole ? 'NRE over the recovery window + lifecycle over the vehicles built' : 'slice ÷ vehicles built');
  tile(8, 'Engineering (NRE)', BNRE, X(md.slice.nre), NF.M, `${Math.round(md.modules.reduce((a, m) => a + m.result.effortPersonMonths, 0)).toLocaleString('en-GB')} person-months`);
  tile(11, 'Lifecycle', BLIFE, X(md.slice.lifecycle), NF.M, 'maintenance, licences, royalties, cloud');
  if (md.slice.isWhole) check('Per vehicle', `${SN}!$E$9`, X(s.perVehicle));
  let sr = 12;
  bar(S, sr, 2, 13, 'What the figures say'); sr++;
  for (const t of md.findings) { note(S, sr, 2, 13, `•  ${t}`, { size: 10, color: C.slate }); sr++; }
  sr++;
  bar(S, sr, 2, 13, md.slice.isWhole ? 'By software domain' : 'Domains in this report', 'formulas'); sr++;
  header(S, sr, [[2, 'Domain'], [6, 'Modules', true], [7, 'Engineering', true], [8, 'Lifecycle', true], [9, 'Total', true], [10, 'Share', true]]);
  S.mergeCells(sr, 2, sr, 5);
  const dFirst = sr + 1;
  md.domains.forEach((d, i) => {
    sr++; S.mergeCells(sr, 2, sr, 5);
    val(S, sr, 2, d.label, undefined, font(10), 'left'); val(S, sr, 6, d.moduleIds.length, NF.count);
    const mods = d.moduleIds.map(id => regRow.get(id)!);
    const sumF = (h: string) => mods.map(rr => `${GN}!${gref(h, rr)}`).join('+');
    val(S, sr, 7, F(sumF('Engineering (NRE)'), X(d.nre)), NF.M); val(S, sr, 8, F(sumF('Lifecycle'), X(d.lifecycle)), NF.M);
    val(S, sr, 9, F(domTotalRef.get(d.category) ?? sumF('Total'), X(d.total)), NF.M);
    val(S, sr, 10, F(`I${sr}/${BT}`, d.total / Math.max(1, md.slice.total)), NF.pct);
    zebra(S, sr, 2, 10, i % 2 === 1);
  });
  const dLast = sr;
  if (md.slice.isWhole) for (const it of md.programmeItems) {
    sr++; S.mergeCells(sr, 2, sr, 5); val(S, sr, 2, `${it.label} (programme-level)`, undefined, font(10, C.muted, false, true), 'left');
    const itemRef = it.kind === 'cloudFixed' ? `${GN}!$${A(gc['Total'])}$${regTotRow + 2}` : `${GN}!$${A(gc['Total'])}$${regTotRow + 1}`;
    val(S, sr, 9, F(itemRef, X(it.amount)), NF.M, font(10, C.muted, false, true)); val(S, sr, 10, F(`I${sr}/${BT}`, it.amount / Math.max(1, s.grandTotal)), NF.pct);
  }
  sr++; S.mergeCells(sr, 2, sr, 5); val(S, sr, 2, md.slice.isWhole ? 'Programme total' : 'This report', undefined, font(10, C.navy, true), 'left');
  val(S, sr, 9, F(`SUM(I${dFirst}:I${sr - 1})`, X(md.slice.total)), NF.M); val(S, sr, 10, F(`I${sr}/${BT}`, 1), NF.pct); strong(S, sr, 2, 10);
  check('Summary: domains + programme items = total', `${SN}!$I$${sr}`, X(md.slice.total));
  const sumEnd = sr;
  // Doughnut NRE v lifecycle (the tiles' cells) and domain bars.
  S.getCell(sumEnd + 2, 12).value = 'Engineering (NRE)'; S.getCell(sumEnd + 3, 12).value = 'Lifecycle';
  S.getCell(sumEnd + 2, 13).value = F(BNRE, X(md.slice.nre)); S.getCell(sumEnd + 3, 13).value = F(BLIFE, X(md.slice.lifecycle));
  for (const rr of [sumEnd + 2, sumEnd + 3]) { S.getCell(rr, 12).font = font(9, C.muted); S.getCell(rr, 13).font = font(9, C.muted); S.getCell(rr, 13).numFmt = NF.M; }
  charts.push({ sheet: S.name, kind: 'doughnut', title: 'Engineering v lifecycle', labels: 'percent', legend: 'b', holeSize: 55,
    series: [{ name: 'Split', catRef: `${SN}!$L$${sumEnd + 2}:$L$${sumEnd + 3}`, cats: ['Engineering (NRE)', 'Lifecycle'], valRef: `${SN}!$M$${sumEnd + 2}:$M$${sumEnd + 3}`, vals: [X(md.slice.nre), X(md.slice.lifecycle)], colors: [NRE, LIFE] }],
    from: { col: 1, row: sumEnd + 1 }, to: { col: 5, row: sumEnd + 20 } });
  charts.push({ sheet: S.name, kind: 'bar', title: 'Domains: engineering and lifecycle', stacked: true, reverseCats: true, numFmt: NF.M, legend: 'b',
    series: [
      { name: 'Engineering (NRE)', catRef: `${SN}!$B$${dFirst}:$B$${dLast}`, cats: md.domains.map(d => d.label), valRef: `${SN}!$G$${dFirst}:$G$${dLast}`, vals: md.domains.map(d => X(d.nre)), color: NRE },
      { name: 'Lifecycle', catRef: `${SN}!$B$${dFirst}:$B$${dLast}`, cats: md.domains.map(d => d.label), valRef: `${SN}!$H$${dFirst}:$H$${dLast}`, vals: md.domains.map(d => X(d.lifecycle)), color: LIFE },
    ], from: { col: 5, row: sumEnd + 1 }, to: { col: 11, row: sumEnd + 20 } });

  // ── Architecture ──────────────────────────────────────────────────────────────────────────────────────────────────
  if (ARCH) {
    const W = ARCH.ws; let ar = 7;
    bar(W, ar, 2, 7, 'Where the software runs', `${md.components.length} components carry software in scope`); ar++;
    ar += picture(W, 'architecture', 2, ar + 1, 900) + 1;
    note(W, ar, 2, 7, 'Coloured by the highest ASIL among the modules on each component. A module that runs on several components counts at each — money is never split by component. Schematic top view, not to scale.', { italic: true }); ar += 2;
    header(W, ar, [[2, 'No.'], [3, 'Component'], [4, 'Highest ASIL'], [5, 'Modules'], [6, 'Modules running on it'], [7, 'What it is']]);
    md.components.forEach((c, i) => {
      ar++;
      val(W, ar, 2, c.no, '0', font(10, C.navy, true), 'center'); val(W, ar, 3, c.label, undefined, font(10), 'left');
      val(W, ar, 4, c.offVehicle ? '— (off-vehicle)' : c.highestAsil === 'QM' ? 'QM' : `ASIL ${c.highestAsil}`, undefined, font(10), 'center'); val(W, ar, 5, c.modules.length, '0');
      val(W, ar, 6, c.modules.join(', '), undefined, font(9), 'left'); val(W, ar, 7, c.what, undefined, font(9, C.muted), 'left');
      W.getRow(ar).height = Math.max(18, Math.ceil(c.modules.join(', ').length / 85) * 13 + 4);
      zebra(W, ar, 2, 7, i % 2 === 1);
    });
  }

  // ── Unit economics ────────────────────────────────────────────────────────────────────────────────────────────────
  if (UNIT) {
    const U = UNIT.ws, u = md.unit; let ur = 7;
    bar(U, ur, 2, 6, 'Unit economics', (p.discountRatePct ?? 0) ? 'nominal — the total is discounted' : 'reconciles to the total at 0 % discount'); ur++;
    header(U, ur, [[2, 'Figure'], [3, 'Rate', true], [4, 'Volume', true], [5, 'Programme', true], [6, 'Basis']]);
    const line = (lab: string, rateV: number | null, nfR: string, volF: string | null, volV: number, progF: string, progV: number, basis: string) => {
      ur++; val(U, ur, 2, lab, undefined, font(10), 'left');
      if (rateV != null) val(U, ur, 3, X(rateV), nfR, font(10, C.muted, false, true));
      if (volF) val(U, ur, 4, F(volF, volV), NF.count);
      val(U, ur, 5, F(progF, X(progV)), NF.money); val(U, ur, 6, basis, undefined, font(9, C.muted), 'left'); zebra(U, ur, 2, 6, false);
    };
    line('Engineering, one-off (NRE)', null, '', null, 0, BNRE, u.nre, 'Cost build-up');
    line('Royalty per vehicle built', u.perVehicleBuilt, NF.money2, `${volR}*${lifeR}`, u.vehiclesBuilt, `C${ur + 1}*D${ur + 1}`, u.perVehicleBuilt * u.vehiclesBuilt, 'engine rate × vehicles built');
    line('Map data per vehicle-year', u.subscriptionPerYear, NF.money2, `${volR}*${lifeR}*${u.subscriptionYears}`, u.subscriptionVehicleYears, `C${ur + 1}*D${ur + 1}`, u.subscriptionPerYear * u.subscriptionVehicleYears, `${u.subscriptionYears} subscription years a vehicle`);
    line('Cloud per connected vehicle-year', u.cloudPerYear, NF.money2, `${volR}*${lifeR}*${u.serviceYears}`, u.serviceVehicleYears, `C${ur + 1}*D${ur + 1}`, u.cloudPerYear * u.serviceVehicleYears, `${u.serviceYears} service years a vehicle`);
    // The fixed £ split at the last build (review): production years, then what is paid after the last build.
    const fixedProd = md.fixedSplit.production / p.programLifeYears;
    line('Fixed per production year (average)', fixedProd, NF.money, lifeR, p.programLifeYears, `C${ur + 1}*D${ur + 1}`, md.fixedSplit.production, 'maintenance, IP licences, platform in the production years');
    const afterLabel = [md.fixedSplit.postSupport > 0.5 ? `security support (${md.postSupportYears} years)` : '', md.fixedSplit.platformAfter > 0.5 ? 'cloud platform while vehicles are served' : ''].filter(Boolean).join(' + ') || 'nothing';
    ur++; val(U, ur, 2, `After the last build: ${afterLabel}`, undefined, font(10), 'left'); val(U, ur, 5, X(md.fixedSplit.afterLastBuild), NF.money, font(10, C.muted, false, true));
    val(U, ur, 6, 'service years after the last build (engine value)', undefined, font(9, C.muted), 'left'); zebra(U, ur, 2, 6, false);
    ur++; val(U, ur, 2, 'Programme total (from unit rates)', undefined, font(10, C.navy, true), 'left');
    const recon = u.nre + u.perVehicleBuilt * u.vehiclesBuilt + u.subscriptionPerYear * u.subscriptionVehicleYears + u.cloudPerYear * u.serviceVehicleYears + u.fixedPerYear * p.programLifeYears;
    val(U, ur, 5, F(`SUM(E${ur - 6}:E${ur - 1})`, X(recon)), NF.money); strong(U, ur, 2, 6);
    if (!(p.discountRatePct ?? 0) && md.slice.isWhole) check('Unit economics reconcile to the total (0 % discount)', `${q(U.name)}!$E$${ur}`, X(s.grandTotal));
  }

  // ── Spend by year ─────────────────────────────────────────────────────────────────────────────────────────────────
  if (SPEND) {
    const P = SPEND.ws, PN = q(P.name), yrs = md.spend.years;
    bar(P, 7, 2, 9, 'Nominal spend by year', 'formulas for totals and cumulative');
    header(P, 8, [[2, 'Year'], [3, 'Engineering', true], [4, 'Maintenance', true], [5, 'Licences', true], [6, 'Royalties', true], [7, 'Cloud', true], [8, 'Total', true], [9, 'Cumulative', true]]);
    yrs.forEach((yy, i) => {
      const rr = 9 + i;
      val(P, rr, 2, yy.label, undefined, font(10, yy.phase === 'development' ? C.blue : yy.phase === 'service' ? C.muted : C.slate), 'left');
      [yy.engineering, yy.maintenance, yy.licences, yy.royalties, yy.cloud].forEach((vv, k) => val(P, rr, 3 + k, X(vv), NF.money));
      val(P, rr, 8, F(`SUM(C${rr}:G${rr})`, X(yy.total)), NF.money); val(P, rr, 9, F(i ? `I${rr - 1}+H${rr}` : `H${rr}`, X(yy.cumulative)), NF.money);
      zebra(P, rr, 2, 9, i % 2 === 1);
    });
    const pl = 8 + yrs.length, pt = pl + 1;
    val(P, pt, 2, 'Total', undefined, font(10, C.navy, true), 'left');
    const colSum = (k: 'engineering' | 'maintenance' | 'licences' | 'royalties' | 'cloud' | 'total') => X(yrs.reduce((a, y) => a + y[k], 0));
    (['engineering', 'maintenance', 'licences', 'royalties', 'cloud', 'total'] as const).forEach((k, i) => val(P, pt, 3 + i, F(`SUM(${A(3 + i)}9:${A(3 + i)}${pl})`, colSum(k)), NF.money));
    strong(P, pt, 2, 9);
    if (!(p.discountRatePct ?? 0)) check('Spend by year (nominal) = programme total', `${PN}!$H$${pt}`, X(s.grandTotal));
    const keys = ['Engineering', 'Maintenance', 'Licences', 'Royalties', 'Cloud'];
    const fields = ['engineering', 'maintenance', 'licences', 'royalties', 'cloud'] as const;
    charts.push({ sheet: P.name, kind: 'column', title: 'Spend by year (nominal)', stacked: true, numFmt: NF.M, legend: 'b',
      series: keys.map((k, i) => ({ name: k, catRef: `${PN}!$B$9:$B$${pl}`, cats: yrs.map(x => x.label), valRef: `${PN}!$${A(3 + i)}$9:$${A(3 + i)}$${pl}`, vals: yrs.map(x => X(x[fields[i]])), color: SERIES[i] })),
      from: { col: 1, row: pt + 1 }, to: { col: 9, row: pt + 24 } });
    note(P, pt + 26, 2, 9, md.spend.note, { size: 9 });
  }

  // ── Hubs, countries ───────────────────────────────────────────────────────────────────────────────────────────────
  if (HUBS) {
    const H = HUBS.ws, HN = q(H.name);
    bar(H, 7, 2, 9, `The same ${r.modules.length}-module scope at every hub`, 'engine re-run per hub');
    header(H, 8, [[2, 'Hub'], [3, 'Confidence'], [4, 'Loaded / PM', true], [5, 'Engineering', true], [6, 'Lifecycle', true], [7, 'Total', true], [8, 'Per vehicle', true], [9, 'v this report', true]]);
    md.hubs.forEach((h, i) => {
      const rr = 9 + i;
      val(H, rr, 2, h.label + (h.selected ? ' (this report)' : ''), undefined, font(10, h.selected ? C.navy : C.slate, h.selected), 'left');
      val(H, rr, 3, h.confidence, undefined, font(9), 'left'); val(H, rr, 4, X(h.loadedRatePerPM), NF.money);
      val(H, rr, 5, X(h.nre), NF.M); val(H, rr, 6, X(h.lifecycle), NF.M); val(H, rr, 7, F(`E${rr}+F${rr}`, X(h.total)), NF.M); val(H, rr, 8, X(h.perVehicle), NF.money);
      const sel = 9 + md.hubs.findIndex(x => x.selected);
      val(H, rr, 9, F(`G${rr}-$G$${sel}`, X(h.deltaTotal)), NF.delta);
      zebra(H, rr, 2, 9, i % 2 === 1);
    });
    const hl = 8 + md.hubs.length;
    charts.push({ sheet: H.name, kind: 'bar', title: 'Programme total by hub', stacked: true, reverseCats: true, numFmt: NF.M, legend: 'b',
      series: [
        { name: 'Engineering (NRE)', catRef: `${HN}!$B$9:$B$${hl}`, cats: md.hubs.map(h => h.label), valRef: `${HN}!$E$9:$E$${hl}`, vals: md.hubs.map(h => X(h.nre)), color: NRE },
        { name: 'Lifecycle', catRef: `${HN}!$B$9:$B$${hl}`, cats: md.hubs.map(h => h.label), valRef: `${HN}!$F$9:$F$${hl}`, vals: md.hubs.map(h => X(h.lifecycle)), color: LIFE },
      ], from: { col: 1, row: hl + 1 }, to: { col: 9, row: hl + 32 } });
  }
  if (CTRY) {
    const K = CTRY.ws;
    bar(K, 7, 2, 5, 'Every manufacturing country and its software hub', 'nearest assessed hub when the country has none');
    header(K, 8, [[2, 'Country'], [3, 'Software hub'], [4, 'Programme total at that hub', true], [5, 'Why this hub']]);
    const hubTotal = new Map(md.hubs.map(h => [h.hub as string, h.total]));
    [...md.countries].sort((a, b) => a.label.localeCompare(b.label)).forEach((c, i) => {
      const rr = 9 + i;
      val(K, rr, 2, c.label, undefined, font(10), 'left'); val(K, rr, 3, c.hubLabel, undefined, font(10), 'left');
      val(K, rr, 4, X(hubTotal.get(c.hub) ?? 0), NF.M); val(K, rr, 5, c.basis || 'its own assessed hub', undefined, font(9, C.muted), 'left');
      zebra(K, rr, 2, 5, i % 2 === 1);
    });
  }

  // ── Risk ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  if (RISK) {
    const K = RISK.ws, KN = q(K.name), mc = r.monteCarlo; let kr = 7;
    bar(K, kr, 2, 7, 'Monte Carlo band', `${mc.iterations.toLocaleString('en-GB')} trials; ranges by evidence grade`); kr++;
    header(K, kr, [[2, 'Measure'], [3, 'Programme total', true], [4, 'Per vehicle', true]]);
    for (const [lab, a, b] of [['P10', mc.p10, mc.p10PerVehicle], ['P50 (median)', mc.p50, mc.p50PerVehicle], ['P90', mc.p90, mc.p90PerVehicle], [`Headline (about P${Math.round(mc.headlinePercentile)})`, s.grandTotal, s.perVehicle]] as Array<[string, number, number]>) {
      kr++; val(K, kr, 2, lab, undefined, font(10), 'left'); val(K, kr, 3, X(a), NF.M); val(K, kr, 4, X(b), NF.money); zebra(K, kr, 2, 4, false);
    }
    kr += 2; header(K, kr, [[2, 'Band (programme total)'], [3, 'From', true], [4, 'To', true], [5, 'Trials', true]]);
    const h0 = kr + 1;
    mc.histogram.forEach((b, i) => { kr++; val(K, kr, 2, `${sym}${(X(b.lo) / 1e6).toFixed(0)}–${(X(b.hi) / 1e6).toFixed(0)}M`, undefined, font(9), 'left'); val(K, kr, 3, X(b.lo), NF.M); val(K, kr, 4, X(b.hi), NF.M); val(K, kr, 5, b.count, NF.count); zebra(K, kr, 2, 5, i % 2 === 1); });
    const h1 = kr;
    charts.push({ sheet: K.name, kind: 'column', title: 'Simulated programme total (trials per band)', numFmt: '#,##0', legend: 'none',
      series: [{ name: 'Trials', catRef: `${KN}!$B$${h0}:$B$${h1}`, cats: mc.histogram.map(b => `${sym}${(X(b.lo) / 1e6).toFixed(0)}–${(X(b.hi) / 1e6).toFixed(0)}M`), valRef: `${KN}!$E$${h0}:$E$${h1}`, vals: mc.histogram.map(b => b.count), color: NRE }],
      from: { col: 6, row: h0 - 2 }, to: { col: 13, row: h1 + 1 } });
    kr += 2; bar(K, kr, 2, 7, 'One driver at a time, everything else held', 'tornado: change from the base'); kr++;
    header(K, kr, [[2, 'Driver (low vs high case)'], [3, 'Low', true], [4, 'Base', true], [5, 'High', true], [6, 'Low − base', true], [7, 'High − base', true]]);
    const sens = r.sensitivity.filter(x => x.unit === '£M').sort((a, b) => Math.abs(b.high - b.low) - Math.abs(a.high - a.low));
    const perVeh = r.sensitivity.filter(x => x.unit !== '£M');
    const t0 = kr + 1;
    sens.forEach((x, i) => {
      kr++; val(K, kr, 2, x.parameter, undefined, font(9.5), 'left');
      val(K, kr, 3, X(x.low), NF.M); val(K, kr, 4, X(x.base), NF.M); val(K, kr, 5, X(x.high), NF.M);
      val(K, kr, 6, F(`C${kr}-D${kr}`, X(x.low - x.base)), NF.delta); val(K, kr, 7, F(`E${kr}-D${kr}`, X(x.high - x.base)), NF.delta);
      zebra(K, kr, 2, 7, i % 2 === 1);
    });
    const t1 = kr;
    charts.push({ sheet: K.name, kind: 'bar', title: 'Tornado: change in the programme total', stacked: true, reverseCats: true, numFmt: NF.delta, legend: 'b',
      series: [
        { name: 'Low case', catRef: `${KN}!$B$${t0}:$B$${t1}`, cats: sens.map(x => x.parameter), valRef: `${KN}!$F$${t0}:$F$${t1}`, vals: sens.map(x => X(x.low - x.base)), color: NRE },
        { name: 'High case', catRef: `${KN}!$B$${t0}:$B$${t1}`, cats: sens.map(x => x.parameter), valRef: `${KN}!$G$${t0}:$G$${t1}`, vals: sens.map(x => X(x.high - x.base)), color: LIFE },
      ], from: { col: 1, row: t1 + 1 }, to: { col: 8, row: t1 + 26 } });
    if (perVeh.length) {
      kr = t1 + 28; bar(K, kr, 2, 7, 'Per vehicle — what volume does to each vehicle\'s share'); kr++;
      header(K, kr, [[2, 'Driver'], [3, 'Low case', true], [4, 'Base', true], [5, 'High case', true]]);
      for (const x of perVeh) { kr++; val(K, kr, 2, x.parameter, undefined, font(9.5), 'left'); val(K, kr, 3, X(x.low), NF.money); val(K, kr, 4, X(x.base), NF.money); val(K, kr, 5, X(x.high), NF.money); zebra(K, kr, 2, 5, false); }
    }
  }

  // ── Make or buy ───────────────────────────────────────────────────────────────────────────────────────────────────
  if (MB) {
    const Mw = MB.ws; let mr = 7;
    bar(Mw, mr, 2, 7, 'Engineering by domain, by development source', 'engine re-run per source'); mr++;
    header(Mw, mr, [[2, 'Domain'], [3, 'OEM in-house', true], [4, 'Tier-1 supplier', true], [5, 'Start-up', true], [6, 'Tier-1 premium', true]]);
    md.makeBuy.rows.forEach((x, i) => { mr++; val(Mw, mr, 2, x.label, undefined, font(10), 'left'); val(Mw, mr, 3, X(x.make), NF.M); val(Mw, mr, 4, X(x.tier1), NF.M); val(Mw, mr, 5, X(x.startup), NF.M); val(Mw, mr, 6, F(`IF(C${mr}=0,0,D${mr}/C${mr}-1)`, x.make ? x.tier1 / x.make - 1 : 0), '+0.0%;-0.0%'); zebra(Mw, mr, 2, 7, i % 2 === 1); });
    mr++; note(Mw, ++mr, 2, 7, md.makeBuy.basis, { size: 9.5, color: C.slate });
    const qc = md.quote, qRows = [qc.nre, qc.perVehicle, qc.perVehicleYear, qc.fixedPerYear, ...qc.byCategory].filter(Boolean) as NonNullable<typeof qc.nre>[];
    mr += 2; bar(Mw, mr, 2, 7, 'Supplier quote check'); mr++;
    if (qRows.length) {
      header(Mw, mr, [[2, 'Line'], [3, 'Should-cost', true], [4, 'Quote', true], [5, 'Gap', true], [6, 'Gap %', true]]);
      for (const x of qRows) { mr++; const nf = x.unit === 'perVehicle' ? NF.money2 : NF.M; val(Mw, mr, 2, x.label, undefined, font(10), 'left'); val(Mw, mr, 3, X(x.should), nf); val(Mw, mr, 4, X(x.quoted), nf); val(Mw, mr, 5, F(`D${mr}-C${mr}`, X(x.gap)), nf); val(Mw, mr, 6, F(`IF(C${mr}=0,0,E${mr}/C${mr})`, x.gapPct / 100), '+0%;-0%'); zebra(Mw, mr, 2, 7, false); }
    } else if (md.quoteNote) note(Mw, mr, 2, 7, md.quoteNote, { size: 10 });
    const effort = qc.target.nre - s.totalToolchain - s.totalHomologation;
    const mm = (n: number) => `${sym}${(X(n) / 1e6).toFixed(1)}M`;
    mr += 2; note(Mw, mr, 2, 7, `Negotiation target for a Tier-1 supplier: engineering effort ${mm(effort)} (${Math.round(s.totalEffortPersonMonths).toLocaleString('en-GB')} person-months at ${sym}${Math.round(X(qc.target.ratePerPM)).toLocaleString('en-GB')} per person-month, ${qc.target.basis}) + development tools ${mm(s.totalToolchain)} = ${mm(effort + s.totalToolchain)}.${s.totalHomologation ? ` Homologation ${mm(s.totalHomologation)} (type approval, CSMS / SUMS) stays with the OEM.` : ''}`, { size: 10, color: C.slate, fillHex: C.blueT });
  }

  // ── Evidence ──────────────────────────────────────────────────────────────────────────────────────────────────────
  if (EVI) {
    const E = EVI.ws, EN = q(E.name);
    const lines = md.evidenceLines;
    const KIND: Record<string, string> = { effort: 'Engineering effort', tools: 'Development tools', maintenance: 'Maintenance', postSupport: 'Security support after the last build',
      licences: 'IP licences', royalties: 'Royalties', cloud: 'Cloud', homologation: 'Homologation', cloudFixed: 'Cloud platform (fixed)' };
    const grades = ['entered', 'calibrated', 'sourced', 'estimate', 'unsourced'] as const;
    bar(E, 7, 2, 6, 'By evidence grade', 'SUMIF over the lines below');
    header(E, 8, [[2, 'Grade'], [3, 'Amount', true], [4, 'Share', true], [5, 'Simulated range', true]]);
    const l0 = 9 + grades.length + 4, l1 = l0 + lines.length - 1;
    grades.forEach((g, i) => {
      const rr = 9 + i, amt = lines.filter(l => l.grade === g).reduce((a, l) => a + l.amount, 0);
      const cell = val(E, rr, 2, GRADE_NAME[g], undefined, font(10, GRADE_C[g][0], true), 'left'); cell.fill = fill(GRADE_C[g][1]);
      val(E, rr, 3, F(`SUMIF($D$${l0}:$D$${l1},B${rr},$E$${l0}:$E$${l1})`, X(amt)), NF.money);
      val(E, rr, 4, F(`C${rr}/SUM($C$9:$C$${8 + grades.length})`, amt / (lines.reduce((a, l) => a + l.amount, 0) || 1)), NF.pct);
      val(E, rr, 5, `× ${SW_MC_RANGE_BY_GRADE[g][0]} – × ${SW_MC_RANGE_BY_GRADE[g][2]}`, undefined, font(9, C.muted), 'right');
    });
    const gt = 9 + grades.length;
    val(E, gt, 2, 'Total', undefined, font(10, C.navy, true), 'left');
    val(E, gt, 3, F(`SUM(C9:C${gt - 1})`, X(lines.reduce((a, l) => a + l.amount, 0))), NF.money); strong(E, gt, 2, 6);
    check('Evidence lines = total', `${EN}!$C$${gt}`, X(md.slice.total - (md.slice.isWhole ? 0 : 0)));
    charts.push({ sheet: E.name, kind: 'doughnut', title: 'The total by evidence grade', labels: 'percent', legend: 'r', holeSize: 55, hideLabelBelow: 0.03,
      series: [{ name: 'Grade', catRef: `${EN}!$B$9:$B$${gt - 1}`, cats: grades.map(g => GRADE_NAME[g]), valRef: `${EN}!$C$9:$C$${gt - 1}`, vals: grades.map(g => X(lines.filter(l => l.grade === g).reduce((a, l) => a + l.amount, 0))), colors: grades.map(g => GRADE_C[g][0]) }],
      from: { col: 6, row: 6 }, to: { col: 7, row: gt + 2 } });
    bar(E, l0 - 2, 2, 6, 'Every costed line', `${lines.length} lines`);
    header(E, l0 - 1, [[2, 'Line'], [3, 'Kind'], [4, 'Grade'], [5, 'Amount', true], [6, 'Basis']]);
    lines.forEach((l, i) => {
      const rr = l0 + i;
      val(E, rr, 2, l.label, undefined, font(9.5), 'left'); val(E, rr, 3, KIND[l.kind] ?? l.kind, undefined, font(9, C.muted), 'left');
      val(E, rr, 4, GRADE_NAME[l.grade], undefined, font(9, GRADE_C[l.grade][0], true), 'left'); val(E, rr, 5, X(l.amount), NF.money);
      val(E, rr, 6, l.basis, undefined, font(8.5, C.muted), 'left'); E.getRow(rr).height = Math.max(16, Math.min(90, Math.ceil(l.basis.length / 100) * 12 + 4));
      zebra(E, rr, 2, 6, i % 2 === 1);
    });
    E.views = [{ state: 'frozen', ySplit: l0 - 1, showGridLines: false }];
  }

  // ── Assumptions, your figures, calibration ────────────────────────────────────────────────────────────────────────
  if (ASM) {
    const Q = ASM.ws; let ar = 7;
    bar(Q, ar, 2, 3, 'Stated assumptions and their basis'); ar++;
    for (const [k, b] of md.assumptions) { ar++; val(Q, ar, 2, k, undefined, font(10, C.navy, true), 'left'); val(Q, ar, 3, b, undefined, font(9.5), 'left'); Q.getRow(ar).height = Math.max(18, Math.ceil(b.length / 130) * 13 + 4); zebra(Q, ar, 2, 3, false); }
    ar += 2; bar(Q, ar, 2, 3, 'Your figures — quotes and modules you entered, with their sources'); ar++;
    if (md.yourFigures.length) for (const y of md.yourFigures) { ar++; val(Q, ar, 2, `${y.line}: ${y.value}`, undefined, font(10), 'left'); val(Q, ar, 3, y.source, undefined, font(9.5), 'left'); zebra(Q, ar, 2, 3, false); }
    else { ar++; note(Q, ar, 2, 3, 'None yet. Supplier quotes (Setup) and your own modules (Scope) each replace an unsourced figure.', { size: 10 }); }
    ar += 2; bar(Q, ar, 2, 3, 'Calibration — which modules to measure first'); ar++;
    const cal = md.calibration;
    for (const x of cal.rows.slice(0, 15)) { ar++; val(Q, ar, 2, x.name, undefined, font(10), 'left'); val(Q, ar, 3, `${Math.round(x.personMonths).toLocaleString('en-GB')} PM · ${sym}${(X(x.amount) / 1e6).toFixed(1)}M · ${(x.share * 100).toFixed(1)} % · cumulative ${(x.cumulative * 100).toFixed(1)} %`, undefined, font(9.5), 'left'); zebra(Q, ar, 2, 3, false); }
  }

  // ── Scope ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  if (SCOPE) {
    const Z = SCOPE.ws; let zr = 7;
    if (md.slice.isWhole) {
      bar(Z, zr, 2, 4, 'Where out-of-scope catalogue software would run (hatched)'); zr++;
      zr += picture(Z, 'excluded', 2, zr + 1, 760) + 1;
      header(Z, zr, [[2, 'Catalogue module not in this programme'], [3, 'Domain'], [4, 'Why not']]);
      md.excluded.forEach(([a, b, c], i) => { zr++; val(Z, zr, 2, a, undefined, font(10), 'left'); val(Z, zr, 3, b, undefined, font(9.5), 'left'); val(Z, zr, 4, c, undefined, font(9.5, C.muted), 'left'); zebra(Z, zr, 2, 4, i % 2 === 1); });
    } else {
      bar(Z, zr, 2, 4, 'Modules in the vehicle costing but not in this report'); zr++;
      const inS = new Set(md.scopeIds);
      r.modules.filter(m => !inS.has(m.moduleId)).forEach((m, i) => { zr++; val(Z, zr, 2, m.moduleName, undefined, font(10), 'left'); val(Z, zr, 3, m.categoryLabel, undefined, font(9.5), 'left'); val(Z, zr, 4, X(m.grandTotal), NF.M); zebra(Z, zr, 2, 4, i % 2 === 1); });
    }
    zr += 2; bar(Z, zr, 2, 4, 'Vehicle software the catalogue has no module for (review judgement)'); zr++;
    for (const g of md.gaps) { note(Z, ++zr, 2, 4, `•  ${g}`, { size: 10, color: C.slate }); }
    for (const g of md.gapsCovered) { note(Z, ++zr, 2, 4, `•  ${g} — covered by your own module, costed in this total`, { size: 10, color: C.teal }); }
    zr += 2; bar(Z, zr, 2, 4, 'Limitations'); zr++;
    for (const t of ['Accuracy has not been measured: no real programme cost has been logged against the model. The Checks sheet proves the arithmetic, not the inputs.',
      'Sourced figures were read from search results of the cited pages and re-checked by an independent search.', 'Vehicle volume and programme life are user inputs.',
      'The vehicle skeleton is a generic zonal E/E template: parts are placed by vehicle zone, not taken from this vehicle\'s architecture.',
      ...(md.mlExcluded ? ['ML training data, annotation and retraining are not costed (switched off for this programme).'] : [])]) note(Z, ++zr, 2, 4, `•  ${t}`, { size: 10, color: C.slate });
  }

  // ── Cover ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    const V = COVER.ws;
    for (let rr = 7; rr <= 11; rr++) for (let c = 2; c <= 13; c++) V.getCell(rr, c).fill = fill(C.navy);
    V.mergeCells(7, 2, 7, 13); const a = V.getCell(7, 2); a.value = `COSTVISION  ·  SOFTWARE SHOULD-COST  ·  ${prof.label.toUpperCase()}`; a.font = font(9, 'B0C4DE', true); a.alignment = { indent: 1, vertical: 'bottom' };
    V.mergeCells(8, 2, 8, 13); const b = V.getCell(8, 2); b.value = req.title; b.font = font(22, C.white, true); b.alignment = { indent: 1, vertical: 'middle' }; V.getRow(8).height = 38;
    V.mergeCells(9, 2, 9, 13); const c = V.getCell(9, 2);
    c.value = md.slice.isWhole ? `Whole-vehicle software · ${p.powertrain ?? 'drivetrain as configured'} · ${r.modules.length} modules in ${md.headline.domains} domains` : `${md.modules.length} of ${r.modules.length} modules · ${md.domains.map(d => d.label).join(', ')}`;
    c.font = font(11, 'D6E2F0'); c.alignment = { indent: 1 };
    V.mergeCells(10, 2, 10, 13); const d = V.getCell(10, 2);
    d.value = [req.meta?.preparedBy ? `Prepared by ${req.meta.preparedBy}` : '', req.meta?.preparedFor ? `for ${req.meta.preparedFor}` : '', date].filter(Boolean).join('  ·  ');
    d.font = font(10, 'B0C4DE'); d.alignment = { indent: 1 };
    const tl = (c0: number, label: string, f: string, res: number, nf: string) => {
      V.mergeCells(13, c0, 13, c0 + 2); V.mergeCells(14, c0, 14, c0 + 2);
      const x = V.getCell(13, c0); x.value = label.toUpperCase(); x.font = font(8.5, C.muted, true); x.alignment = { indent: 1 };
      const y = V.getCell(14, c0); y.value = F(f, res); y.numFmt = nf; y.font = font(20, C.navy, true); y.alignment = { indent: 1, horizontal: 'left' };
      for (const rr of [13, 14]) for (let k = c0; k <= c0 + 2; k++) V.getCell(rr, k).fill = fill(C.page);
    };
    V.getRow(14).height = 34;
    tl(2, md.slice.isWhole ? 'Programme total' : 'This report', BT, X(md.slice.total), NF.M);
    tl(5, 'Per vehicle', `${SN}!$E$9`, X(md.slice.isWhole ? s.perVehicle : md.slice.total / (p.annualProductionVolume * p.programLifeYears)), NF.money);
    tl(8, 'Engineering (NRE)', BNRE, X(md.slice.nre), NF.M);
    tl(11, 'Lifecycle', BLIFE, X(md.slice.lifecycle), NF.M);
    const used = picture(V, 'cover', 2, 16, 960, false);
    note(V, 16 + used + 1, 2, 13, `Where the software runs: ${md.slice.components} vehicle components carry the software costed here, coloured by the highest ASIL among their modules. Schematic top view, not to scale.`, { italic: true });
    note(V, 16 + used + 3, 2, 13, 'A deterministic should-cost model: every figure comes from the module catalogue, the hub rate book and stated constants — no AI sets a price. Totals in this workbook are formulas; the Checks sheet compares each with the engine. Accuracy against real programme costs has not been measured.', { size: 10, color: C.slate, fillHex: C.amberT });
  }

  // ── Checks ────────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    const K = CHK.ws, KN = q(K.name);
    bar(K, 7, 2, 6, `${checks.length} checks — workbook formula against the engine's figure`, 'tolerance: 1 in the report currency');
    header(K, 8, [[2, 'Check'], [3, 'Workbook', true], [4, 'Engine', true], [5, 'Difference', true], [6, 'OK']]);
    checks.forEach((c, i) => {
      const rr = 9 + i;
      val(K, rr, 2, c.label, undefined, font(9.5), 'left');
      val(K, rr, 3, F(c.formula, c.result), NF.money2); val(K, rr, 4, c.engine, NF.money2, font(10, C.muted, false, true));
      val(K, rr, 5, F(`C${rr}-D${rr}`, 0), '0.0000');
      val(K, rr, 6, F(`IF(ABS(E${rr})<=MAX(1,ABS(D${rr})*1E-9),"✓","✗")`, '✓'), undefined, font(11, C.green, true), 'center');
      zebra(K, rr, 2, 6, i % 2 === 1);
    });
    const cl = 8 + checks.length;
    const sumRow = cl + 2;
    K.mergeCells(sumRow, 2, sumRow, 4);
    val(K, sumRow, 2, 'Checks passing', undefined, font(11, C.navy, true), 'left');
    val(K, sumRow, 5, F(`COUNTIF(F9:F${cl},"✓")&" of "&COUNTA(F9:F${cl})`, `${checks.length} of ${checks.length}`), undefined, font(11, C.navy, true), 'right');
    strong(K, sumRow, 2, 6);
    note(K, sumRow + 2, 2, 6, `The report model also ran ${md.checks.length} reconciliation checks before export (module buckets, the effort chain × rate, evidence lines, domains, the build-up): ${md.checks.filter(c => !c.ok).length ? md.checks.filter(c => !c.ok).length + ' FAILED' : 'all agree to within 1p'}. Engine figures are in the report currency (× ${fx} per £).`, { size: 9.5, color: C.slate });
    void KN;
  }

  // ── Contents ──────────────────────────────────────────────────────────────────────────────────────────────────────
  {
    const T = TOC.ws; let tr = 7;
    bar(T, tr, 2, 4, 'Sheets', 'click a name to go there'); tr++;
    header(T, tr, [[2, '#'], [3, 'Sheet'], [4, 'What it holds']]);
    sheets.forEach(({ ws, title }, i) => {
      tr++; val(T, tr, 2, i + 1, '0', font(10, C.muted), 'center');
      const cell = val(T, tr, 3, { text: ws.name, hyperlink: `#${q(ws.name)}!A1` }, undefined, { ...font(10, C.blue), underline: true }, 'left'); void cell;
      val(T, tr, 4, title, undefined, font(9.5), 'left'); zebra(T, tr, 2, 4, i % 2 === 1);
    });
    tr += 2; bar(T, tr, 2, 4, 'Report details');
    const meta2: Array<[string, string]> = [['Report', `${prof.label} — ${prof.what}`], ['Programme', req.title], ['Engineering hub', req.hubLabel], ['Currency', `${req.currency.code} (${sym}) — engine prices in £, × ${fx} per £`],
      ...(req.meta?.preparedBy ? [['Prepared by', req.meta.preparedBy]] as Array<[string, string]> : []), ...(req.meta?.preparedFor ? [['Prepared for', req.meta.preparedFor]] as Array<[string, string]> : []),
      ...(req.meta?.reference ? [['Reference', req.meta.reference]] as Array<[string, string]> : []), ...(req.meta?.confidentiality ? [['Confidentiality', req.meta.confidentiality]] as Array<[string, string]> : []),
      ['Generated', `${req.generatedAt.toLocaleString('en-GB')} · rate book ${req.bookVersion || '—'}`]];
    for (const [k, vv] of meta2) { tr++; val(T, tr, 3, k, undefined, font(10, C.navy, true), 'left'); val(T, tr, 4, vv, undefined, font(10), 'left'); zebra(T, tr, 3, 4, false); }
  }

  // Print areas reach the last chart row.
  for (const { ws, last } of sheets) {
    const chartEnd = Math.max(0, ...charts.filter(c => c.sheet === ws.name).map(c => c.to.row));
    ws.pageSetup.printArea = `A1:${colL(last + 1)}${Math.max(ws.rowCount, chartEnd)}`;
  }
  const raw = await wb.xlsx.writeBuffer();
  return addCharts(raw as ArrayBuffer, charts);
}

/** A domain's sheet name: "A · Powertrain & Battery" within Excel's 31 characters and allowed characters. */
export function domainSheetName(d: Pick<SWReportDomain, 'category' | 'label'>): string {
  const full = `${d.category} ${d.label}`.replace(/[\\/?*[\]:]/g, ' ');
  if (full.length <= 31) return full.trim();
  return full.slice(0, 31).replace(/[\s,&]+\S*$/, '').replace(/[\s,&]+$/, '').trim();
}
