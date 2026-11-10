/**
 * Secondary-machining parity (3 Nov 2026). The casting route with machined features and the cast + machine route cost
 * the SAME scope — the same 18 features of Casting_Braket on the same HMC cell — and used to be £1.85 apart (£7.3270 v
 * £9.1767 at 200k / 5 yr, UK, EXW): the casting route poured, heat-treated and blasted the finished weight, had no deburr
 * and gauge check, no tool changes, an untended pallet change and a 0.92 change-over efficiency; cast + machine deburred
 * every B-rep face and programmed every feature row. Now ONE model: the casting and forging routes' secondary machining
 * IS the near-net plan (`nearNetSecondaryMachining` → nearNetCut → routing → buildOperationPlan →
 * machiningOperationInputs), the casting route pours the as-cast weight, the deburr counts the machined faces and the
 * programming the machined feature rows.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { costMeasuredPart } from '../server/services/bulk-run.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';
import { toCostParams, SHOP_DEFAULTS } from '../src/engine/cost-input-rules/to-cost-params.js';
import { nearNetSecondaryMachining } from '../src/engine/cost-input-rules/secondary-machining.js';
import {
  nearNetCut, routingFor, buildOperationPlan, MACHINE_LABOUR_EFFICIENCY, machiningOperationPlan,
} from '../src/engine/cost-input-rules/commodities/machining.js';
import { machiningOperationInputs } from '../src/engine/modules/cast-and-machine.js';
import { asCastWeight, costedNearNetRows, machinedFaceCount, deburrInspectMinutes, NEAR_NET_TURN_STOCK_MM } from '../src/engine/machining-time.js';
import { screenRoute } from '../src/engine/route-feasibility.js';
import { buildDeterministicAnalysis } from '../src/engine/cost-input-rules/deterministic.js';
import { runCostInputRules } from '../src/engine/cost-input-rules/engine.js';
import { FORGING_RULES } from '../src/engine/cost-input-rules/commodities/forging.js';
import { activeLabourRate } from '../src/engine/rate-context.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';
import type { FeatureRow } from '../src/engine/feature-ops.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';

process.env.AIR_GAPPED = '1';
const BASE = JSON.parse(readFileSync('tests/fixtures/real-parts-baseline.json', 'utf8')) as Array<{
  part: string; answers: Record<string, string>; geometry: OCCTGeometry;
}>;
const rec = (part: string) => BASE.find(p => p.part === part)!;
const book = recomputeMachineRates(DEFAULT_RATE_LIBRARY);
const BRACKET = 'Casting_Braket.stp';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cost(part: string, route: string, annual: number): Promise<any> {
  const p = rec(part);
  return costMeasuredPart(p.geometry, part, { partNumber: part, file: part, annualVolume: annual } as never,
    { ...p.answers, 'commodity.route': route }, 'UK', { annualVolume: annual, programmeYears: 5, deliveryTerms: 'EXW' } as never, book,
    { partNumber: part, file: part, status: 'error' } as never);
}
const ctxOf = (part: string, annual: number): RuleContext => ({
  geo: rec(part).geometry, geometryQuality: 'occt', commodity: 'cast_and_machine', annualVolume: annual, filename: part, answers: {},
});

describe('1. the bracket: the casting route = cast + machine, to the penny', () => {
  for (const annual of [200_000, 50_000]) {
    it(`${annual.toLocaleString('en-GB')} / yr, 5 yr, UK, ex-works`, async () => {
      const [cast, cam] = await Promise.all([cost(BRACKET, 'casting', annual), cost(BRACKET, 'cast_and_machine', annual)]);
      expect(cast.status).toBe('costed');
      expect(cam.status).toBe('costed');
      expect(cast.commodity).toBe('casting');
      expect(cast.total).toBe(cam.total);
      for (const k of Object.keys(cam.breakdown)) expect(cast.breakdown[k], k).toBeCloseTo(cam.breakdown[k], 4);
      // the same machining operations, op for op
      const machOps = (r: typeof cast) => (r.trace.stackInput.operations as Array<{ operationName: string; cycleTimeHr: number; labourTimeHr: number; manning: number; labourEfficiency: number }>)
        .filter(o => /^(Machining Setup|Finish machining|Drilling|Finish boring|Turning|Load|Pallet|Deburr)/.test(o.operationName));
      expect(machOps(cast)).toEqual(machOps(cam));
      // £7.33 casting / £9.18 cast + machine before; £8.74 until its four 1 mm-deep "holes" became lands (fresh numbers
      // review, 4 Nov 2026 — on this recorded geometry they stand alone; with the kernel's axis lines they ride their holes)
      // (8.22 once the recorded geometry carries the kernel's axis lines: the 1 mm lands ride their holes as stepped bores)
      const axes = ((rec(BRACKET).geometry as { featureTable?: Array<{ axes?: unknown[] }> }).featureTable ?? []).some(r => r.axes?.length);
      // Review round (4 Nov 2026): 8.22 → 9.14 — the foundry indirect lines (new sand, ladle preheat, dust extraction, plant
      // electricity), 12 impressions (the 60 % plate rule) for 20, the HMC at £300,000
      // Phase B (4 Nov 2026): 9.14 → 9.77 — the UK cast-steel charge at consumer scrap + trim ÷ 0.96 (£0.148 → £0.314/kg)
      // Part1 review (5 Nov 2026): 9.77 → 9.81 — one hydraulic fixture a cell the capacity implies, not one for all of them
      // PKG-2 (10 Nov 2026): 9.81 → 8.54 — non-cutting time per operation (tool changes, rapids, one datum probe) in place of
      // the fixed allowance a feature, tool wear on the cutting only, the faces rough + finish from the 3 mm sand stock
      if (annual === 200_000) expect(cast.total).toBeCloseTo(axes ? 8.54 : 8.80, 2);
    }, 60_000);
  }

  it('the casting route pours the AS-CAST weight (finished + drilled-hole + machining stock), as cast + machine', async () => {
    const [cast, cam] = await Promise.all([cost(BRACKET, 'casting', 200_000), cost(BRACKET, 'cast_and_machine', 200_000)]);
    expect(cast.params.partWeightKg).toBe(cam.params.castPartWeightKg);
    expect(cast.params.partWeightKg).toBe(3.039);
    expect(cast.trace.stackInput.rawMaterial.netWeightKg).toBe(3.039);   // the report's "£/kg as cast" divides by this
    // heat treatment and shot blast on the as-cast kg
    const item = (r: typeof cast, re: RegExp) => (r.trace.stackInput.rawMaterial.consumablesItems as Array<{ label: string; gbp: number }>).find(i => re.test(i.label))!.gbp;
    expect(item(cast, /^heat treatment/)).toBeCloseTo(item(cam, /^heat treatment/), 6);
    expect(item(cast, /^shot blast/)).toBe(item(cam, /^shot blast/));
    expect(String(cast.provenance['cast-shot-blast'].basis)).toMatch(/3\.04 kg as cast \(finished \+ machining stock\)/);
  }, 60_000);
});

describe('2. the deburr and gauge check counts the MACHINED faces', () => {
  it('a near-net part: the faces of its costed rows (28 on the bracket, not its 230 B-rep faces)', () => {
    const rows = costedNearNetRows(rec(BRACKET).geometry.featureTable as FeatureRow[]);
    expect(machinedFaceCount(rows)).toBe(28);
    expect(rec(BRACKET).geometry.faces!.total).toBe(230);
    const c = ctxOf(BRACKET, 200_000);
    const cut = nearNetCut(c, 'steel', 'sand');
    const deburr = buildOperationPlan(c, cut, routingFor(c, cut)).find(o => o.name.startsWith('Deburr'))!;
    expect(deburr.cycleTimeHr).toBe(Math.round(deburrInspectMinutes(28) / 60 * 10_000) / 10_000);
    expect(deburrInspectMinutes(28)).toBe(1.11);
    expect(deburr.basis).toMatch(/0\.004 min × 28 machined faces/);
    expect(deburr.basis).toMatch(/engineering-typical, not sourced/);
  });
  it('a row without face ids counts one face an instance; a face shared by two rows once', () => {
    expect(machinedFaceCount([{ kind: 'hole', diaMm: 8, depthMm: 10, through: true, count: 3 } as FeatureRow])).toBe(3);
    expect(machinedFaceCount([
      { kind: 'face', diaMm: 0, depthMm: 0, through: null, count: 1, faceIds: [4] } as FeatureRow,
      { kind: 'hole', diaMm: 8, depthMm: 10, through: true, count: 1, faceIds: [4, 5] } as FeatureRow,
    ])).toBe(2);
  });
  it('a part cut from solid is machined all over: every B-rep face', () => {
    const p = rec('MACH_Hydraulic_Manifold.stp');
    const c: RuleContext = { geo: p.geometry, geometryQuality: 'occt', commodity: 'machining', annualVolume: 50_000, filename: p.part, answers: {} };
    const deburr = machiningOperationPlan(c, 'aluminium').find(o => o.name.startsWith('Deburr'))!;
    expect(deburr.cycleTimeHr).toBe(Math.round(deburrInspectMinutes(p.geometry.faces!.total) / 60 * 10_000) / 10_000);
    expect(deburr.basis).toMatch(/B-rep faces of edges \(a part cut from solid is machined all over\)/);
  });
});

describe('3. programming counts the machined feature groups on a near-net cut', () => {
  it('the bracket programs its 15 machined rows, not the 19 of the table (its bosses and pockets are cast in)', () => {
    const g = rec(BRACKET).geometry;
    expect((g.featureTable ?? []).length).toBe(19);
    const sec = nearNetSecondaryMachining(g, { family: 'steel', subtype: 'sand', annualVolume: 200_000 })!;
    expect(sec.rows.length).toBe(15);
    const hrs = Math.round((1.5 * sec.setups + 0.25 * 15) * 100) / 100;
    expect(sec.programmingGBP).toBe(Math.round(hrs * activeLabourRate('lab-uk-engineer')));
    expect(sec.toolingBasis).toMatch(/0\.25 h × 15 machined feature group\(s\)/);
  });
});

describe('4. ONE plan: the casting / forging secondary machining is the near-net plan', () => {
  it('a forging with secondary machining keeps the same operations as the near-net plan (the knuckle)', () => {
    const c = { ...ctxOf('steering_knuckle_RH.stp', 50_000), commodity: 'forging', answers: rec('steering_knuckle_RH.stp').answers };
    const { analysis } = buildDeterministicAnalysis(FORGING_RULES, c, 'knuckle');
    const p = toCostParams('forging', analysis.costInputSuggestions as never, 50_000, 'steel', c.geo)!.params as Record<string, unknown>;
    // the plan, built here from the shared pieces: closed-die bores > Ø25 pierced, the near-net turning stock
    const cut = nearNetCut(c, 'steel', 'forging', { coredAboveMm: 25, turnStockMm: NEAR_NET_TURN_STOCK_MM });
    const routing = routingFor(c, cut);
    const plan = buildOperationPlan(c, cut, routing);
    const setups = routing.chosen.setups + (cut.spindle ? 1 : 0);
    const want = machiningOperationInputs(
      { setupTimeHr: Math.round(setups * 45 / 60 * 1000) / 1000, batchSize: 2500, machineId: routing.chosen.primaryMachineId, labourId: 'lab-uk-skilled' },
      plan.map(o => ({ name: o.name, type: o.type, machineId: o.machineId, labourId: o.labourId!, cycleTimeHr: o.cycleTimeHr, partsPerCycle: 1,
        oee: o.oee!, manning: o.manning!, labourTimeHr: o.cycleTimeHr, labourEfficiency: SHOP_DEFAULTS.labourEfficiency, ...(o.benchOperation ? { benchOperation: true } : {}) })),
    );
    expect(p.secondaryMachiningOps).toEqual(want);
    // its spindle is turned in its own lathe fixture, the deburr counts its machined faces, the change-over is efficiency 1
    const names = want.map(o => o.operationName);
    expect(names).toContain('Turning — spindle on the CNC lathe (journals, taper, shoulders)');
    expect(names[names.length - 1]).toBe('Deburr and gauge check (bench)');
    expect(want[0]).toMatchObject({ operationName: 'Machining Setup (amortised)', labourEfficiency: 1 });
  });
  it('the as-forged weight carries the turning stock of the spindle the plan turns', () => {
    const c = { ...ctxOf('steering_knuckle_RH.stp', 50_000), commodity: 'forging', answers: rec('steering_knuckle_RH.stp').answers };
    const wt = runCostInputRules(FORGING_RULES, c).provenance['forge-part-wt'];
    const cut = nearNetCut(c, 'steel', 'forging', { coredAboveMm: 25, turnStockMm: NEAR_NET_TURN_STOCK_MM });
    expect(cut.spindle).not.toBeNull();   // the knuckle's 9 % turned axis is turned, as on cast + machine
    // 3.321 kg (finished + drilled + face stock) before the turning stock was carried
    expect(Number(wt.value)).toBeGreaterThan(3.321);
    expect(String(wt.basis)).toMatch(/cm³ turning stock on the \d+ cm² turned axis \(2 mm a side, engineering-typical, not sourced\)/);
  });
  it('the shop efficiency the plan carries is SHOP_DEFAULTS\'', () => {
    expect(MACHINE_LABOUR_EFFICIENCY).toBe(SHOP_DEFAULTS.labourEfficiency);
  });
});

describe('5. the form\'s ticks and finish factor are inputs to the same plan (the screen calls this function)', () => {
  const g = rec(BRACKET).geometry;
  const table = g.featureTable as FeatureRow[];
  const opts = { family: 'steel' as const, subtype: 'sand', annualVolume: 200_000 };
  it('default ticks = the headless plan; an unticked face leaves the cut, the programming and the as-cast stock', () => {
    const all = nearNetSecondaryMachining(g, opts)!;
    const flags = table.map(r => r.kind === 'hole' || r.kind === 'face');
    expect(nearNetSecondaryMachining(g, { ...opts, includeFlags: flags })!.operations).toEqual(all.operations);
    const firstFace = table.findIndex(r => r.kind === 'face');
    const less = nearNetSecondaryMachining(g, { ...opts, includeFlags: flags.map((f, i) => i === firstFace ? false : f) })!;
    expect(less.rows.length).toBe(all.rows.length - 1);
    expect(less.cuttingMin).toBeLessThan(all.cuttingMin);
    expect(less.programmingGBP).toBeLessThan(all.programmingGBP);
    const w = (rows: FeatureRow[]) => asCastWeight({ finishedKg: 2.512, volumeCm3: g.volume!.cm3, rows, subtype: 'sand', family: 'steel' }).kg;
    expect(w(less.rows)).toBeLessThan(w(all.rows));
    expect(w(all.rows)).toBe(3.039);
    expect(nearNetSecondaryMachining(g, { ...opts, includeFlags: table.map(() => false) })).toBeNull();
  });
  it('a ticked pocket is milled at its feature time with its end mill; the finish factor scales the cut', () => {
    const flags = table.map(r => r.kind === 'hole' || r.kind === 'face');
    const pocket = table.findIndex(r => r.kind === 'pocket');
    const all = nearNetSecondaryMachining(g, { ...opts, includeFlags: flags })!;
    const withPocket = nearNetSecondaryMachining(g, { ...opts, includeFlags: flags.map((f, i) => i === pocket ? true : f) })!;
    expect(withPocket.cuttingMin).toBeGreaterThan(all.cuttingMin);
    expect(withPocket.cut.detail.basis).toMatch(/pocket \/ slot \/ boss feature\(s\) ticked to machine/);
    const reamed = nearNetSecondaryMachining(g, { ...opts, finishFactor: 1.3 })!;
    expect(reamed.cuttingMin).toBeGreaterThan(all.cuttingMin * 1.2);
  });
  it('a machine typed on the form runs the cut (not the lathe); the volume cell is never offered a turned part', () => {
    const typed = nearNetSecondaryMachining(g, { ...opts, machineId: 'mach-vmc3' })!;
    expect(typed.operations.every(o => o.machineId === 'mach-vmc3')).toBe(true);
    const hub = rec('FORGE_Hub_Flange.stp').geometry;
    const h = nearNetSecondaryMachining(hub, { family: 'steel', subtype: 'forging', coredAboveMm: 25, turnStockMm: 2, annualVolume: 200_000 })!;
    expect(h.cut.turnedPart).toBe(true);
    expect(h.operations.some(o => o.machineId === 'mach-hmc-400')).toBe(false);
    expect(h.operations.some(o => o.operationName.startsWith('Turning — outside and faces on the CNC lathe'))).toBe(true);
  });
});

describe('6. the casting route is the finished scope (route feasibility)', () => {
  it('as_cast_scope passes with the note, for a part with machined features', () => {
    const p = rec('steering_knuckle_RH.stp');
    const s = screenRoute('casting', { geo: p.geometry as never, filename: p.part, family: 'steel', annualVolume: 100_000 });
    const c = s.checks.find(x => x.id === 'as_cast_scope')!;
    expect(c.pass).toBe(true);
    expect(c.measured).toMatch(/machined features costed as secondary machining — same scope as cast \+ machine/);
  });
});
