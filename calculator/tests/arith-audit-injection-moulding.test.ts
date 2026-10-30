/**
 * Arithmetic audit — injection moulding (30 Oct 2026, docs/review/arith-audit/injection-moulding.md).
 *
 * Each block failed before its fix: a resin read as the wrong polymer by a substring, the purge scaled by the reject
 * uplift, a maintenance basis that printed "5 years" whatever the programme, cavitation figures ranked at conventions
 * the costing does not charge, resins every datasheet dries left undried, and fallbacks taken silently.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runCostInputRules } from '../src/engine/cost-input-rules/engine.js';
import { INJECTION_MOULDING_RULES } from '../src/engine/cost-input-rules/commodities/injection-moulding.js';
import {
  autoCoolFactorForMaterial, thermodynamicCoolFactor, computeInjectionMouldingDrivers,
} from '../src/engine/modules/injection-moulding.js';
import { cavityPressureMPaFor, cavityPressureBasis } from '../src/engine/cost-input-rules/derive/resin.js';
import { toCostParams } from '../src/engine/cost-input-rules/to-cost-params.js';
import { costMeasuredPart } from '../server/services/bulk-run.js';
import { DEFAULT_RATE_LIBRARY, recomputeMachineRates } from '../src/engine/rate-library.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';

const baseline = JSON.parse(readFileSync(new URL('./fixtures/real-parts-baseline.json', import.meta.url), 'utf8')) as
  Array<{ part: string; geometry: OCCTGeometry }>;
const geoOf = (p: string) => baseline.find(b => b.part === p)!.geometry;
const ctx = (resin: string, programmeYears?: number, part = 'IM_ECU_Cover.stp'): RuleContext => ({
  geo: geoOf(part), geometryQuality: 'occt', commodity: 'injection_moulding', commoditySource: 'engineer',
  annualVolume: 50_000, filename: part,
  answers: { 'material.resin': resin, 'commodity.thinWallRoute': 'injection_moulding' },
  ...(programmeYears ? { programmeYears } : {}),
} as RuleContext);

describe('IM-1 a resin is read as its own polymer, not by a substring', () => {
  it('GPPS (crystal polystyrene) is polystyrene, not PPS', () => {
    expect(autoCoolFactorForMaterial('mat-gpps')).toBe(2.0);
    const t = thermodynamicCoolFactor('mat-gpps')!;
    expect([t.meltC, t.mouldC, t.ejectC]).toEqual([220, 45, 85]);
    expect(cavityPressureMPaFor('mat-gpps')).toBe(45);
  });
  it('PCR PP (recycled polypropylene) is polypropylene, not polycarbonate', () => {
    expect(autoCoolFactorForMaterial('mat-pcr-pp')).toBe(3.16);
    const t = thermodynamicCoolFactor('mat-pcr-pp')!;
    expect([t.meltC, t.mouldC, t.ejectC]).toEqual([230, 40, 85]);
  });
  it('the real PPS, PC and PC blends keep their own figures', () => {
    expect(autoCoolFactorForMaterial('mat-pps-gf40')).toBe(2.4);
    expect(cavityPressureMPaFor('mat-pps-gf40')).toBe(80);
    expect(autoCoolFactorForMaterial('mat-pc')).toBe(2.5);
    expect(autoCoolFactorForMaterial('mat-pc-glazing')).toBe(2.5);
    expect(autoCoolFactorForMaterial('mat-pc-abs')).toBe(2.2);
  });
  it('the cavity-pressure basis is arithmetic that gives the value', () => {
    expect(cavityPressureBasis('mat-pa66gf30')).toBe('55 MPa for the base resin + 10 MPa for glass / mineral fill = 65 MPa');
  });
});

describe('IM-2 the purge is per mould change, not per part made', () => {
  it('gross per good part = (part + runner waste) ÷ (1 − reject) + purge ÷ batch', () => {
    const d = computeInjectionMouldingDrivers({
      materialId: 'mat-pp', partWeightKg: 0.1, runnerWeightKg: 0, regrindFraction: 0, runnerSystem: 'hot', cavities: 1,
      projectedAreaCm2: 100, cavityPressureMPa: 35, wallThicknessMm: 2, coolTimeFactorSPerMm2: 3, fillTimeSec: 1,
      packTimeSec: 1, ejectTimeSec: 1, machineId: 'imm-200t', labourId: 'lab-uk-semiskilled', oee: 1, manning: 1,
      labourEfficiency: 1, mouldCost: 1000, mouldLife: 1e6, amortizationVolume: 1000, rejectRate: 0.5,
      setup: { hoursPerChange: 1, batchSize: 1000, setterLabourId: 'lab-uk-technician', purgeKg: 10 },
    });
    const gross = d.rawMaterial.netWeightKg / d.rawMaterial.materialUtilization;
    expect(d.rawMaterial.netWeightKg).toBeCloseTo(0.2, 10);
    expect(gross).toBeCloseTo(0.1 * 2 + 10 / 1000, 10);   // was (0.1 + 0.01) × 2 = 0.22
  });
});

describe('IM-3 the maintenance basis states the years the costing charges', () => {
  const basis = (c: RuleContext) => String(runCostInputRules(INJECTION_MOULDING_RULES, c).provenance['imm-maint']!.basis);
  it('a 3-year programme: three years, not "5 years on a 5-year programme"', () => {
    expect(basis(ctx('mat-pa66gf30', 3))).toContain('each of the 3 year(s)');
    expect(basis(ctx('mat-pa66gf30', 3))).not.toContain('5-year');
  });
  it('no programme life: one year, as to-cost-params charges it', () => {
    expect(basis(ctx('mat-pa66gf30'))).toContain('each of the 1 year(s)');
  });
});

describe('IM-4 the cavitation £/part printed for the chosen row is the costing\'s', () => {
  it.each(['IM_ECU_Cover.stp', 'IM_Cable_Clip.stp', 'IM_Storage_Tray.stp'])('%s', async (part) => {
    const answers = { 'material.resin': part === 'IM_Storage_Tray.stp' ? 'mat-pp-impact' : 'mat-pa66gf30',
      'commodity.route': 'injection_moulding', 'commodity.thinWallRoute': 'injection_moulding' };
    const r = await costMeasuredPart(geoOf(part), part, { partNumber: part, file: part, annualVolume: 50_000 },
      answers, 'UK', { annualVolume: 50_000, programmeYears: 5 }, recomputeMachineRates(DEFAULT_RATE_LIBRARY),
      { partNumber: part, file: part, status: 'error' } as never) as never as {
        provenance: Record<string, { value: unknown; basis: string }>;
        trace: { operations: Array<{ operationName: string; processCost: number; labourCost: number }>;
          result: { breakdown: { tooling: number } } } };
    const n = r.provenance['imm-cav'].value as number;
    const printed = Number(new RegExp(`→ ${n}-up`).test(r.provenance['imm-cav'].basis)
      && new RegExp(`${n}-up £([\\d.]+)/part`).exec(r.provenance['imm-cav'].basis)![1]);
    const op = r.trace.operations.find(o => o.operationName === 'Injection Moulding')!;
    expect(printed).toBeCloseTo(op.processCost + op.labourCost + r.trace.result.breakdown.tooling, 4);
  });
});

describe('IM-5 resins every datasheet dries are dried', () => {
  it.each(['mat-psu', 'mat-ppsu', 'mat-pla'])('%s', (resin) => {
    const p = runCostInputRules(INJECTION_MOULDING_RULES, ctx(resin, 5)).provenance['imm-dry-kwh'];
    expect(p?.value).toBe(0.15);
  });
});

describe('IM-6 a fallback the mapper takes is named', () => {
  it('no wall, area, cycle or life from the rules → each listed as assumed', () => {
    const r = toCostParams('injection_moulding',
      { materialId: 'mat-pp', netWeightKg: 0.1, injectionMoulding: { regrindFraction: 0.2 } } as never, 50_000)!;
    for (const w of ['wallThicknessMm 3 mm', 'projectedAreaCm2 100 cm²', 'coolTimeFactorSPerMm2 3.16 (PP)', 'packTimeSec 6 s', 'mouldLife 1,000,000 shots']) {
      expect(r.assumed.some(a => a.startsWith(w))).toBe(true);
    }
  });
});
