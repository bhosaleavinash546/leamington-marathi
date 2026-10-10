/**
 * The rotational-moulding review, 3 Oct 2026 — one test per finding.
 *
 * Traced on two tanks modelled in OCP (cad-audit/parts/ROTO_modelled_parts.py —
 * not customer parts): a 30 L coolant tank and a 4 L header tank, and on the real
 * fuel tank's recorded geometry costed as a low-volume rotomoulding.
 * docs/cad/rotational-moulding-review-2026-10.md has the trace and the hand
 * reconciliation of the header tank at 5,000/yr (£20.63).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runCostInputRules } from '../src/engine/cost-input-rules/engine.js';
import {
  ROTATIONAL_MOULDING_RULES, rotoIndexSec, rotoMoulds, rotoMachineFor, ROTO_GRINDING_GBP_PER_KG,
} from '../src/engine/cost-input-rules/commodities/rotational-moulding.js';
import { RESIN_DECISION_ID, resinFacts } from '../src/engine/cost-input-rules/derive/resin.js';
import { hollowVerdict, enclosedShell } from '../src/engine/cost-input-rules/derive/hollow.js';
import { inferCommodity } from '../src/engine/cost-input-rules/derive/commodity.js';
import { buildDeterministicAnalysis } from '../src/engine/cost-input-rules/deterministic.js';
import { toCostParams } from '../src/engine/cost-input-rules/to-cost-params.js';
import { computeRotationalMouldingDrivers } from '../src/engine/modules/rotational-moulding.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';
import { costMeasuredPart } from '../server/services/bulk-run.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';

const baseline = JSON.parse(readFileSync(new URL('./fixtures/real-parts-baseline.json', import.meta.url), 'utf8')) as
  Array<{ part: string; geometry: OCCTGeometry; outcome: { total?: number } }>;
const geoOf = (p: string) => structuredClone(baseline.find(b => b.part === p)!.geometry);
const TANK = (JSON.parse(readFileSync(new URL('../../cad-audit/final/runs/FINAL-Fuel_tank-api.json', import.meta.url), 'utf8'))
  .response.occtGeometry) as OCCTGeometry;

const ANS = { 'material.family': 'plastic', [RESIN_DECISION_ID]: 'mat-lldpe-roto', 'commodity.route': 'rotational_moulding' };
const ctx = (geo: OCCTGeometry, annualVolume = 5_000, answers: Record<string, string> = ANS): RuleContext => ({
  geo, geometryQuality: 'occt', commodity: 'rotational_moulding', commoditySource: 'engineer', annualVolume,
  filename: 'tank.stp', answers,
} as RuleContext);
const rm = (geo: OCCTGeometry, v = 5_000) => {
  const r = runCostInputRules(ROTATIONAL_MOULDING_RULES, ctx(geo, v));
  return { r, s: r.suggestions.rotationalMoulding as Record<string, number | string> };
};
const headless = async (part: string, geo: OCCTGeometry, v: number, answers: Record<string, string> = ANS) =>
  await costMeasuredPart(geo, part, { partNumber: part, file: part, annualVolume: v, commodity: 'rotational_moulding' } as never,
    answers, 'UK', { annualVolume: v } as never, recomputeMachineRates(DEFAULT_RATE_LIBRARY),
    { partNumber: part, file: part, status: 'error' } as never) as { status: string; total: number; breakdown: Record<string, number> };

describe('1. a closed tank is measured as closed (the enclosure probe)', () => {
  it('tanks read 1.00 from the envelope centre; the open tray 0.56, pressings ≤ 0.68, the knuckle 0.44', () => {
    for (const p of ['ROTO_Coolant_Tank.stp', 'ROTO_Header_Tank.stp', 'BM_Washer_Reservoir.stp']) {
      expect(geoOf(p).enclosure!.hitShare).toBe(1);
      expect(enclosedShell(geoOf(p))).toBe(true);
    }
    for (const p of ['IM_Storage_Tray.stp', 'Seat_Locking_Bracket.stp', 'BIW_Floor_Reinforcement.stp', 'steering_knuckle_RH.stp']) {
      expect(enclosedShell(geoOf(p))).toBe(false);
    }
  });
  it('the 4 L header tank at 10.5% fill is hollow (the fill test alone called it a solid)', () => {
    const g = geoOf('ROTO_Header_Tank.stp');
    expect(g.fillRatio).toBeGreaterThan(0.08);
    expect(hollowVerdict(g)).toBe('near-enclosed');
  });
});

describe('2. a tank is offered the hollow routes before the bend test', () => {
  it('both tanks: blow / roto / sheet, leaning roto below 10,000 a year (they were offered IM / sheet / thermoform)', () => {
    for (const p of ['ROTO_Coolant_Tank.stp', 'ROTO_Header_Tank.stp']) {
      const r = inferCommodity({ geo: geoOf(p), geometryQuality: 'occt', annualVolume: 5_000, filename: p, answers: {} } as never) as
        { decision: { options: Array<{ value: string; leaning?: boolean }> } };
      expect(r.decision.options.map(o => o.value)).toEqual(['blow_moulding', 'rotational_moulding', 'sheet_metal']);
      expect(r.decision.options.find(o => o.leaning)!.value).toBe('rotational_moulding');
    }
  });
  it('geometry measured before the probe (the real fuel tank) is offered blow and roto too, never leaned on', () => {
    const r = inferCommodity({ geo: structuredClone(TANK), geometryQuality: 'occt', annualVolume: 5_000, filename: 'Fuel_tank.STEP', answers: {} } as never) as
      { decision: { options: Array<{ value: string; leaning?: boolean }> } };
    const v = r.decision.options.map(o => o.value);
    expect(v).toContain('blow_moulding');
    expect(v).toContain('rotational_moulding');
    expect(r.decision.options.find(o => o.leaning)!.value).toBe('injection_moulding');
  });
});

describe('3. the material is a roto powder, ground', () => {
  it('the menu is the library roto powders (it offered pellet HDPE at £1.05/kg)', () => {
    const q = resinFacts({ ...ctx(geoOf('ROTO_Header_Tank.stp')), answers: {} } as RuleContext).decision!;
    expect(q.options.map(o => o.value)).toEqual(['mat-lldpe-roto', 'mat-hdpe-roto', 'mat-xlpe-roto', 'mat-pp-roto', 'mat-pa12-roto']);
  });
  it('a grinding adder on both paths (headless had none, the screen £0.25/kg)', () => {
    expect(rm(geoOf('ROTO_Header_Tank.stp')).s.powderCostAdderPerKg).toBe(ROTO_GRINDING_GBP_PER_KG);
  });
});

describe('4. the wall is 2·V/S', () => {
  it('header tank 3.99 mm; the fuel tank 4.45 mm, not its 5.04 mm ray mean', () => {
    expect(rm(geoOf('ROTO_Header_Tank.stp')).s.wallThicknessMm).toBe(3.99);
    const t = rm(structuredClone(TANK), 5_000);
    expect(t.s.wallThicknessMm).toBe(4.45);
  });
});

describe('5. the slowest station paces a carousel', () => {
  it('3 arms: oven, cool and load at once — max, not the sum spread over the arms', () => {
    expect(rotoIndexSec(3, 1290, 1742, 240).sec).toBe(1742);
    expect(rotoIndexSec(4, 1290, 1742, 240).sec).toBe(1290);   // two cooling bays
    expect(rotoIndexSec(2, 1175, 1586, 180).sec).toBe(1766);   // shuttle: cool + unload share a bay
    expect(rotoIndexSec(1, 1000, 1350, 180).sec).toBe(2530);
  });
  it('the module charges one arm-load per index', () => {
    const d = computeRotationalMouldingDrivers({
      materialId: 'mat-lldpe-roto', partWeightKg: 0.64, powderCostAdderPerKg: 0.25, numArms: 4, partsPerArm: 4,
      heatingTimeSec: 1078, coolingTimeSec: 1455, loadUnloadTimeSec: 360, indexTimeSec: 1078,
      machineId: 'rotomould-carousel-4arm', labourId: 'lab-uk-roto', oee: 0.8, manning: 2, labourEfficiency: 0.92,
      mouldCost: 7442, mouldLife: 5000, amortizationVolume: 5000, mouldsInService: 4,
    });
    expect(d.operations[0]).toMatchObject({ cycleTimeHr: 1078 / 3600, partsPerCycle: 4 });
  });
  it('the machine follows the arms on both paths (the screen kept its 3-arm default)', () => {
    expect(rm(geoOf('ROTO_Header_Tank.stp')).s.machineId).toBe(rotoMachineFor(4));
  });
});

describe('6. moulds: what the volume needs, not one on every arm', () => {
  it('coolant tank at 5,000/yr: 2.56 moulds → 4 (whole arm-loads of 2), not 8', () => {
    expect(rotoMoulds(5_000, 4, 2, 1290).moulds).toBe(4);
    expect(rm(geoOf('ROTO_Coolant_Tank.stp')).s.mouldsInService).toBe(4);
  });
  it('moulds wear fractionally above one set', () => {
    const d = computeRotationalMouldingDrivers({
      materialId: 'mat-lldpe-roto', partWeightKg: 1, powderCostAdderPerKg: 0, numArms: 3, partsPerArm: 1,
      heatingTimeSec: 1000, coolingTimeSec: 1000, loadUnloadTimeSec: 180, indexTimeSec: 1000, machineId: 'rotomould-biaxial',
      labourId: 'lab-uk-roto', oee: 0.8, manning: 2, labourEfficiency: 0.92, mouldCost: 10_000, mouldLife: 5_000,
      amortizationVolume: 12_000, mouldsInService: 2,
    });
    expect(d.tooling.totalToolingCost).toBeCloseTo(10_000 * 2 * 1.2, 6);
  });
});

describe('7. crew, OEE, scrap, load and labour are rules, the same on both paths', () => {
  it('headless takes them (it had a crew of 1, a 60 s load, no scrap and no grinding)', () => {
    const c = ctx(geoOf('ROTO_Header_Tank.stp'));
    const { analysis } = buildDeterministicAnalysis(ROTATIONAL_MOULDING_RULES, c, 'header');
    const p = toCostParams('rotational_moulding', analysis.costInputSuggestions as never, 5_000, 'plastic', c.geo)!.params;
    expect(p).toMatchObject({
      manning: 2, oee: 0.8, labourEfficiency: 0.92, rejectRate: 0.03, labourId: 'lab-uk-roto',
      loadUnloadTimeSec: 360, indexTimeSec: 1078, mouldsInService: 4, powderCostAdderPerKg: 0.25,
      machineId: 'rotomould-carousel-4arm',
    });
  });
});

describe('8. the parts reconcile', () => {
  // £19.80 / £48.51 since the two-half release test (Oct 2026, docs/cad/dfm-cost-drivers-2026-10.md): the tanks' inside
  // skins (11 faces each) are cavity faces, not undercuts, so `rotoComplexity` no longer scores them "complex" and the
  // mould is priced as the shape it is. Before: £20.63 / £51.62 (and £35.57 / £50.64 before the roto review).
  it('header tank £19.43 and coolant tank £47.63 at 5,000/yr (£19.80 / £48.51 before the UK rate book)', async () => {
    expect((await headless('ROTO_Header_Tank.stp', geoOf('ROTO_Header_Tank.stp'), 5_000)).total).toBeCloseTo(19.43, 2);
    expect((await headless('ROTO_Coolant_Tank.stp', geoOf('ROTO_Coolant_Tank.stp'), 5_000)).total).toBeCloseTo(47.63, 2);
  });
  it('baseline (50,000/yr) records both', () => {
    expect(baseline.find(b => b.part === 'ROTO_Header_Tank.stp')!.outcome.total).toBe(20.13);
    expect(baseline.find(b => b.part === 'ROTO_Coolant_Tank.stp')!.outcome.total).toBe(50.97);
  });
});
