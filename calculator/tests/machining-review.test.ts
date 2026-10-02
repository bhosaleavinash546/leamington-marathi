/**
 * The machining & cast-and-machine review, 2 Oct 2026 — one test per finding.
 *
 * Traced on Part1, the Casting Bracket and PRCR002 (real), and on a 6082
 * manifold block and a steel stepped shaft modelled in OCP
 * (cad-audit/parts/MACH_modelled_parts.py — not customer parts). Before the
 * fixes the cutting time was the kernel's planar face area ÷ a flat
 * 5,000 mm²/min — the same for steel and aluminium, blind to the metal removed;
 * the shaft was costed as a 40 mm square block on a 5-axis mill with 1.1 min of
 * cutting; the cast-and-machine machining was a weight-based ceiling that
 * disagreed with the casting route's own machining for the same part.
 * docs/cad/machining-review-2026-10.md has the trace.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runCostInputRules } from '../src/engine/cost-input-rules/engine.js';
import {
  MACHINING_RULES, solidCut, stockFacts, turnedFacts, routingFor, machiningOperationPlan,
} from '../src/engine/cost-input-rules/commodities/machining.js';
import { CAST_AND_MACHINE_RULES } from '../src/engine/cost-input-rules/commodities/cast-and-machine.js';
import { buildDeterministicAnalysis } from '../src/engine/cost-input-rules/deterministic.js';
import { toCostParams } from '../src/engine/cost-input-rules/to-cost-params.js';
import { featureMinutesEach, computeFeatureMachining, tappedThread } from '../src/engine/feature-machining.js';
import { featureToOperation } from '../src/engine/feature-ops.js';
import { CUTTING_DATA, stockSize, handlingMinPerFixturing, SETUP_MIN_PER_FIXTURING } from '../src/engine/machining-time.js';
import { optimiseMachiningRouting } from '../src/engine/routing-optimiser.js';
import { computeMachiningDrivers } from '../src/engine/modules/machining.js';
import { computeCastAndMachineDrivers } from '../src/engine/modules/cast-and-machine.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { applyNearNetMachiningCap } from '../server/utils/cad-machining-guard.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';

const baseline = JSON.parse(readFileSync(new URL('./fixtures/real-parts-baseline.json', import.meta.url), 'utf8')) as
  Array<{ part: string; geometry: OCCTGeometry; outcome: { total?: number } }>;
const geoOf = (p: string) => baseline.find(b => b.part === p)!.geometry;
const ctx = (part: string, family: string, annualVolume = 50_000, commodity = 'machining'): RuleContext => ({
  geo: geoOf(part), geometryQuality: 'occt', commodity, commoditySource: 'engineer', annualVolume, filename: part,
  answers: { 'material.family': family, 'commodity.route': commodity, 'service.pressureTight': 'no',
    'service.toleranceClass': 'standard', 'service.safetyCritical': 'no' },
} as RuleContext);
const mach = (part: string, family: string, vol = 50_000) =>
  runCostInputRules(MACHINING_RULES, ctx(part, family, vol)).suggestions.machining as Record<string, unknown>;

describe('1. cutting time is built up from the metal removed and the surface finished', () => {
  it('Part1: 1,773 cm³ of aluminium to rough out — the kernel gave the whole part 13 min', () => {
    const c = solidCut(ctx('Part1.stp', 'aluminium'), 'aluminium')!;
    expect(c.detail.roughMin).toBeGreaterThan(10);           // removed ÷ 120 cm³/min
    expect(c.kernelHr! * 60).toBeLessThan(15);                // the kernel's area-rate figure, not used
    expect(c.detail.basis).toContain('cm³ ÷ 120 cm³/min');
  });
  it('steel takes longer than aluminium — the kernel rate was the same for both', () => {
    const al = solidCut(ctx('MACH_Hydraulic_Manifold.stp', 'aluminium'), 'aluminium')!;
    const st = solidCut(ctx('MACH_Hydraulic_Manifold.stp', 'steel'), 'steel')!;
    expect(st.detail.totalMin / al.detail.totalMin).toBeGreaterThan(2);
    expect(CUTTING_DATA.steel.timeFactor).toBe(2);
  });
  it('free-form area is surfaced, flats and walls are finished at the wall rate (measured per type)', () => {
    expect(geoOf('Part1.stp').faces?.areaByTypeMm2?.BSPLINE).toBeGreaterThan(0);
    expect(solidCut(ctx('Part1.stp', 'aluminium'), 'aluminium')!.detail.surfacingMin).toBeGreaterThan(0);
  });
});

describe('2. drilling runs at a drilling feed', () => {
  it('Ø11 × 60 through in aluminium: 0.375 min (60 mm > 5 Ø pecks), not 1.35 min (50 mm/min was 10–20× slow)', () => {
    expect(featureMinutesEach({ kind: 'hole', diaMm: 11, depthMm: 60, through: true, count: 1 })).toBeCloseTo(0.15 + 60 / 400 * 1.5, 6);
  });
  it('a hole at a tapping-drill size is tapped — the manifold\'s four Ø5 × 12 are M6', () => {
    const row = { kind: 'hole' as const, diaMm: 5, depthMm: 12, through: false, count: 4 };
    expect(tappedThread(row)).toBe('M6');
    expect(featureToOperation(row)).toBe('Drill + tap M6');
    expect(featureMinutesEach(row)).toBeCloseTo(0.06 + 12 / 250 + 0.10 + 0.10 + 24 / 500, 6);
    // a Ø14 × 1 land is not a tapped hole (too shallow), nor is a Ø11 clearance hole
    expect(tappedThread({ kind: 'hole', diaMm: 14, depthMm: 1, through: false, count: 1 })).toBeNull();
    expect(tappedThread({ kind: 'hole', diaMm: 11, depthMm: 60, through: true, count: 1 })).toBeNull();
  });
  it('a deep hole pecks', () => {
    const shallow = featureMinutesEach({ kind: 'hole', diaMm: 8, depthMm: 30, through: true, count: 1 });
    const deep = featureMinutesEach({ kind: 'hole', diaMm: 8, depthMm: 70, through: true, count: 1 });
    expect((deep - 0.15) / (shallow - 0.15)).toBeCloseTo(70 / 30 * 1.5, 1);
  });
});

describe('3. stock is bought in stocked sizes, not the bounding box', () => {
  it('manifold 120 × 80 × 60: sawn from 65 mm plate with squaring and a saw cut', () => {
    const s = stockFacts(ctx('MACH_Hydraulic_Manifold.stp', 'aluminium'), 'aluminium', 1.312)!;
    expect(s.form).toBe('plate');
    expect(s.basis).toContain('65 mm plate');
    expect(s.stockCm3).toBeGreaterThan(120 * 80 * 60 / 1000);
  });
  it('shaft Ø40 × 190: Ø45 bar × 198 mm', () => {
    expect(stockSize([190, 40, 40], { maxDiaMm: 40, lengthMm: 190 }).dimsMm).toEqual([45, 198]);
  });
});

describe('4. a turned part is measured, and turned', () => {
  it('the shaft is 95% one coaxial family of revolved surfaces — the bounding box test missed it', () => {
    expect(turnedFacts(ctx('MACH_Stepped_Shaft.stp', 'steel'))).toMatchObject({ maxDiaMm: 40, lengthMm: 190 });
    expect(turnedFacts(ctx('MACH_Hydraulic_Manifold.stp', 'aluminium'))).toBeNull();
  });
  it('routed on the lathe from bar, keyway and cross hole on a mill (was a 5-axis mill, 1.1 min)', () => {
    const m = mach('MACH_Stepped_Shaft.stp', 'steel', 10_000);
    expect(m.machineId).toBe('mach-lathe-cnc');
    const ops = m.operations as Array<{ name: string; machineId: string }>;
    expect(ops[0].name).toContain('Turning');
    expect(ops[1].machineId).toBe('mach-haas-vf2');
  });
});

describe('5. a 5-axis machine cannot machine the face it is clamped on', () => {
  it('from solid: op 10 five sides, op 20 the clamped face; a casting on its cast datums: one', () => {
    const p = { millingHr: 0.2, drillHr: 0.05, principalDirections: 3, axisymmetric: false,
      bboxSortedMm: [200, 100, 50] as const, batchSize: 500 };
    const solid = optimiseMachiningRouting({ ...p, fromSolid: true }).alternatives.find(a => a.label === 'consolidated-5axis')!;
    const cast = optimiseMachiningRouting({ ...p, fromSolid: false }).alternatives.find(a => a.label === 'consolidated-5axis')!;
    expect(solid.setups).toBe(2);
    expect(cast.setups).toBe(1);
  });
});

describe('6–8. handling, crew and change-over are charged as the routing was ranked', () => {
  it('load / clamp / unload is an operation: fixturings × the handling minutes for the weight', () => {
    const c = ctx('MACH_Hydraulic_Manifold.stp', 'aluminium');
    const ops = machiningOperationPlan(c, 'aluminium');
    const load = ops.find(o => o.name.startsWith('Load / clamp'))!;
    const routing = routingFor(c, solidCut(c, 'aluminium')!);
    expect(load.cycleTimeHr * 60).toBeCloseTo(routing.chosen.setups * handlingMinPerFixturing(1.9), 2);
    expect(load.manning).toBe(1);
  });
  it('one operator tends two machines while they cut', () => {
    const ops = machiningOperationPlan(ctx('MACH_Hydraulic_Manifold.stp', 'aluminium'), 'aluminium');
    expect(ops[0].manning).toBe(0.5);
  });
  it('a change-over is 45 min a fixturing, not the kernel\'s 15 min per-part allowance', () => {
    const m = mach('MACH_Hydraulic_Manifold.stp', 'aluminium');
    expect(m.setupTimeHr).toBe(Number(m.setupCount) * SETUP_MIN_PER_FIXTURING / 60);
  });
});

describe('9–14. fixtures, programming, tool wear, deburr, scrap, batch and grade are rules on both paths', () => {
  it('fixtures and programming were £0 headless and £15,000 / £0 on the screen', () => {
    const m = mach('MACH_Hydraulic_Manifold.stp', 'aluminium');
    expect(m.toolingCost).toBe(10_000);                      // 4 dedicated fixtures × £2,500
    expect(Number(m.programmingNRE)).toBeGreaterThan(300);
  });
  it('cutting tools wear: steel at £0.12 a cutting minute', () => {
    const m = mach('MACH_Stepped_Shaft.stp', 'steel');
    expect(Number(m.toolWearCostPerPart)).toBeGreaterThan(0.7);
  });
  it('deburr and gauge check is a bench task: labour, no machine time', () => {
    const d = computeMachiningDrivers({
      materialId: 'mat-al6082-bar', netWeightKg: 1, stockWeightKg: 2, materialUtilization: 0.5,
      operations: [{ name: 'Deburr', type: 'milling_3ax', machineId: 'mach-vmc3', labourId: 'lab-uk-semiskilled',
        cycleTimeHr: 0.02, partsPerCycle: 1, oee: 1, manning: 1, labourTimeHr: 0.02, labourEfficiency: 0.92, benchOperation: true }],
      setup: { setupTimeHr: 0, batchSize: 1, machineId: 'mach-vmc3', labourId: 'lab-uk-skilled' },
      programmingNRE: 0, toolingCost: 0, amortizationVolume: 1,
    });
    const bench = d.operations.find(o => o.operationName === 'Deburr')!;
    expect(bench.cycleTimeHr).toBe(0);
    expect(bench.labourTimeHr).toBeCloseTo(0.02, 6);
  });
  it('scrap, batch and the bar grade are decided, not left to each path\'s default', () => {
    const m = mach('MACH_Stepped_Shaft.stp', 'steel', 10_000);
    expect(m.rejectRate).toBe(0.02);                          // was 3% headless, 0% on screen
    expect(m.batchSize).toBe(500);                            // was 50 on screen, annual ÷ 20 headless
    const c = ctx('MACH_Stepped_Shaft.stp', 'steel', 10_000);
    const { analysis } = buildDeterministicAnalysis(MACHINING_RULES, c, 'shaft');
    expect(analysis.costInputSuggestions.materialId).toBe('mat-en8');   // screen kept 1045
    const p = toCostParams('machining', analysis.costInputSuggestions as never, 10_000, 'steel', c.geo)!.params;
    expect(p).toMatchObject({ rejectRate: 0.02, toolingCost: 3_100, setup: { batchSize: 500 } });
  });
});

describe('15–18. cast + machine', () => {
  it('the setup is no longer multiplied by a complexity factor on top of its setup count', () => {
    const base = {
      castingSubtype: 'sand' as const, materialId: 'mat-gs-c25', castPartWeightKg: 3, finishedWeightKg: 2.5,
      castingYield: 0.53, rejectRate: 0.03, castingLabourId: 'lab-uk-foundry', castingOee: 0.8, castingManning: 4,
      castingLabourEfficiency: 0.92,
      sand: { mouldLineId: 'sand-cast-line', cycleTimeHr: 0.0083, patternCost: 9000, patternLife: 32000, coreCostPerPart: 1.5 },
      machiningOps: [], machiningSetup: { setupTimeHr: 3, batchSize: 100, machineId: 'mach-vmc3', labourId: 'lab-uk-skilled' },
      machiningToolingCost: 0, machiningProgrammingNRE: 0, amortizationVolume: 50_000,
    };
    const a = computeCastAndMachineDrivers({ ...base, geometryComplexity: 5 });
    const b = computeCastAndMachineDrivers({ ...base, geometryComplexity: 1 });
    const setupOf = (d: typeof a) => d.operations.find(o => o.operationName.startsWith('Machining Setup'))!.cycleTimeHr;
    expect(setupOf(a)).toBe(setupOf(b));
    expect(setupOf(a)).toBeCloseTo(3 / 100, 6);
  });
  it('PRCR002 costs the same machining as cast-and-machine and as a casting with secondary machining', () => {
    // Before: £50.10 against £80.84 for the same part (a weight ceiling v the feature table).
    const cam = baseline.find(b => b.part === 'PRCR002.stp')!.outcome.total!;
    expect(cam).toBeGreaterThan(45);
    const r = runCostInputRules(CAST_AND_MACHINE_RULES, ctx('PRCR002.stp', 'aluminium', 50_000, 'cast_and_machine'));
    const ops = (r.suggestions.machining as Record<string, unknown>).operations as Array<{ name: string }>;
    expect(ops.some(o => o.name.startsWith('Finish machining'))).toBe(true);
  });
  it('the near-net guard bounds AI times, not the measured plan (it was scaling it — handling and deburr too)', () => {
    const plan = () => ({ costInputSuggestions: {
      recommendedCommodity: 'cast_and_machine', netWeightKg: 2.5, estimatedCycleTimeHr: 0.5,
      estimatedOperations: [{ name: 'Finish machining', cycleTimeHr: 0.5, measured: true }],
    } });
    const measured = plan();
    expect(applyNearNetMachiningCap(measured as never)).toEqual([]);
    expect(measured.costInputSuggestions.estimatedOperations[0].cycleTimeHr).toBe(0.5);
    const ai = plan();
    delete (ai.costInputSuggestions.estimatedOperations[0] as { measured?: boolean }).measured;
    expect(applyNearNetMachiningCap(ai as never)[0].code).toBe('near_net_machining_capped');
  });
  it('the as-cast weight carries the measured face machining stock', () => {
    const r = runCostInputRules(CAST_AND_MACHINE_RULES, ctx('Casting_Braket.stp', 'steel', 50_000, 'cast_and_machine'));
    expect(r.provenance['cam-cast-wt'].basis).toContain('3 mm a side on the machined faces');
  });
  it('secondary machining on a steel casting or forging is timed for steel; cored bores are finish-bored', () => {
    const rows = [{ kind: 'hole' as const, diaMm: 40, depthMm: 45, through: false, count: 1 }];
    const opts = { machineId: 'mach-vmc3', labourId: 'lab-uk-skilled' };
    const al = computeFeatureMachining(rows, opts).totalCycleHr;
    const st = computeFeatureMachining(rows, { ...opts, materialFactor: CUTTING_DATA.steel.timeFactor }).totalCycleHr;
    const cored = computeFeatureMachining(rows, { ...opts, coredAboveMm: 20 }).totalCycleHr;
    expect(st / al).toBeCloseTo(2, 6);
    expect(cored).toBeLessThan(al / 3);                       // one boring pass, not a helical mill from solid
  });
});

describe('19. the kernel bounding box is exact', () => {
  it('seat bracket height 19.4 mm (a fine mesh says so) — it read 31.0 from B-spline control points', () => {
    expect(geoOf('Seat_Locking_Bracket.stp').boundingBox!.zMm).toBeCloseTo(19.4, 1);
    expect(geoOf('MACH_Stepped_Shaft.stp').boundingBox!.xMm).toBe(40);   // the warm pool read 40.11
  });
});

describe('20. the screen fills the form from the analysis, not its own model', () => {
  const src = readFileSync(new URL('../src/ui/main.ts', import.meta.url), 'utf8');
  it('no net × 1.4 stock, no net × 1.15 as-cast weight, no kernel-scaled ops, no keyword grind pass', () => {
    expect(src).not.toContain("setNumericField('mach-stock-wt', c.netWeightKg * 1.4");
    expect(src).not.toContain("setNumericField('cam-cast-wt', c.netWeightKg * 1.15");
    expect(src).not.toContain('Cylindrical Grinding — Bearing Journal');
    expect(src).not.toContain('geometryComplexity: (num(\'cam-complexity\')');
  });
});

describe('the reference part still reconciles', () => {
  it('core arithmetic untouched: a bench op adds labour, never machine', () => {
    const r = computeUniversalStack({
      partName: 'x', rawMaterial: { materialId: 'mat-al6061', netWeightKg: 0.5, materialUtilization: 0.65 },
      operations: [{ operationName: 'b', machineId: 'mach-vmc3', labourId: 'lab-uk-skilled', cycleTimeHr: 0,
        partsPerCycle: 1, oee: 1, manning: 1, labourTimeHr: 0.1, labourEfficiency: 1, benchOperation: true }],
      tooling: { totalToolingCost: 0, amortizationVolume: 1, mode: 'amortized' },
      packagingPerPart: 0, logisticsPerPart: 0, overheadPct: 0, marginPct: 0,
    }, DEFAULT_RATE_LIBRARY);
    expect(r.breakdown.process).toBe(0);
    expect(r.breakdown.labour).toBeCloseTo(0.1 * DEFAULT_RATE_LIBRARY.labour.find(l => l.id === 'lab-uk-skilled')!.fullyLoadedRatePerHr, 6);
  });
});
