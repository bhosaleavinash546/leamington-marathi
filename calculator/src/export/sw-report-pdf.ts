/**
 * Software should-cost PDF report (president review, 14 Oct 2026).
 *
 * The old export printed 8 short sections: a hard-coded "Premium Luxury SUV (2024–2026)" title, the top 20 modules with
 * cut names, a bucket table that left out homologation (so it did not add up), raw enum names and float noise, and seven
 * UNVERIFIED "published" programme figures beside the headline. This report prints only what the costing holds:
 *
 *   cover · contents · 1 executive summary · 2 programme definition (+ the vehicle facts, each with its page) ·
 *   3 how the cost is built (the seven steps) · 4 cost build-up (sums checked) · 5 every module · 6 lifecycle and unit
 *   economics · 7 spend by year · 8 every engineering hub and every manufacturing country · 9 risk · 10 evidence and
 *   sources · 11 make or buy and the supplier check · 12 scope, exclusions and limitations · appendix: the hub's rate build-up.
 *
 * Every figure is read off the engine's result (or the engine re-run for another hub); nothing is recomputed here except
 * sums printed as checks. Pure: the caller passes jsPDF, autoTable and the formatters.
 */
import type { jsPDF } from 'jspdf';
import type { SWProgramResult } from '../engine/sw-should-cost.js';
import {
  swRateBasis, SW_DEV_SOURCE_LABEL, SW_MC_RANGE_BY_GRADE, SW_SERVICE_BASIS, SW_SUBSCRIPTION_BASIS, SW_TOOL_SEAT_BASIS,
  SW_MAINT_BASIS, SW_POST_EOP_BASIS, SW_HOMOLOGATION_BASIS, SW_CLOUD_BASIS, SW_DEVELOPMENT_BASIS, SW_MODULES, swHorizon,
} from '../engine/sw-should-cost.js';
import type { SWHubRow, SWQuoteCheck, SWMakeBuy, SWEvidence, SWUnitEconomics, SWSpendProfile } from '../engine/sw-cockpit.js';
import type { SWCostingStep } from '../engine/sw-costing-steps.js';

type AutoTable = (doc: jsPDF, opts: Record<string, unknown>) => void;
type RGB = [number, number, number];

export interface SWReportCountry { code: string; label: string; hub: string; hubLabel: string; basis: string }

export interface SWReportInput {
  result:      SWProgramResult;
  /** Programme name, e.g. the vehicle demo's label. */
  title:       string;
  vehicleDesc?: string;
  facts?:      Array<[string, string]>;
  hubLabel:    string;
  steps:       SWCostingStep[];
  hubs:        SWHubRow[];
  countries:   SWReportCountry[];
  evidence:    SWEvidence;
  unit:        SWUnitEconomics;
  spend:       SWSpendProfile;
  makeBuy:     SWMakeBuy;
  quote:       SWQuoteCheck;
  hubRate?:    { build: string; sources: Array<[string, string, string]>; confidence: string; median?: string };
  /** Formatters in the page's display currency: money(n, dp), moneyM(n) ("£12.3M"), the M-unit label and the symbol. */
  /** The engine's loaded £ / person-month (swLoadedRate). */
  loadedRate:  number;
  money:       (n: number, dp?: number) => string;
  moneyM:      (n: number) => string;
  unitM:       string;
  sym:         string;
  generatedAt: Date;
  bookVersion: string;
}

// ── Look ────────────────────────────────────────────────────────────────────────────────────────────────────────────
const INK: RGB = [15, 23, 42], BODY: RGB = [51, 65, 85], MUTED: RGB = [100, 116, 139], RULE: RGB = [226, 232, 240];
const BAND: RGB = [15, 23, 42], ALT: RGB = [248, 250, 252];
// Two series (NRE, lifecycle): the app's validated chart slots 1 and 2.
const NRE_C: RGB = [42, 120, 214], LIFE_C: RGB = [235, 104, 52];
const W = 210, H = 297, MG = 16, TOP = 22, BOTTOM = 277;

export const SW_CATALOGUE_GAPS = [
  'Occupant restraint (airbag) control',
  'On-board AC charger and DC-DC converter control (the charging module covers DC fast-charge protocols)',
  'Electric power steering and electric parking brake base software',
  'Tyre-pressure monitoring',
  'Seat memory / massage and other comfort ECUs beyond climate and body control',
  'Trailer functions',
];

export function buildSWReportPdf(doc: jsPDF, autoTable: AutoTable, d: SWReportInput): void {
  const r = d.result, s = r.summary, p = r.inputs;
  const vehicles = p.annualProductionVolume * p.programLifeYears;
  const horizon = swHorizon(p);
  const pct = (x: number, of = s.grandTotal) => `${of > 0 ? (x / of * 100).toFixed(1) : '0.0'} %`;
  const M = d.moneyM, money = d.money;
  const num = (n: number, dp = 0) => n.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const toc: Array<[string, number]> = [];
  let y = TOP;

  const finalY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const page = () => (doc as unknown as { internal: { getNumberOfPages(): number } }).internal.getNumberOfPages();
  const ensure = (need: number) => { if (y + need > BOTTOM) { doc.addPage(); y = TOP; } };
  const setFont = (size: number, style: 'normal' | 'bold' = 'normal', c: RGB = BODY) => { doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...c); };
  const para = (text: string, size = 8.5, c: RGB = BODY, gap = 2.5) => {
    setFont(size, 'normal', c);
    const lines = doc.splitTextToSize(text, W - 2 * MG) as string[];
    const lh = size * 0.42;
    for (const line of lines) { ensure(lh + 1); doc.text(line, MG, y); y += lh; }
    y += gap;
  };
  const bullets = (items: string[], size = 8.5) => {
    setFont(size, 'normal', BODY);
    const lh = size * 0.42;
    for (const it of items) {
      const lines = doc.splitTextToSize(it, W - 2 * MG - 5) as string[];
      ensure(lh * lines.length + 1);
      doc.setFillColor(...NRE_C); doc.circle(MG + 1.2, y - 1.1, 0.7, 'F');
      lines.forEach((l, i) => doc.text(l, MG + 5, y + i * lh));
      y += lh * lines.length + 1.2;
    }
    y += 1.5;
  };
  const section = (n: string, title: string, lead?: string) => {
    if (y > TOP + 40) { doc.addPage(); y = TOP; } else ensure(30);
    toc.push([`${n}  ${title}`, page()]);
    setFont(15, 'bold', INK); doc.text(`${n}  ${title}`, MG, y); y += 2.5;
    doc.setDrawColor(...NRE_C); doc.setLineWidth(0.6); doc.line(MG, y, MG + 18, y); y += 6;
    if (lead) para(lead, 9, MUTED, 3);
  };
  const sub = (title: string) => { ensure(14); setFont(10.5, 'bold', INK); doc.text(title, MG, y); y += 5; };
  const table = (head: string[], body: Array<Array<string | { content: string; styles?: Record<string, unknown> }>>, cols: Record<number, Record<string, unknown>> = {}, opts: Record<string, unknown> = {}) => {
    autoTable(doc, {
      startY: y, head: [head], body, theme: 'plain',
      headStyles: { fillColor: BAND, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5, cellPadding: { top: 2.2, bottom: 2.2, left: 2, right: 2 } },
      bodyStyles: { fontSize: 7.5, textColor: BODY, cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 }, lineColor: RULE, lineWidth: { bottom: 0.1 } },
      alternateRowStyles: { fillColor: ALT },
      columnStyles: cols, margin: { left: MG, right: MG, top: TOP, bottom: H - BOTTOM }, ...opts,
    });
    y = finalY() + 6;
  };
  const strong = (t: string) => ({ content: t, styles: { fontStyle: 'bold', textColor: INK } });
  const R = { halign: 'right' };
  /** Horizontal bars, values in £, stacked NRE + lifecycle when both are given. */
  const bars = (rows: Array<{ label: string; a: number; b?: number; note?: string; bold?: boolean }>, max: number) => {
    const labelW = 52, barW = W - 2 * MG - labelW - 26, rowH = 5.2;
    for (const row of rows) {
      ensure(rowH + 1);
      setFont(7.5, row.bold ? 'bold' : 'normal', row.bold ? INK : BODY);
      doc.text(row.label.length > 34 ? row.label.slice(0, 33) + '…' : row.label, MG, y + 3);
      const x0 = MG + labelW;
      const wa = max > 0 ? barW * row.a / max : 0, wb = max > 0 && row.b ? barW * row.b / max : 0;
      doc.setFillColor(...NRE_C); doc.rect(x0, y + 0.6, Math.max(0.3, wa), 3.4, 'F');
      if (wb) { doc.setFillColor(...LIFE_C); doc.rect(x0 + wa + 0.3, y + 0.6, wb, 3.4, 'F'); }
      setFont(7.5, row.bold ? 'bold' : 'normal', INK);
      doc.text(row.note ?? M(row.a + (row.b ?? 0)), x0 + wa + wb + 2, y + 3);
      y += rowH;
    }
    y += 2;
  };
  const legend = (items: Array<[RGB, string]>) => {
    ensure(6); let x = MG;
    setFont(7.5, 'normal', MUTED);
    for (const [c, l] of items) { doc.setFillColor(...c); doc.rect(x, y - 2.4, 3, 3, 'F'); doc.text(l, x + 4.5, y); x += doc.getTextWidth(l) + 12; }
    y += 6;
  };

  // ── Cover ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  doc.setFillColor(...BAND); doc.rect(0, 0, W, 132, 'F');
  doc.setFillColor(...NRE_C); doc.rect(MG, 34, 22, 1.2, 'F');
  setFont(10, 'bold', [148, 163, 184]); doc.text('COSTVISION  ·  SOFTWARE SHOULD-COST REPORT', MG, 28);
  setFont(26, 'bold', [255, 255, 255]);
  const tLines = doc.splitTextToSize(d.title, W - 2 * MG) as string[];
  tLines.forEach((l, i) => doc.text(l, MG, 50 + i * 10));
  let cy = 50 + tLines.length * 10;
  setFont(11, 'normal', [203, 213, 225]);
  const subt = `Whole-vehicle software · ${p.powertrain ?? 'drivetrain as configured'} · ${r.modules.length} software modules`;
  doc.text(subt, MG, cy); cy += 7;
  setFont(9.5, 'normal', [148, 163, 184]);
  doc.text(`${d.hubLabel} engineering hub  ·  ${SW_DEV_SOURCE_LABEL[p.devSource]}  ·  ${num(p.annualProductionVolume)} vehicles a year × ${p.programLifeYears} years`, MG, cy); cy += 5.5;
  doc.text(`Prepared ${d.generatedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}  ·  rate book ${d.bookVersion}`, MG, cy);
  // KPI tiles
  const tiles: Array<[string, string, string]> = [
    ['Programme total', M(s.grandTotal), `≈ P${r.monteCarlo.headlinePercentile} of the simulated range`],
    ['Per vehicle, all-in', money(s.perVehicle, 0), `over ${num(vehicles)} vehicles`],
    ['Engineering (NRE)', M(s.nreTotal), `${num(s.totalEffortPersonMonths)} person-months`],
    ['Lifecycle', M(s.grandTotal - s.nreTotal), `to programme year ${horizon}`],
  ];
  const tw = (W - 2 * MG - 3 * 4) / 4;
  tiles.forEach(([k, v, n], i) => {
    const x = MG + i * (tw + 4), ty = 98;
    doc.setFillColor(30, 41, 59); doc.roundedRect(x, ty, tw, 26, 2, 2, 'F');
    setFont(7, 'bold', [148, 163, 184]); doc.text(k.toUpperCase(), x + 3.5, ty + 6);
    setFont(15, 'bold', [255, 255, 255]); doc.text(v, x + 3.5, ty + 15);
    setFont(6.8, 'normal', [148, 163, 184]); doc.text(doc.splitTextToSize(n, tw - 7) as string[], x + 3.5, ty + 20.5);
  });
  y = 146;
  setFont(10.5, 'bold', INK); doc.text('Read this first', MG, y); y += 6;
  bullets([
    `The figures are a deterministic should-cost model: every number comes from the module catalogue, the hub rate book and stated constants — no AI sets a price. The full arithmetic is in section 3 and was reconciled independently to the penny.`,
    `${pct(d.evidence.byGrade.unsourced)} of the total (${M(d.evidence.byGrade.unsourced)}) rests on unsourced catalogue figures — chiefly cloud, map data, the OS licence placeholder and the module effort catalogue. Treat them as estimates to replace with supplier quotes.`,
    `Accuracy against real programme costs has not been measured: no actual programme cost has been logged in the tool.`,
    `${d.facts?.length ? 'The vehicle facts behind the scope were checked against the manufacturer\'s and press pages (section 2). ' : ''}The annual volume and programme life are the user's inputs, not published figures.`,
  ], 9);
  y += 2;
  table(['Report detail', ''], [
    ['Programme', d.title],
    ['Software scope', `${r.modules.length} modules in 7 domains (section 5); excluded modules and catalogue gaps in section 12`],
    ['Engineering hub', `${d.hubLabel} — plus every hub in the rate book re-costed (section 8)`],
    ['Countries', `${d.countries.length} manufacturing countries mapped to their software hub (section 8)`],
    ['Currency', `${d.sym} — engine prices in £; figures shown in the report currency`],
  ], { 0: { cellWidth: 40, fontStyle: 'bold', textColor: INK } }, { showHead: 'never' });

  // Contents (filled at the end once page numbers are known)
  doc.addPage(); const tocPage = page();
  doc.addPage(); y = TOP;   // the contents page is left for the end; section 1 opens its own page

  // ── 1 Executive summary ───────────────────────────────────────────────────────────────────────────────────────────
  section('1', 'Executive summary', `${d.title}: ${r.modules.length} software modules, ${num(p.annualProductionVolume)} vehicles a year for ${p.programLifeYears} years (${num(vehicles)} vehicles), engineered at the ${d.hubLabel} hub by a ${SW_DEV_SOURCE_LABEL[p.devSource].toLowerCase()}.`);
  const cats = Object.entries(s.byCategory).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const catLabel = (c: string) => r.modules.find(m => m.category === c)?.categoryLabel ?? c;
  const top3 = [...r.modules].sort((a, b) => b.grandTotal - a.grandTotal).slice(0, 3);
  const hubsSorted = [...d.hubs].sort((a, b) => a.total - b.total);
  const lifecycle = s.grandTotal - s.nreTotal;
  table(['Figure', 'Value', 'What it covers'], [
    [strong('Programme total'), strong(M(s.grandTotal)), 'all engineering and every lifecycle cost to programme year ' + horizon],
    ['Per vehicle, all-in', money(s.perVehicle, 0), `total ÷ ${num(vehicles)} vehicles built`],
    ['Engineering (NRE)', M(s.nreTotal), `${pct(s.nreTotal)} — development, verification, integration, cyber, calibration, tools, homologation`],
    ['Lifecycle', M(lifecycle), `${pct(lifecycle)} — maintenance, licences and royalties, cloud`],
    ['Royalty per vehicle built', money(d.unit.perVehicleBuilt, 2), 'paid on every vehicle in the piece price'],
    ['Running cost per vehicle-year', money(d.unit.perVehicleYear, 2), `map data (${d.unit.subscriptionYears} yr) + cloud (${d.unit.serviceYears} yr) per vehicle in service`],
    ['Simulated range', `${M(r.monteCarlo.p10)} – ${M(r.monteCarlo.p90)}`, `P10–P90; P50 ${M(r.monteCarlo.p50)}; the headline sits at about P${r.monteCarlo.headlinePercentile}`],
    ['Hub range (same scope)', `${M(hubsSorted[0].total)} – ${M(hubsSorted[hubsSorted.length - 1].total)}`, `${hubsSorted[0].label} to ${hubsSorted[hubsSorted.length - 1].label} (section 8)`],
  ], { 0: { cellWidth: 46 }, 1: { cellWidth: 34, halign: 'right' } });
  sub('What the figures say');
  bullets([
    `Lifecycle is ${pct(lifecycle)} of the total: cloud ${M(s.totalCloud)}, licences and royalties ${M(s.totalLicensing)}, maintenance ${M(s.totalMaintenance)}. The running cost, more than the engineering, sets this programme's price.`,
    `The largest domain is ${catLabel(cats[0][0])} at ${M(cats[0][1])} (${pct(cats[0][1])}); the three largest modules — ${top3.map(m => `${m.moduleName} ${M(m.grandTotal)}`).join(', ')} — are ${pct(top3.reduce((a, m) => a + m.grandTotal, 0))} of the total.`,
    `Engineering is ${num(s.totalEffortPersonMonths)} person-months at ${money(d.loadedRate, 0)} per person-month loaded; moving the hub moves only the engineering and its maintenance — cloud, royalties and licences do not change with the hub.`,
    `The total rests mostly on unsourced catalogue figures (${pct(d.evidence.byGrade.unsourced)}); the published-source share is ${pct(d.evidence.byGrade.sourced)}. Replacing the largest unsourced lines with supplier quotes (section 10) is the fastest way to firm up the figure.`,
  ]);

  // ── 2 Programme definition ────────────────────────────────────────────────────────────────────────────────────────
  section('2', 'Programme definition', 'Every input the costing used. Defaults are the tool\'s stated assumptions; the basis of each is in section 10.');
  table(['Input', 'Value', 'Basis'], [
    ['Vehicle / programme', d.title, d.vehicleDesc ? 'vehicle demo (facts below)' : 'user programme'],
    ['Drivetrain', p.powertrain ?? 'as configured', 'engine powertrain scope'],
    ['Annual volume', num(p.annualProductionVolume), 'user input'],
    ['Programme life (production years)', String(p.programLifeYears), 'user input'],
    ['Engineering hub', d.hubLabel, 'hub rate book (appendix)'],
    ['Development source', `${SW_DEV_SOURCE_LABEL[p.devSource]}`, p.devSource === 'OEM_Internal' ? '—' : 'modelling assumption; efficiency factor unsourced, supplier margin sourced (section 10)'],
    ['Senior engineer share', `${Math.round(p.teamSeniorFraction * 100)} %`, 'demo / user input'],
    ['Engineering burden', p.burden ? `employment +${p.burden.employmentPct} %, company +${p.burden.companyPct} %, capital +${p.burden.capitalPct} %` : `× ${p.overheadMultiplier}`, 'section 10'],
    ['Reuse (all modules unless set)', [...new Set(p.modules.filter(m => m.enabled).map(m => m.reuse))].join(', '), 'tool default Medium (× 0.60) — unsourced'],
    ['Development window', `${p.developmentMonths ?? 54} months`, 'Volkswagen\'s stated cycle (section 10)'],
    ['Connected service per vehicle', `${d.unit.serviceYears} years`, 'median of current OEM terms'],
    ['Map-data subscription per vehicle', `${d.unit.subscriptionYears} years`, 'OEM map-update terms'],
    ['Security support after the last build', `${p.postProductionSupportYears ?? 10} years`, 'UN R155 post-production duty; share assumed'],
    ['Discount rate', `${p.discountRatePct ?? 0} % (nominal money)`, 'user input'],
    ['Homologation', (p.includeHomologation ?? true) ? 'included' : 'excluded', 'section 10'],
  ], { 0: { cellWidth: 52 }, 1: { cellWidth: 52 } });
  if (d.vehicleDesc) { sub('The vehicle'); para(d.vehicleDesc, 8.5); }
  if (d.facts?.length) {
    sub('Product facts the scope rests on (each checked on the page given)');
    table(['Fact', 'Checked on'], d.facts.map(([f, u]) => [f, u]), { 0: { cellWidth: 80 }, 1: { cellWidth: 98, fontSize: 6.5, textColor: MUTED } });
  }

  // ── 3 How the cost is built ───────────────────────────────────────────────────────────────────────────────────────
  section('3', 'How the cost is built', 'The seven steps the tool runs, with this programme\'s figures. An independent script recomputed every module and bucket from the same published tables and matched the tool to the penny at every hub (scripts/sw-review/rr-phev-trace.ts).');
  table(['#', 'Step', 'Result', 'How'], d.steps.map((st, i) => [String(i + 1), st.title, st.value, st.detail]),
    { 0: { cellWidth: 7 }, 1: { cellWidth: 34, fontStyle: 'bold', textColor: INK }, 2: { cellWidth: 26, halign: 'right' }, 3: { cellWidth: 111 } });
  sub('Formulas');
  bullets([
    'Loaded rate = hub mid / senior blend × development-source price factor × engineering burden.',
    'Development person-months = catalogue person-months × reuse × ASIL factor; costed across requirements 12 %, architecture 14 %, algorithms 22 % × complexity, implementation 37 % × (1 + 0.15 × (complexity − 1)), safety 15 % (reuse floored by ASIL).',
    'Testing, integration, cybersecurity (by the ISO/SAE 21434 CAL) and calibration are fractions of development; tools = engineer-years × the seat price.',
    'Maintenance = (development + testing + integration) × the module\'s % a year — full for 3 years after SOP, then 50 %, then the post-production security share after the last build.',
    'Royalties = vehicles × £ per vehicle built + vehicle-years × £ per vehicle-year; cloud = connected vehicle-years × £ per connected vehicle-year.',
  ]);

  // ── 4 Cost build-up ───────────────────────────────────────────────────────────────────────────────────────────────
  section('4', 'Cost build-up', 'Every bucket, the two subtotals and the total. The check line confirms the buckets add up.');
  const buckets: Array<[string, number]> = [
    ['Development engineering', s.totalDevelopment], ['Testing and validation (SIL / MIL / HIL)', s.totalTesting], ['Integration', s.totalIntegration],
    ['Cybersecurity engineering', s.totalCybersecurity], ['Calibration', s.totalCalibration], ['ML data', s.totalMLData],
    ['Development tools', s.totalToolchain], ['Homologation (R155 / R156 / ISO 26262)', s.totalHomologation],
  ];
  const life: Array<[string, number]> = [['Maintenance and security support', s.totalMaintenance], ['Licences and royalties', s.totalLicensing], ['Cloud', s.totalCloud]];
  const nreSum = buckets.reduce((a, [, v]) => a + v, 0), lifeSum = life.reduce((a, [, v]) => a + v, 0);
  table([`Bucket`, `${d.unitM}`, 'Share'], [
    ...buckets.filter(([, v]) => v > 0).map(([k, v]) => [k, M(v), pct(v)]),
    [strong('Engineering (NRE) subtotal'), strong(M(nreSum)), strong(pct(nreSum))],
    ...life.map(([k, v]) => [k, M(v), pct(v)]),
    [strong('Lifecycle subtotal'), strong(M(lifeSum)), strong(pct(lifeSum))],
    [strong('Programme total'), strong(M(s.grandTotal)), strong('100.0 %')],
  ], { 1: { ...R, cellWidth: 36 }, 2: { ...R, cellWidth: 26 } });
  // Exact pounds, so the check visibly adds up (rounded £M figures need not).
  para(`Check, exact: NRE ${money(nreSum, 0)} + lifecycle ${money(lifeSum, 0)} = ${money(nreSum + lifeSum, 0)}; the programme total is ${money(s.grandTotal, 0)} (${Math.abs(nreSum + lifeSum - s.grandTotal) < 1 ? 'they agree' : 'DIFFERENCE — investigate'}).`, 8, MUTED);
  sub('By software domain');
  const catRows = cats.map(([c]) => {
    const ms = r.modules.filter(m => m.category === c);
    const nre = ms.reduce((a, m) => a + m.totalNonRecurring, 0), lc = ms.reduce((a, m) => a + m.totalLifecycle, 0);
    return { c, label: catLabel(c), n: ms.length, nre, lc };
  });
  bars(catRows.map(x => ({ label: x.label, a: x.nre, b: x.lc })), Math.max(...catRows.map(x => x.nre + x.lc)));
  legend([[NRE_C, 'Engineering (NRE)'], [LIFE_C, 'Lifecycle']]);
  table(['Domain', 'Modules', 'NRE', 'Lifecycle', 'Total', 'Share'], catRows.map(x => [x.label, String(x.n), M(x.nre), M(x.lc), M(x.nre + x.lc), pct(x.nre + x.lc)]),
    { 1: { ...R, cellWidth: 16 }, 2: { ...R, cellWidth: 24 }, 3: { ...R, cellWidth: 24 }, 4: { ...R, cellWidth: 24 }, 5: { ...R, cellWidth: 18 } });
  para('Domain totals are module costs; homologation (programme-level) sits outside the domains.', 7.5, MUTED);

  // ── 5 Every module ────────────────────────────────────────────────────────────────────────────────────────────────
  section('5', 'Every software module', `All ${r.modules.length} modules in scope, grouped by domain. PM = costed engineering person-months (development, verification, integration, cyber, calibration). NRE includes the module's tools; lifecycle is its maintenance, licences, royalties and cloud.`);
  const modBody: Array<Array<string | { content: string; styles?: Record<string, unknown> }>> = [];
  for (const x of catRows) {
    modBody.push([{ content: x.label, styles: { fontStyle: 'bold', textColor: INK, fillColor: [226, 232, 240] } } as unknown as string,
      ...Array(8).fill({ content: '', styles: { fillColor: [226, 232, 240] } })]);
    for (const m of r.modules.filter(mm => mm.category === x.c).sort((a, b) => b.grandTotal - a.grandTotal)) {
      modBody.push([m.moduleName, m.asilUsed, m.complexityUsed, m.reuseUsed, m.calUsed === 'none' ? '—' : m.calUsed, num(m.effortPersonMonths, 0),
        M(m.totalNonRecurring), M(m.totalLifecycle), M(m.grandTotal)]);
    }
  }
  modBody.push([strong('All modules'), '', '', '', '', strong(num(r.modules.reduce((a, m) => a + m.effortPersonMonths, 0), 0)),
    strong(M(r.modules.reduce((a, m) => a + m.totalNonRecurring, 0))), strong(M(r.modules.reduce((a, m) => a + m.totalLifecycle, 0))), strong(M(r.modules.reduce((a, m) => a + m.grandTotal, 0)))]);
  table(['Module', 'ASIL', 'Complexity', 'Reuse', 'CAL', 'PM', 'NRE', 'Lifecycle', 'Total'], modBody,
    { 0: { cellWidth: 58 }, 1: { cellWidth: 10, halign: 'center' }, 2: { cellWidth: 21 }, 3: { cellWidth: 14 }, 4: { cellWidth: 12 }, 5: { ...R, cellWidth: 12 },
      6: { ...R, cellWidth: 17 }, 7: { ...R, cellWidth: 17 }, 8: { ...R, cellWidth: 17 } }, { bodyStyles: { fontSize: 6.8, textColor: BODY, cellPadding: 1.4, lineColor: RULE, lineWidth: { bottom: 0.1 } } });
  const modSum = r.modules.reduce((a, m) => a + m.grandTotal, 0), fixedCloud = s.grandTotal - modSum - s.totalHomologation;
  para(`Check, exact: module sum ${money(modSum, 0)} + homologation ${money(s.totalHomologation, 0)}${Math.abs(fixedCloud) >= 1 ? ` + fixed cloud platform ${money(fixedCloud, 0)}` : ''} = programme total ${money(s.grandTotal, 0)}.`, 8, MUTED);

  // ── 6 Lifecycle and unit economics ────────────────────────────────────────────────────────────────────────────────
  section('6', 'Lifecycle and unit economics', 'The figures purchasing compares, and every per-vehicle charge with the basis it was priced on.');
  const u = d.unit;
  table(['Figure', 'Value', 'Volume', 'Programme £'], [
    ['Engineering, one-off (NRE)', M(u.nre), '—', M(u.nre)],
    ['Royalty per vehicle built', money(u.perVehicleBuilt, 2), `${num(u.vehiclesBuilt)} vehicles`, M(u.perVehicleBuilt * u.vehiclesBuilt)],
    ['Map data per vehicle-year', money(u.subscriptionPerYear, 2), `${num(u.subscriptionVehicleYears)} vehicle-years (${u.subscriptionYears} yr each)`, M(u.subscriptionPerYear * u.subscriptionVehicleYears)],
    ['Cloud per connected vehicle-year', money(u.cloudPerYear, 2), `${num(u.serviceVehicleYears)} vehicle-years (${u.serviceYears} yr each)`, M(u.cloudPerYear * u.serviceVehicleYears)],
    ['Fixed per production year (maintenance, IP licences, platform) — average', M(u.fixedPerYear), `× ${p.programLifeYears} years`, M(u.fixedPerYear * p.programLifeYears)],
    [strong('Programme total'), '', '', strong(M(u.total))],
  ], { 0: { cellWidth: 64 }, 1: { ...R, cellWidth: 26 }, 2: { cellWidth: 56 }, 3: { ...R, cellWidth: 32 } });
  // Per module: royalties (each with its own basis) and IP licences; cloud per module with ONE basis below (it is the
  // same rule for every module — printing it on each row filled five pages with one paragraph).
  const byMod = new Map<string, { name: string; roy: number; royBasis: string; royGrade: string; ip: number; cloud: number }>();
  for (const m of r.modules) byMod.set(m.moduleName, { name: m.moduleName, roy: 0, royBasis: '', royGrade: '', ip: 0, cloud: 0 });
  for (const l of d.evidence.lines) {
    const name = l.label.replace(/ — (royalties|IP licences|cloud)$/, ''), x = byMod.get(name);
    if (!x) continue;
    if (l.kind === 'royalties') { x.roy += l.amount; x.royBasis = l.basis; x.royGrade = gradeName(l.grade); }
    else if (l.kind === 'licences') x.ip += l.amount;
    else if (l.kind === 'cloud') x.cloud += l.amount;
  }
  const mods = [...byMod.values()];
  sub('Royalties per vehicle — each priced on its own basis');
  const roy = mods.filter(x => x.roy > 1).sort((a, b) => b.roy - a.roy);
  table(['Module', 'Programme £', 'Grade', 'Basis'], roy.map(x => [x.name, M(x.roy), x.royGrade, x.royBasis]),
    { 0: { cellWidth: 40 }, 1: { ...R, cellWidth: 20 }, 2: { cellWidth: 22 }, 3: { cellWidth: 96, fontSize: 6.5 } });
  sub('Embedded IP licences (£ a year per module, over the production years)');
  const ip = mods.filter(x => x.ip > 1).sort((a, b) => b.ip - a.ip);
  table(['Module', 'Programme £', 'Module', 'Programme £'], Array.from({ length: Math.ceil(ip.length / 2) }, (_, i) => [ip[2 * i].name, M(ip[2 * i].ip), ip[2 * i + 1]?.name ?? '', ip[2 * i + 1] ? M(ip[2 * i + 1].ip) : '']),
    { 0: { cellWidth: 64 }, 1: { ...R, cellWidth: 25 }, 2: { cellWidth: 64 }, 3: { ...R, cellWidth: 25 } }, { bodyStyles: { fontSize: 6.8, textColor: BODY, cellPadding: 1.3, lineColor: RULE, lineWidth: { bottom: 0.1 } } });
  para(`IP licences ${M(ip.reduce((a, x) => a + x.ip, 0))} in all — the module catalogue's £ a year, unsourced (no licence prices are published for these stacks).`, 8, MUTED);
  sub('Cloud per module');
  const cl = mods.filter(x => x.cloud > 1).sort((a, b) => b.cloud - a.cloud);
  table(['Module', 'Programme £', 'Module', 'Programme £'], Array.from({ length: Math.ceil(cl.length / 2) }, (_, i) => [cl[2 * i].name, M(cl[2 * i].cloud), cl[2 * i + 1]?.name ?? '', cl[2 * i + 1] ? M(cl[2 * i + 1].cloud) : '']),
    { 0: { cellWidth: 64 }, 1: { ...R, cellWidth: 25 }, 2: { cellWidth: 64 }, 3: { ...R, cellWidth: 25 } }, { bodyStyles: { fontSize: 6.8, textColor: BODY, cellPadding: 1.3, lineColor: RULE, lineWidth: { bottom: 0.1 } } });
  para(`Cloud ${M(cl.reduce((a, x) => a + x.cloud, 0))} in all. Basis (every module): ${SW_CLOUD_BASIS} ${SW_SERVICE_BASIS}`, 7.8, MUTED);

  // ── 7 Spend by year ───────────────────────────────────────────────────────────────────────────────────────────────
  section('7', 'Spend by year', d.spend.note);
  const yrs = d.spend.years;
  table(['Year', 'Engineering', 'Maintenance', 'Licences', 'Royalties', 'Cloud', 'Total', 'Cumulative'],
    [...yrs.map(yy => [yy.label, M(yy.engineering), M(yy.maintenance), M(yy.licences), M(yy.royalties), M(yy.cloud), M(yy.total), M(yy.cumulative)]),
      [strong('Total'), strong(M(yrs.reduce((a, x) => a + x.engineering, 0))), strong(M(yrs.reduce((a, x) => a + x.maintenance, 0))), strong(M(yrs.reduce((a, x) => a + x.licences, 0))),
        strong(M(yrs.reduce((a, x) => a + x.royalties, 0))), strong(M(yrs.reduce((a, x) => a + x.cloud, 0))), strong(M(yrs.reduce((a, x) => a + x.total, 0))), '']],
    Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map(i => [i, R])), { bodyStyles: { fontSize: 6.8, textColor: BODY, cellPadding: 1.3, lineColor: RULE, lineWidth: { bottom: 0.1 } } });

  // ── 8 Hubs and countries ──────────────────────────────────────────────────────────────────────────────────────────
  section('8', 'Every engineering hub and every country', `The same ${r.modules.length}-module scope re-costed at each of the ${d.hubs.length} hubs in the rate book, each at its own salaries, employer on-costs and working hours (no UK multiplier). Only engineering and its maintenance move with the hub.`);
  bars(d.hubs.map(h => ({ label: `${h.label}${h.selected ? '  (this report)' : ''}`, a: h.nre, b: h.lifecycle, bold: h.selected })), Math.max(...d.hubs.map(h => h.total)));
  legend([[NRE_C, 'Engineering (NRE)'], [LIFE_C, 'Lifecycle']]);
  table(['Hub', 'Rate confidence', 'Loaded £/PM', 'NRE', 'Lifecycle', 'Total', 'Per vehicle', 'v this report'], d.hubs.map(h => [
    h.selected ? strong(h.label) : h.label, h.confidence, money(h.loadedRatePerPM, 0), M(h.nre), M(h.lifecycle), h.selected ? strong(M(h.total)) : M(h.total), money(h.perVehicle, 0),
    h.selected ? '—' : `${h.deltaTotal >= 0 ? '+' : '−'}${M(Math.abs(h.deltaTotal))}`]),
    { 0: { cellWidth: 40 }, 1: { cellWidth: 18 }, 2: { ...R, cellWidth: 20 }, 3: { ...R, cellWidth: 19 }, 4: { ...R, cellWidth: 19 }, 5: { ...R, cellWidth: 19 }, 6: { ...R, cellWidth: 18 }, 7: { ...R, cellWidth: 25 } });
  sub(`Every manufacturing country and its software hub (${d.countries.length})`);
  para('Software is costed where it is engineered. A country with its own assessed hub uses it; any other uses the nearest assessed hub, for the reason given.', 8, MUTED);
  const hubTotal = new Map(d.hubs.map(h => [h.hub as string, h.total]));
  table(['Country', 'Software hub', 'Programme total at that hub', 'Why this hub'], [...d.countries].sort((a, b) => a.label.localeCompare(b.label)).map(c => [c.label, c.hubLabel, M(hubTotal.get(c.hub) ?? NaN), c.basis || 'its own assessed hub']),
    { 0: { cellWidth: 34 }, 1: { cellWidth: 34 }, 2: { ...R, cellWidth: 30 }, 3: { cellWidth: 80, fontSize: 6.5 } }, { bodyStyles: { fontSize: 7, textColor: BODY, cellPadding: 1.4, lineColor: RULE, lineWidth: { bottom: 0.1 } } });

  // ── 9 Risk ────────────────────────────────────────────────────────────────────────────────────────────────────────
  section('9', 'Risk and sensitivity', `${num(r.monteCarlo.iterations)} seeded trials; each costed line is drawn from a triangular range set by its evidence grade, with a 55 % programme-wide correlation. The headline adds each line's most likely value; because most money rests on unsourced lines whose risk runs upwards, it sits at about P${r.monteCarlo.headlinePercentile}, not at the median.`);
  const mc = r.monteCarlo;
  table(['Measure', 'Programme total', 'Per vehicle'], [
    ['P10', M(mc.p10), money(mc.p10PerVehicle, 0)], [strong('P50 (median)'), strong(M(mc.p50)), strong(money(mc.p50PerVehicle, 0))], ['P90', M(mc.p90), money(mc.p90PerVehicle, 0)],
    ['Mean', M(mc.mean), money(mc.mean / vehicles, 0)], [`Headline (≈ P${mc.headlinePercentile})`, M(s.grandTotal), money(s.perVehicle, 0)],
  ], { 1: { ...R, cellWidth: 40 }, 2: { ...R, cellWidth: 34 } });
  sub('What moves the total — one driver at a time, everything else held');
  table(['Driver (low case vs high case)', 'Low', 'Base', 'High', 'Swing'], [...r.sensitivity].sort((a, b) => Math.abs(b.high - b.low) - Math.abs(a.high - a.low)).map(x => {
    const f = (n: number) => x.unit === '£M' ? M(n) : money(n, 0);
    return [x.parameter, f(x.low), f(x.base), f(x.high), f(Math.abs(x.high - x.low))];
  }), { 0: { cellWidth: 78 }, 1: { ...R }, 2: { ...R }, 3: { ...R }, 4: { ...R } });

  // ── 10 Evidence and sources ───────────────────────────────────────────────────────────────────────────────────────
  section('10', 'Evidence and sources', 'How well each part of the total is supported, the basis of every stated assumption, and the rate build-up.');
  const ev = d.evidence;
  table(['Evidence grade', 'In the total', 'Share', 'Simulated range (low · high)'], (['entered', 'calibrated', 'sourced', 'estimate', 'unsourced'] as const).map(g => [
    gradeName(g), M(ev.byGrade[g]), pct(ev.byGrade[g], ev.total), `× ${SW_MC_RANGE_BY_GRADE[g][0]} · × ${SW_MC_RANGE_BY_GRADE[g][2]}`]),
    { 1: { ...R, cellWidth: 30 }, 2: { ...R, cellWidth: 20 } });
  sub('Largest unsourced amounts — replace these first');
  table(['What', 'In the total'], ev.topUnsourced.slice(0, 8).map(t => [t.label, M(t.amount)]), { 1: { ...R, cellWidth: 36 } });
  sub('Stated assumptions and their basis');
  table(['Assumption', 'Basis'], [
    ['Connected service per vehicle', SW_SERVICE_BASIS], ['Map-data subscription', SW_SUBSCRIPTION_BASIS], ['Cloud £ per connected vehicle-year', SW_CLOUD_BASIS],
    ['Development window', SW_DEVELOPMENT_BASIS], ['Development tools', SW_TOOL_SEAT_BASIS], ['Maintenance profile', SW_MAINT_BASIS],
    ['Security support after the last build', SW_POST_EOP_BASIS], ['Homologation', SW_HOMOLOGATION_BASIS],
    ['Supplier margin (bought development)', d.makeBuy.basis],
    ['Effort catalogue (person-months per module)', 'CostVision catalogue — no published automotive productivity source was found (the defence data in Clark & Madachy\'s cost-estimation manual is the next source to read). Calibrate on your own actuals or size modules in KSLOC.'],
    ['Reuse, complexity factors', 'CostVision catalogue factors — no published source.'],
    ['ASIL factor', 'Solcept engineering blog (× 1.4 to ASIL-B, × 1.3 B → D); A and C interpolated — Low confidence.'],
  ], { 0: { cellWidth: 46, fontStyle: 'bold', textColor: INK }, 1: { cellWidth: 132, fontSize: 6.8 } });
  sub('Rate basis — what these figures were priced on');
  table(['Item', 'Value'], swRateBasis(p), { 0: { cellWidth: 50, fontStyle: 'bold', textColor: INK }, 1: { cellWidth: 128, fontSize: 6.8 } }, { showHead: 'never' });

  // ── 11 Make or buy and the supplier check ─────────────────────────────────────────────────────────────────────────
  section('11', 'Make or buy and the supplier check', `Each domain's engineering re-costed with each development source at this hub. ${d.makeBuy.basis}`);
  table(['Domain', 'OEM in-house', 'Tier-1 supplier', 'Start-up'], d.makeBuy.rows.map(x => [x.label, M(x.make), M(x.tier1), M(x.startup)]),
    { 1: R, 2: R, 3: R });
  para(`A bought source pays only when its effort is below ${(d.makeBuy.breakEvenEffortShare * 100).toFixed(1)} % of the in-house effort. The efficiency factors behind it are unsourced — set your supplier's own.`, 8, MUTED);
  const q = d.quote;
  const qRows = [q.nre, q.perVehicle, q.perVehicleYear, q.fixedPerYear, ...q.byCategory].filter(Boolean) as NonNullable<typeof q.nre>[];
  sub('Supplier quote check');
  if (qRows.length) {
    table(['Line', 'Should-cost', 'Quote', 'Gap'], qRows.map(x => {
      const f = (n: number) => x.unit === 'perVehicle' ? money(n, 2) : M(n);
      return [x.label, f(x.should), f(x.quoted), `${x.gap >= 0 ? '+' : '−'}${f(Math.abs(x.gap))} (${x.gapPct >= 0 ? '+' : ''}${x.gapPct.toFixed(0)} %)`];
    }), { 1: R, 2: R, 3: R });
  } else para('No supplier quote was entered on the Supplier check tab.', 8.5);
  para(`Negotiation target: a fair Tier-1 price for this scope is ${M(q.target.nre)} of engineering at ${money(q.target.ratePerPM, 0)} per person-month (${q.target.basis}).`, 8.5);

  // ── 12 Scope, exclusions and limitations ──────────────────────────────────────────────────────────────────────────
  section('12', 'Scope, exclusions and limitations');
  const inScope = new Set(r.modules.map(m => m.moduleId));
  const out = SW_MODULES.filter(m => !inScope.has(m.id));
  sub('Catalogue modules not in this programme');
  table(['Module', 'Domain', 'Why not'], out.map(m => [m.name, m.categoryLabel,
    m.id === 'digital_key' ? 'not confirmed for this vehicle — excluded rather than assumed' : m.id === 'mhev_48v' ? 'a 48 V mild-hybrid starter-generator; not this drivetrain' : 'switched off for this programme']),
    { 0: { cellWidth: 70 }, 1: { cellWidth: 50 } });
  sub('Vehicle software the catalogue has no module for (review judgement)');
  para('These functions are normally supplier ECUs whose software is priced in the hardware piece price. They are not in this total; confirm against the electrical bill of materials.', 8, MUTED);
  bullets(SW_CATALOGUE_GAPS);
  sub('Limitations');
  bullets([
    'Accuracy has not been measured: no real programme cost has been logged against the model. The reconciliation in section 3 proves the arithmetic, not the inputs.',
    'Sourced figures (hub salaries, supplier margins, licence prices, OEM service terms) were read from search results of the cited pages, and each new default was re-checked by an independent search; the pages themselves could not be opened from the build environment.',
    'Published "programme software cost" figures for other vehicles are not printed: none could be verified.',
    'Vehicle volume and programme life are user inputs. The manufacturer publishes no model-level volume for this vehicle.',
    'The voice-engine royalty uses Cerence\'s published average price per unit as the reference price for an embedded voice licence; the vehicle\'s own voice-assistant terms are not public.',
  ]);

  // ── Appendix: hub rate build-up ───────────────────────────────────────────────────────────────────────────────────
  if (d.hubRate) {
    section('A', `Appendix — ${d.hubLabel} engineering rate build-up`, `Rate confidence: ${d.hubRate.confidence}.`);
    para(d.hubRate.build, 8.5);
    if (d.hubRate.median) para(d.hubRate.median, 8.5);
    table(['Figure', 'Source', 'Page'], d.hubRate.sources.map(([f, src, url]) => [f, src, url]),
      { 0: { cellWidth: 26 }, 1: { cellWidth: 82 }, 2: { cellWidth: 70, fontSize: 6.3, textColor: MUTED } });
  }

  // ── Contents, header and footer ───────────────────────────────────────────────────────────────────────────────────
  doc.setPage(tocPage); y = TOP;
  setFont(15, 'bold', INK); doc.text('Contents', MG, y); y += 2.5;
  doc.setDrawColor(...NRE_C); doc.setLineWidth(0.6); doc.line(MG, y, MG + 18, y); y += 9;
  for (const [t, pg] of toc) {
    setFont(10, 'normal', BODY); doc.text(t, MG, y);
    doc.text(String(pg), W - MG, y, { align: 'right' });
    doc.setDrawColor(...RULE); doc.setLineWidth(0.1); doc.line(MG, y + 2, W - MG, y + 2);
    y += 8;
  }
  const total = page();
  for (let pg = 1; pg <= total; pg++) {
    doc.setPage(pg);
    if (pg > 1) {
      setFont(7, 'normal', MUTED); doc.text(`${d.title} — software should-cost`, MG, 12);
      doc.text(`${d.hubLabel} hub · ${num(p.annualProductionVolume)} / yr × ${p.programLifeYears} yr`, W - MG, 12, { align: 'right' });
      doc.setDrawColor(...RULE); doc.setLineWidth(0.2); doc.line(MG, 14, W - MG, 14);
    }
    doc.setDrawColor(...RULE); doc.setLineWidth(0.2); doc.line(MG, 284, W - MG, 284);
    setFont(7, 'normal', MUTED);
    doc.text('CostVision · deterministic should-cost model · Confidential', MG, 289);
    doc.text(`Page ${pg} of ${total}`, W - MG, 289, { align: 'right' });
  }
}

function gradeName(g: string): string {
  return ({ entered: 'Your figures', calibrated: 'Calibrated to your actuals', sourced: 'Published source', estimate: 'Labelled estimate', unsourced: 'Unsourced catalogue' } as Record<string, string>)[g] ?? g;
}

/** How the book's mid / senior salary follows from the listed observations: their median (each × its annual factor).
 *  Returns null when the median does not reproduce the book (the note would then be wrong — it is left out). */
export function hubMedianNote(raw: { currency: string; midAnnualSalary: number; seniorAnnualSalary: number;
  mid: Array<{ value: number; annualFactor: number }>; senior: Array<{ value: number; annualFactor: number }> }): string | null {
  const med = (xs: number[]) => { const a = [...xs].sort((p, q) => p - q), n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : NaN; };
  const mids = raw.mid.map(o => o.value * o.annualFactor), seniors = raw.senior.map(o => o.value * o.annualFactor);
  const m = med(mids), s = seniors.length ? med(seniors) : NaN;
  const f = (n: number) => Math.round(n).toLocaleString('en-GB');
  if (Math.abs(m - raw.midAnnualSalary) > 1) return null;
  const seniorOk = seniors.length && Math.abs(s - raw.seniorAnnualSalary) <= 1;
  return `The book takes the median of the observations below: mid = median of ${mids.length} (${mids.map(f).join(', ')}) = ${raw.currency} ${f(m)}`
    + (seniorOk ? `; senior = median of ${seniors.length} (${seniors.map(f).join(', ')}) = ${raw.currency} ${f(s)}.` : `; senior ${raw.currency} ${f(raw.seniorAnnualSalary)} as stated in the book.`);
}
