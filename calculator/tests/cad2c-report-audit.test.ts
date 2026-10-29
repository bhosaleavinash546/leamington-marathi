/**
 * CAD2C five-part review (29 Oct 2026, docs/review/cad2c-five-part-review-2026-10-29.md): the report and screen fixes
 * the line-by-line audit of five parts' PDFs and workbooks asked for.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { shortOperationName, operationFeatureList } from '../src/engine/operation-names.js';
import { reportNoteText } from '../src/export/money-text.js';
import { coverWarningText, decisionAnswerLabel, decisionAnswerText } from '../src/export/decision-text.js';
import { COMMODITY_REPORT_LABELS } from '../src/ui/data/commodity-meta.js';
import { winAnsiSafe } from '../src/export/pdf.js';
import { routeCompareHtml, routeComparisonExport, type RouteCompareRow } from '../src/ui/cad-workspace.js';
import { compareRoutes } from '../server/services/route-compare.js';
import { recomputeMachineRates, DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { validateStackInput } from '../src/engine/core.js';
import { runSensitivity } from '../src/engine/sensitivity.js';

const FULL = 'CNC Machining — 20 features (1×Ø10.0×12, 1×Ø11.0×21, 1×Ø12.0×2, 2×Ø12.5×16, 1× face 1544mm², 1× face 956mm²) [geometry-measured]';

describe('R3 — an operation prints its name, the feature list prints once in the feature audit', () => {
  it('shortens the measured machining names and leaves every other name alone', () => {
    expect(shortOperationName(FULL)).toBe('CNC Machining — 20 features');
    expect(shortOperationName('Drilling — 8 holes (1×Ø10.0×12, 2×Ø12.5×16) [geometry-measured]')).toBe('Drilling — 8 holes');
    expect(shortOperationName('Finish boring — 4 cored bore(s) (1×Ø63.0×3, 1×Ø68.0×40) [geometry-measured]')).toBe('Finish boring — 4 cored bore(s)');
    expect(shortOperationName('Machining load / unload + change-over (3 fixturing(s): 0.6 min each + 45 min ÷ batch 5000)'))
      .toBe('Machining load / unload + change-over (3 fixturing(s): 0.6 min each + 45 min ÷ batch 5000)');
    expect(shortOperationName('Forging')).toBe('Forging');
    expect(operationFeatureList(FULL)).toBe('1×Ø10.0×12, 1×Ø11.0×21, 1×Ø12.0×2, 2×Ø12.5×16, 1× face 1544mm², 1× face 956mm²');
    expect(operationFeatureList('Forging')).toBeNull();
  });
  it('the sensitivity names its drivers by the short name', () => {
    const lib = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
    const input = {
      partName: 'x', annualVolume: 10_000,
      rawMaterial: { materialId: 'mat-steel-38mnvs6', netWeightKg: 1, materialUtilization: 0.8 },
      operations: [{ operationName: FULL, machineId: 'mach-vmc3', labourId: 'lab-uk-skilled', cycleTimeHr: 0.1, partsPerCycle: 1, oee: 0.8, manning: 1, labourTimeHr: 0.1, labourEfficiency: 0.9 }],
      tooling: { totalToolingCost: 1000, amortizationVolume: 10_000, mode: 'amortized' as const },
      packagingPerPart: 0.1, logisticsPerPart: 0.1, overheadPct: 0.12, marginPct: 0.08,
    };
    const s = runSensitivity(input as never, lib, 10);
    const names = s.drivers.map(d => d.driver);
    expect(names.some(n => n.includes('CNC Machining — 20 features'))).toBe(true);
    expect(names.some(n => n.includes('1×Ø10.0×12'))).toBe(false);
  });
});

describe('R10 / R26 / R27 — a rate-book note as a report prints it', () => {
  it('drops the refresh bookkeeping, the previous figure, the pricing-basis cross-reference and a module parameter', () => {
    const note = 'UK resin distributor Jun 2026. Automotive interior, electronics housings. coolFactor ~2.2 s/mm² Index-anchored 2026-07 (see RESIN PRICING BASIS). | Refresh 2026-09: -£0.026/kg from 0.6kg pc £1.000->£1.000/kg; premiums held';
    expect(reportNoteText(note)).toBe('UK resin distributor Jun 2026. Automotive interior, electronics housings. Index-anchored 2026-07.');
    expect(reportNoteText('UK book 2026-10-10: 15.73 × 2028 h × 1.18 shift = £37,643 gross. Source: https://x.y/z. Was £24.17/h'))
      .toBe('UK book 2026-10-10: 15.73 × 2028 h × 1.18 shift = £37,643 gross. Source: https://x.y/z.');
    // mid-note and per kg too (§5 machine rates, §3 / §6 material notes in the five-part run)
    expect(reportNoteText('£0.182/kWh. Was £41.32/h (a build-up tuned to a shop rate). UK Tier-2 CNC turning centre.'))
      .toBe('£0.182/kWh. UK Tier-2 CNC turning centre.');
    expect(reportNoteText('ladder +£0.010/kg (book grade £0.87 - book base £0.86). Was £0.87/kg. Source: https://a.b/c'))
      .toBe('ladder +£0.010/kg (book grade £0.87 - book base £0.86). Source: https://a.b/c');
    expect(reportNoteText(null)).toBe('');
  });

  it('a priced lever\'s re-cost basis names the operation short', async () => {
    const src = await import('node:fs').then(fs => fs.readFileSync('src/engine/idea-levers.ts', 'utf8'));
    expect(src).toMatch(/basis: `\$\{shortOperationName\(top\.operationName\)\} cycle time/);
  });

  it('a cover note names the operation whatever its name holds (em dash, commas)', () => {
    const w = 'operations[0] (Direct extrusion — press, quench, stretch, saw).partsPerCycle: Direct extrusion — press, quench, stretch, saw: 15 parts a cycle — each part carries 1/15 of the cycle time';
    expect(coverWarningText(w)).toBe('Direct extrusion — press, quench, stretch, saw (operation 1) — parts per cycle: Direct extrusion — press, quench, stretch, saw: 15 parts a cycle — each part carries 1/15 of the cycle time');
    expect(coverWarningText('rawMaterial.materialUtilization: Very low utilisation')).not.toMatch(/^rawMaterial/);
  });
});

describe('R6 / R37 — decision answers read as a person reads them', () => {
  it('routes, materials, yes / no and classes are labelled; the unanswered text uses an em dash', () => {
    const o = { routeLabels: COMMODITY_REPORT_LABELS, grades: [{ id: 'mat-pc-abs', grade: 'PC/ABS Blend (automotive grade)' }] };
    expect(decisionAnswerLabel('commodity.route', 'injection_moulding', o)).toBe('Injection moulding');
    expect(decisionAnswerLabel('material.resin', 'mat-pc-abs', o)).toBe('PC/ABS Blend (automotive grade)');
    expect(decisionAnswerLabel('service.safetyCritical', 'yes', o)).toBe('Yes');
    expect(decisionAnswerLabel('service.toleranceClass', 'standard', o)).toBe('Standard');
    expect(decisionAnswerLabel('material.family', 'cast iron', o)).toBe('Cast iron');
    expect(decisionAnswerText({ severity: 'advisory', answer: null, used: '38MnVS6' })).toBe('not answered — costed as 38MnVS6');
  });
  it('the report labels are full names and every tab label has one', () => {
    expect(COMMODITY_REPORT_LABELS.injection_moulding).toBe('Injection moulding');
    expect(COMMODITY_REPORT_LABELS.sheet_metal_fab).toMatch(/laser/);
    expect(COMMODITY_REPORT_LABELS.cast_and_machine).toBe('Cast and machine');
    expect(COMMODITY_REPORT_LABELS.gear).toBe('Gear cutting');
    for (const k of Object.keys(COMMODITY_REPORT_LABELS)) expect(COMMODITY_REPORT_LABELS[k]).not.toMatch(/Cast\+|^SM |^Al /);
  });
});

describe('R28 — Greek letters in a basis are named in the PDF, never dropped', () => {
  it('Σ, π, α, Δ survive the WinAnsi pass as words', () => {
    expect(winAnsiSafe('Σ over 4 operations')).toBe('Sum over 4 operations');
    expect(winAnsiSafe('t = wall²/(π²·α)')).toBe('t = wall²/(pi²·alpha)');
    expect(winAnsiSafe('Δ 3 mm')).toBe('delta 3 mm');
  });
});

describe('R5 / R24 — a multi-cavity cycle and a Medium price grade are not warnings', () => {
  it('core: a Medium-confidence price raises no warning; Low does; parts a cycle is still said (as a note)', () => {
    const lib = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
    const medium = lib.materials.find(m => m.confidence === 'Medium')!;
    const low = lib.materials.find(m => m.confidence === 'Low')!;
    const base = {
      partName: 'x', annualVolume: 1000,
      operations: [{ operationName: 'Moulding', machineId: 'imm-400t', labourId: 'lab-uk-semiskilled', cycleTimeHr: 0.01, partsPerCycle: 2, oee: 0.8, manning: 1, labourTimeHr: 0.01, labourEfficiency: 0.9 }],
      tooling: { totalToolingCost: 1000, amortizationVolume: 1000, mode: 'amortized' as const },
      packagingPerPart: 0.1, logisticsPerPart: 0.1, overheadPct: 0.12, marginPct: 0.08,
    };
    const vMed = validateStackInput({ ...base, rawMaterial: { materialId: medium.id, netWeightKg: 1, materialUtilization: 0.9 } } as never, lib);
    expect(vMed.warnings.some(w => /price confidence/.test(w.message))).toBe(false);
    expect(vMed.warnings.some(w => /parts a cycle/.test(w.message))).toBe(true);
    const vLow = validateStackInput({ ...base, rawMaterial: { materialId: low.id, netWeightKg: 1, materialUtilization: 0.9 } } as never, lib);
    expect(vLow.warnings.some(w => /price confidence Low/.test(w.message))).toBe(true);
  });
  it('the PDF prints them as notes, not engine warnings', () => {
    const pdf = readFileSync('src/export/pdf.ts', 'utf8');
    expect(pdf).toContain("'Notes on this costing'");
    expect(pdf).toMatch(/coverWarn\.length/);
  });
});

describe('R1 / R32 / R33 / U6 — the comparison on screen and in the reports', () => {
  const parts = JSON.parse(readFileSync('tests/fixtures/real-parts-baseline.json', 'utf8')) as Array<{ part: string; answers: Record<string, string>; geometry: Record<string, unknown>; outcome: { commodity?: string } }>;
  const book = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
  it('a caveat lands on its own row once; the reference row prints the band the screen gave; a grade note names the grade', async () => {
    const p = parts.find(x => x.part === 'FORGE_Hub_Flange.stp')!;
    const band = { p10: 15.5, p50: 17.3, p90: 19.2, plusMinusPct: 9.4, confidence: 'Low' };
    const cmp = await compareRoutes({ geo: p.geometry as never, filename: p.part, current: 'forging', answers: p.answers, region: 'UK', annualVolume: 100_000, programmeYears: 5, baseBook: book, bands: false, referenceBand: band });
    const ref = cmp.rows[0];
    expect(ref.caveats.filter(c => /same operations and tooling/.test(c))).toHaveLength(0);
    const precision = cmp.rows.find(r => r.process === 'precision')!;
    expect(precision.caveats.filter(c => /same operations and tooling/.test(c))).toHaveLength(1);
    expect(precision.caveats[precision.caveats.length - 1]).toMatch(/material line \(yield, machining stock, per-part services/);
    expect(ref.band).toEqual(band);
    expect(ref.byVolume.find(v => v.volume === 100_000)).toMatchObject({ p10: 15.5, p90: 19.2 });
    const q = parts.find(x => x.part === 'IM_ECU_Cover.stp')!;
    const c2 = await compareRoutes({ geo: q.geometry as never, filename: q.part, current: 'injection_moulding', answers: q.answers, region: 'UK', annualVolume: 100_000, programmeYears: 5, baseBook: book, bands: false, ladder: false });
    const mach = c2.rows.find(r => r.route === 'machining')!;
    expect(mach.notes.join(' ')).not.toMatch(/mat-pa66gf30/);
    expect(mach.notes.join(' ')).toMatch(/PA66 GF30 is not bought on this route/);
  }, 120_000);
  it('the table puts the basis on its own full-width row under the figures (no sideways scroll), with full route names', () => {
    const row = (route: string, total: number): RouteCompareRow => ({
      route, process: null, label: route, commodity: route, status: 'costed', total, toolingPerPart: 0.1, breakdown: null, reconciles: null, audit: null, spec: [],
      material: null, tooling: null, operations: null, band: null, checks: [], caveats: ['c'], assumed: [], openQuestions: [], notes: [], refusal: null, byVolume: [], programme: null,
    });
    const html = routeCompareHtml(routeComparisonExport({ principle: 'p', rows: [row('forging', 10), row('cast_and_machine', 12)], excluded: [], ladder: [], crossovers: [], programme: { annualVolume: 1, years: 5, yearsAssumed: false } },
      { current: 'forging', headline: 10, labels: COMMODITY_REPORT_LABELS }), { fmt: n => `£${n.toFixed(2)}` });
    expect((html.match(/class="cad-compare-basis/g) ?? []).length).toBe(2);
    expect(html).toContain('colspan="6"');
    expect(html).not.toContain('<th scope="col">Basis</th>');
    expect(html).toContain('Cast and machine');
  });
});

describe('S1 / S2 / S4 — screen wording', () => {
  it('no changelog prose, no emoji markers, no "review before calculating" after the cost', () => {
    const ws = readFileSync('src/ui/cad-workspace.ts', 'utf8');
    expect(ws).not.toMatch(/it used to be loaded/);
    const main = readFileSync('src/ui/main.ts', 'utf8');
    expect(main).not.toMatch(/&#127919; Improve this analysis|&#128247; Material is only/);
    expect(main).not.toMatch(/review before calculating/);
  });
});

describe('P-A — no process-plausibility block before a process is chosen', () => {
  it('runAllGuards drops the process checks while the route question is open, keeps them once it is answered', async () => {
    const { runAllGuards } = await import('../server/routes/cad.js');
    const parts = JSON.parse(readFileSync('tests/fixtures/real-parts-baseline.json', 'utf8')) as Array<{ part: string; geometry: Record<string, unknown> }>;
    const rail = parts.find(p => p.part === 'AL_Battery_Rail.stp')!;
    const analysis = { costInputSuggestions: { recommendedCommodity: 'machining' }, materialAnalysis: { primarySuggestion: { name: 'Aluminium', confidencePct: 0 } } };
    const open = runAllGuards(structuredClone(analysis), rail.geometry as never, (rail.geometry as { volume: { cm3: number } }).volume.cm3, null, { routeOpen: true });
    expect(open.some(w => w.code === 'process_geometry_implausible')).toBe(false);
    const chosen = runAllGuards(structuredClone(analysis), rail.geometry as never, (rail.geometry as { volume: { cm3: number } }).volume.cm3, null, { routeOpen: false });
    expect(chosen.some(w => w.code === 'process_geometry_implausible')).toBe(true);
  });
});

describe('V1 — two isometric CAD views under the summary (the Director, 30 Oct 2026)', async () => {
  const { pdfText, sandCastingResult } = await import('./casting-360-review.test.js');
  const { printPDF } = await import('../src/export/pdf.js');
  const { exportToExcelBlob } = await import('../src/export/excel.js');
  const { DEFAULT_RATE_LIBRARY: lib } = await import('../src/engine/rate-library.js');
  // an 8 × 6 white JPEG (tests/fixtures/tiny-view.jpg, written by PyMuPDF) — a picture jsPDF and ExcelJS both accept
  const { readFileSync } = await import('node:fs');
  const JPEG = `data:image/jpeg;base64,${readFileSync('tests/fixtures/tiny-view.jpg').toString('base64')}`;
  const views = [{ label: 'Isometric — front, right, top', dataUrl: JPEG }, { label: 'Isometric — back, left, top', dataUrl: JPEG }];
  const { input, result } = sandCastingResult();

  it('the PDF cover prints the block and both captions; a costing without views prints nothing', () => {
    const withViews = pdfText(() => printPDF(result, input, lib, 'GBP', 1, 'cast_and_machine', null, 'UK', [], { cadViews: views } as never));
    expect(withViews).toMatch(/CAD Model .*Isometric Views/);   // pdfText drops the em dash (an octal escape in the PDF string)
    expect(withViews).toMatch(/front, right, top/);
    expect(withViews).toMatch(/back, left, top/);
    const without = pdfText(() => printPDF(result, input, lib, 'GBP', 1, 'cast_and_machine', null, 'UK', [], {} as never));
    expect(without).not.toMatch(/Isometric Views/);
  });

  it('the workbook carries both pictures on 1-Summary, and every sheet, cell and formula survives the round trip', async () => {
    const plain = await exportToExcelBlob(result, input, lib, 'GBP', 1, null);
    const blob = await exportToExcelBlob(result, input, lib, 'GBP', 1, null, null, null, null, views);
    const ExcelJS = (await import('exceljs')).default ?? await import('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    const ws = wb.getWorksheet('1-Summary')!;
    expect(ws.getImages()).toHaveLength(2);
    expect(String(ws.getCell(1, 5).value)).toMatch(/front, right, top/);
    const XLSX = await import('xlsx');
    const a = XLSX.read(new Uint8Array(await plain.arrayBuffer())), b = XLSX.read(new Uint8Array(await blob.arrayBuffer()));
    expect(b.SheetNames).toEqual(a.SheetNames);
    // every sheet equal as CSV; on 1-Summary the two picture captions (row 1, columns E and L) are the only addition
    const body = (csv: string, n: string) => (n === '1-Summary' ? csv.split('\n').slice(1).join('\n') : csv).replace(/,+$/gm, '');
    for (const n of a.SheetNames) expect(body(XLSX.utils.sheet_to_csv(b.Sheets[n]), n), n).toBe(body(XLSX.utils.sheet_to_csv(a.Sheets[n]), n));
    expect(XLSX.utils.sheet_to_csv(b.Sheets['1-Summary']).split('\n')[0]).toMatch(/CAD model/);
  });
});
