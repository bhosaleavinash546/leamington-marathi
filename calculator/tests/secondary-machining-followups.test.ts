/**
 * Secondary-machining follow-ups (Nov 2026). Commit 2c990d7a made the casting and forging routes' secondary machining the
 * near-net plan of cast + machine (cost-input-rules/secondary-machining.ts): the casting route and cast + machine cost the
 * same scope to the penny. Four things in the reports still read the old world:
 *   1. the route comparison printed the same costing twice (casting and cast + machine, process by process);
 *   2. the same items carried two sets of names (one "Secondary machining fixtures and programming" item v "Machining
 *      fixtures" + "CNC programming (NRE)"; "machining consumables" / "machining tool wear and cell consumables" v
 *      "cutting-tool wear");
 *   3. the uncosted-scope alert compared minutes a feature only on operations named "N features / holes / bores", so the
 *      near-net plan's faces dropped out and different features were set against each other as "two time models";
 *   4. report text that reads operation names (fixturings charged, the set-up attribution) knew only the old names.
 * No cost moves: every test here reads labels, rows and report text — totals are asserted equal.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { compareRoutes, foldSameScopeRows, sameCosting, crossovers, type RouteRow } from '../server/services/route-compare.js';
import { costMeasuredPart } from '../server/services/bulk-run.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';
import { computeCastingDrivers, type CastingInputs } from '../src/engine/modules/casting.js';
import { computeForgingDrivers, type ForgingInputs } from '../src/engine/modules/forging.js';
import { machiningNreItems, toolingSplit } from '../src/engine/tooling-split.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { isFeatureCutOperation, chargedFixturings } from '../src/engine/operation-names.js';
import { buildCoreReport, type CoreReportMeta } from '../src/export/executive-summary.js';
import { routeComparisonExport, routeCompareHtml, routeRowLabel } from '../src/ui/cad-workspace.js';
import { BASELINE, ANSWERS } from '../scripts/real-parts-baseline.js';
import type { OCCTGeometry } from '../server/utils/geometry-bridge.js';
import type { UniversalStackInput, PartCostResult } from '../src/engine/types.js';
import type { FeatureMachiningLine } from '../src/engine/feature-machining.js';

process.env.AIR_GAPPED = '1';
const book = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const base = JSON.parse(readFileSync(BASELINE, 'utf8')) as Array<{ part: string; geometry: OCCTGeometry }>;
const fixtures = JSON.parse(readFileSync('tests/fixtures/real-parts-baseline.json', 'utf8')) as Array<{
  part: string; answers: Record<string, string>; geometry: Record<string, unknown>; outcome: { commodity?: string };
}>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cost(part: string, commodity?: string, answers?: Record<string, unknown>): Promise<any> {
  const p = base.find(x => x.part === part)!;
  return costMeasuredPart(p.geometry, part,
    { partNumber: part, file: part, annualVolume: 200_000, ...(commodity ? { commodity } : {}) } as never,
    { ...ANSWERS[part].answers, ...(answers ?? {}) }, 'UK', { annualVolume: 200_000, programmeYears: 5, deliveryTerms: 'EXW' } as never, book,
    { partNumber: part, file: part, status: 'error' } as never);
}

// ─── 1. One row per process where casting and cast + machine are the same costing ──────────────────────────────────────

const row = (route: string, process: string | null, total: number, over: Partial<RouteRow> = {}): RouteRow => ({
  route, process, label: process ? `${route.replace(/_/g, ' ')} — ${process} casting` : route, commodity: route, status: 'costed', total,
  toolingPerPart: 0.1, breakdown: { rawMaterial: total - 1, process: 0.5, labour: 0.5, tooling: 0, packaging: 0, logistics: 0, overhead: 0, margin: 0 },
  reconciles: true, audit: { lines: [], closes: true }, spec: [], material: null,
  tooling: { investment: 20_000, amortisedOver: 1_000_000, items: [] },
  operations: [{ name: 'Sand Casting — Moulding', machine: 'sand line', cycleMin: 1, processCost: 0.5, labourCost: 0.5, bench: false }],
  band: { p10: total * 0.9, p50: total, p90: total * 1.1, plusMinusPct: 10, confidence: 'Medium' },
  consumables: [], credible: true, notCredible: [], checks: [], caveats: [], assumed: [], openQuestions: [], notes: [], refusal: null,
  byVolume: [{ volume: 5_000, total: total + 2, p10: null, p90: null, note: null }, { volume: 200_000, total, p10: null, p90: null, note: null }],
  programme: null, ...over,
});

describe('1. Route comparison: casting and cast + machine for the same process are ONE row when they are the same costing', () => {
  it('folds an identical pair into one row named for the process; the reference survives and stays first', () => {
    const ref = row('forging', 'closed-die', 16);
    const cast = row('casting', 'sand', 13.2883), cam = row('cast_and_machine', 'sand', 13.2883);
    const inv = row('casting', 'investment', 74.7197), camInv = row('cast_and_machine', 'investment', 74.7197);
    const out = foldSameScopeRows([ref, cast, inv, cam, camInv], ref);
    expect(out).toHaveLength(3);
    expect(out[0]).toBe(ref);
    // neither is the reference: cast + machine (whose form carries the machining half) is kept
    expect(out.map(r => r.label)).toEqual(['forging — closed-die casting', 'Sand casting + machining', 'Investment casting + machining']);
    expect(out[1]).toBe(cam);
    expect(cam.alsoRoutes).toEqual(['casting']);
    expect(cam.notes.join(' ')).toMatch(/casting and cast and machine routes cost this process the same to the penny/);
    expect(routeRowLabel(cam, { cast_and_machine: 'Cast + Machine' })).toBe('Sand casting + machining');
    // crossovers are read off the folded rows: one per process, not two
    const x = crossovers(out, ref, [5_000, 200_000], 200_000);
    expect(x.map(c => c.label)).toEqual(['Sand casting + machining', 'Investment casting + machining']);
  });
  it('keeps the costing\'s own row when it is one of the pair (it is the reference and equals the headline)', () => {
    const ref = row('cast_and_machine', 'sand', 8.7391), other = row('casting', 'sand', 8.7391);
    const out = foldSameScopeRows([ref, other], ref);
    expect(out).toEqual([ref]);
    expect(ref.total).toBe(8.7391);
    expect(ref.label).toBe('Sand casting + machining');
  });
  it('keeps both rows when they differ by a penny, by an operation, by the tooling or at one ladder volume', () => {
    const variants: Array<Partial<RouteRow>> = [
      { total: 13.2983 },
      { operations: [{ name: 'Sand Casting — Moulding', machine: 'sand line', cycleMin: 1, processCost: 0.5, labourCost: 0.52, bench: false }] },
      { operations: [{ name: 'Gravity die casting', machine: 'sand line', cycleMin: 1, processCost: 0.5, labourCost: 0.5, bench: false }] },
      { tooling: { investment: 21_000, amortisedOver: 1_000_000, items: [] } },
      { byVolume: [{ volume: 5_000, total: 15.4, p10: null, p90: null, note: null }, { volume: 200_000, total: 13.2883, p10: null, p90: null, note: null }] },
    ];
    for (const v of variants) {
      const a = row('casting', 'sand', 13.2883), b = row('cast_and_machine', 'sand', 13.2883, v);
      expect(sameCosting(a, b), JSON.stringify(v)).toBe(false);
      expect(foldSameScopeRows([row('forging', null, 16), a, b], row('forging', null, 16))).toHaveLength(3);
    }
  });
  it('on real parts: the knuckle (a forging) and the cast + machined bracket print each casting process once, the reference = the headline', async () => {
    const input = (name: string) => {
      const p = fixtures.find(x => x.part === name)!;
      return { geo: p.geometry as never, filename: p.part, current: p.outcome.commodity ?? 'machining', answers: p.answers, region: 'UK' as const,
        annualVolume: 200_000, programmeYears: 5, deliveryTerms: 'EXW' as const, baseBook: book, bands: false };
    };
    const knuckle = await compareRoutes(input('steering_knuckle_RH.stp'));
    const labels = knuckle.rows.map(r => r.label);
    expect(labels).toContain('Sand casting + machining');
    expect(labels).toContain('Investment casting + machining');
    for (const proc of ['sand', 'investment']) {
      expect(knuckle.rows.filter(r => r.process === proc && (r.route === 'casting' || r.route === 'cast_and_machine')), proc).toHaveLength(1);
      expect(knuckle.crossovers.filter(c => c.process === proc && /cast/.test(c.route)), proc).toHaveLength(1);
    }
    const sand = knuckle.rows.find(r => r.label === 'Sand casting + machining')!;
    expect(sand.alsoRoutes).toEqual(['casting']);
    expect(sand.audit!.closes).toBe(true);
    expect(sand.reconciles).toBe(true);
    // the bracket is costed on cast + machine: its own row is the reference, folded with the casting route's sand row
    const bracket = await compareRoutes(input('Casting_Braket.stp'));
    const ref = bracket.rows[0];
    expect(ref.route).toBe('cast_and_machine');
    expect(ref.label).toBe('Sand casting + machining');
    expect(ref.alsoRoutes).toEqual(['casting']);
    const headline = await cost('Casting_Braket.stp');
    expect(Math.abs(ref.total! - headline.trace.result.total)).toBeLessThan(1e-9);
    expect(bracket.rows.some(r => r.route === 'casting' && r.process === 'sand')).toBe(false);
    // a process refused alike on both routes is one refusal too (steel is not die cast)
    const hpdc = bracket.excluded.filter(e => e.process === 'hpdc');
    expect(hpdc).toHaveLength(1);
    expect(hpdc[0].label).toBe('High-pressure die casting + machining');
    // the screen names the folded row for the process, never one route's label over the other's
    const x = routeComparisonExport(bracket, { current: 'cast_and_machine', headline: headline.trace.result.total, labels: { cast_and_machine: 'Cast + Machine', casting: 'Casting' } });
    const html = routeCompareHtml(x, { fmt: n => `£${n.toFixed(2)}` });
    expect(html).toContain('Sand casting + machining');
    expect(html).not.toContain('Casting — sand casting');
  }, 120_000);
});

// ─── 2. One set of names for the same thing on the three routes ────────────────────────────────────────────────────────

describe('2. Tooling and consumables carry cast + machine\'s names on the casting and forging routes', () => {
  it('the casting and forging modules split fixtures and programming into two NRE items and call the wear "cutting-tool wear"', () => {
    const cast = computeCastingDrivers({
      subtype: 'sand', materialId: 'mat-gjs500', partWeightKg: 3, castingYield: 0.6, rejectRate: 0.03, labourId: 'lab-uk-foundry',
      oee: 0.8, manning: 1, labourEfficiency: 0.92, amortizationVolume: 1_000_000,
      sand: { machineId: 'sand-cast-line', mouldsPerHour: 60, impressions: 1, patternCost: 20_000, patternLife: 100_000 },
      secondaryMachiningToolingCost: 12_175, secondaryMachiningProgrammingNRE: 175, secondaryMachiningConsumablesPerPart: 0.6372,
    } as unknown as CastingInputs);
    const nre = cast.tooling.items!.filter(i => i.kind === 'nre');
    expect(nre.map(i => [i.label, i.gbp])).toEqual([['Machining fixtures', 12_000], ['CNC programming (NRE)', 175]]);
    expect(cast.rawMaterial.consumablesItems!.map(i => i.label)).toContain('cutting-tool wear');
    expect(cast.rawMaterial.consumablesItems!.map(i => i.label)).not.toContain('machining consumables');
    expect(toolingSplit(cast.tooling).unclassified).toBeCloseTo(0, 9);

    const forge = computeForgingDrivers({
      materialId: 'mat-steel-38mnvs6', partWeightKg: 3, billetWeightKg: 4, forgeId: 'forge-press-1600t', cycleTimeHr: 0.003, oee: 0.8,
      manning: 3, labourId: 'lab-uk-forge', labourEfficiency: 0.92, dieCost: 30_000, dieLife: 40_000, amortizationVolume: 1_000_000,
      secondaryMachiningToolingCost: 14_758, secondaryMachiningProgrammingNRE: 258, secondaryMachiningConsumablesPerPart: 0.8201,
    } as unknown as ForgingInputs);
    expect(forge.tooling.items!.filter(i => i.kind === 'nre').map(i => [i.label, i.gbp])).toEqual([['Machining fixtures', 14_500], ['CNC programming (NRE)', 258]]);
    expect(forge.rawMaterial.consumablesItems!.find(i => i.label === 'cutting-tool wear')!.gbp).toBe(0.8201);
    expect(forge.rawMaterial.consumablesItems!.map(i => i.label)).not.toContain('machining tool wear and cell consumables');
  });
  it('a typed figure (a quotation of both) stays one NRE item that says what it covers; the items add to the total', () => {
    expect(machiningNreItems(9_000)).toEqual([{ label: 'Machining fixtures and CNC programming (NRE), as typed', gbp: 9_000, kind: 'nre' }]);
    expect(machiningNreItems(9_000, 10_000)).toHaveLength(1);
    expect(machiningNreItems(0, 0)).toEqual([]);
    const items = machiningNreItems(14_758.4, 258.4);
    expect(items.reduce((s, i) => s + i.gbp, 0)).toBe(14_758.4);
  });
  it('headless: the bracket on the casting route carries the same items, names and £ as on cast + machine — and the same total', async () => {
    const cam = await cost('Casting_Braket.stp');
    const cast = await cost('Casting_Braket.stp', 'casting', { 'casting.processChoice': 'sand' });
    expect(cam.commodity).toBe('cast_and_machine');
    expect(cast.commodity).toBe('casting');
    const mach = (r: { trace: { stackInput: UniversalStackInput } }) => (r.trace.stackInput.tooling.items ?? []).filter(i => i.kind === 'nre').map(i => [i.label, i.gbp]);
    expect(mach(cast)).toEqual(mach(cam));
    expect(mach(cast).map(([l]) => l)).toEqual(['Machining fixtures', 'CNC programming (NRE)']);
    const wear = (r: { trace: { stackInput: UniversalStackInput } }) => (r.trace.stackInput.rawMaterial.consumablesItems ?? []).find(i => i.label === 'cutting-tool wear')?.gbp;
    expect(wear(cast)).toBeGreaterThan(0);
    expect(wear(cast)).toBe(wear(cam));
    expect(Math.abs(cast.trace.result.total - cam.trace.result.total)).toBeLessThan(1e-9);
    // the forging route too
    const knuckle = await cost('steering_knuckle_RH.stp');
    expect(knuckle.commodity).toBe('forging');
    expect((knuckle.trace.stackInput as UniversalStackInput).tooling.items!.filter(i => i.kind === 'nre').map(i => i.label)).toEqual(['Machining fixtures', 'CNC programming (NRE)']);
    expect((knuckle.trace.stackInput as UniversalStackInput).rawMaterial.consumablesItems!.map(i => i.label)).toContain('cutting-tool wear');
  }, 120_000);
});

// ─── 3. The uncosted-scope alert compares the time models like for like ───────────────────────────────────────────────

const ln = (kind: FeatureMachiningLine['kind'], count: number, totalMinutes: number, included: boolean, extra: Partial<FeatureMachiningLine> = {}): FeatureMachiningLine => ({
  kind, diaMm: kind === 'hole' ? 12 : 0, depthMm: 10, through: kind === 'hole' ? true : null, count, ...(kind === 'hole' ? {} : { areaMm2: 1200 }),
  operation: kind === 'hole' ? 'Drilling' : kind === 'pocket' ? 'Pocket milling (rough + finish)' : 'Face milling (facing)',
  minutesEach: totalMinutes / count, totalMinutes, volumeCm3: 1, included, autoIncluded: included, ...extra,
});

/** A forging with its near-net plan as the knuckle carries it: three face operations, drilling, finish boring, the cell. */
function nearNetForging(scale: number): { input: UniversalStackInput; result: PartCostResult } {
  const op = (operationName: string, min: number, extra: Record<string, unknown> = {}) => ({ operationName, machineId: 'mach-hmc-400', labourId: 'lab-uk-skilled',
    cycleTimeHr: min / 60, partsPerCycle: 1, oee: 0.8, manning: 0.5, labourTimeHr: min / 60, labourEfficiency: 0.92, ...extra });
  const input = {
    partName: 'knuckle (test)',
    rawMaterial: { materialId: 'mat-steel-38mnvs6', netWeightKg: 3.4, materialUtilization: 0.67, consumablesCostPerPart: 0.82, consumablesItems: [{ label: 'cutting-tool wear', gbp: 0.82 }] },
    operations: [
      { operationName: 'Forging', machineId: 'forge-press-1600t', labourId: 'lab-uk-forge', cycleTimeHr: 0.004, partsPerCycle: 1, oee: 0.8, manning: 3, labourTimeHr: 0.004, labourEfficiency: 0.92 },
      op('Machining Setup (amortised)', 0.0225, { oee: 1, manning: 1, labourEfficiency: 1 }),
      op('Finish machining — +X side', 1.62 * scale), op('Finish machining — +Z side', 0.84 * scale), op('Finish machining — +Y side', 0.564 * scale),
      op('Drilling — 8 holes (8×Ø12.0×10) [geometry-measured]', 1.398 * scale),
      op('Finish boring — 4 cored bore(s) (4×Ø65.0×10) [geometry-measured]', 1.812 * scale),
      op('Pallet change — 1 fixturing(s)', 0.12, { manning: 1 }),
      { operationName: 'Deburr and gauge check (bench)', machineId: 'mach-hmc-400', labourId: 'lab-uk-semiskilled', cycleTimeHr: 0, partsPerCycle: 1, oee: 1, manning: 1, labourTimeHr: 1.14 / 60, labourEfficiency: 0.92, benchOperation: true },
    ],
    tooling: { totalToolingCost: 14_758, amortizationVolume: 1_000_000, mode: 'amortized',
      items: [{ label: 'Machining fixtures', gbp: 14_500, kind: 'nre' }, { label: 'CNC programming (NRE)', gbp: 258, kind: 'nre' }] },
    packagingPerPart: 0.2, logisticsPerPart: 0, overheadPct: 0.12, marginPct: 0.08, annualVolume: 200_000, programmeYears: 5, deliveryTerms: 'EXW',
  } as UniversalStackInput;
  return { input, result: computeUniversalStack(input, book) };
}
// the feature table for the SAME rows: 8 faces (2.625 min), 8 holes (1.404 min), 4 bores (1.809 min) — and 5 pockets not costed
const knuckleLines = [
  ...Array.from({ length: 8 }, () => ln('face', 1, 2.625 / 8, true)),
  ln('hole', 8, 1.404, true), ln('hole', 4, 1.809, true, { diaMm: 65 }),
  ln('pocket', 5, 4.147, false),
];
const scopeMeta = (lines: FeatureMachiningLine[]): CoreReportMeta => ({
  featureLinesInCost: true, featureLines: lines, featureMachineRatePerHr: book.machines.find(m => m.id === 'mach-hmc-400')!.computedRatePerHr ?? null,
  featureMachineOee: 0.8, featureTurningOp: null,
} as CoreReportMeta);

describe('3. "The two time models differ" is said only on the same features, and only when it is true', () => {
  it('the knuckle\'s plan and its feature table agree on the rows it machines: no "two time models" line (it set 12 holes against 5 pockets)', () => {
    const { input, result } = nearNetForging(1);
    const core = buildCoreReport({ result, input, library: book, commodity: 'forging', region: 'UK', cadMeta: scopeMeta(knuckleLines) });
    const scope = core.alerts.find(a => a.kind === 'scope')!;
    expect(scope.title).toMatch(/5 machinable features/);
    expect(scope.lines.join(' ')).not.toMatch(/time models differ/);
  });
  it('when the costing\'s own minutes for the SAME rows are 3× the table\'s, it says so with both figures, like for like', () => {
    const { input, result } = nearNetForging(3);
    const core = buildCoreReport({ result, input, library: book, commodity: 'forging', region: 'UK', cadMeta: scopeMeta(knuckleLines) });
    const line = core.alerts.find(a => a.kind === 'scope')!.lines.find(l => /time models differ/.test(l))!;
    const costingMin = 3 * (1.62 + 0.84 + 0.564 + 1.398 + 1.812);   // the cutting operations only: no set-up, pallet change or bench
    const tableMin = 2.625 + 1.404 + 1.809;
    expect(line).toContain(`the 20 feature instance(s) this costing machines take ${costingMin.toFixed(2)} min in its own machining build-up and ${tableMin.toFixed(2)} min in the feature table (× ${(costingMin / tableMin).toFixed(2)})`);
    expect(line).toContain(`these would take about ${(4.147 * costingMin / tableMin).toFixed(1)} min`);
  });
  it('no costed rows to compare (nothing ticked, or no cutting operation): no comparison is printed', () => {
    const { input, result } = nearNetForging(3);
    const none = knuckleLines.map(l => ({ ...l, included: false }));
    const core = buildCoreReport({ result, input, library: book, commodity: 'forging', region: 'UK', cadMeta: scopeMeta(none) });
    expect(core.alerts.find(a => a.kind === 'scope')!.lines.join(' ')).not.toMatch(/time models differ/);
  });
});

// ─── 4. Report text reads the near-net plan's operation names ──────────────────────────────────────────────────────────

describe('4. Operation names: the near-net plan\'s and the feature table\'s, read alike', () => {
  it('cutting operations v set-up, handling, turning and bench — both naming schemes', () => {
    for (const n of ['Finish machining — +X side', 'Drilling — 10 holes (1×Ø4.0×7) [geometry-measured]', 'Finish boring — 4 cored bore(s) (1×Ø63.0×3)',
      'CNC Machining — 18 features (1×Ø10.0×12) [geometry-measured]', 'Mill / drill after turning — 2 hole(s)']) expect(isFeatureCutOperation(n), n).toBe(true);
    for (const n of ['Machining Setup (amortised)', 'Machining change-over, amortised (1 fixturing(s) × 45 min ÷ batch 5000)',
      'Pallet change — 1 fixturing(s)', 'Pallet change (1 fixturing(s) × 7.1 s)', 'Load / clamp / unload — lathe fixture, 1 fixturing',
      'Load / clamp / unload — 2 fixturing(s)', 'Load / unload on the pallet while the spindle cuts — 1 fixturing(s)',
      'Machining load / unload + change-over (1 fixturing(s): 0.6 min each + 45 min ÷ batch 5000)',
      'Turning — spindle on the CNC lathe (journals, taper, shoulders)', 'Deburr and gauge check (bench)']) expect(isFeatureCutOperation(n), n).toBe(false);
  });
  it('the fixturings charged are read off the load / clamp / unload OR the pallet change (the near-net plan is on the twin-pallet cell)', () => {
    expect(chargedFixturings(['Machining Setup (amortised)', 'Finish machining — +X side', 'Pallet change — 1 fixturing(s)', 'Deburr and gauge check (bench)'])).toBe(1);
    expect(chargedFixturings(['Pallet change (2 fixturing(s) × 7.1 s)'])).toBe(2);
    expect(chargedFixturings(['Load / clamp / unload — lathe fixture, 1 fixturing', 'Load / clamp / unload — 3 fixturing(s)'])).toBe(3);
    expect(chargedFixturings(['Load / clamp / unload — lathe fixture, 1 fixturing'])).toBeNull();
  });
  it('page 1 on the casting route: the machining half carries the tool wear, fixtures and programming, and the two halves add to the headline', async () => {
    const r = await cost('Casting_Braket.stp', 'casting', { 'casting.processChoice': 'sand' });
    const core = buildCoreReport({ result: r.trace.result, input: r.trace.stackInput, library: book, commodity: 'casting', region: 'UK', cadMeta: {} });
    const fm = core.formMachine!;
    expect(fm.form).toBe('Casting');
    expect(fm.formGbp + fm.machiningGbp).toBeCloseTo(r.trace.result.total, 9);
    const wear = (r.trace.stackInput as UniversalStackInput).rawMaterial.consumablesItems!.find(i => i.label === 'cutting-tool wear')!.gbp;
    expect(fm.machiningParts.join(' · ')).toMatch(/cutting-tool wear £/);
    expect(fm.machiningParts.join(' · ')).toMatch(/fixtures and programming £/);
    const machOps = (r.trace.result as PartCostResult).operationDetails.filter(o => /^mach-/.test(o.machineId));
    const nre = (r.trace.stackInput as UniversalStackInput).tooling.items!.filter(i => i.kind === 'nre').reduce((s, i) => s + i.gbp, 0);
    expect(fm.machiningDirectGbp).toBeCloseTo(machOps.reduce((s, o) => s + o.processCost + o.labourCost, 0) + wear + nre / 1_000_000, 9);
  }, 120_000);
  it('the set-up time drives the set-up operation, not the twin-pallet cell\'s pallet change', () => {
    const { input, result } = nearNetForging(1);
    const meta = { checks: { costable: true, sanity: [], overrides: [], decisions: [], ruleValues: [
      { label: 'Setup time', fieldId: 'cam-mach-setup-time', value: '0.75', ruleValue: '0.75', basis: '1 fixturing × 45 min (engineering-typical, not sourced)', source: 'rule', edited: false },
    ] } } as unknown as CoreReportMeta;
    const core = buildCoreReport({ result, input, library: book, commodity: 'forging', region: 'UK', cadMeta: meta });
    const drives = core.unsourced.items.find(i => i.label === 'Setup time')!.drives.join(' | ');
    expect(drives).toMatch(/Machining Setup \(amortised\)/);
    expect(drives).not.toMatch(/Pallet change/);
  });
});
