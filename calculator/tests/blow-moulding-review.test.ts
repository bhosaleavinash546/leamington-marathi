/**
 * The blow-moulding review, 3 Oct 2026 — one test per finding.
 *
 * Traced on the real fuel tank (its STEP is not in the repo; its measured
 * geometry is kept in cad-audit/final/runs/FINAL-Fuel_tank-api.json) and two
 * blow mouldings modelled in OCP (cad-audit/parts/BM_modelled_parts.py — not
 * customer parts): a 2.5 mm HDPE washer reservoir and a 2 mm PP air duct.
 * docs/cad/blow-moulding-review-2026-10.md has the trace and the hand
 * reconciliation of the reservoir (£1.59).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runCostInputRules } from '../src/engine/cost-input-rules/engine.js';
import {
  BLOW_MOULDING_RULES, CAPACITY_DECISION_ID, EXACT_CAPACITY_DECISION_ID, BARRIER_DECISION_ID, EBM_HEADS, blowMachineFor,
} from '../src/engine/cost-input-rules/commodities/blow-moulding.js';
import { RESIN_DECISION_ID } from '../src/engine/cost-input-rules/derive/resin.js';
import { shellWallMm } from '../src/engine/cost-input-rules/derive/shell-wall.js';
import { hollowVerdict } from '../src/engine/cost-input-rules/derive/hollow.js';
import { inferCommodity } from '../src/engine/cost-input-rules/derive/commodity.js';
import { applyShellWallCorrection } from '../src/engine/geometry-sanity.js';
import { buildDeterministicAnalysis } from '../src/engine/cost-input-rules/deterministic.js';
import { toCostParams } from '../src/engine/cost-input-rules/to-cost-params.js';
import { computeBlowMouldingDrivers } from '../src/engine/modules/blow-moulding.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';
import { costMeasuredPart } from '../server/services/bulk-run.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';

const baseline = JSON.parse(readFileSync(new URL('./fixtures/real-parts-baseline.json', import.meta.url), 'utf8')) as
  Array<{ part: string; geometry: OCCTGeometry; outcome: { total?: number } }>;
const geoOf = (p: string) => structuredClone(baseline.find(b => b.part === p)!.geometry);
const TANK = (JSON.parse(readFileSync(new URL('../../cad-audit/final/runs/FINAL-Fuel_tank-api.json', import.meta.url), 'utf8'))
  .response.occtGeometry) as OCCTGeometry;

const RESERVOIR = { 'material.family': 'plastic', [RESIN_DECISION_ID]: 'mat-hdpe-bm', 'commodity.route': 'blow_moulding', [CAPACITY_DECISION_ID]: '2_20' };
const DUCT = { 'material.family': 'plastic', [RESIN_DECISION_ID]: 'mat-pp-bm', 'commodity.route': 'blow_moulding',
  [CAPACITY_DECISION_ID]: 'exact', [EXACT_CAPACITY_DECISION_ID]: '2.5' };
const TANK_ANS = { 'material.family': 'plastic', [RESIN_DECISION_ID]: 'mat-hdpe-bm', 'commodity.route': 'blow_moulding',
  [CAPACITY_DECISION_ID]: 'over_20', [BARRIER_DECISION_ID]: 'barrier' };

const ctx = (geo: OCCTGeometry, answers: Record<string, string>, filename = 'part.stp'): RuleContext => ({
  geo, geometryQuality: 'occt', commodity: 'blow_moulding', commoditySource: 'engineer', annualVolume: 50_000, filename, answers,
} as RuleContext);
const bm = (geo: OCCTGeometry, answers: Record<string, string>) => {
  const r = runCostInputRules(BLOW_MOULDING_RULES, ctx(geo, answers));
  return { r, s: r.suggestions.blowMoulding as Record<string, number | string | boolean> };
};

/** The reservoir as the kernel reports it, before the boundary correction. */
const rawReservoir = (): OCCTGeometry => {
  const g = geoOf('BM_Washer_Reservoir.stp');
  g.wallThickness = { ...g.wallThickness!, meanMm: 25.31, p95Mm: 162.45, method: 'ray_cast', sampleCount: 7 } as never;
  return g;
};

describe('1. the wall of a blown shell is 2·V/S, not the ray-cast mean', () => {
  it('reservoir: 2.50 mm, where the raw ray-cast mean reads 25.3 mm across the cavity', () => {
    expect(shellWallMm(rawReservoir())!.mm).toBeCloseTo(2.5, 2);
    expect(bm(rawReservoir(), RESERVOIR).s.wallThicknessMm).toBe(2.5);
  });
  it('the measurement boundary corrects the raw reservoir to 2.5 mm, so it reads hollow', () => {
    const g = rawReservoir();
    expect(applyShellWallCorrection(g)).toEqual({ fromMm: 25.31, toMm: 2.5 });
    expect(hollowVerdict(g)).toBe('near-enclosed');
  });
  it('fuel tank: 4.45 mm area-mean wall, not the 5.04 mm ray mean the boundary correction lets through', () => {
    const t = structuredClone(TANK);
    expect(applyShellWallCorrection(t)).toBeNull();       // under the 3× overshoot guard
    expect(bm(t, TANK_ANS).s.wallThicknessMm).toBe(4.45);
  });
});

describe('1b. a small hollow shell is offered the hollow routes', () => {
  it('the 220 mm reservoir was offered sheet metal, injection moulding and machining — not blow moulding', () => {
    const r = inferCommodity({ geo: geoOf('BM_Washer_Reservoir.stp'), geometryQuality: 'occt', annualVolume: 50_000,
      filename: 'BM_Washer_Reservoir.stp', answers: {} } as never) as { decision?: { options: Array<{ value: string }> } };
    expect(r.decision!.options.map(o => o.value)).toContain('blow_moulding');
  });
  it('a sparse solid forging is not (the knuckle keeps its casting / forging question)', () => {
    const r = inferCommodity({ geo: geoOf('steering_knuckle_RH.stp'), geometryQuality: 'occt', annualVolume: 50_000,
      filename: 'k.stp', answers: {} } as never) as { decision?: { options: Array<{ value: string }> } };
    expect(r.decision!.options.map(o => o.value)).not.toContain('blow_moulding');
  });
});

describe('2. a shell with no ray-cast reading gets its wall at the measurement boundary', () => {
  it('air duct: no wall from the kernel → 1.99 mm (2·V/S); it was blocked, and the typed answer was never read', () => {
    const g = geoOf('BM_Air_Duct.stp');
    delete (g as { wallThickness?: unknown }).wallThickness;
    expect(applyShellWallCorrection(g)).toEqual({ fromMm: 0, toMm: 1.99 });
    // a whole reading, not a partial one: /analyze prints every field
    expect(g.wallThickness).toMatchObject({ meanMm: 1.99, minMm: 1.99, maxMm: 2.79, stdDevMm: 0, sampleCount: 0 });
    expect(bm(g, DUCT).r.status).toBe('complete');
  });
});

describe('3. capacity: the band is capped at what the envelope can hold, or typed exactly', () => {
  it('a 3.8 L reservoir answered "2 – 20 L" is tooled at the 5.43 L its envelope holds, not 10 L', () => {
    expect(bm(geoOf('BM_Washer_Reservoir.stp'), RESERVOIR).s.partVolumeL).toBe(5.43);
  });
  it('"I know the exact capacity" asks for the litres, then costs at them', () => {
    const asked = bm(geoOf('BM_Air_Duct.stp'), { ...DUCT, [EXACT_CAPACITY_DECISION_ID]: '' }).r;
    expect(asked.decisions.map(d => d.id)).toContain(EXACT_CAPACITY_DECISION_ID);
    expect(bm(geoOf('BM_Air_Duct.stp'), DUCT).s.partVolumeL).toBe(2.5);
  });
});

describe('4. the machine follows the wall and the shot', () => {
  it('a barrier tank runs on the multi-layer co-ex head (rule and headless disagreed)', () => {
    expect(bm(structuredClone(TANK), TANK_ANS).s.machineId).toBe('blow-ebm-coex5');
  });
  it('a mono-layer EBM part is sized on the shot a cycle: part + flash, times cavities', () => {
    expect(blowMachineFor('ebm_2head', 0.2 * 2, false).id).toBe('blow-ebm-100l');
    expect(blowMachineFor('ebm_2head', 0.2, false).id).toBe('blow-ebm-2head');
  });
});

describe('5. the parison is in series only when the head makes it so', () => {
  it('continuous head: the next parison extrudes while the mould runs — 0 s in series (was 6 s)', () => {
    expect(EBM_HEADS['blow-ebm-100l'].head).toBe('continuous');
    expect(bm(geoOf('BM_Washer_Reservoir.stp'), RESERVOIR).s.parisonExtrusionTimeSec).toBe(0);
  });
  it('accumulator head: 12.28 kg pushed out at 2 kg/s = 6.1 s in series', () => {
    // 12.41 kg at the pellet's 960 kg/m³ until the scope review moved blow moulding onto its blow grade (950).
    expect(bm(structuredClone(TANK), TANK_ANS).s.parisonExtrusionTimeSec).toBe(6.1);
  });
  it('an extruder that cannot keep up sets the pace', () => {
    // 0.45 kg twin-cavity bottles on the 90 kg/h 2-head: 36 s to extrude.
    const id = blowMachineFor('ebm_2head', 0.29, false).id;
    expect(id).toBe('blow-ebm-2head');
    expect(0.9 / EBM_HEADS[id].extruderKgPerH * 3600).toBeCloseTo(36, 0);
  });
});

describe('6. flash is reground, not bought as virgin resin', () => {
  it('all EBM flash fed back: the tank buys its 10.2 kg wall, not 12.4 kg', () => {
    const base = {
      materialId: 'mat-hdpe-fuel-coex', partWeightKg: 10.17, flashWeightKg: 2.24, wallThicknessMm: 4.45,
      coolTimeFactorSPerMm2: 3.5, blowTimeSec: 20, openCloseSec: 8, machineId: 'blow-ebm-coex5', labourId: 'lab-uk-blow',
      cavities: 1, oee: 0.8, manning: 1, labourEfficiency: 0.92, mouldCost: 69_377, mouldLife: 500_000, amortizationVolume: 50_000,
    };
    expect(computeBlowMouldingDrivers({ ...base, flashRegrindFraction: 1 }).rawMaterial.materialUtilization).toBe(1);
    expect(computeBlowMouldingDrivers(base).rawMaterial.materialUtilization).toBeCloseTo(10.17 / 12.41, 4);
  });
});

describe('7. crew, OEE, scrap, labour, cooling and trim are rules, the same on both paths', () => {
  it('headless takes every one (it fixed the cool factor at 2.5 and the parison at 6 s)', () => {
    const c = ctx(geoOf('BM_Washer_Reservoir.stp'), RESERVOIR);
    const { analysis } = buildDeterministicAnalysis(BLOW_MOULDING_RULES, c, 'reservoir');
    const p = toCostParams('blow_moulding', analysis.costInputSuggestions as never, 50_000, 'plastic', c.geo)!.params;
    expect(p).toMatchObject({
      coolTimeFactorSPerMm2: 3.5, parisonExtrusionTimeSec: 0, machineId: 'blow-ebm-100l',
      manning: 0.5, oee: 0.8, labourEfficiency: 0.92, rejectRate: 0.025, labourId: 'lab-uk-blow',
      flashRegrindFraction: 1, deflashMachineId: 'blow-deflash-trimmer', deflashManning: 0,
    });
    expect(Number((p as Record<string, unknown>).deflashCycleTimeSec)).toBeCloseTo(33.7, 1);
  });
  it('the in-line trimmer is charged at the blow takt with no crew of its own — the validator accepts it', () => {
    const d = computeBlowMouldingDrivers({
      materialId: 'mat-hdpe', partWeightKg: 0.3625, flashWeightKg: 0.0435, flashRegrindFraction: 1, wallThicknessMm: 2.5,
      coolTimeFactorSPerMm2: 3.5, blowTimeSec: 7.3, openCloseSec: 4.5, parisonExtrusionTimeSec: 0,
      machineId: 'blow-ebm-100l', labourId: 'lab-uk-blow', cavities: 1, oee: 0.8, manning: 0.5, labourEfficiency: 0.92,
      mouldCost: 14_790, mouldLife: 500_000, amortizationVolume: 50_000, rejectRate: 0.025,
      deflashMachineId: 'blow-deflash-trimmer', deflashLabourId: 'lab-uk-blow', deflashCycleTimeSec: 33.7, deflashManning: 0,
    });
    const trim = d.operations[1];
    expect(trim).toMatchObject({ labourTimeHr: 0, untended: true });
    const r = computeUniversalStack({
      rawMaterial: d.rawMaterial, operations: d.operations, tooling: d.tooling,
      packagingCostPerPart: 0, logisticsCostPerPart: 0, overheadPct: 0, marginPct: 0,
    } as never, recomputeMachineRates(DEFAULT_RATE_LIBRARY));
    expect(r.breakdown.labour).toBeGreaterThan(0);
  });
});

describe('8. moulds wear fractionally', () => {
  it('600,000 parts on a 500,000-cycle mould = 1.2 moulds, not 2', () => {
    const d = computeBlowMouldingDrivers({
      materialId: 'mat-hdpe', partWeightKg: 0.36, flashWeightKg: 0.04, wallThicknessMm: 2.5, coolTimeFactorSPerMm2: 3.5,
      blowTimeSec: 7, openCloseSec: 4.5, machineId: 'blow-ebm-100l', labourId: 'lab-uk-blow', cavities: 1, oee: 0.8,
      manning: 0.5, labourEfficiency: 0.92, mouldCost: 10_000, mouldLife: 500_000, amortizationVolume: 600_000,
    });
    expect(d.tooling.totalToolingCost).toBeCloseTo(12_000, 6);
  });
});

describe('9. the parts reconcile', () => {
  it('reservoir £1.60 and duct £1.22 at 50,000/yr (£1.62 / £1.24 before the UK rate book; both blocked before; £1.59 / £1.20 on pellet grades before the scope review)', () => {
    expect(baseline.find(b => b.part === 'BM_Washer_Reservoir.stp')!.outcome.total).toBe(1.6);
    expect(baseline.find(b => b.part === 'BM_Air_Duct.stp')!.outcome.total).toBe(1.22);
  });
  it('the real fuel tank: £28.69 (£28.91 before the UK rate book; was £32.41; £29.12 on the pellet grade before the scope review)', async () => {
    const t = structuredClone(TANK);
    const r = await costMeasuredPart(t, 'Fuel_tank.STEP',
      { partNumber: 'Fuel_tank', file: 'Fuel_tank.STEP', annualVolume: 50_000, commodity: 'blow_moulding' } as never,
      TANK_ANS, 'UK', { annualVolume: 50_000 } as never, recomputeMachineRates(DEFAULT_RATE_LIBRARY),
      { partNumber: 'Fuel_tank', file: 'Fuel_tank.STEP', status: 'error' } as never) as { status: string; total: number };
    expect(r.status).toBe('costed');
    expect(r.total).toBeCloseTo(28.69, 2);
  });
});
