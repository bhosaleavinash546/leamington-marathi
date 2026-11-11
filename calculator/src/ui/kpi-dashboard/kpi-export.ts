/**
 * KPI dashboard exports — PDF dashboard report and Excel report. Both draw the SAME server
 * summary and the SAME filtered record list the screen shows; nothing is recomputed. The
 * workbook's "Reconciliation" sheet re-adds the financial KPIs from the exported records
 * with live formulas, so a reader can check them without trusting the tool.
 * (The CSV is built by the server: GET /api/kpi/records.csv.)
 */
import {
  STATUS_LABEL, DATE_PRESET_LABEL, FX_METHOD_LABEL, INELIGIBLE_LABEL, DIMENSIONS, NOT_SET, KPI_FMT,
  type DashboardSummary, type RecordStatus, type CategoryRow,
} from '../../engine/kpi-dashboard.js';
import { DIM_LABEL, optionLabel, type RecordRowView } from './kpi-builders.js';
import { chartSpecs, withLightTheme } from './kpi-charts.js';

export const REPORT_TITLE = 'CostVision | Global Cost Engineering KPI Dashboard';

export interface ExportRow extends RecordRowView {
  sourceRef: string; currentTerms: string | null; shouldTerms: string | null; annualVolume: number | null; volumeValidated: boolean;
}

const lbl = (k: string) => (k === NOT_SET ? 'Not set' : k);

export function filterLines(s: DashboardSummary): string[] {
  const f = s.filters;
  const period = f.datePreset === 'custom'
    ? `Custom: ${s.window.from ?? 'start'} to ${s.window.to ?? 'today'}`
    : `${DATE_PRESET_LABEL[f.datePreset]}${s.window.from ? ` (${s.window.from} to ${s.window.to})` : ''}`;
  const lines = [`Period: ${period}`];
  for (const d of DIMENSIONS) if (f[d].length) lines.push(`${DIM_LABEL[d]}: ${f[d].map(v => optionLabel(d, v)).join(', ')}`);
  if (lines.length === 1) lines.push('No other filter — all commodities, programmes, model years and powertrains');
  return lines;
}

export function fxNote(s: DashboardSummary): string {
  return `GBP at each record's frozen FX snapshot. Policy: ${FX_METHOD_LABEL[s.fx.policy]}. ${s.fx.approvedRates} approved rate(s) loaded; `
    + `${s.dataQuality.unapprovedFx} current record(s) converted at the built-in reference (not approved).`;
}

/** The KPI rows both exports print (label, value, basis). */
export function kpiRows(s: DashboardSummary): [string, string, string][] {
  const o = s.operational, f = s.financial, { gbp2, pct1 } = KPI_FMT;
  return [
    ['Total eligible costing records', String(o.totalRecords), `${o.currentRecords} current; revisions included`],
    ['Unique components analysed', String(o.uniqueComponents), `By part number; ${o.unidentified} record(s) without one not counted`],
    ['Completed costing records', String(o.completedRecords), 'Current records completed, reviewed or approved'],
    ['Commodities covered', String(o.commodities), 'Current records'],
    ['Vehicle programmes covered', String(o.programmes), 'Current records'],
    ['Weighted average cost gap', f.weightedGapPct === null ? 'n/a' : pct1(f.weightedGapPct), `Sum of gaps / sum of GBP current cost; ${f.eligible} eligible record(s)`],
    ['Potential unit cost opportunity', gbp2(f.opportunity.gbp), `Sum of per-piece gaps above should-cost; ${f.opportunity.n} record(s). Not an annual saving.`],
    ['Unfavourable gaps (below should-cost)', gbp2(f.unfavourable.gbp), `${f.unfavourable.n} record(s)`],
    ['Annualised opportunity', f.annualised.n ? gbp2(f.annualised.gbp) : 'Not available', f.annualised.n ? `${f.annualised.n} record(s) with an admin-validated annual volume` : 'No validated annual volume'],
    ['Validated savings', f.validatedSavings.n ? gbp2(f.validatedSavings.gbp) : 'Not tracked', `${f.validatedSavings.n} record(s), per piece`],
    ['Implemented savings', f.implementedSavings.n ? gbp2(f.implementedSavings.gbp) : 'Not tracked', `${f.implementedSavings.n} record(s), per piece`],
    ['Records requiring review or approval', String(o.needsReview), `${o.awaitingReview} to review, ${o.awaitingApproval} to approve`],
  ];
}

const dqRows = (s: DashboardSummary): [string, number][] => {
  const q = s.dataQuality, m = q.missingClassification;
  return [['Total retrieved records', q.retrieved], ['Included (all revisions)', q.included], ['Records excluded', q.excluded],
    ['  deleted', q.excludedBy.deleted], ['  test', q.excludedBy.test], ['  invalid', q.excludedBy.invalid],
    ['Financially eligible', q.financiallyEligible], ['Missing should-cost', q.missingShouldCost], ['Missing current cost', q.missingCurrentCost],
    ['Missing FX rate', q.missingFx], ['Different cost basis', q.basisMismatch], ['Reference FX (not approved)', q.unapprovedFx],
    ['Duplicate candidates', q.duplicateCandidates], ['Older revisions', q.supersededRevisions], ['No part number', m.partNumber],
    ['No commodity', m.commodity], ['No programme', m.programme], ['No model year', m.modelYear], ['No powertrain', m.powertrain]];
};

function stamp(): string { return new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', ''); }

function download(blob: Blob, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ─── Excel ────────────────────────────────────────────────────────────────────

const COLS: { h: string; get: (r: ExportRow) => unknown; fmt?: string; w?: number }[] = [
  { h: 'Costing ID', get: r => r.id, w: 22 }, { h: 'Original record ID', get: r => r.sourceRef, w: 18 },
  { h: 'Component', get: r => r.componentName, w: 26 }, { h: 'Part number', get: r => r.partNumber, w: 14 },
  { h: 'Commodity', get: r => r.commodity, w: 18 }, { h: 'Programme', get: r => r.programme }, { h: 'Model year', get: r => r.modelYear },
  { h: 'Powertrain', get: r => r.powertrain }, { h: 'Country / market', get: r => r.country },
  { h: 'Current cost (original)', get: r => r.currentCost, fmt: '#,##0.00' }, { h: 'Current currency', get: r => r.currentCcy }, { h: 'Current terms', get: r => r.currentTerms },
  { h: 'Should-cost (original)', get: r => r.shouldCost, fmt: '#,##0.00' }, { h: 'Should currency', get: r => r.shouldCcy }, { h: 'Should terms', get: r => r.shouldTerms },
  { h: 'FX current (GBP per unit)', get: r => r.fx.current?.gbpPerUnit ?? null, fmt: '0.000000' },
  { h: 'FX current source', get: r => (r.fx.current ? `${r.fx.current.source} (${r.fx.current.effectiveDate})${r.fx.current.approved ? '' : ' — reference'}` : null), w: 30 },
  { h: 'FX should (GBP per unit)', get: r => r.fx.should?.gbpPerUnit ?? null, fmt: '0.000000' },
  { h: 'GBP current cost', get: r => r.gbpCurrent, fmt: '£#,##0.00' }, { h: 'GBP should-cost', get: r => r.gbpShould, fmt: '£#,##0.00' },
  { h: 'GBP cost gap', get: r => r.gapGbp, fmt: '£#,##0.00;[Red]-£#,##0.00' }, { h: 'Cost gap %', get: r => (r.gapPct === null ? null : r.gapPct / 100), fmt: '0.0%' },
  { h: 'Annual volume', get: r => r.annualVolume, fmt: '#,##0' }, { h: 'Volume validated', get: r => (r.volumeValidated ? 'yes' : 'no') },
  { h: 'Costing tool', get: r => r.sourceTool }, { h: 'Status', get: r => STATUS_LABEL[r.status] ?? r.status },
  { h: 'Reporting role', get: r => r.role }, { h: 'Financial eligibility', get: r => (r.eligible ? 'eligible' : r.ineligible ? INELIGIBLE_LABEL[r.ineligible] : '') },
  { h: 'Created by', get: r => r.ownerName, w: 18 }, { h: 'Costing date', get: r => r.costingDate }, { h: 'Created', get: r => r.createdAt, w: 20 }, { h: 'Last updated', get: r => r.updatedAt, w: 20 },
];
const colLetter = (i: number) => { let s = '', n = i + 1; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

export async function buildExcel(s: DashboardSummary, rows: ExportRow[]): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CostVision'; wb.created = new Date();
  const H = { bold: true, color: { argb: 'FFFFFFFF' } };
  const FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF16325C' } };
  const head = (ws: import('exceljs').Worksheet, cells: string[]) => {
    const r = ws.addRow(cells); r.font = H; r.eachCell(c => { c.fill = FILL; c.alignment = { vertical: 'middle', wrapText: true }; });
  };

  // 1 Executive summary
  const ex = wb.addWorksheet('Executive summary');
  ex.columns = [{ width: 40 }, { width: 22 }, { width: 80 }];
  ex.addRow([REPORT_TITLE]).font = { bold: true, size: 14 };
  ex.addRow([`Generated ${new Date(s.generatedAt).toLocaleString('en-GB')} · data refreshed ${new Date().toLocaleString('en-GB')}`]);
  for (const l of filterLines(s)) ex.addRow([l]);
  ex.addRow([fxNote(s)]);
  ex.addRow([]);
  head(ex, ['KPI', 'Value', 'Basis']);
  for (const k of kpiRows(s)) ex.addRow(k);
  ex.addRow([]);
  head(ex, ['Insight', '', '']);
  for (const i of s.insights) { const r = ex.addRow([i.title, '', i.detail]); r.getCell(3).alignment = { wrapText: true }; }
  if (!s.insights.length) ex.addRow(['No insights — no records in this view.']);

  const catSheet = (name: string, keyH: string, counts: CategoryRow[], money: CategoryRow[]) => {
    const ws = wb.addWorksheet(name);
    ws.columns = [{ width: 28 }, { width: 16 }, { width: 14 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 22 }];
    head(ws, [keyH, 'Records', 'Eligible', 'GBP current (Σ per piece)', 'GBP should-cost (Σ per piece)', 'GBP gap', 'Opportunity (Σ per piece)']);
    for (const c of counts) {
      const m = money.find(x => x.key === c.key);
      const r = ws.addRow([lbl(c.key), c.count, m?.eligible ?? 0, m?.currentGbp ?? null, m?.shouldGbp ?? null, m?.gapGbp ?? null, m?.opportunityGbp ?? null]);
      for (const i of [4, 5, 6, 7]) r.getCell(i).numFmt = '£#,##0.00';
    }
    ws.addRow([]);
    ws.addRow(['Records = current records except the commodity sheet, which counts every save. GBP columns use eligible current records only.']);
    return ws;
  };
  const c = s.charts;
  catSheet('Commodity analysis', 'Commodity', c.byCommodity, c.costByCommodity);
  catSheet('Programme analysis', 'Programme', c.byProgramme, c.costByProgramme);
  catSheet('Powertrain analysis', 'Powertrain', c.byPowertrain, c.costByPowertrain);
  const my = catSheet('Model year & status', 'Model year', c.byModelYear, c.costByModelYear);
  my.addRow([]); head(my, ['Status', 'Current records']);
  for (const r of c.byStatus) my.addRow([STATUS_LABEL[r.key as RecordStatus] ?? r.key, r.count]);
  my.addRow([]); head(my, ['Costing tool', 'Records']);
  for (const r of c.byTool) my.addRow([lbl(r.key), r.count]);

  // Original currencies (never added together)
  const oc = wb.addWorksheet('Original currencies');
  oc.columns = [{ width: 12 }, { width: 14 }, { width: 18 }, { width: 14 }, { width: 18 }, { width: 14 }, { width: 22 }];
  head(oc, ['Currency', 'Records (current)', 'Σ current cost', 'Records (should)', 'Σ should-cost', 'Same-currency records', 'Σ gap (same currency, same basis)']);
  for (const t of s.currencyTotals) oc.addRow([t.currency, t.currentRecords, t.sumCurrent, t.shouldRecords, t.sumShould, t.sameCcyRecords, t.sameCcyRecords ? t.sumGap : null]);
  oc.addRow([]); oc.addRow(['Each row is in its own currency. Rows are never added together.']);

  // Costing records
  const rec = wb.addWorksheet('Costing records');
  rec.columns = COLS.map(col => ({ width: col.w ?? 14 }));
  head(rec, COLS.map(col => col.h));
  for (const r of rows) {
    const row = rec.addRow(COLS.map(col => col.get(r) ?? null));
    COLS.forEach((col, i) => { if (col.fmt) row.getCell(i + 1).numFmt = col.fmt; });
  }
  rec.views = [{ state: 'frozen', ySplit: 1, xSplit: 3 }];
  rec.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLS.length } };

  // Data quality
  const dq = wb.addWorksheet('Data quality');
  dq.columns = [{ width: 36 }, { width: 12 }];
  head(dq, ['Check', 'Records']);
  for (const [k, v] of dqRows(s)) dq.addRow([k, v]);

  // Reconciliation — live formulas over the exported records
  const rc = wb.addWorksheet('Reconciliation');
  rc.columns = [{ width: 40 }, { width: 20 }, { width: 20 }, { width: 14 }];
  head(rc, ['Financial KPI', 'Dashboard', 'Re-added from "Costing records"', 'Match']);
  const n = rows.length + 1;
  const col = (h: string) => `'Costing records'!$${colLetter(COLS.findIndex(x => x.h === h))}$2:$${colLetter(COLS.findIndex(x => x.h === h))}$${Math.max(2, n)}`;
  const el = col('Financial eligibility'), cur = col('GBP current cost'), sh = col('GBP should-cost'), gap = col('GBP cost gap');
  const f = s.financial;
  const lines: [string, number | null, string, string][] = [
    ['Financially eligible records', f.eligible, `COUNTIF(${el},"eligible")`, '0'],
    ['Σ GBP current cost', f.sumCurrentGbp, `SUMIFS(${cur},${el},"eligible")`, '£#,##0.00'],
    ['Σ GBP should-cost', f.sumShouldGbp, `SUMIFS(${sh},${el},"eligible")`, '£#,##0.00'],
    ['Σ GBP cost gap', f.sumGapGbp, `SUMIFS(${gap},${el},"eligible")`, '£#,##0.00'],
    ['Potential unit cost opportunity', f.opportunity.gbp, `SUMIFS(${gap},${el},"eligible",${gap},">0")`, '£#,##0.00'],
    ['Unfavourable gaps', f.unfavourable.gbp, `SUMIFS(${gap},${el},"eligible",${gap},"<0")`, '£#,##0.00'],
    ['Weighted cost gap %', f.weightedGapPct === null ? null : f.weightedGapPct / 100, `IF(C3=0,"",C5/C3)`, '0.00%'],
  ];
  lines.forEach(([k, v, formula, fmt], i) => {
    const r = rc.addRow([k, v, { formula }, { formula: `IF(ABS(N(B${i + 2})-N(C${i + 2}))<0.005,"✓","✗")` }]);
    r.getCell(2).numFmt = fmt; r.getCell(3).numFmt = fmt;
  });
  rc.addRow([]);
  rc.addRow(['The re-added column recomputes each KPI from the exported records. Every row should show ✓.']);

  // Method & FX
  const me = wb.addWorksheet('Method & FX');
  me.columns = [{ width: 120 }];
  for (const l of [
    fxNote(s), `FX reference: ${s.fx.reference}`,
    'GBP value = original value × the GBP-per-unit rate frozen on the record when it was saved. Current and should-cost are converted independently.',
    'Gap = GBP current − GBP should-cost. Gap % = Σ gap ÷ Σ GBP current (weighted). Missing costs are never treated as zero.',
    'One current record per application (part number × programme × model year × powertrain): the newest non-draft. Older revisions and other users\' costings of the same application are kept for activity, not financial KPIs.',
    'Records without a part number cannot be de-duplicated and are counted on their own. Names are never used to merge parts.',
    'Opportunity is a sum of per-piece gaps, not programme spend or an annual saving. An annualised figure uses only admin-validated annual volumes.',
  ]) { const r = me.addRow([l]); r.getCell(1).alignment = { wrapText: true }; }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export async function exportExcel(s: DashboardSummary, rows: ExportRow[]): Promise<void> {
  download(await buildExcel(s, rows), `costvision-kpi-dashboard-${stamp()}.xlsx`);
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

/** jsPDF's built-in fonts are WinAnsi: replace the few characters they cannot draw. */
export const pdfSafe = (t: string): string => t.replace(/−/g, '-').replace(/Σ/g, 'Sum ').replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/→/g, '->').replace(/×/g, 'x').replace(/[  ]/g, ' ');

async function chartImages(s: DashboardSummary): Promise<{ title: string; basis: string; url: string }[]> {
  const { Chart } = await import('chart.js');
  const out: { title: string; basis: string; url: string }[] = [];
  const prevFont = Chart.defaults.font.size;
  Chart.defaults.font.size = 22;            // drawn at 1000 px, printed at ~135 mm: print-legible
  await withLightTheme(async () => {
    for (const sp of chartSpecs(s)) {
      if (sp.empty || !sp.config) continue;
      const canvas = document.createElement('canvas');
      canvas.width = 1000; canvas.height = Math.min(700, Math.round((sp.height ?? 240) * 1.9));
      canvas.style.cssText = 'position:fixed;left:-99999px;top:0';
      document.body.appendChild(canvas);
      const cfg = sp.config();
      cfg.options = { ...cfg.options, responsive: false, animation: false, devicePixelRatio: 1 };
      const ch = new Chart(canvas, cfg as never);
      const ctx = canvas.getContext('2d')!;
      ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      // The on-screen hint ("select a bar to filter") means nothing on paper.
      out.push({ title: sp.title, basis: sp.basis.replace(/\s*·\s*(select|hover)[^·]*/gi, ''), url: canvas.toDataURL('image/png') });
      ch.destroy(); canvas.remove();
    }
  }).finally(() => { Chart.defaults.font.size = prevFont; });
  return out;
}

export async function buildPdf(s: DashboardSummary, rows: ExportRow[]): Promise<Blob> {
  const [{ jsPDF }, at] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const autoTable = (at as unknown as { default: (d: unknown, o: unknown) => void }).default;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), M = 12;
  const NAVY: [number, number, number] = [22, 50, 92];
  const txt = (t: string, x: number, y: number, o?: Record<string, unknown>) => doc.text(pdfSafe(t), x, y, o);
  const tableOpts = { theme: 'grid', styles: { fontSize: 8, cellPadding: 1.6 }, headStyles: { fillColor: NAVY, textColor: 255 }, margin: { left: M, right: M } };
  const lastY = () => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 30;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...NAVY);
  txt(REPORT_TITLE, M, 16);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(70);
  let y = 22;
  for (const l of [`Generated ${new Date(s.generatedAt).toLocaleString('en-GB')}`, ...filterLines(s)]) { txt(l, M, y); y += 4.2; }
  const fx = doc.splitTextToSize(pdfSafe(fxNote(s)), W - 2 * M) as string[]; doc.text(fx, M, y); y += fx.length * 4 + 2;

  autoTable(doc, { ...tableOpts, startY: y, head: [['KPI', 'Value', 'Basis']], body: kpiRows(s).map(r => r.map(pdfSafe)),
    columnStyles: { 0: { cellWidth: 70, fontStyle: 'bold' }, 1: { cellWidth: 36, halign: 'right' } } });
  if (s.insights.length) {
    autoTable(doc, { ...tableOpts, startY: lastY() + 5, head: [['Insight', 'Detail']], body: s.insights.map(i => [pdfSafe(i.title), pdfSafe(i.detail)]), columnStyles: { 0: { cellWidth: 90, fontStyle: 'bold' } } });
  }

  // Charts, two per row
  const imgs = await chartImages(s);
  if (imgs.length) {
    doc.addPage(); y = 14;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...NAVY); txt('Charts', M, y); y += 4;
    const cw = (W - 2 * M - 8) / 2;
    const hOf = (u: string) => { const p = doc.getImageProperties(u); return Math.min(72, (p.height / p.width) * cw); };
    for (let i = 0; i < imgs.length; i += 2) {
      const pair = imgs.slice(i, i + 2);
      const rowH = Math.max(...pair.map(im => hOf(im.url)));      // a row is as tall as its taller chart
      if (y + rowH + 14 > doc.internal.pageSize.getHeight() - 10) { doc.addPage(); y = 14; }
      pair.forEach((im, k) => {
        const x = M + k * (cw + 8);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(30); txt(im.title, x, y + 4);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(110); txt(im.basis, x, y + 8);
        doc.addImage(im.url, 'PNG', x, y + 10, cw, hOf(im.url));
      });
      y += rowH + 16;
    }
  }

  // Analysis tables
  doc.addPage();
  const c = s.charts;
  autoTable(doc, { ...tableOpts, startY: 14, head: [['Commodity', 'Records (saves)', 'Eligible', 'GBP current', 'GBP should-cost', 'GBP gap', 'Opportunity']],
    body: c.byCommodity.map(r => { const m = c.costByCommodity.find(x => x.key === r.key); return [lbl(r.key), r.count, m?.eligible ?? 0, KPI_FMT.gbp2(m?.currentGbp ?? 0), KPI_FMT.gbp2(m?.shouldGbp ?? 0), pdfSafe(KPI_FMT.gbp2(m?.gapGbp ?? 0)), KPI_FMT.gbp2(m?.opportunityGbp ?? 0)]; }) });
  const small = (title: string, rs: CategoryRow[], f: (k: string) => string = lbl) =>
    autoTable(doc, { ...tableOpts, startY: lastY() + 5, head: [[title, 'Current records']], body: rs.map(r => [f(r.key), r.count]), tableWidth: 90 });
  small('Programme', c.byProgramme); small('Powertrain', c.byPowertrain); small('Model year', c.byModelYear, k => (k === NOT_SET ? 'Not set' : `MY${k}`));
  small('Status', c.byStatus, k => STATUS_LABEL[k as RecordStatus] ?? k); small('Costing tool', c.byTool);
  autoTable(doc, { ...tableOpts, startY: lastY() + 5, head: [['Currency', 'Sum current (original)', 'Sum should-cost (original)', 'Same-currency gap']],
    body: s.currencyTotals.map(t => [t.currency, `${t.sumCurrent.toFixed(2)} (${t.currentRecords})`, `${t.sumShould.toFixed(2)} (${t.shouldRecords})`, t.sameCcyRecords ? t.sumGap.toFixed(2) : '-']), tableWidth: 160 });
  autoTable(doc, { ...tableOpts, startY: lastY() + 5, head: [['Data quality', 'Records']], body: dqRows(s).map(([k, v]) => [k, v]), tableWidth: 90 });

  // Records (the CSV / Excel hold the complete list)
  const CAP = 400;
  const list = rows.filter(r => r.role === 'current').slice(0, CAP);
  doc.addPage();
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...NAVY);
  txt(`Current costing records${rows.filter(r => r.role === 'current').length > CAP ? ` (first ${CAP}; the Excel and CSV hold all)` : ''}`, M, 14);
  autoTable(doc, { ...tableOpts, startY: 18, styles: { fontSize: 6.6, cellPadding: 1.1 },
    head: [['Part number', 'Component', 'Commodity', 'Prog.', 'MY', 'Powertrain', 'Current (orig.)', 'Should (orig.)', 'GBP current', 'GBP should', 'GBP gap', 'Gap %', 'Tool', 'Status', 'Created by', 'Date']],
    body: list.map(r => [r.partNumber ?? '-', pdfSafe(r.componentName), r.commodity ?? '-', r.programme ?? '-', r.modelYear ?? '-', r.powertrain ?? '-',
      r.currentCost === null ? '-' : `${r.currentCost.toFixed(2)} ${r.currentCcy}`, r.shouldCost === null ? '-' : `${r.shouldCost.toFixed(2)} ${r.shouldCcy}`,
      r.gbpCurrent === null ? '-' : r.gbpCurrent.toFixed(2), r.gbpShould === null ? '-' : r.gbpShould.toFixed(2),
      r.eligible ? r.gapGbp!.toFixed(2) : (r.ineligible ? INELIGIBLE_LABEL[r.ineligible] : '-'), r.eligible && r.gapPct !== null ? `${r.gapPct.toFixed(1)}%` : '-',
      r.sourceTool, STATUS_LABEL[r.status] ?? r.status, pdfSafe(r.ownerName), r.costingDate]) });

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p); doc.setFontSize(7); doc.setTextColor(120);
    txt(`${REPORT_TITLE} · page ${p} of ${pages} · GBP at frozen FX; opportunity = per-piece gaps summed, not an annual saving`, M, doc.internal.pageSize.getHeight() - 5);
  }
  return doc.output('blob');
}

export async function exportPdf(s: DashboardSummary, rows: ExportRow[]): Promise<void> {
  download(await buildPdf(s, rows), `costvision-kpi-dashboard-${stamp()}.pdf`);
}

export { download };
