/**
 * The rubber review, 2 Oct 2026 — one test per finding.
 *
 * Traced on three rubber parts modelled in OCP (cad-audit/parts/
 * RUB_modelled_parts.py — not customer parts): an EPDM grommet, a natural-rubber
 * mount block and a 1 m EPDM door-seal profile. docs/cad/rubber-review-2026-10.md.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runCostInputRules } from '../src/engine/cost-input-rules/engine.js';
import {
  RUBBER_RULES, extrusionProfile, cureSectionMm, cavitiesFor,
} from '../src/engine/cost-input-rules/commodities/rubber.js';
import { inferCommodity } from '../src/engine/cost-input-rules/derive/commodity.js';
import { buildDeterministicAnalysis } from '../src/engine/cost-input-rules/deterministic.js';
import { toCostParams } from '../src/engine/cost-input-rules/to-cost-params.js';
import { estimateRubberCureTimeSec, RUBBER_THERMAL_DIFFUSIVITY_MM2_S } from '../src/engine/modules/rubber-advisor.js';
import { computeRubberDrivers } from '../src/engine/modules/rubber.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';

const baseline = JSON.parse(readFileSync(new URL('./fixtures/real-parts-baseline.json', import.meta.url), 'utf8')) as
  Array<{ part: string; geometry: OCCTGeometry; outcome: { total?: number; commodity?: string } }>;
const geoOf = (p: string) => baseline.find(b => b.part === p)!.geometry;
const ctx = (part: string, compound = 'mat-epdm', annualVolume = 50_000): RuleContext => ({
  geo: geoOf(part), geometryQuality: 'occt', commodity: 'rubber', commoditySource: 'engineer', annualVolume, filename: part,
  answers: { 'material.elastomer': compound, 'commodity.route': 'rubber' },
} as RuleContext);
const rub = (part: string, compound = 'mat-epdm', vol = 50_000) =>
  runCostInputRules(RUBBER_RULES, ctx(part, compound, vol)).suggestions.rubber as Record<string, number | string>;

describe('1. liquid silicone only goes to the LSR machine', () => {
  it('an EPDM grommet at 500k/yr is transfer moulded, not "injection_mould_lsr"', () => {
    expect(rub('RUB_Grommet.stp', 'mat-epdm', 500_000).process).not.toBe('injection_mould_lsr');
    expect(rub('RUB_Grommet.stp', 'mat-lsr', 500_000).process).toBe('injection_mould_lsr');
  });
});

describe('2. an extruded profile is extruded', () => {
  it('the door seal: constant 1.29 cm² section over 1 m → extrusion, cured in line', () => {
    expect(extrusionProfile(ctx('RUB_Door_Seal.stp'))).toMatchObject({ lengthMm: 1000 });
    const r = rub('RUB_Door_Seal.stp');
    expect(r.process).toBe('extrusion_vulcanise');
    expect(r.cycleTimeSec).toBe(5);                     // 1 m ÷ 12 m/min
    expect(r.cureOvenMachineId).toBe('cure-oven-rubber');
    expect(extrusionProfile(ctx('RUB_Grommet.stp'))).toBeNull();
  });
});

describe('3. the cure section is the governing section, not the ray-cast max', () => {
  it('door seal 4.6 mm (the ray max read 18 mm); grommet 6.4 mm (no ray reading blocked it)', () => {
    expect(cureSectionMm(ctx('RUB_Door_Seal.stp'))!.mm).toBeLessThan(5);
    expect(cureSectionMm(ctx('RUB_Grommet.stp'))!.mm).toBeCloseTo(6.4, 1);
    expect(rub('RUB_Grommet.stp').cycleTimeSec).toBeGreaterThan(0);
  });
});

describe('4. heat penetration is slab conduction', () => {
  it('(t)² ÷ (4α) with α 0.1 mm²/s — 2.5 s/mm², not an unsourced 4', () => {
    const t = 25;
    const diff = estimateRubberCureTimeSec({ compoundFamily: 'nr', thicknessMm: t })
      - estimateRubberCureTimeSec({ compoundFamily: 'nr', thicknessMm: 0.3 });
    expect(diff).toBeCloseTo((t * t - 0.09) / (4 * RUBBER_THERMAL_DIFFUSIVITY_MM2_S), -1);
  });
});

describe('5. cavities are chosen on cost', () => {
  it('a 50k/yr grommet runs many-up, not the old 8-up cap', () => {
    expect(Number(rub('RUB_Grommet.stp').cavities)).toBeGreaterThan(8);
  });
  it('never fewer than the press needs, never more than the platen holds', () => {
    const c = cavitiesFor('transfer_mould', 35, 1700, 100_000,
      { pressPerHrGBP: 30, toolGBP: k => 6000 + 2000 * k ** 0.9 });
    expect(c.n).toBeGreaterThanOrEqual(Math.ceil(100_000 * 1700 / (4000 * 3600 * 0.8)));
    expect(c.n).toBeLessThanOrEqual(Math.floor(1500 / (35 * 2.5)));
  });
});

describe('6. crew, OEE, scrap, press, deflash, post-cure and mould change are rules on both paths', () => {
  it('headless takes them', () => {
    const c = ctx('RUB_Grommet.stp');
    const { analysis } = buildDeterministicAnalysis(RUBBER_RULES, c, 'grommet');
    const p = toCostParams('rubber', analysis.costInputSuggestions as never, 50_000, null, c.geo)!.params as Record<string, unknown>;
    expect(p).toMatchObject({ machineId: 'transfer-mould-std', manning: 0.5, oee: 0.8, labourEfficiency: 0.92,
      rejectRate: 0.03, deflashCycleSec: 5, labourId: 'lab-uk-semiskilled' });
    expect(p.setup).toMatchObject({ hoursPerChange: 1.5 });
  });
  it('FKM is post-cured; EPDM is not', () => {
    expect(rub('RUB_Grommet.stp', 'mat-viton-fkm').postCureHours).toBe(4);
    expect(rub('RUB_Grommet.stp').postCureHours).toBe(0);
  });
  it('deflash with no machine is a bench task — labour, no press time', () => {
    const d = computeRubberDrivers({
      materialId: 'mat-epdm', partWeightKg: 0.01, flashAndRunnerWeightKg: 0, process: 'transfer_mould',
      machineId: 'transfer-mould-std', labourId: 'lab-uk-semiskilled', cycleTimeSec: 300, cavities: 8,
      oee: 0.8, manning: 0.5, labourEfficiency: 0.92, mouldCost: 10_000, mouldLife: 500_000, amortizationVolume: 50_000,
      deflashCycleSec: 5, deflashLabourId: 'lab-uk-semiskilled',
    });
    const op = d.operations.find(o => o.operationName.startsWith('Deflash'))!;
    expect(op.benchOperation).toBe(true);
    expect(op.cycleTimeHr).toBe(0);
  });
  it('mould sets are fractional, not rounded up inside a year', () => {
    const d = computeRubberDrivers({
      materialId: 'mat-epdm', partWeightKg: 0.01, flashAndRunnerWeightKg: 0, process: 'transfer_mould',
      machineId: 'transfer-mould-std', labourId: 'lab-uk-semiskilled', cycleTimeSec: 300, cavities: 1,
      oee: 0.8, manning: 0.5, labourEfficiency: 0.92, mouldCost: 10_000, mouldLife: 30_000, amortizationVolume: 50_000,
    });
    expect(d.tooling.totalToolingCost).toBeCloseTo(10_000 * 50_000 / 30_000, 0);
  });
});

describe('7. a moulded part is not cured twice', () => {
  it('the separate cure is 0 for a moulded part — the mould cure is the cycle', () => {
    expect(rub('RUB_AV_Mount.stp', 'mat-nr').cureTimeSec).toBe(0);
  });
});

describe('8. inserts are asked, not counted from bosses', () => {
  it('a rubber part has 0 inserts unless the engineer says', () => {
    expect(rub('RUB_Grommet.stp').metalInserts).toBe(0);
  });
});

describe('9. rubber is a route the engineer can answer', () => {
  it('the route question accepts rubber; a part named EPDM is offered it', () => {
    const v = inferCommodity(ctx('RUB_Grommet.stp'));
    expect(v.commodity).toBe('rubber');
  });
  it('all three modelled parts cost as rubber in the baseline', () => {
    for (const p of ['RUB_Grommet.stp', 'RUB_AV_Mount.stp', 'RUB_Door_Seal.stp']) {
      expect(baseline.find(b => b.part === p)!.outcome.commodity).toBe('rubber');
    }
  });
});
