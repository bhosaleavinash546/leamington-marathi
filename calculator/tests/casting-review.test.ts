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
import { CAST_AND_MACHINE_RULES, drilledStockCm3 } from '../src/engine/cost-input-rules/commodities/cast-and-machine.js';
import { executeCalculateCost } from '../server/services/cost-executor.js';
import { buildRegionalLibrary } from '../src/engine/regional-rates.js';
import { MELT_SHOP } from '../src/engine/casting-melt.js';
import { toCostParams, SHOP_DEFAULTS } from '../src/engine/cost-input-rules/to-cost-params.js';
import { adviseCastingProcess } from '../src/engine/modules/casting-advisor.js';
import { secondaryMachiningMachineId } from '../src/engine/feature-machining.js';
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
  it('buys the good part plus the dross lost remelting gating and rejects — not the whole pour less a scrap credit', () => {
    const d = computeCastingDrivers(BASE);
    const pour = 2.512 / 0.97 / 0.65;
    const lost = (pour - 2.512) * meltFactsFor('mat-gs-c25')!.lossFraction;
    expect(d.rawMaterial.netWeightKg).toBeCloseTo(2.512, 10);
    expect(d.rawMaterial.materialUtilization).toBeCloseTo(2.512 / (2.512 + lost), 10);
  });

  it('was £2.62 a part dearer on the Casting Bracket when gating and rejects went to the scrap yard', () => {
    const now = stack(computeCastingDrivers({ ...BASE, melt: { energyKwhPerKg: 0 }, sand: { ...BASE.sand!, coreCostPerPart: 0 } }));
    const old = stack(computeCastingDrivers({ ...BASE, melt: { lossFraction: 1, energyKwhPerKg: 0 }, sand: { ...BASE.sand!, coreCostPerPart: 0 } }));
    // Gating and the 3% rejects, both remelted: £2.62 of metal on the bracket.
    expect(old.breakdown.rawMaterial - now.breakdown.rawMaterial).toBeCloseTo(2.62, 1);
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
    expect(c.shotBlastCostPerPart).toBe(0.19);   // 2.5 kg ÷ 600 kg/h × (blast + operator)
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

// ── Second pass ────────────────────────────────────────────────────────────

describe('A. rejected castings are remelted, like the gating', () => {
  it('a higher reject rate costs melt, processing and consumables — not a whole casting of metal', () => {
    const lo = stack(computeCastingDrivers({ ...BASE, rejectRate: 0.03 }));
    const hi = stack(computeCastingDrivers({ ...BASE, rejectRate: 0.10 }));
    const metalOnly = (r: typeof lo) => r.breakdown.rawMaterial;
    // 7 points more scrap would add ~£0.38 of metal if rejects were bought
    // outright; remelted, the metal moves by the dross alone.
    const d = computeCastingDrivers({ ...BASE, rejectRate: 0.10 });
    expect(d.rawMaterial.netWeightKg).toBeCloseTo(2.512, 10);
    expect(metalOnly(hi)).toBeGreaterThan(metalOnly(lo));
  });
});

describe('B. melt energy is priced at the region the part is costed in', () => {
  it('a regional library melts at its own tariff, not the UK\'s', () => {
    const cnLib = buildRegionalLibrary(DEFAULT_RATE_LIBRARY, 'CN');
    const cnTariff = cnLib.energy[0].electricityPerKwh;
    const ukTariff = DEFAULT_RATE_LIBRARY.energy[0].electricityPerKwh;
    expect(cnTariff).not.toBe(ukTariff);
    const atRegion = executeCalculateCost({ commodity: 'casting', params: BASE, rateLibrary: cnLib } as never);
    const atUk = executeCalculateCost({ commodity: 'casting', params: { ...BASE, melt: { energyPricePerKwh: ukTariff } }, rateLibrary: cnLib } as never);
    const pour = 2.512 / 0.97 / 0.65;
    const kwh = meltFactsFor('mat-gs-c25')!.energyKwhPerKg;
    expect(atUk.breakdown.rawMaterial - atRegion.breakdown.rawMaterial).toBeCloseTo(pour * kwh * (ukTariff - cnTariff), 4);
  });
});

describe('C. a sand line is run by a crew', () => {
  it('manning 4 on sand, 1 on a die-casting cell', () => {
    const sand = runCostInputRules(CAST_AND_MACHINE_RULES, ctxOf('Casting_Braket.stp', ANSWERS));
    expect((sand.suggestions.casting as Record<string, number>).manning).toBe(4);
    const grav = runCostInputRules(CAST_AND_MACHINE_RULES, ctxOf('PRCR002.stp', { ...ANSWERS, 'material.family': 'aluminium' }));
    expect((grav.suggestions.casting as Record<string, number>).manning).toBe(1);
  });
});

describe('D. the melt shop has labour and the sand has a cost', () => {
  it('melt-shop labour on every kg poured, at the furnace-operator rate', () => {
    const d = computeCastingDrivers(BASE);
    const op = d.operations.find(o => /Melt shop/.test(o.operationName))!;
    expect(op.labourId).toBe('lab-uk-furnace');
    expect(op.labourTimeHr).toBeCloseTo(2.512 / 0.97 / 0.65 / 1000 * MELT_SHOP.labourHrPerTonnePoured, 8);
  });
});

describe('E. the as-cast weight carries the holes drilled from solid', () => {
  it('Casting Bracket: finished + drilled-hole stock + face machining stock, measured from the feature table', () => {
    const stock = drilledStockCm3(ctxOf('Casting_Braket.stp', ANSWERS));
    expect(stock.holes).toBeGreaterThan(0);
    const r = runCostInputRules(CAST_AND_MACHINE_RULES, ctxOf('Casting_Braket.stp', ANSWERS));
    const cast = (r.suggestions.casting as Record<string, number>).castPartWeightKg;
    // Machining review: the 8 machined faces (181.7 cm²) carry 3 mm a side in a
    // sand steel casting — 54.5 cm³ the second casting pass left "not measured".
    expect(cast).toBeCloseTo(2.512 + (stock.cm3 + 54.5) * 0.00785, 2);
    expect(r.provenance['cam-cast-wt'].basis).toContain('3 mm a side on the machined faces');
  });
});

describe('F. investment castings are poured as a tree', () => {
  it('a 0.3 kg steel part shares a 20 kg tree with 30 others', () => {
    const geo = { ...geoOf('Casting_Braket.stp'), volume: { mm3: 38_217, cm3: 38.217 } } as OCCTGeometry;
    const r = runCostInputRules(CASTING_RULES, { ...ctxOf('Casting_Braket.stp',
      { ...ANSWERS, 'service.toleranceClass': 'tight' }, 'casting'), geo });
    const c = r.suggestions.casting as Record<string, unknown>;
    expect(c.subtype).toBe('investment');
    expect(c.cycleTimeSandGravHr).toBeCloseTo(0.40 / 30, 4);   // was 0.40 h a part
  });
});

describe('G. shot blast scales with the casting', () => {
  it('a heavier casting blasts for proportionally more', () => {
    const small = runCostInputRules(CAST_AND_MACHINE_RULES, ctxOf('Casting_Braket.stp', ANSWERS));
    const big = runCostInputRules(CAST_AND_MACHINE_RULES, ctxOf('PRCR002.stp', ANSWERS));   // 8.1 kg in steel
    const s = (small.suggestions.casting as Record<string, number>).shotBlastCostPerPart;
    const b = (big.suggestions.casting as Record<string, number>).shotBlastCostPerPart;
    expect(b / s).toBeGreaterThan(2.5);
  });
});

describe('H. pressure-tight castings are leak tested', () => {
  it('45 s on the leak rig, as an operation', () => {
    const r = runCostInputRules(CASTING_RULES, ctxOf('PRCR002.stp',
      { ...ANSWERS, 'material.family': 'aluminium', 'service.pressureTight': 'yes' }, 'casting'));
    expect((r.suggestions.casting as Record<string, number>).leakTestSec).toBe(45);
    const d = computeCastingDrivers({ ...BASE, leakTestSec: 45 });
    expect(d.operations.some(o => /Leak test/.test(o.operationName) && o.machineId === 'extrusion-leak-test')).toBe(true);
  });
});

describe('I. plain casting: finish machining is costed the same on screen and headless', () => {
  it('a VMC once a face is milled (a drill cannot face-mill), a machinist, and no invented NRE', () => {
    const g = geoOf('Casting_Braket.stp');
    expect(secondaryMachiningMachineId(g.featureTable as never, 'near_net')).toBe('mach-vmc3');
    expect(secondaryMachiningMachineId([{ kind: 'hole', diaMm: 8, depthMm: 10, count: 2 }] as never, 'near_net')).toBe('mach-drill');
    const m = toCostParams('casting', {
      materialId: 'mat-gs-c25', netWeightKg: 2.512,
      casting: { subtype: 'sand', yieldFraction: 0.53, dieMouldCostGBP: 1, dieMouldLife: 1, cavities: 1, cycleTimeHpdcSec: 0, cycleTimeSandGravHr: 0.01 },
    } as never, 50_000, 'steel', g)!;
    const ops = m.params.secondaryMachiningOps as Array<{ machineId: string; labourId: string }>;
    expect(ops.every(o => o.machineId === 'mach-vmc3' && o.labourId === 'lab-uk-skilled')).toBe(true);
    // Fixtures + programming are derived now, from the fixturings and features
    // (forging review) — the cell the screen prices too, not an invented £15k.
    expect(m.params.secondaryMachiningToolingCost).toBeGreaterThan(0);
    expect(m.params.secondaryMachiningToolingCost).toBeLessThan(15_000);
  });
});
