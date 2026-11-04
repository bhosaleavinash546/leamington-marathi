/**
 * The core should-cost report (report standard, Nov 2026 — docs/review/report-standard-2026-11/README.md §3): ONE model
 * (executive-summary.ts buildCoreReport) drawn as the default 7-page PDF and the workbook's first sheet; the full report
 * is the audit pack (printAuditPackPDF). Every figure is the costing's own or an engine re-run — the model adds only
 * sums, shares and the capacity count, and these tests re-add them.
 */
import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';
import ExcelJS from 'exceljs';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { buildCoreReport, materialSplit, splitToolingItem, capacityImplied, type CoreReportMeta } from '../src/export/executive-summary.js';
import { reportStandardFor, dfmRuleApplies, REPORT_STANDARD_COMMODITIES } from '../src/export/report-standard.js';
import { printPDF, printAuditPackPDF, type CADReportMeta } from '../src/export/pdf.js';
import { exportToExcelBlob } from '../src/export/excel.js';
import type { UniversalStackInput } from '../src/engine/types.js';

const lib = DEFAULT_RATE_LIBRARY;
const STAMP = 'United Kingdom rate book v2.2.0 · rules v8 · kernel 374f8cebdccb · 3 Nov 2026';

/** A cast + machined part shaped like the stub axle: consumables and services, melt energy, pattern sets, an HMC cell. */
const cast: UniversalStackInput = {
  partName: 'Stub axle (test)',
  rawMaterial: {
    materialId: 'mat-gjs500', netWeightKg: 9.084, materialUtilization: 0.98, lossIsNotScrap: true,
    consumablesCostPerPart: 3.09 + 0.75 + 2.81 + 0.15,
    consumablesItems: [{ label: 'cores', gbp: 3.09 }, { label: 'shot blast', gbp: 0.75 }, { label: 'cutting-tool wear', gbp: 2.81 },
      { label: 'green-sand additions (14.98 kg poured × £0.01/kg, engineering-typical)', gbp: 0.15 }],
    energyKwh: { electricity: 9.29, basis: 'melt energy on every kg poured (engineering-typical — replace with plant data)' },
  },
  operations: [
    { operationName: 'Sand Casting — Moulding', machineId: 'sand-cast-line', labourId: 'lab-uk-foundry', cycleTimeHr: 0.0172, partsPerCycle: 1, oee: 0.8, manning: 4, labourTimeHr: 0.0172, labourEfficiency: 0.92 },
    { operationName: 'Fettling (gate / riser removal, grind)', machineId: 'sand-cast-line', labourId: 'lab-uk-foundry', cycleTimeHr: 0, partsPerCycle: 1, oee: 1, manning: 1, labourTimeHr: 0.103, labourEfficiency: 0.92, benchOperation: true },
    { operationName: 'Finish machining — +Y side', machineId: 'mach-hmc-400', labourId: 'lab-uk-skilled', cycleTimeHr: 0.0624, partsPerCycle: 1, oee: 0.8, manning: 0.5, labourTimeHr: 0.0624, labourEfficiency: 0.92 },
    { operationName: 'Drilling — 12 holes', machineId: 'mach-hmc-400', labourId: 'lab-uk-skilled', cycleTimeHr: 0.1328, partsPerCycle: 1, oee: 0.8, manning: 0.5, labourTimeHr: 0.1328, labourEfficiency: 0.92 },
  ],
  tooling: {
    totalToolingCost: 731_491, amortizationVolume: 1_000_000, mode: 'amortized',
    items: [{ label: 'Pattern equipment: 65 set(s) (life 16,000 castings each; 1,030,928 poured incl. 3% rejects)', gbp: 716_625 },
      { label: 'Machining fixtures', gbp: 14_500 }, { label: 'CNC programming (NRE)', gbp: 366 }],
  },
  packagingPerPart: 0.36, logisticsPerPart: 0, overheadPct: 0.12, marginPct: 0.08,
  annualVolume: 200_000, programmeYears: 5, deliveryTerms: 'EXW',
} as UniversalStackInput;
const castRes = computeUniversalStack(cast, lib);

const route = (r: string, total: number) => ({ route: r, process: null, label: r, commodity: r, status: 'ok', total, toolingPerPart: 0.5, breakdown: null, reconciles: true,
  audit: null, spec: [], material: null, tooling: { investment: 50_000, amortisedOver: 1_000_000, items: [] }, operations: null, band: null, checks: [], caveats: [],
  assumed: [], openQuestions: [], notes: [], refusal: null, byVolume: r === 'cast_and_machine' ? [{ volume: 5_000, total: total * 1.1, p10: null, p90: null, note: null }, { volume: 200_000, total, p10: null, p90: null, note: null }] : [], programme: null });
const routeComparison = {
  principle: 'Same material family, feasible routes only.', ladder: [5_000, 200_000], crossovers: [],
  programme: { annualVolume: 200_000, years: 5, yearsAssumed: false },
  rows: [route('cast_and_machine', castRes.total), route('forging', castRes.total * 0.7), route('machining', castRes.total * 0.9), route('composites', castRes.total * 3)],
  excluded: [{ route: 'injection_moulding', process: null, label: 'injection moulding', reasons: [] }],
  current: 'cast_and_machine', currentLabel: 'Cast and machine', labels: { cast_and_machine: 'Cast and machine', forging: 'Forging', machining: 'Machining', composites: 'Composites' },
  headline: castRes.total,
} as unknown as NonNullable<CoreReportMeta['routeComparison']>;

const grouped = (ruleId: string, severity: string) => ({ ruleId, severity, title: `Finding ${ruleId}`, count: 2, recommendation: 'Change it.', faceIds: [1, 2],
  worst: { detail: 'worst', measured: { field: 'draftDeg', value: 0, unit: 'deg' } }, range: { min: 0, max: 1, unit: 'deg' }, threshold: { value: 1, unit: 'deg', comparator: '>=' },
  source: { standard: 'test standard' } });
const geometricDFM = {
  grouped: [grouped('casting.draft.insufficient', 'major'), grouped('forging.draft.below-process-minimum', 'major'), grouped('moulding.draft.insufficient', 'critical'),
    grouped('machining.hole.many-sizes', 'major'), grouped('machining.setup.access-directions', 'major'), grouped('casting.fillet.sharp-internal-corner', 'major'),
    grouped('casting.section.abrupt-change', 'major'), grouped('casting.hotspot.isolated-heavy-section', 'major'), grouped('casting.undercut.requires-core', 'major'),
    grouped('casting.hole.beyond-cored-depth', 'major'), grouped('machining.hole.depth-beyond-standard-drill', 'minor')],
  findings: [], limitations: ['tolerances'], featuresExamined: 30, rulesEvaluated: 12, packAvailable: true,
  dfa: { available: true, handlingTimeSec: 2, insertionTimeSec: 1.8, totalTimeSec: 3.8, vsIdealRatio: 1.27, penalties: [], source: { standard: 'Boothroyd' }, limitations: [] },
};
const ruleValues = [
  { label: 'Core Cost/Part (£)', value: '3', basis: '32 undercut faces — a default band (UK, engineering-typical, not sourced), not a core-shop quote' },
  { label: 'Casting Yield (0–1)', value: '0.625', basis: 'sand ductile-iron yield band 0.55–0.7, midpoint (engineering-typical band, not sourced)' },
  { label: 'Fettling (bench min/part)', value: '6', basis: 'medium fettling — gate / riser removal (engineering-typical minutes)' },
  { label: 'Casting Manning', value: '4', basis: 'semi-automatic sand line crew of 4 (engineering-typical, not sourced)' },
  { label: 'Die Cost (£)', value: '11025', basis: 'sand toolmaker shop model: 156 toolroom hours — a quotation overrides this' },
  { label: 'Die Life (shots)', value: '16000', basis: 'sand pattern life band 8,000 moulds × 2 impressions (engineering-typical, not sourced)' },
].map(r => ({ ...r, ruleValue: r.value, source: 'rule', edited: false }));
const meta: CADReportMeta = {
  stamp: STAMP, routeComparison: routeComparison as never, geometrySource: 'occt',
  uncertainty: { p10: castRes.total * 0.92, p90: castRes.total * 1.08, plusMinusPct: 8 } as never,
  checks: { costable: true, sanity: [], overrides: [], ruleValues,
    decisions: [{ id: 'service.safetyCritical', question: 'Is the part safety-critical?', severity: 'advisory', answer: 'yes' },
      { id: 'service.finish', question: 'Is the part coated or surface-treated?', severity: 'advisory', answer: null }] },
  geometricDFM: geometricDFM as never,
  geometricDFMAmounts: { 'casting.draft.insufficient': { text: '£0.42/part' } },
  featureLinesInCost: true, featureMachineRatePerHr: 13.59, featureMachineOee: 0.8, featureTurningOp: null,
  featureLines: [
    { kind: 'hole', diaMm: 10, depthMm: 20, through: true, count: 2, operation: 'Drilling', minutesEach: 0.5, totalMinutes: 1, volumeCm3: 1, included: true, autoIncluded: true },
    { kind: 'boss', diaMm: 25, depthMm: 10, through: null, count: 1, operation: 'Turning', minutesEach: 6, totalMinutes: 6, volumeCm3: 2, included: false, autoIncluded: false },
  ],
};
const core = buildCoreReport({ result: castRes, input: cast, library: lib, commodity: 'cast_and_machine', region: 'UK', cadMeta: meta });

describe('the core report model', () => {
  it('splits material into metal / consumables & services / energy, and the split re-adds to bucket 1', () => {
    expect(core.material.totalGbp).toBeCloseTo(castRes.breakdown.rawMaterial, 9);
    expect(core.material.lines.reduce((s, l) => s + l.gbp, 0)).toBeCloseTo(castRes.breakdown.rawMaterial, 9);
    expect(core.material.consumablesGbp).toBeCloseTo(6.8, 9);
    const mat = lib.materials.find(m => m.id === 'mat-gjs500')!;
    expect(core.material.metalGbp).toBeCloseTo(9.084 / 0.98 * mat.pricePerKg, 9);           // no scrap credit: melt loss
    expect(core.material.energyGbp).toBeCloseTo(9.29 * lib.energy[0].electricityPerKwh, 9);
    // with a scrap credit, and a module-priced material, the split still closes
    const mach = { ...cast, rawMaterial: { materialId: 'mat-al6061', netWeightKg: 0.5, materialUtilization: 0.45 } } as UniversalStackInput;
    const mr = computeUniversalStack(mach, lib);
    expect(materialSplit(mr, mach, lib).totalGbp).toBeCloseTo(mr.breakdown.rawMaterial, 9);
    expect(materialSplit(mr, mach, lib).lines.some(l => /Scrap credit/.test(l.label) && l.gbp < 0)).toBe(true);
    const direct = { ...cast, rawMaterial: { materialId: 'mat-virtual', netWeightKg: 0, materialUtilization: 1, directCost: 12.5 } } as UniversalStackInput;
    expect(materialSplit(computeUniversalStack(direct, lib), direct, lib).totalGbp).toBeCloseTo(12.5, 9);
  });

  it('splits tooling into first set / replacements / perishables, and the split re-adds to bucket 4 × the amortisation volume', () => {
    const t = core.tooling;
    expect(t.initialGbp).toBeCloseTo(716_625 / 65 + 14_500 + 366, 6);       // a set's price, not × sets
    expect(t.replacementGbp).toBeCloseTo(716_625 * 64 / 65, 6);
    expect((t.initialGbp + t.replacementGbp + t.perishableGbp + t.unsplitGbp) / cast.tooling.amortizationVolume).toBeCloseTo(castRes.breakdown.tooling, 12);
    expect(t.replacementPerPartGbp).toBeCloseTo(716_625 * 64 / 65 / 1_000_000, 12);
    // the labels the modules write, and a structured kind when an item carries one
    expect(splitToolingItem({ label: 'Extrusion die: £10,003 a set (the up-front investment) × 174.66 sets worn out over the programme', gbp: 1_747_086 }))
      .toMatchObject({ initialGbp: 10_003, replacementGbp: 1_737_083, basis: 'as labelled' });
    expect(splitToolingItem({ label: '222 tools in service (the set the volume needs) × £12,671', gbp: 2_812_962 }).initialGbp).toBe(2_812_962);
    expect(splitToolingItem({ label: '1,778 replacement tools as they wear out', gbp: 22_529_038 }).replacementGbp).toBe(22_529_038);
    expect(splitToolingItem({ label: 'Hob wear: £1400 tool + 12 regrinds', gbp: 232_862 }).perishableGbp).toBe(232_862);
    expect(splitToolingItem({ label: 'anything', gbp: 100, kind: 'perishable' })).toMatchObject({ perishableGbp: 100, basis: 'structured' });
    expect(splitToolingItem({ label: 'Machining fixtures', gbp: 14_500, kind: 'nre' })).toMatchObject({ initialGbp: 14_500, basis: 'structured' });   // up front
    expect(splitToolingItem({ label: 'Pattern equipment — 64 replacement sets as it wears out (65 sets over the programme)', gbp: 705_600, kind: 'replacement' }))
      .toMatchObject({ replacementGbp: 705_600, initialGbp: 0 });                // a structured kind wins over the label
    // no items: one figure, not split
    const plain = { ...cast, tooling: { totalToolingCost: 61_203, amortizationVolume: 1_000_000, mode: 'amortized' } } as UniversalStackInput;
    const pr = buildCoreReport({ result: computeUniversalStack(plain, lib), input: plain, library: lib, commodity: 'injection_moulding', region: 'UK' });
    expect(pr.tooling.unsplitGbp).toBe(61_203);
    expect(pr.tooling.initialGbp).toBe(0);
    expect(pr.unsourced.ruleBasis).toBe(false);                               // no rule values: the share is "not graded", never £0.00
    expect(core.unsourced.ruleBasis).toBe(true);
  });

  it('the piece price excluding tooling is the stack re-run with no tooling', () => {
    expect(core.pieceExToolingGbp).toBeCloseTo(computeUniversalStack({ ...cast, tooling: { ...cast.tooling, totalToolingCost: 0 } }, lib).total, 9);
    expect(core.pieceExToolingGbp).toBeLessThan(castRes.total);
  });

  it('capacity: annual × cycle ÷ parts a cycle ÷ OEE, summed on a machine, ÷ its annual available hours', () => {
    const hmc = lib.machines.find(m => m.id === 'mach-hmc-400')!;
    const line = lib.machines.find(m => m.id === 'sand-cast-line')!;
    const rows = capacityImplied(cast, lib, 200_000);
    const h = rows.find(r => r.machine === hmc.machineClass)!;
    expect(h.operations).toBe(2);
    expect(h.hoursPerYear).toBeCloseTo(200_000 * (0.0624 + 0.1328) / 0.8, 6);
    expect(h.machines).toBeCloseTo(200_000 * (0.0624 + 0.1328) / 0.8 / hmc.buildup.annualAvailableHours, 9);
    // the bench fettling op occupies no machine
    expect(rows.find(r => r.machine === line.machineClass)!.machines).toBeCloseTo(200_000 * 0.0172 / 0.8 / line.buildup.annualAvailableHours, 9);
    expect(core.capacity?.formula).toMatch(/× cycle ÷ parts a cycle ÷ OEE/);
  });

  it('alerts on a feasible route ≥ 20 % cheaper, not on one 10 % cheaper, and lists routes cheaper or within +50 %', () => {
    const routeAlerts = core.alerts.filter(a => a.kind === 'route');
    expect(routeAlerts).toHaveLength(1);
    expect(routeAlerts[0].title).toMatch(/30 % cheaper: Forging/);
    expect(core.routes!.rows.map(r => r.name)).toEqual(['Forging', 'Machining']);
    expect(core.routes!.notShown).toBe(2);                               // +200 % and the infeasible one
    expect(core.volumeLine).toMatch(/at 5,000\/yr/);
  });

  it('alerts on uncosted scope ALL-IN at the rates of the op it would join, naming the time model (fresh review N6)', () => {
    const scope = core.alerts.find(a => a.kind === 'scope')!;
    expect(scope.title).toMatch(/1 machinable feature/);
    // the host op: the costing's largest machining op on the HMC (Drilling), machine ÷ OEE + labour × crew ÷ efficiency
    const host = castRes.operationDetails.find(o => /Drilling/.test(o.operationName))!;
    const perHr = host.machineRateUsed / host.oee + host.labourRateUsed * host.manning / host.labourEfficiency;
    const allIn = 6 / 60 * perHr * (1 + cast.overheadPct) * (1 + cast.marginPct);
    expect(scope.lines[0]).toContain(`about £${allIn.toFixed(2)} a part all-in`);
    expect(scope.lines[0]).toContain(`(£${Math.round(allIn * 200_000).toLocaleString('en-GB')} a year)`);
    expect(scope.lines[0]).toMatch(/feature-machining table \(standard minutes a feature/);
    // like for like (secondary-machining follow-ups, Nov 2026): the rows the costing machines — here the 2 holes the table
    // costs at 1 min — take 11.71 min in its own cutting operations (+Y face 3.74 + drilling 7.97): said so, with both
    // figures and the ratio, never minutes a feature of one kind set against another kind's
    expect(scope.lines[1]).toMatch(/The two time models differ on the same features: the 2 feature instance\(s\) this costing machines take 11\.71 min in its own machining build-up and 1\.00 min in the feature table \(× 11\.71\)/);
    expect(scope.lines.join(' ')).not.toMatch(/…/);
    const turned = buildCoreReport({ result: castRes, input: cast, library: lib, commodity: 'cast_and_machine', region: 'UK', cadMeta: { ...meta, featureTurningOp: 'Turning — spindle' } as never });
    expect(turned.alerts.some(a => a.kind === 'scope')).toBe(false);
  });

  it('confidence counts distinct inputs: a rate shared by two operations counts once', () => {
    const keys = new Set(castRes.traceability.map(t => `${t.rateId}|${/\.([A-Za-z]+)$/.exec(t.field)?.[1] ?? t.field}`));
    expect(core.confidence.distinct.total).toBe(keys.size);
    expect(core.confidence.distinct.total).toBeLessThan(castRes.traceability.length);
    const skilled = lib.labour.find(l => l.id === 'lab-uk-skilled')!;
    if (skilled.confidence === 'Low') expect(core.confidence.lowInputs.find(l => l.unit === '£/hr' && l.value === skilled.fullyLoadedRatePerHr)?.operations).toBe(2);
  });

  it('the £ resting on unsourced figures: the lines they drive, counted once; a whole-cost figure is listed without £', () => {
    const ops = castRes.operationDetails;
    const energy = castRes.traceability.find(t => t.field === 'rawMaterial.energyKwh.electricity')!.value;
    // a LIFE drives the replacement sets only (64 of the 65), never the first set or the programming
    const pattern = 716_625 * 64 / 65 / 1_000_000;
    const expected = 3.09 /* cores */ + (ops[1].processCost + ops[1].labourCost) /* fettling */ + ops[0].labourCost /* crew */
      + pattern /* die life → the pattern item a part */ + 0.15 /* green sand, self-labelled */ + energy /* self-labelled */;
    expect(core.unsourced.totalGbp).toBeCloseTo(expected, 9);
    expect(core.unsourced.sharePct).toBeCloseTo(Math.round(expected / castRes.total * 1000) / 10, 9);
    expect(core.unsourced.items.find(i => /yield/i.test(i.label))!.gbp).toBeNull();
    expect(core.unsourced.items.some(i => /toolmaker shop model/.test(i.basis))).toBe(false); // sourced basis: not listed
    expect(core.unsourced.method).toMatch(/counted once, before overhead and margin/);
  });

  it('lists the commodity\'s "Not included until answered", EXW freight and duty — and drops an item the costing prices', () => {
    expect(core.notIncluded[0]).toMatch(/Freight to your plant/);
    expect(core.notIncluded.join(' | ')).toMatch(/PPAP.*Part marking.*Final wash/);
    const washed = { ...cast, operations: [...cast.operations, { ...cast.operations[1], operationName: 'Final wash and dry (bench)' }] } as UniversalStackInput;
    const w = buildCoreReport({ result: computeUniversalStack(washed, lib), input: washed, library: lib, commodity: 'cast_and_machine', region: 'UK' });
    expect(w.notIncluded.join(' | ')).not.toMatch(/Final wash/);
  });

  it('adds what an answered "Yes" calls for that the route does not price (serviceNotCosted)', () => {
    const mach = { ...cast, rawMaterial: { materialId: 'mat-al6061', netWeightKg: 0.5, materialUtilization: 0.45 } } as UniversalStackInput;
    const m = buildCoreReport({ result: computeUniversalStack(mach, lib), input: mach, library: lib, commodity: 'machining', region: 'UK',
      cadMeta: { checks: { decisions: [{ id: 'service.pressureTight', question: 'Leak-tight?', severity: 'advisory', answer: 'Yes' }] } } });
    expect(m.notIncluded[0]).toMatch(/Leak \/ pressure test.*not costed/);
  });

  it('the alternatives leave out a route the comparison judges not credible', () => {
    const rc = { ...routeComparison, rows: routeComparison.rows.map(r => (r.route === 'forging' ? { ...r, credible: false, notCredible: ['brittle'] } : r)) };
    const m = buildCoreReport({ result: castRes, input: cast, library: lib, commodity: 'cast_and_machine', region: 'UK', cadMeta: { ...meta, routeComparison: rc } as never });
    expect(m.routes!.rows.map(r => r.name)).toEqual(['Machining']);
    expect(m.alerts.some(al => al.kind === 'route')).toBe(false);
  });

  it('design to cost: at most five findings (BLOCKING / COST / RISK, never INFO), only rule families that apply, priced first', () => {
    const info = buildCoreReport({ result: castRes, input: cast, library: lib, commodity: 'cast_and_machine', region: 'UK',
      cadMeta: { ...meta, geometricDFMAmounts: {}, geometricDFM: { ...geometricDFM, grouped: [grouped('casting.draft.insufficient', 'info')] } } as never });
    expect(info.dfm.findings).toHaveLength(0);
    expect(core.dfm.findings.length).toBe(5);
    expect(core.dfm.findings[0]).toMatchObject({ ruleId: 'casting.draft.insufficient', amount: '£0.42/part', severity: 'RISK' });   // legacy grade mapped
    for (const f of core.dfm.findings) expect(dfmRuleApplies('cast_and_machine', f.ruleId)).toBe(true);
    expect(core.dfm.findings.some(f => /forging|moulding|many-sizes|setup/.test(f.ruleId))).toBe(false);
  });

  it('the commodity matrix covers the reviewed commodities, each with a scope list and a quote breakdown', () => {
    for (const c of ['cast_and_machine', 'casting', 'forging', 'machining', 'injection_moulding', 'sheet_metal', 'aluminium_extrusion', 'extrusion',
      'blow_moulding', 'rotational_moulding', 'thermoforming', 'composites', 'rubber', 'gear']) {
      expect(REPORT_STANDARD_COMMODITIES).toContain(c);
      expect(reportStandardFor(c).notIncluded.length).toBeGreaterThan(2);
      expect(reportStandardFor(c).quoteBreakdown.length).toBeGreaterThan(3);
    }
    expect(reportStandardFor('painting').notIncluded.length).toBeGreaterThan(0);   // a default for the rest
  });
});

/** The pages a print function saves, as their content streams. */
function pagesOf(draw: () => void): string[] {
  const api = (jsPDF as unknown as { API: Record<string, unknown> }).API;
  const origSave = api.save;
  const pages: string[] = [];
  api.save = function (this: jsPDF) {
    const d = this as unknown as { internal: { pages: string[][] } };
    // the content stream escapes brackets and writes WinAnsi bytes (an em dash is 0x97)
    for (const p of d.internal.pages.slice(1)) pages.push((p ?? []).join('\n').replace(/\\([()\\])/g, '$1').replace(/\u0097/g, '\u2014').replace(/\u0096/g, '\u2013'));
    return this;
  };
  try { draw(); } finally { api.save = origSave; }
  return pages;
}

describe('the PDF profile switch', () => {
  const corePages = pagesOf(() => printPDF(castRes, cast, lib, 'GBP', 1, 'cast_and_machine', null, 'UK', [], meta));
  const auditPages = pagesOf(() => printAuditPackPDF(castRes, cast, lib, 'GBP', 1, 'cast_and_machine', null, 'UK', [], meta));
  const coreText = corePages.join('\n'), auditText = auditPages.join('\n');

  it('printPDF draws the core report: seven numbered sections, ≤ 8 pages, the stamp, headline, terms and route comparison', () => {
    expect(corePages.length).toBeLessThanOrEqual(8);
    for (const s of ['1. Decision', '2. Cost build-up', '3. Process', '4. What moves the price', '5. Supplier negotiation', '6. Alternatives', '7. Design to cost']) expect(coreText).toContain(s);
    expect(coreText).toContain(`Reproducibility: ${STAMP}`.replace(/·/g, '·'));
    expect(coreText).toContain(`£${castRes.total.toFixed(2)}`);
    expect(coreText).toMatch(/Ex-works \(EXW\)/);
    expect(coreText).toContain('Route Comparison');
    expect(coreText).toMatch(/PIECE PRICE AS QUOTED/);
    expect(coreText).toMatch(/Re-add: piece price £\d+\.\d\d \+ up-front tooling £25,891 ÷ 1,000,000 parts × 1\.2096 \(its overhead and margin\) = £/);
    expect(coreText).not.toMatch(/…/);                                      // no truncated line anywhere (N21)
    expect(coreText).toMatch(/Prepared by/);
    expect(coreText).not.toMatch(/§1 — 8-Bucket/);
  });

  it('printAuditPackPDF draws the full report, without what the register removed; carbon stays', () => {
    expect(auditPages.length).toBeGreaterThan(corePages.length);
    expect(auditText).toMatch(/§1 — 8-Bucket Cost Breakdown/);
    expect(auditText).toMatch(/§9b — Route Comparison/);
    expect(auditText).toMatch(/§10 — Embodied Carbon/);
    expect(auditText).toMatch(/SHOULD-COST AUDIT PACK/);
    expect(auditText).not.toMatch(/Fully Traceable/);                         // director.md #36
    expect(auditText).not.toMatch(/Cost Intelligence Insights/);              // #67
    expect(auditText).not.toMatch(/Opportunity by Category/);                 // #69
    expect(auditText).not.toMatch(/Boothroyd/);                               // #52
    expect(auditPages[0]).not.toMatch(/\(Margin\) Tj|\(Labour\) Tj/);           // #35: no cover shares
    expect(auditPages[0]).not.toMatch(/Key Assumptions/);                     // #37: folded into the executive page
  });
});

describe('the workbook', () => {
  it('opens on the core sheet (the same model) and lists the geometric DFM on 9-DFM', async () => {
    const blob = await exportToExcelBlob(castRes, cast, lib, 'GBP', 1, meta.checks!, null, STAMP, routeComparison as never, null, 'cast_and_machine', { cadMeta: meta });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await blob.arrayBuffer()) as never);
    const first = wb.worksheets[0];
    expect(first.name).toBe('0-Executive');
    const rows: unknown[][] = [];
    first.eachRow(r => rows.push((r.values as unknown[]).slice(1)));
    const row = (label: string) => rows.find(r => r[0] === label);
    expect(Number(row('Should-cost a part')![1])).toBeCloseTo(castRes.total, 4);
    expect(Number(row('Piece price as quoted')![1])).toBeCloseTo(core.price.pieceAsQuotedGbp, 4);
    expect(Number(row('  Re-add')![2])).toBeCloseTo(castRes.total, 4);
    expect(Number(row('Material total = bucket 1')![1])).toBeCloseTo(castRes.breakdown.rawMaterial, 4);
    expect(rows.some(r => r[0] === '── 7. DESIGN TO COST ──')).toBe(true);
    const dfm = wb.getWorksheet('9-DFM')!;
    expect(dfm).toBeDefined();
    const ids: unknown[] = [];
    dfm.eachRow(r => ids.push(r.getCell(1).value));
    expect(ids).toContain('casting.draft.insufficient');
    expect(wb.worksheets.map(w => w.name).indexOf('9-DFM')).toBe(wb.worksheets.length - 1);
  });
});
