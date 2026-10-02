/**
 * The casting review, 2 Oct 2026 — one test per finding.
 *
 * A cost engineering director found the casting model wrong. Read end to end
 * against the real CAD in cad-audit/parts, the arithmetic engine added up; the
 * inputs and the structure did not. Each block below pins one fix, with the
 * number it used to produce. docs/cad/casting-review-2026-10.md has the trace.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeCastingDrivers, type CastingInputs } from '../src/engine/modules/casting.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import { meltFactsFor, castingAlloyOf } from '../src/engine/casting-melt.js';
import { ukElectricityPerKwh } from '../src/engine/uk-tariff.js';
import { runCostInputRules } from '../src/engine/cost-input-rules/engine.js';
import { CASTING_RULES, sandImpressions, castingSectionMm } from '../src/engine/cost-input-rules/commodities/casting.js';
import { CAST_AND_MACHINE_RULES } from '../src/engine/cost-input-rules/commodities/cast-and-machine.js';
import { toCostParams, SHOP_DEFAULTS } from '../src/engine/cost-input-rules/to-cost-params.js';
import { adviseCastingProcess } from '../src/engine/modules/casting-advisor.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';

const BASE: CastingInputs = {
  subtype: 'sand', materialId: 'mat-gs-c25', partWeightKg: 2.512, castingYield: 0.65, rejectRate: 0.03,
  labourId: 'lab-uk-foundry', oee: 0.8, manning: 1, labourEfficiency: 0.92, amortizationVolume: 50_000,
  sand: { mouldLineId: 'sand-cast-line', cycleTimeHr: 0.0083, patternCost: 4253, patternLife: 8000, coreCostPerPart: 1.5 },
};
const stack = (d: ReturnType<typeof computeCastingDrivers>) => computeUniversalStack(
  { partName: 'x', ...d, overheadPct: 0, marginPct: 0, packagingPerPart: 0, logisticsPerPart: 0 } as never,
  DEFAULT_RATE_LIBRARY);

const baseline = JSON.parse(readFileSync(new URL('./fixtures/real-parts-baseline.json', import.meta.url), 'utf8')) as
  Array<{ part: string; geometry: OCCTGeometry }>;
const geoOf = (part: string) => baseline.find(b => b.part === part)!.geometry;
const ANSWERS = {
  'material.family': 'steel', 'commodity.route': 'cast_and_machine', 'service.pressureTight': 'no',
  'service.toleranceClass': 'standard', 'service.safetyCritical': 'no',
};
const ctxOf = (part: string, answers: Record<string, string>, commodity = 'cast_and_machine'): RuleContext => ({
  geo: geoOf(part), geometryQuality: 'occt', commodity, commoditySource: 'engineer',
  annualVolume: 50_000, filename: part, answers,
} as RuleContext);

describe('1. runners and risers are remelted, not sold as scrap', () => {
  it('buys the part plus the dross lost on the gating — not the whole pour less a scrap credit', () => {
    const d = computeCastingDrivers(BASE);
    const net = 2.512 / 0.97;
    const lost = (net / 0.65 - net) * meltFactsFor('mat-gs-c25')!.lossFraction;
    expect(d.rawMaterial.materialUtilization).toBeCloseTo(net / (net + lost), 10);
  });

  it('was £2.47 a part dearer on the Casting Bracket when the gating went to the scrap yard', () => {
    const now = stack(computeCastingDrivers({ ...BASE, melt: { energyKwhPerKg: 0 }, sand: { ...BASE.sand!, coreCostPerPart: 0 } }));
    const old = stack(computeCastingDrivers({ ...BASE, melt: { lossFraction: 1, energyKwhPerKg: 0 }, sand: { ...BASE.sand!, coreCostPerPart: 0 } }));
    expect(old.breakdown.rawMaterial - now.breakdown.rawMaterial).toBeCloseTo(2.47, 1);
  });
});

describe('2. melting is charged on every kg poured', () => {
  it('pour × kWh/kg × the library tariff, in the material line', () => {
    const on = computeCastingDrivers(BASE);
    const off = computeCastingDrivers({ ...BASE, melt: { energyKwhPerKg: 0 } });
    const pour = 2.512 / 0.97 / 0.65;
    expect((on.rawMaterial.consumablesCostPerPart ?? 0) - (off.rawMaterial.consumablesCostPerPart ?? 0))
      .toBeCloseTo(pour * 0.70 * ukElectricityPerKwh(), 6);
  });

  it('knows the alloy behind every casting grade the rules pick', () => {
    for (const id of ['mat-gs-c25', 'mat-adc12', 'mat-lm25', 'mat-gjl250', 'mat-gjs400', 'mat-mag-az91', 'mat-bronze-c905', 'mat-zamak3', 'mat-ss304-cast']) {
      expect(castingAlloyOf(id), id).not.toBeNull();
    }
    expect(castingAlloyOf('mat-gs-c25')).toBe('carbon-steel');
    expect(castingAlloyOf('mat-gjs400')).toBe('ductile-iron');
    expect(castingAlloyOf('mat-ss304-cast')).toBe('stainless-steel');
  });
});

describe('3. the sand line is timed per mould, shared by its impressions', () => {
  it('fits four Casting Brackets in a 500 × 400 flask and charges ~30 s of line time each', () => {
    const r = runCostInputRules(CAST_AND_MACHINE_RULES, ctxOf('Casting_Braket.stp', ANSWERS));
    const c = r.suggestions.casting as Record<string, number>;
    expect(c.subtype).toBe('sand');
    expect(c.cycleTimeSandGravHr).toBe(0.0083);  // was 0.1846 h — 11 minutes of line time a part
  });

  it('packs impressions either way round and never fewer than one fit', () => {
    expect(sandImpressions([133, 120])).toBe(4);
    expect(sandImpressions([400, 300])).toBe(1);
    expect(sandImpressions([600, 500])).toBe(0);  // floor-moulded
  });
});

describe('4. the route the screen printed is now the route that is costed', () => {
  it('a steel sand casting is fettled, normalised and blasted', () => {
    const r = runCostInputRules(CAST_AND_MACHINE_RULES, ctxOf('Casting_Braket.stp', ANSWERS));
    const c = r.suggestions.casting as Record<string, number>;
    expect(c.fettlingMinutes).toBe(6);
    expect(c.heatTreatCostPerKg).toBe(0.35);
    expect(c.shotBlastCostPerPart).toBe(0.35);
    expect(c.ndtCostPerPart).toBe(0);
  });

  it('fettling is foundry labour on a bench, not material', () => {
    const d = computeCastingDrivers({ ...BASE, fettlingMinutes: 6 });
    const op = d.operations.find(o => /Fettling/.test(o.operationName))!;
    expect(op.benchOperation).toBe(true);
    expect(op.labourTimeHr).toBeCloseTo(6 / 60 / 0.97, 6);
  });

  it('safety-critical adds radiography; pressure-tight aluminium adds impregnation', () => {
    const r = runCostInputRules(CASTING_RULES, ctxOf('PRCR002.stp',
      { ...ANSWERS, 'material.family': 'aluminium', 'service.safetyCritical': 'yes', 'service.pressureTight': 'yes' }, 'casting'));
    const c = r.suggestions.casting as Record<string, number>;
    expect(c.ndtCostPerPart).toBe(5);
    expect(c.impregnationCostPerPart).toBe(0.9);
  });
});

describe('5–6. process choice and HPDC shot time read the casting section, not ray-cast artefacts', () => {
  const al = { ...ANSWERS, 'material.family': 'aluminium' };

  it('PRCR002 has a 15 mm section — gravity, not "thin-wall" HPDC off a 0.45 mm fillet edge', () => {
    expect(castingSectionMm(ctxOf('PRCR002.stp', al))).toBeCloseTo(15.1, 1);
    expect(geoOf('PRCR002.stp').wallThickness?.minMm).toBe(0.45);
    const r = runCostInputRules(CAST_AND_MACHINE_RULES, ctxOf('PRCR002.stp', al));
    expect((r.suggestions.casting as Record<string, unknown>).subtype).toBe('gravity');
  });

  it('a genuinely thin section still goes HPDC', () => {
    const rec = adviseCastingProcess({ annualVolume: 60_000, partWeightKg: 2.8, minWallThicknessMm: 0.4, sectionMm: 3,
      complexity: 'medium', alloyFamily: 'aluminium' });
    expect(rec.process).toBe('hpdc');
  });

  it('the aluminium grade follows the process: A356/LM25 for gravity, ADC12 only for HPDC', () => {
    const r = runCostInputRules(CAST_AND_MACHINE_RULES, ctxOf('PRCR002.stp', al));
    expect((r.suggestions as Record<string, unknown>).materialId ?? (r.suggestions.casting as Record<string, unknown>).materialId)
      .toBe('mat-lm25');
  });
});

describe('7. tooling from the toolmaker build-up, not £10,000 per undercut face', () => {
  it('PRCR002: the kernel said £300,000 (its cap); the shop model is an order of magnitude below', () => {
    const r = runCostInputRules(CAST_AND_MACHINE_RULES, ctxOf('PRCR002.stp', { ...ANSWERS, 'material.family': 'aluminium' }));
    const die = (r.suggestions.casting as Record<string, number>).dieMouldCostGBP;
    expect(die).toBeLessThan(60_000);
    expect(r.provenance['cam-hpdc-die-cost'].basis).toContain('£80,000 (not used)');
  });
});

describe('8. alloy-specific yield', () => {
  it('a steel sand casting yields 0.53, not the process midpoint 0.65', () => {
    const r = runCostInputRules(CAST_AND_MACHINE_RULES, ctxOf('Casting_Braket.stp', ANSWERS));
    expect((r.suggestions.casting as Record<string, number>).yieldFraction).toBe(0.53);
  });
});

describe('9. screen and headless use the same foundry labour', () => {
  it('the rule writes the id toCostParams uses', () => {
    const r = runCostInputRules(CASTING_RULES, ctxOf('Casting_Braket.stp', ANSWERS, 'casting'));
    const params = toCostParams('casting', {
      materialId: 'mat-gs-c25', netWeightKg: 2.5,
      casting: { subtype: 'sand', yieldFraction: 0.53, dieMouldCostGBP: 1, dieMouldLife: 1, cavities: 1, cycleTimeHpdcSec: 0, cycleTimeSandGravHr: 0.01 },
    } as never, SHOP_DEFAULTS.annualVolume)!;
    expect((r.suggestions.casting as Record<string, unknown>).labourId).toBe(params.params.labourId);
  });
});

describe('10. HPDC press from the clamp force, not mass × 220', () => {
  it('sizes from projected area × intensification pressure', () => {
    const geo = { ...geoOf('PRCR002.stp'), volume: { mm3: 1_037_000, cm3: 1037 }, surfaceArea: { mm2: 691_333, cm2: 6913 } } as OCCTGeometry;
    const r = runCostInputRules(CASTING_RULES, { ...ctxOf('PRCR002.stp', { ...ANSWERS, 'material.family': 'aluminium' }, 'casting'), geo });
    const c = r.suggestions.casting as Record<string, unknown>;
    expect(c.subtype).toBe('hpdc');
    expect(c.hpdcMachineId).toBe('hpdc-500t');
    expect(r.provenance['cast-hpdc-mach'].basis).toContain('0.8 t/cm²');
  });
});
