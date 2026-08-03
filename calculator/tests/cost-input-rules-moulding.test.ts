/**
 * Injection- and blow-moulding cost inputs, derived deterministically.
 *
 * The behaviours worth defending:
 *
 *   - projected area is the WORST-case projection, so the press can never be
 *     undersized (the documented bumper failure);
 *   - the resin is asked, because density, price and cooling all hang off it and
 *     none of them is a shape;
 *   - container capacity is asked, because a void is not a solid and OCCT has
 *     nothing to measure;
 *   - IBM and SBM are charged no pinch-off flash, because they do not make any.
 */
import { describe, it, expect } from 'vitest';
import { runCostInputRules, renderCommodityRulesPrompt } from '../src/engine/cost-input-rules/engine.js';
import {
  INJECTION_MOULDING_RULES, projectedAreaCm2, cavityCount, sideActions, steelClassFor,
} from '../src/engine/cost-input-rules/commodities/injection-moulding.js';
import {
  BLOW_MOULDING_RULES, CAPACITY_DECISION_ID, BARRIER_DECISION_ID,
  envelopeCapacityL, processFor,
} from '../src/engine/cost-input-rules/commodities/blow-moulding.js';
import { RESIN_DECISION_ID, resinFacts, cavityPressureMPaFor } from '../src/engine/cost-input-rules/derive/resin.js';
import { THIN_WALL_COMMODITY_DECISION_ID } from '../src/engine/cost-input-rules/derive/thin-wall-ambiguity.js';
import { estimateMouldCost, estimateClampingTonnage } from '../src/engine/modules/injection-moulding.js';
import { estimateBlowMouldCost } from '../src/engine/modules/blow-advisor.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';

/**
 * The front bumper from the explainer deck. Modelled deliberately with its
 * length on X so the "two largest dimensions" rule and the prompt's `bbox X x Y`
 * agree — the disagreement is exercised separately below.
 */
const BUMPER = {
  status: 'success',
  partName: 'front bumper fascia',
  boundingBox: { xMm: 1800, yMm: 500, zMm: 450 },
  volume: { mm3: 5_000_000, cm3: 5000 },
  surfaceArea: { mm2: 3_400_000, cm2: 34_000 },
  fillRatio: 0.012,
  wallThickness: {
    minMm: 2.4, maxMm: 3.8, meanMm: 3.0, stdDevMm: 0.3,
    sampleCount: 500, method: 'ray_cast', uniformity: 'good',
  },
  draftAnalysis: { undercutFaceCount: 14, zeroDraftFaceCount: 6, adequateDraftFaceCount: 210, analyzedFaceCount: 230 },
  topology: { available: true, openShell: true, enclosesSealedVoid: false },
  features: { freeFormFaceCount: 60, planarFaceCount: 20 },
  toolingCostEstimates: {
    hpdcDieCostGBP: 210_000, gravityMouldCostGBP: 60_000, sandPatternCostGBP: 18_000,
    imMouldCostGBP: 412_000, forgeDieCostGBP: 150_000, progressiveDieCostGBP: 260_000,
  },
} as unknown as OCCTGeometry;

/** A ~60 L coex fuel tank — sealed hollow body, HDPE. */
const FUEL_TANK = {
  status: 'success',
  partName: 'fuel tank',
  boundingBox: { xMm: 900, yMm: 700, zMm: 320 },
  volume: { mm3: 12_500_000, cm3: 12_500 },
  surfaceArea: { mm2: 2_600_000, cm2: 26_000 },
  fillRatio: 0.062,
  wallThickness: {
    minMm: 3.4, maxMm: 6.2, meanMm: 4.5, stdDevMm: 0.6,
    sampleCount: 400, method: 'ray_cast', uniformity: 'fair',
  },
  topology: { available: true, openShell: false, enclosesSealedVoid: true, voidCount: 1 },
  draftAnalysis: { undercutFaceCount: 0, zeroDraftFaceCount: 4, adequateDraftFaceCount: 90, analyzedFaceCount: 94 },
  features: { freeFormFaceCount: 40, planarFaceCount: 8 },
} as unknown as OCCTGeometry;

/** A 1 L PET bottle. */
const BOTTLE = {
  status: 'success',
  partName: 'bottle',
  boundingBox: { xMm: 70, yMm: 70, zMm: 220 },
  volume: { mm3: 22_000, cm3: 22 },
  surfaceArea: { mm2: 62_000, cm2: 620 },
  fillRatio: 0.020,
  wallThickness: {
    minMm: 0.25, maxMm: 0.6, meanMm: 0.35, stdDevMm: 0.08,
    sampleCount: 200, method: 'ray_cast', uniformity: 'fair',
  },
  topology: { available: true, openShell: false, enclosesSealedVoid: true, voidCount: 1 },
  draftAnalysis: { undercutFaceCount: 0, zeroDraftFaceCount: 2, adequateDraftFaceCount: 30, analyzedFaceCount: 32 },
  features: { freeFormFaceCount: 14, planarFaceCount: 2 },
} as unknown as OCCTGeometry;

const PP = { [RESIN_DECISION_ID]: 'mat-pp-impact' };

const imCtx = (
  geo: OCCTGeometry = BUMPER,
  answers: Record<string, unknown> = {},
  over: Partial<RuleContext> = {},
): RuleContext => ({
  geo, geometryQuality: 'occt', commodity: 'injection_moulding',
  commoditySource: 'engineer', annualVolume: 200_000,
  filename: 'front-bumper.step', answers, ...over,
});

const bmCtx = (
  geo: OCCTGeometry = FUEL_TANK,
  answers: Record<string, unknown> = {},
  over: Partial<RuleContext> = {},
): RuleContext => ({
  geo, geometryQuality: 'occt', commodity: 'blow_moulding',
  commoditySource: 'engineer', annualVolume: 120_000,
  filename: 'fuel-tank.step', answers, ...over,
});

describe('the resin question', () => {
  it('asks, because density, price and cooling all hang off it', () => {
    const f = resinFacts(imCtx());
    expect(f.materialId).toBeNull();
    expect(f.decision?.id).toBe(RESIN_DECISION_ID);
    expect(f.decision?.severity).toBe('blocking');
  });

  it('prices every option, so the answer is chosen with the consequence visible', () => {
    const d = resinFacts(imCtx()).decision!;
    for (const o of d.options) {
      expect(o.consequence).toMatch(/^\d+\.\d{3} kg at £\d+\.\d{2}\/kg · cools at [\d.]+ s\/mm²$/);
    }
    // 5,000 cm³ of PP impact copolymer at 900 kg/m³.
    expect(d.options[0].consequence).toContain('4.500 kg');
  });

  it('shows the filename hint as a leaning and nothing more', () => {
    const d = resinFacts(imCtx(BUMPER, {}, { filename: 'front-bumper-PA66.step' })).decision!;
    const leaning = d.options.filter(o => o.leaning);
    expect(leaning).toHaveLength(1);
    expect(leaning[0].value).toBe('mat-pa66gf30');
  });

  it('offers blow-moulding resins to a blow-moulded part', () => {
    const d = resinFacts(bmCtx()).decision!;
    expect(d.options.map(o => o.value)).toEqual(['mat-hdpe', 'mat-pp-homo', 'mat-pet-bg']);
  });

  it('raises cavity pressure for glass fill', () => {
    expect(cavityPressureMPaFor('mat-pp-impact')).toBe(35);
    expect(cavityPressureMPaFor('mat-pp-gf30')).toBe(45);
    expect(cavityPressureMPaFor('mat-pa66gf30')).toBe(65);
  });
});

describe('injection moulding', () => {
  it('projects onto the two largest dimensions, so the press cannot be undersized', () => {
    // Same solid, modelled with its length along Z. The prompt rule (bbox X x Y)
    // would have projected 500 x 450 = 2,250 cm² — a quarter of the truth, and
    // the press picked from it would not close the tool.
    const rotated = {
      ...BUMPER, boundingBox: { xMm: 500, yMm: 450, zMm: 1800 },
    } as unknown as OCCTGeometry;
    expect(projectedAreaCm2(imCtx())).toBe(9000);
    expect(projectedAreaCm2(imCtx(rotated))).toBe(9000);

    const promptRule = (500 * 450) / 100;
    expect(promptRule).toBe(2250);
  });

  it('sizes the press from clamp force', () => {
    const r = runCostInputRules(INJECTION_MOULDING_RULES, imCtx(BUMPER, PP));
    const im = r.suggestions.injectionMoulding as Record<string, unknown>;
    // 9,000 cm² at 35 MPa with a 1.15 safety factor is ~3,694 t — beyond the
    // largest press in the library, which is the honest answer for a bumper.
    const tonnes = estimateClampingTonnage({ projectedAreaCm2: 9000, cavityPressureMPa: 35 });
    expect(Math.round(tonnes)).toBe(3694);
    expect(im.machineId).toBe('imm-3500t');
    expect(r.provenance['imm-mach'].basis).toContain('3694 t clamp');
  });

  it('caps cavitation at what a press can actually close', () => {
    // A 5 g part on a big footprint: the weight ladder wants 4 cavities, but
    // 4-up would need more clamp than exists.
    const smallWidePart = {
      ...BUMPER,
      volume: { mm3: 5_500, cm3: 5.5 },
      boundingBox: { xMm: 900, yMm: 400, zMm: 20 },
    } as unknown as OCCTGeometry;
    const ctx = imCtx(smallWidePart, PP);
    const resin = resinFacts(ctx);
    const c = cavityCount(ctx, resin);
    expect(c.n).toBeLessThan(4);
    expect(c.basis).toContain('capped at');

    // ...and a genuinely small part still gets its four cavities.
    const smallPart = {
      ...BUMPER, volume: { mm3: 5_500, cm3: 5.5 }, boundingBox: { xMm: 60, yMm: 40, zMm: 20 },
    } as unknown as OCCTGeometry;
    expect(cavityCount(imCtx(smallPart, PP), resinFacts(imCtx(smallPart, PP))).n).toBe(4);
  });

  it('never gives an undercut part a straight-pull tool', () => {
    expect(sideActions(imCtx()).n).toBe(3);           // 14 undercut faces
    expect(sideActions(imCtx()).basis).toContain('14 undercut face');
    const clean = { ...BUMPER, draftAnalysis: { ...BUMPER.draftAnalysis, undercutFaceCount: 0 } } as unknown as OCCTGeometry;
    expect(sideActions(imCtx(clean)).n).toBe(0);
  });

  it('picks the tool steel from the shots the programme needs', () => {
    // The prompt said mouldLife=1000000 for every part ever moulded.
    expect(steelClassFor(20_000)).toEqual({ cls: 'prototype', life: 50_000 });
    expect(steelClassFor(80_000)).toEqual({ cls: 'standard', life: 500_000 });
    expect(steelClassFor(900_000)).toEqual({ cls: 'production', life: 1_000_000 });
    expect(steelClassFor(4_000_000)).toEqual({ cls: 'high_volume', life: 5_000_000 });

    // A tool must outlast the shots it is asked to make.
    for (const shots of [20_000, 80_000, 900_000, 4_000_000]) {
      expect(steelClassFor(shots).life).toBeGreaterThanOrEqual(shots);
    }
  });

  it('fills the whole form once the resin is chosen', () => {
    const r = runCostInputRules(INJECTION_MOULDING_RULES, imCtx(BUMPER, PP));
    expect(r.status).toBe('complete');
    const im = r.suggestions.injectionMoulding as Record<string, number | string>;

    expect(im.wallThicknessMm).toBe(3.0);
    expect(im.projectedAreaCm2).toBe(9000);
    expect(im.partWeightKg).toBe(4.5);
    expect(im.cavities).toBe(1);
    expect(im.cavityPressureMPa).toBe(35);
    expect(im.coolTimeFactorSPerMm2).toBe(3.16);      // PP
    expect(im.fillTimeSec).toBe(1.5);                  // 3.0 x 0.5, at the floor
    expect(im.packTimeSec).toBe(2.4);                  // 3.0 x 0.8
    expect(im.ejectTimeSec).toBe(2);
    expect(im.runnerWeightKg).toBe(0.675);             // 15% cold runner
    expect(im.sideActionsLifters).toBe(3);
    expect(im.steelClass).toBe('production');          // 200k/yr x 5 yr, 1 cavity
    expect(im.mouldLife).toBe(1_000_000);
  });

  it('estimates the mould from cavitation, area, steel and slides', () => {
    const r = runCostInputRules(INJECTION_MOULDING_RULES, imCtx(BUMPER, PP));
    const im = r.suggestions.injectionMoulding as Record<string, number>;
    expect(im.mouldCostGBP).toBe(estimateMouldCost({
      cavities: 1, projectedAreaCm2: 9000, steelClass: 'production',
      sideActionsLifters: 3, runnerSystem: 'cold',
    }).total);
    expect(r.provenance['imm-mould-cost'].basis).toContain('412000');   // OCCT cross-check
  });

  it('does not re-ask the metal-or-plastic question of someone who chose the tile', () => {
    const r = runCostInputRules(INJECTION_MOULDING_RULES, imCtx(BUMPER, PP));
    expect(r.decisions).toHaveLength(0);
  });

  it('does ask it when the commodity was inferred from the shape', () => {
    const r = runCostInputRules(INJECTION_MOULDING_RULES,
      imCtx(BUMPER, PP, { commoditySource: 'inferred' }));
    expect(r.decisions.map(d => d.id)).toEqual([THIN_WALL_COMMODITY_DECISION_ID]);
  });
});

describe('blow moulding', () => {
  it('bounds the capacity from the envelope but refuses to answer for the engineer', () => {
    // 201.6 L of bounding box, 6.2% of it plastic.
    expect(envelopeCapacityL(bmCtx())).toBeCloseTo(189.1, 0);
    const r = runCostInputRules(BLOW_MOULDING_RULES, bmCtx(FUEL_TANK, { [RESIN_DECISION_ID]: 'mat-hdpe' }));
    const d = r.decisions.find(x => x.id === CAPACITY_DECISION_ID)!;
    expect(d.severity).toBe('blocking');
    expect(d.why).toContain('a void is not a solid');
    expect(d.options.filter(o => o.leaning).map(o => o.value)).toEqual(['over_20']);
  });

  it('asks resin, then capacity, then the barrier spec — each once', () => {
    const seq: string[] = [];
    const answers: Record<string, unknown> = {};
    for (let i = 0; i < 4; i++) {
      const r = runCostInputRules(BLOW_MOULDING_RULES, bmCtx(FUEL_TANK, { ...answers }));
      if (r.status === 'complete') break;
      const d = r.decisions[0];
      seq.push(d.id);
      answers[d.id] = { [RESIN_DECISION_ID]: 'mat-hdpe', [CAPACITY_DECISION_ID]: 'over_20', [BARRIER_DECISION_ID]: 'barrier' }[d.id];
    }
    expect(seq).toEqual([RESIN_DECISION_ID, CAPACITY_DECISION_ID, BARRIER_DECISION_ID]);
  });

  it('costs a coex tank on the barrier grade and the accumulator machine', () => {
    const r = runCostInputRules(BLOW_MOULDING_RULES, bmCtx(FUEL_TANK, {
      [RESIN_DECISION_ID]: 'mat-hdpe',
      [CAPACITY_DECISION_ID]: 'over_20',
      [BARRIER_DECISION_ID]: 'barrier',
    }));
    expect(r.status).toBe('complete');
    const bm = r.suggestions.blowMoulding as Record<string, number | string>;

    expect(bm.materialId).toBe('mat-hdpe-fuel-coex');
    expect(bm.process).toBe('ebm_coex5');
    expect(bm.partWeightKg).toBe(12);                 // 12,500 cm³ x 960 kg/m³
    expect(bm.flashWeightKg).toBe(2.64);              // 22% above 3 kg
    expect(bm.machineId).toBe('blow-ebm-large');      // 14.64 kg gross shot
    expect(bm.cavities).toBe(1);
    expect(bm.mouldMaterial).toBe('aluminium');
    expect(bm.mouldLife).toBe(500_000);
    expect(bm.blowTimeSec).toBe(20);                  // capped
    expect(bm.openCloseSec).toBe(8);                  // capped
    expect(bm.mouldCostGBP).toBe(estimateBlowMouldCost({
      process: 'ebm', cavities: 1, partVolumeL: 60, mouldMaterial: 'aluminium',
    }).total);
  });

  it('keeps a mono-layer tank on its own grade', () => {
    const r = runCostInputRules(BLOW_MOULDING_RULES, bmCtx(FUEL_TANK, {
      [RESIN_DECISION_ID]: 'mat-hdpe',
      [CAPACITY_DECISION_ID]: 'over_20',
      [BARRIER_DECISION_ID]: 'mono',
    }));
    const bm = r.suggestions.blowMoulding as Record<string, string>;
    expect(bm.materialId).toBe('mat-hdpe');
    expect(bm.process).toBe('ebm_large');
  });

  it('never asks the barrier question where it cannot change anything', () => {
    // A PET bottle has no EVOH decision to make.
    const r = runCostInputRules(BLOW_MOULDING_RULES, bmCtx(BOTTLE, {
      [RESIN_DECISION_ID]: 'mat-pet-bg', [CAPACITY_DECISION_ID]: '0p25_2',
    }, { filename: 'bottle.step', annualVolume: 20_000_000 }));
    expect(r.status).toBe('complete');
    expect(r.decisions).toHaveLength(0);
  });

  it('charges no pinch-off flash to a process that makes none', () => {
    const r = runCostInputRules(BLOW_MOULDING_RULES, bmCtx(BOTTLE, {
      [RESIN_DECISION_ID]: 'mat-pet-bg', [CAPACITY_DECISION_ID]: '0p25_2',
    }, { filename: 'bottle.step', annualVolume: 20_000_000 }));
    const bm = r.suggestions.blowMoulding as Record<string, number | string>;
    expect(bm.process).toBe('sbm_2stage');
    expect(bm.flashWeightKg).toBe(0);
    expect(r.provenance['bm-flash-wt'].basis).toContain('no pinch-off');
    // The prompt's flat 12% would have invented 3.6 g of scrap per bottle.
    expect((bm.partWeightKg as number) * 0.12).toBeCloseTo(0.00364, 4);
  });

  it('routes by capacity and resin', () => {
    expect(processFor(0.1, 'mat-hdpe', false, 1_000_000).formValue).toBe('ibm_linear');
    expect(processFor(0.1, 'mat-hdpe', false, 20_000_000).formValue).toBe('ibm_rotary');
    expect(processFor(1.1, 'mat-pet-bg', false, 20_000_000).formValue).toBe('sbm_2stage');
    expect(processFor(1.1, 'mat-pet-bg', false, 100_000).formValue).toBe('sbm_1stage');
    expect(processFor(1.1, 'mat-hdpe', false, 100_000).formValue).toBe('ebm_2head');
    expect(processFor(60, 'mat-hdpe', false, 100_000).formValue).toBe('ebm_large');
    expect(processFor(60, 'mat-hdpe', true, 100_000).formValue).toBe('ebm_coex5');
  });

  it('refuses to blow-mould a model with no cavity in it', () => {
    const open = {
      ...FUEL_TANK,
      topology: { available: true, openShell: true, enclosesSealedVoid: false },
    } as unknown as OCCTGeometry;
    const r = runCostInputRules(BLOW_MOULDING_RULES, bmCtx(open, { [RESIN_DECISION_ID]: 'mat-hdpe' }));
    const d = r.decisions.find(x => x.id === 'blow.notHollow');
    expect(d).toBeDefined();
    expect(d!.options.map(o => o.value)).toContain('injection_moulding');
  });
});

describe('the prompt cannot say anything the engine would not compute', () => {
  const cases: Array<[string, typeof INJECTION_MOULDING_RULES, RuleContext]> = [
    ['injection moulding', INJECTION_MOULDING_RULES, imCtx(BUMPER, PP)],
    ['blow moulding', BLOW_MOULDING_RULES, bmCtx(FUEL_TANK, {
      [RESIN_DECISION_ID]: 'mat-hdpe',
      [CAPACITY_DECISION_ID]: 'over_20',
      [BARRIER_DECISION_ID]: 'barrier',
    })],
  ];

  for (const [name, spec, ctx] of cases) {
    it(`renders every ${name} value with its own basis attached`, () => {
      const text = renderCommodityRulesPrompt(spec, ctx);
      for (const rule of spec.rules) {
        const out = rule.evaluate(ctx);
        expect(out.ok, `${rule.id} should be decided`).toBe(true);
        if (!out.ok) continue;
        const line = text.split('\n').find(l => l.trim().startsWith(`${rule.label}=`));
        expect(line, `no rendered line for ${rule.label}`).toBeDefined();
        expect(line).toContain(String(out.decided.value));
        expect(line).toContain(out.decided.basis);
      }
    });
  }

  it('marks a blocked moulding field UNDECIDED rather than dropping it', () => {
    const text = renderCommodityRulesPrompt(INJECTION_MOULDING_RULES, imCtx());
    expect(text).toContain('mouldCostGBP: UNDECIDED');
    expect(text).toContain('Which resin is this moulded in?');
    // The two pure-geometry fields survive the block.
    expect(text).toContain('wallThicknessMm=3');
    expect(text).toContain('projectedAreaCm2=9000');
  });
});
