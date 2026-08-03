/**
 * Forging cost inputs, derived deterministically.
 *
 * Forging already had a complete parametric advisor suite — process selection,
 * die-fill tonnage, die cost, alloy-keyed die life, heating energy, secondary
 * adders. All of it was reachable from the browser only when the model returned
 * nothing. These tests pin it running first, and pin the two constants it
 * replaces: a flat 0.90 yield and a flat 20,000 die life.
 */
import { describe, it, expect } from 'vitest';
import { runCostInputRules, renderCommodityRulesPrompt } from '../src/engine/cost-input-rules/engine.js';
import {
  FORGING_RULES, yieldFractionFor, shapeComplexity, dieSteelFor,
} from '../src/engine/cost-input-rules/commodities/forging.js';
import { isRingShape } from '../src/engine/cost-input-rules/derive/envelope.js';
import { MATERIAL_FAMILY_DECISION_ID, toForgingAlloyFamily } from '../src/engine/cost-input-rules/derive/material.js';
import {
  TOLERANCE_CLASS_DECISION_ID, SAFETY_CRITICAL_DECISION_ID,
} from '../src/engine/cost-input-rules/derive/service-context.js';
import {
  FORGING_PROCESS_REFERENCE, FORGING_DIE_LIFE_BASE,
  estimateForgingDieCost, estimateForgingDieLife, estimateForgingTonnage,
} from '../src/engine/modules/forging-advisor.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';

/**
 * Stub axle PRCR002 from docs/cad-to-cost-learnings.md — a forged steel part of
 * 8.14 kg that the tool first costed at £41.97 as 2.8 kg of aluminium against a
 * manual ~£30. 1,037 cm³ of steel is 8.14 kg.
 */
const STUB_AXLE = {
  status: 'success',
  partName: 'stub axle',
  boundingBox: { xMm: 260, yMm: 180, zMm: 180 },
  volume: { mm3: 1_037_000, cm3: 1037 },
  surfaceArea: { mm2: 96_000, cm2: 960 },
  fillRatio: 0.123,
  wallThickness: { minMm: 12, maxMm: 48, meanMm: 26, stdDevMm: 8, sampleCount: 300, method: 'ray_cast', uniformity: 'poor' },
  draftAnalysis: { undercutFaceCount: 2, zeroDraftFaceCount: 4, adequateDraftFaceCount: 54, analyzedFaceCount: 60 },
  features: { freeFormFaceCount: 4, planarFaceCount: 20, estimatedHoleCount: 4 },
  faces: { total: 60, byType: {} },
  featureTable: [{ kind: 'hole', diaMm: 14, depthMm: 40, through: true, count: 4 }],
  processSpecificEstimates: {
    sandCycleTimeHr: 0.5, sandCycleTimeHrFerrous: 0.8, forgeStrokes: 6,
    investWaxCostGBP: 2, investShellCostGBP: 6,
  },
  toolingCostEstimates: {
    hpdcDieCostGBP: 150_000, gravityMouldCostGBP: 40_000, sandPatternCostGBP: 9_000,
    imMouldCostGBP: 60_000, forgeDieCostGBP: 78_400, progressiveDieCostGBP: 120_000,
  },
} as unknown as OCCTGeometry;

/** An aluminium flange ring — the ring-rolling route, and no flash. */
const AL_RING = {
  status: 'success',
  partName: 'bearing flange ring',
  boundingBox: { xMm: 300, yMm: 300, zMm: 60 },
  volume: { mm3: 900_000, cm3: 900 },
  surfaceArea: { mm2: 180_000, cm2: 1800 },
  fillRatio: 0.167,
  wallThickness: { minMm: 18, maxMm: 30, meanMm: 24, stdDevMm: 3, sampleCount: 200, method: 'ray_cast', uniformity: 'good' },
  draftAnalysis: { undercutFaceCount: 0, zeroDraftFaceCount: 2, adequateDraftFaceCount: 26, analyzedFaceCount: 28 },
  features: { freeFormFaceCount: 0, planarFaceCount: 12, estimatedHoleCount: 1 },
  faces: { total: 28, byType: {} },
  featureTable: [{ kind: 'hole', diaMm: 140, depthMm: 60, through: true, count: 1 }],
} as unknown as OCCTGeometry;

const STEEL_ANSWERED = {
  [MATERIAL_FAMILY_DECISION_ID]: 'steel',
  [TOLERANCE_CLASS_DECISION_ID]: 'standard',
  [SAFETY_CRITICAL_DECISION_ID]: 'yes',
};

const ctx = (
  geo: OCCTGeometry = STUB_AXLE,
  answers: Record<string, unknown> = {},
  over: Partial<RuleContext> = {},
): RuleContext => ({
  geo, geometryQuality: 'occt', commodity: 'forging', commoditySource: 'engineer',
  annualVolume: 100_000, filename: 'stub-axle-prcr002.step', answers, ...over,
});

describe('the forging yield fix', () => {
  it('takes yield from the process reference band, not a flat 0.90', () => {
    const r = runCostInputRules(FORGING_RULES, ctx(STUB_AXLE, STEEL_ANSWERED));
    const f = r.suggestions.forging as Record<string, number | string>;
    expect(f.process).toBe('closed-die');
    // Band [0.55, 0.80] → mid 0.675, scaled by the 10% flash so the billet lands
    // at part ÷ 0.675 once `computeForgingDrivers` divides by it.
    expect(f.yieldFraction).toBe(0.743);
    expect(r.provenance['forge-yield'].source).toBe('library');
    expect(r.provenance['forge-yield'].basis).toContain('0.55–0.8');
  });

  it('under-charged the stub axle by 21% of its billet', () => {
    const r = runCostInputRules(FORGING_RULES, ctx(STUB_AXLE, STEEL_ANSWERED));
    const f = r.suggestions.forging as Record<string, number>;
    // computeForgingDrivers: billet = (part + flash) / yieldFraction
    const billet = (yv: number) => (f.partWeightKg + f.flashAndScaleKg) / yv;
    const atPrompt = billet(0.90);          // what the prompt said, for every forging
    const atReference = billet(f.yieldFraction);

    expect(f.partWeightKg).toBe(8.14);
    expect(atPrompt).toBeCloseTo(9.95, 2);
    expect(atReference).toBeCloseTo(12.05, 2);
    expect(atReference / atPrompt).toBeCloseTo(1.21, 2);
  });

  it('reconciles to the documented band midpoint exactly, without charging flash twice', () => {
    // The module divides by yieldFraction AFTER adding flash, but the reference
    // band is the overall finished/input ratio. Scaling the band by (1 + flash)
    // makes billet come out at part ÷ bandMid, which is what the band means.
    for (const process of Object.keys(FORGING_PROCESS_REFERENCE) as Array<keyof typeof FORGING_PROCESS_REFERENCE>) {
      const y = yieldFractionFor(process);
      const part = 10;
      const billet = (part + part * y.flashFrac) / y.value;
      expect(billet, `${process} billet`).toBeCloseTo(part / y.bandMid, 1);
    }
  });

  it('charges no flash to a route that makes none', () => {
    // Cold forming, ring rolling and open-die have no impression parting line.
    // The prompt charged all five routes a flat 10%.
    for (const p of ['cold-forming', 'ring-rolling', 'open-die'] as const) {
      expect(yieldFractionFor(p).flashFrac).toBe(0);
      expect(yieldFractionFor(p).value).toBe(
        Math.round((FORGING_PROCESS_REFERENCE[p].yieldBand[0] + FORGING_PROCESS_REFERENCE[p].yieldBand[1]) / 2 * 1000) / 1000);
    }
    expect(yieldFractionFor('closed-die').flashFrac).toBe(0.10);
  });
});

describe('the forging die-life fix', () => {
  it('predicts life from the alloy instead of a flat 20,000', () => {
    const r = runCostInputRules(FORGING_RULES, ctx(STUB_AXLE, STEEL_ANSWERED));
    const f = r.suggestions.forging as Record<string, number>;
    expect(f.dieLife).toBe(estimateForgingDieLife({
      alloyFamily: 'carbon-steel', projectedAreaCm2: 468, complexity: 'moderate',
    }));
    expect(f.dieLife).toBeGreaterThan(20_000);   // the flat prompt figure over-charged tooling
  });

  it('spans a 23x range across the metals the prompt treated identically', () => {
    const lives = Object.values(FORGING_DIE_LIFE_BASE);
    expect(Math.max(...lives) / Math.min(...lives)).toBeGreaterThan(20);
    // Aluminium runs 4x the flat figure; a superalloy runs a fraction of it.
    expect(FORGING_DIE_LIFE_BASE.aluminium).toBe(80_000);
    expect(FORGING_DIE_LIFE_BASE.superalloy).toBe(3_500);
  });
});

describe('route selection', () => {
  it('measures a ring rather than asking about one', () => {
    expect(isRingShape(ctx(AL_RING))).toBe(true);
    expect(isRingShape(ctx(STUB_AXLE))).toBe(false);   // 260 x 180 is not axisymmetric
  });

  it('routes an aluminium flange ring to ring rolling, with no flash', () => {
    const r = runCostInputRules(FORGING_RULES, ctx(AL_RING, {
      [MATERIAL_FAMILY_DECISION_ID]: 'aluminium',
      [TOLERANCE_CLASS_DECISION_ID]: 'standard',
      [SAFETY_CRITICAL_DECISION_ID]: 'no',
    }, { filename: 'bearing-flange-ring.step' }));
    const f = r.suggestions.forging as Record<string, number | string>;
    expect(f.process).toBe('ring-rolling');
    expect(f.flashAndScaleKg).toBe(0);
    expect(f.yieldFraction).toBe(0.725);
    expect(r.provenance['forge-flash'].basis).toContain('no impression parting line');
  });

  it('grades shape complexity from measured faces', () => {
    expect(shapeComplexity(ctx(STUB_AXLE))).toBe('moderate');
    expect(shapeComplexity(ctx(AL_RING))).toBe('simple');
  });

  it('puts hot-hard die steel under the alloys that need it', () => {
    expect(dieSteelFor('carbon-steel')).toBe('h13');
    expect(dieSteelFor('aluminium')).toBe('h13');
    expect(dieSteelFor('titanium')).toBe('premium');
    expect(dieSteelFor('superalloy')).toBe('premium');
  });
});

describe('material and service context', () => {
  it('asks which metal before costing anything that depends on it', () => {
    const r = runCostInputRules(FORGING_RULES, ctx(STUB_AXLE));
    expect(r.status).toBe('needs_decision');
    expect(r.decisions[0].id).toBe(MATERIAL_FAMILY_DECISION_ID);
    // This is the stub-axle failure: the tool picked the lightest metal and
    // costed 8.14 kg of steel as 2.8 kg of aluminium.
    const opts = Object.fromEntries(r.decisions[0].options.map(o => [o.value, o.consequence]));
    expect(opts.steel).toContain('8.14 kg');
    expect(opts.aluminium).toContain('2.80 kg');
  });

  it('reuses the casting service questions rather than asking its own', () => {
    const seq: string[] = [];
    const answers: Record<string, unknown> = {};
    const all: Record<string, unknown> = {
      [MATERIAL_FAMILY_DECISION_ID]: 'steel',
      [TOLERANCE_CLASS_DECISION_ID]: 'standard',
      [SAFETY_CRITICAL_DECISION_ID]: 'yes',
    };
    for (let i = 0; i < 5; i++) {
      const r = runCostInputRules(FORGING_RULES, ctx(STUB_AXLE, { ...answers }));
      if (r.status === 'complete') break;
      const d = r.decisions[0];
      seq.push(d.id);
      answers[d.id] = all[d.id];
    }
    // Exactly the ids the casting rules use — a part re-routed from casting to
    // forging arrives with these already answered.
    expect(seq).toEqual([
      MATERIAL_FAMILY_DECISION_ID, TOLERANCE_CLASS_DECISION_ID, SAFETY_CRITICAL_DECISION_ID,
    ]);
  });

  it('leans safety-critical on a suspension part without preselecting it', () => {
    const r = runCostInputRules(FORGING_RULES, ctx(STUB_AXLE, {
      [MATERIAL_FAMILY_DECISION_ID]: 'steel', [TOLERANCE_CLASS_DECISION_ID]: 'standard',
    }));
    const d = r.decisions.find(x => x.id === SAFETY_CRITICAL_DECISION_ID)!;
    expect(d.options.find(o => o.value === 'yes')!.leaning).toBe(true);
    expect(d.severity).toBe('blocking');
  });

  it('refuses to forge something that cannot be forged', () => {
    const r = runCostInputRules(FORGING_RULES, ctx(STUB_AXLE, {
      [MATERIAL_FAMILY_DECISION_ID]: 'cast iron',
    }, { commodity: 'casting' }));
    // Cast iron is not in the forging allow-list, so the family answer is
    // rejected and the material question stands.
    expect(r.status).toBe('needs_decision');
    expect(toForgingAlloyFamily('cast iron')).toBeNull();
    expect(toForgingAlloyFamily('steel')).toBe('carbon-steel');
    expect(toForgingAlloyFamily('magnesium')).toBe('aluminium');
  });
});

describe('press, die and secondary ops', () => {
  it('sizes the press to the die-fill force', () => {
    const r = runCostInputRules(FORGING_RULES, ctx(STUB_AXLE, STEEL_ANSWERED));
    const f = r.suggestions.forging as Record<string, string | number>;
    // F = Kt(5, moderate) x σflow(90 MPa, carbon steel) x 468 cm²
    const t = estimateForgingTonnage({ projectedAreaCm2: 468, alloyFamily: 'carbon-steel', shapeComplexity: 'moderate' });
    expect(Math.round(t)).toBe(2148);
    expect(f.forgeId).toBe('forge-press-4000t');   // 2148 x 1.2 safety = 2577 t
    expect(f.projectedAreaCm2).toBe(468);
  });

  it('estimates the die from the envelope and shows the kernel figure beside it', () => {
    const r = runCostInputRules(FORGING_RULES, ctx(STUB_AXLE, STEEL_ANSWERED));
    const f = r.suggestions.forging as Record<string, number>;
    expect(f.dieCost).toBe(estimateForgingDieCost({
      projectedAreaCm2: 468, partWeightKg: 8.14, dieSteel: 'h13',
      impressions: 2, complexity: 'moderate',
    }).total);
    expect(r.provenance['forge-die-cost'].basis).toContain('78400');
  });

  it('takes the measured stroke count over its own ladder', () => {
    const r = runCostInputRules(FORGING_RULES, ctx(STUB_AXLE, STEEL_ANSWERED));
    expect((r.suggestions.forging as Record<string, number>).strokesToForm).toBe(6);
    const noStrokes = { ...STUB_AXLE, processSpecificEstimates: undefined } as unknown as OCCTGeometry;
    const r2 = runCostInputRules(FORGING_RULES, ctx(noStrokes, STEEL_ANSWERED));
    expect((r2.suggestions.forging as Record<string, number>).strokesToForm).toBe(5);   // moderate
    expect(r2.provenance['forge-strokes'].confidence).toBeLessThan(
      r.provenance['forge-strokes'].confidence);
  });

  it('prices NDT only on a safety-critical part', () => {
    const critical = runCostInputRules(FORGING_RULES, ctx(STUB_AXLE, STEEL_ANSWERED));
    expect((critical.suggestions.forging as Record<string, number>).ndtCostPerPart).toBe(2.5);   // MPI

    const notCritical = runCostInputRules(FORGING_RULES, ctx(STUB_AXLE, {
      ...STEEL_ANSWERED, [SAFETY_CRITICAL_DECISION_ID]: 'no',
    }));
    expect((notCritical.suggestions.forging as Record<string, number>).ndtCostPerPart).toBe(0);
  });

  it('heats the billet only when the route is hot', () => {
    const hot = runCostInputRules(FORGING_RULES, ctx(STUB_AXLE, STEEL_ANSWERED));
    expect((hot.suggestions.forging as Record<string, number>).heatingEnergyKwhPerKg).toBe(0.35);

    // A small high-volume steel part goes cold-formed — no furnace at all.
    const smallPart = {
      ...STUB_AXLE, volume: { mm3: 250_000, cm3: 250 },
      boundingBox: { xMm: 90, yMm: 60, zMm: 50 },
    } as unknown as OCCTGeometry;
    const cold = runCostInputRules(FORGING_RULES, ctx(smallPart, STEEL_ANSWERED));
    const f = cold.suggestions.forging as Record<string, number | string>;
    expect(f.process).toBe('cold-forming');
    expect(f.heatingEnergyKwhPerKg).toBe(0);
    expect(f.descaleCostPerKg).toBe(0);
    expect(f.flashAndScaleKg).toBe(0);
  });
});

describe('the prompt cannot say anything the engine would not compute', () => {
  it('renders every forging value with its own basis attached', () => {
    const c = ctx(STUB_AXLE, STEEL_ANSWERED);
    const text = renderCommodityRulesPrompt(FORGING_RULES, c);
    for (const rule of FORGING_RULES.rules) {
      const out = rule.evaluate(c);
      expect(out.ok, `${rule.id} should be decided`).toBe(true);
      if (!out.ok) continue;
      const line = text.split('\n').find(l => l.trim().startsWith(`${rule.label}=`));
      expect(line, `no rendered line for ${rule.label}`).toBeDefined();
      expect(line).toContain(String(out.decided.value));
      expect(line).toContain(out.decided.basis);
    }
  });
});
