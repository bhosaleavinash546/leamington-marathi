/**
 * The forging review, 2 Oct 2026 — one test per finding.
 *
 * Traced on the real steering knuckle and two forgings modelled in OCP
 * (cad-audit/parts/FORGE_modelled_parts.py — not customer parts): a drafted
 * control-arm yoke and a hub flange. docs/cad/forging-review-2026-10.md has the
 * trace and the hand reconciliation of the hub flange (£31.76).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runCostInputRules } from '../src/engine/cost-input-rules/engine.js';
import {
  FORGING_RULES, forgeLine, flashGeometry, trimPress, forgingPlanAreaCm2, FORGE_CREW,
} from '../src/engine/cost-input-rules/commodities/forging.js';
import { isRingShape } from '../src/engine/cost-input-rules/derive/envelope.js';
import { buildDeterministicAnalysis } from '../src/engine/cost-input-rules/deterministic.js';
import { toCostParams } from '../src/engine/cost-input-rules/to-cost-params.js';
import { computeForgingDrivers } from '../src/engine/modules/forging.js';
import { featureMinutesEach } from '../src/engine/feature-machining.js';
import { secondaryMachiningCell } from '../src/engine/machining-time.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';

const baseline = JSON.parse(readFileSync(new URL('./fixtures/real-parts-baseline.json', import.meta.url), 'utf8')) as
  Array<{ part: string; geometry: OCCTGeometry; outcome: { total?: number } }>;
const geoOf = (p: string) => baseline.find(b => b.part === p)!.geometry;
const ctx = (part: string, safety = 'yes', annualVolume = 50_000): RuleContext => ({
  geo: geoOf(part), geometryQuality: 'occt', commodity: 'forging', commoditySource: 'engineer', annualVolume, filename: part,
  answers: { 'material.family': 'steel', 'commodity.route': 'forging',
    'service.toleranceClass': 'standard', 'service.safetyCritical': safety },
} as RuleContext);
const forge = (part: string, safety = 'yes') =>
  runCostInputRules(FORGING_RULES, ctx(part, safety)).suggestions.forging as Record<string, number | string>;

describe('1. the forge line is paced by its hits, not 10 s "blows"', () => {
  it('knuckle: 3 s load + (2 impressions + 1 finisher hit) × 4 s = 15 s (was 6 × 10 = 60 s)', () => {
    const f = forge('steering_knuckle_RH.stp');
    expect(f.strokesToForm).toBe(3);
    expect(Number(f.cycleTimeHr) * 3600).toBeCloseTo(15, 1);
  });
  it('a hydraulic press hits slower; ring and open-die routes have their own cycle', () => {
    const base = { impressions: 2, shape: 'moderate' as const, partKg: 5 };
    expect(forgeLine({ ...base, process: 'closed-die', forgeId: 'forge-press-4000t' }).cycleSec).toBe(3 + 3 * 8);
    expect(forgeLine({ ...base, process: 'ring-rolling', forgeId: 'forge-ring-mill' }).cycleSec).toBe(80);
    expect(forgeLine({ ...base, process: 'open-die', forgeId: 'forge-hammer-5t' }).cycleSec).toBe(160);
  });
});

describe('2. the flash is trimmed, in line', () => {
  it('a trim press sized on the flash line, at the forge takt, one operator', () => {
    const f = forge('steering_knuckle_RH.stp');
    expect(f.trimMachineId).toBe('press-100t');
    expect(f.trimCycleHr).toBe(f.cycleTimeHr);
    expect(f.trimManning).toBe(1);
    expect(trimPress(112, 'carbon-steel').tonnes).toBeGreaterThan(5);
  });
});

describe('3. crew, labour, scrap and furnace are rules, the same on both paths', () => {
  it('2-man closed-die line, forge labour, 2% scrap, induction for steel', () => {
    const f = forge('steering_knuckle_RH.stp');
    expect(f.manning).toBe(FORGE_CREW['closed-die']);           // screen 2, headless 1 before
    expect(f.labourId).toBe('lab-uk-forge');                   // screen used a machinist
    expect(f.rejectRate).toBe(0.02);                           // screen 0, headless 3%
    expect(f.furnaceType).toBe('induction');                   // screen resistance (×1.35)
  });
  it('headless takes them', () => {
    const c = ctx('steering_knuckle_RH.stp');
    const { analysis } = buildDeterministicAnalysis(FORGING_RULES, c, 'knuckle');
    const p = toCostParams('forging', analysis.costInputSuggestions as never, 50_000, 'steel', c.geo)!.params;
    expect(p).toMatchObject({ manning: 2, labourId: 'lab-uk-forge', rejectRate: 0.02, furnaceType: 'induction',
      trimmingMachineId: 'press-100t', trimmingManning: 1 });
  });
});

describe('4. die sets wear fractionally, not rounded up inside a year', () => {
  it('50,000 forgings on a 39,104-forging die = 1.28 sets, not 2', () => {
    const d = computeForgingDrivers({
      materialId: 'mat-steel-38mnvs6', partWeightKg: 3, flashAndScaleKg: 0.3, yieldFraction: 0.743,
      forgeId: 'forge-press-1600t', labourId: 'lab-uk-forge', strokesToForm: 3, cycleTimeHr: 0.004,
      oee: 0.8, manning: 2, labourEfficiency: 0.92, heatingEnergyKwhPerKg: 0.35,
      dieLife: 39_104, dieCost: 29_326, amortizationVolume: 50_000,
    });
    expect(d.tooling.totalToolingCost).toBeCloseTo(29_326 * 50_000 / 39_104, 0);
  });
});

describe('5. the forging carries its machining stock', () => {
  it('knuckle: finished 2.795 kg + drilled holes + 2 mm a side on the machined faces', () => {
    const f = forge('steering_knuckle_RH.stp');
    expect(Number(f.partWeightKg)).toBeGreaterThan(2.795);
    expect(runCostInputRules(FORGING_RULES, ctx('steering_knuckle_RH.stp')).provenance['forge-part-wt'].basis)
      .toContain('2 mm a side on the machined faces');
  });
});

describe('6. the press closes across the largest section', () => {
  it('yoke: its 84 cm² plan, not a side or end silhouette', () => {
    const a = forgingPlanAreaCm2(ctx('FORGE_Control_Arm_Yoke.stp'));
    const p = geoOf('FORGE_Control_Arm_Yoke.stp').projectedArea!;
    expect(a.cm2).toBe(Math.round(Math.max(p.xMm2!, p.yMm2!, p.zMm2!) / 100 * 10) / 10);
  });
  it('the die-fill force counts the flash land', () => {
    expect(flashGeometry(112).landAreaCm2).toBeGreaterThan(15);
    expect(String(runCostInputRules(FORGING_RULES, ctx('steering_knuckle_RH.stp')).provenance['forge-mach'].basis))
      .toContain('flash land');
  });
});

describe('7. ring rolling is for rings', () => {
  it('a Ø140 hub flange with a Ø80 hub is upset in a closed die, not rolled', () => {
    expect(isRingShape(ctx('FORGE_Hub_Flange.stp'))).toBe(false);
    expect(forge('FORGE_Hub_Flange.stp', 'no').process).toBe('closed-die');
  });
});

describe('8. secondary machining is a cell, priced alike on both paths (castings too)', () => {
  it('load / unload + change-over, fixtures, programming and tool wear', () => {
    const c = secondaryMachiningCell({ fixturings: 2, weightKg: 2.8, annualVolume: 50_000, family: 'steel',
      featureRows: 10, cuttingMin: 10, engineerRatePerHr: 42.8 });
    expect(c.cell).toMatchObject({ fixturings: 2, handlingMin: 0.6, setupMinPerFixturing: 45, batchSize: 2500 });
    expect(c.toolingGBP).toBe(2 * 2500 + Math.round((1.5 * 2 + 0.25 * 10) * 42.8));
    expect(c.toolWearPerPart).toBeCloseTo(1.2, 6);
  });
  it('the knuckle carries them headless', () => {
    const c = ctx('steering_knuckle_RH.stp');
    const { analysis } = buildDeterministicAnalysis(FORGING_RULES, c, 'knuckle');
    const p = toCostParams('forging', analysis.costInputSuggestions as never, 50_000, 'steel', c.geo)!.params as Record<string, unknown>;
    expect(Number(p.secondaryMachiningToolingCost)).toBeGreaterThan(0);
    expect(Number(p.secondaryMachiningConsumablesPerPart)).toBeGreaterThan(0);
    const ops = p.secondaryMachiningOps as Array<{ operationName: string; manning: number }>;
    expect(ops[0].manning).toBe(0.5);
    expect(ops[1].operationName).toContain('load / unload + change-over');
  });
});

describe('9. holes: through means open at both ends; clearance holes are not reamed', () => {
  it('the hub\'s 6 × Ø14 bolt holes through an 18 mm flange read through (they read blind)', () => {
    const holes = (geoOf('FORGE_Hub_Flange.stp').featureTable ?? []).filter(r => r.kind === 'hole' && r.diaMm === 14);
    expect(holes[0].through).toBe(true);
  });
  it('a shallow through hole is drilled; a blind or deep one is drilled and reamed', () => {
    const clear = featureMinutesEach({ kind: 'hole', diaMm: 14, depthMm: 18, through: true, count: 1 });
    const bore = featureMinutesEach({ kind: 'hole', diaMm: 14, depthMm: 18, through: false, count: 1 });
    expect(bore - clear).toBeCloseTo(0.25 + 18 / 400 + 0.10, 6);
  });
});

describe('10. the hub flange reconciles by hand', () => {
  it('£31.76 at 50,000/yr', () => {
    expect(baseline.find(b => b.part === 'FORGE_Hub_Flange.stp')!.outcome.total).toBe(31.76);
  });
});
