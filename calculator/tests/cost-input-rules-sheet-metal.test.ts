/**
 * Sheet-metal cost inputs, derived deterministically.
 *
 * Two behaviours are worth defending here.
 *
 * The first is the thin-wall stop: a 1.5 mm steel pressing and a 2.5 mm PA6
 * moulding are the same object to a geometry kernel, and per
 * docs/cad-to-cost-learnings.md that confusion is implicated in three of the six
 * documented cost errors. Where bends settle it we must NOT ask; where nothing
 * settles it we must refuse rather than guess.
 *
 * The second is that gauge, die cost and die life now come from the measurement
 * and the parametric advisors rather than from a ray-cast minimum and a flat
 * lookup ladder.
 */
import { describe, it, expect } from 'vitest';
import { runCostInputRules, renderCommodityRulesPrompt } from '../src/engine/cost-input-rules/engine.js';
import {
  SHEET_METAL_RULES, blankDims, gaugeMm, holeDensity, formingComplexity,
} from '../src/engine/cost-input-rules/commodities/sheet-metal.js';
import {
  thinWallAmbiguity, THIN_WALL_COMMODITY_DECISION_ID,
} from '../src/engine/cost-input-rules/derive/thin-wall-ambiguity.js';
import { MATERIAL_FAMILY_DECISION_ID } from '../src/engine/cost-input-rules/derive/material.js';
import {
  estimateStampingDieCost, estimateStampingDieLife,
} from '../src/engine/modules/sheet-metal-advisor.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';

/**
 * The seat LH cross-member from the learnings doc — a 1.5 mm steel stamping
 * with four bends. This is the part that was costed as PA6 injection moulding at
 * £2.84 against a manual £1.40.
 */
const CROSS_MEMBER = {
  status: 'success',
  partName: 'seat cross member LH',
  boundingBox: { xMm: 620, yMm: 180, zMm: 60 },
  volume: { mm3: 168_000, cm3: 168 },
  surfaceArea: { mm2: 232_000, cm2: 2320 },
  fillRatio: 0.025,
  wallThickness: {
    // Deliberately lower than the real gauge: the ray cast landed on a bend
    // radius. This is exactly what the prompt used to hand the model.
    minMm: 1.1, maxMm: 1.6, meanMm: 1.5, stdDevMm: 0.1,
    sampleCount: 300, method: 'ray_cast', uniformity: 'good',
  },
  sheetMetal: { bendCount: 4, totalBendLengthMm: 640, thicknessMm: 1.5 },
  featureTable: [{ kind: 'hole', diaMm: 10, depthMm: 1.5, through: true, count: 6 }],
  features: { freeFormFaceCount: 0, planarFaceCount: 24 },
  draftAnalysis: { undercutFaceCount: 0, zeroDraftFaceCount: 0, adequateDraftFaceCount: 0, analyzedFaceCount: 0 },
  toolingCostEstimates: {
    hpdcDieCostGBP: 96_000, gravityMouldCostGBP: 24_000, sandPatternCostGBP: 6_400,
    imMouldCostGBP: 38_000, forgeDieCostGBP: 51_000, progressiveDieCostGBP: 92_300,
  },
} as unknown as OCCTGeometry;

/** A thin open shell with no bends measured — nothing in the shape decides it. */
const AMBIGUOUS_SHELL = {
  status: 'success',
  partName: 'trim panel',
  boundingBox: { xMm: 400, yMm: 300, zMm: 90 },
  volume: { mm3: 300_000, cm3: 300 },
  surfaceArea: { mm2: 280_000, cm2: 2800 },
  fillRatio: 0.028,
  wallThickness: {
    minMm: 1.9, maxMm: 2.6, meanMm: 2.2, stdDevMm: 0.2,
    sampleCount: 300, method: 'ray_cast', uniformity: 'good',
  },
  topology: { available: true, openShell: true, enclosesSealedVoid: false },
  featureTable: [{ kind: 'hole', diaMm: 8, depthMm: 2.2, through: true, count: 4 }],
  features: { freeFormFaceCount: 0, planarFaceCount: 12 },
} as unknown as OCCTGeometry;

/** A small, hole-riddled bracket — the turret-punching case. */
const PUNCHED_BRACKET = {
  status: 'success',
  partName: 'bracket',
  boundingBox: { xMm: 100, yMm: 80, zMm: 20 },
  volume: { mm3: 20_000, cm3: 20 },
  surfaceArea: { mm2: 24_000, cm2: 240 },
  fillRatio: 0.125,
  wallThickness: {
    minMm: 1.9, maxMm: 2.1, meanMm: 2.0, stdDevMm: 0.05,
    sampleCount: 120, method: 'ray_cast', uniformity: 'good',
  },
  sheetMetal: { bendCount: 3, totalBendLengthMm: 180, thicknessMm: 2.0 },
  featureTable: [{ kind: 'hole', diaMm: 6, depthMm: 2, through: true, count: 8 }],
  features: { freeFormFaceCount: 0, planarFaceCount: 10 },
} as unknown as OCCTGeometry;

const STEEL = { [MATERIAL_FAMILY_DECISION_ID]: 'steel' };

const ctx = (
  geo: OCCTGeometry,
  answers: Record<string, unknown> = {},
  over: Partial<RuleContext> = {},
): RuleContext => ({
  geo, geometryQuality: 'occt', commodity: 'sheet_metal',
  annualVolume: 120_000, filename: 'seat-cross-member-lh.step', answers, ...over,
});

describe('the sheet-metal / plastic stop', () => {
  it('does not ask when bends settle it', () => {
    const v = thinWallAmbiguity(ctx(CROSS_MEMBER));
    expect(v.ambiguous).toBe(false);
    expect(v.decision).toBeUndefined();
    expect(v.reason).toContain('4 bends');
  });

  it('asks when the shell is thin and nothing decides it', () => {
    const v = thinWallAmbiguity(ctx(AMBIGUOUS_SHELL));
    expect(v.ambiguous).toBe(true);
    expect(v.decision?.id).toBe(THIN_WALL_COMMODITY_DECISION_ID);
    expect(v.decision?.severity).toBe('blocking');
    expect(v.decision?.options.map(o => o.value)).toEqual(['sheet_metal', 'injection_moulding']);
  });

  it('quantifies what each answer costs in mass, because that is the whole error', () => {
    const d = thinWallAmbiguity(ctx(AMBIGUOUS_SHELL)).decision!;
    // 300 cm³: 2.35 kg of steel or 0.32 kg of plastic — a 7.5x material swing,
    // which is why nobody should be allowed to answer this by accident.
    expect(d.options[0].consequence).toContain('2.35 kg');
    expect(d.options[1].consequence).toContain('0.32 kg');
  });

  it('never preselects a route', () => {
    const d = thinWallAmbiguity(ctx(AMBIGUOUS_SHELL)).decision!;
    expect(d.options.some(o => o.leaning)).toBe(false);
  });

  it('does not ask about a sealed body — it cannot be stamped', () => {
    const tank = {
      ...AMBIGUOUS_SHELL,
      topology: { available: true, openShell: false, enclosesSealedVoid: true },
    } as unknown as OCCTGeometry;
    const v = thinWallAmbiguity(ctx(tank));
    expect(v.ambiguous).toBe(false);
    expect(v.reason).toContain('sealed void');
  });

  it('does not ask about a solid part — the question does not arise', () => {
    const billet = {
      ...AMBIGUOUS_SHELL,
      fillRatio: 0.62,
      wallThickness: { ...AMBIGUOUS_SHELL.wallThickness, meanMm: 18 },
    } as unknown as OCCTGeometry;
    expect(thinWallAmbiguity(ctx(billet)).ambiguous).toBe(false);
  });

  it('stops asking once answered', () => {
    const answered = ctx(AMBIGUOUS_SHELL, { [THIN_WALL_COMMODITY_DECISION_ID]: 'sheet_metal' });
    expect(thinWallAmbiguity(answered).ambiguous).toBe(false);
  });
});

describe('gauge', () => {
  it('takes the bend-derived coil gauge over the ray-cast minimum', () => {
    const g = gaugeMm(ctx(CROSS_MEMBER))!;
    // The ray cast said 1.1 mm because it hit a radius. The coil is 1.5 mm.
    expect(g.mm).toBe(1.5);
    expect(g.confidence).toBe(0.9);
    expect(g.basis).toContain('coil gauge');
  });

  it('falls back to the ray-cast minimum, and says the source is weaker', () => {
    const g = gaugeMm(ctx(AMBIGUOUS_SHELL))!;
    expect(g.mm).toBe(1.9);
    expect(g.confidence).toBe(0.5);
    expect(g.basis).toContain('ray-cast');
  });

  it('returns nothing rather than a default when neither is measured', () => {
    const bare = { volume: { mm3: 1000, cm3: 1 }, boundingBox: { xMm: 10, yMm: 10, zMm: 10 } } as unknown as OCCTGeometry;
    expect(gaugeMm(ctx(bare))).toBeNull();
  });
});

describe('blank, stations and complexity', () => {
  it('develops the blank from the two largest bbox dimensions plus trim', () => {
    // 620 x 1.05 = 651, 180 x 1.05 = 189. The 60 mm form depth is not a blank dimension.
    expect(blankDims(ctx(CROSS_MEMBER))).toEqual({ lengthMm: 651, widthMm: 189 });
  });

  it('grades hole density per unit blank area, not per part', () => {
    // 6 holes over a 1230 cm² blank is sparse; 8 over 88 cm² is not.
    expect(holeDensity(ctx(CROSS_MEMBER))).toBe('low');
    expect(holeDensity(ctx(PUNCHED_BRACKET))).toBe('high');
  });

  it('grades forming complexity from bends and holes', () => {
    expect(formingComplexity(ctx(CROSS_MEMBER))).toBe('medium');   // 4 bends
    expect(formingComplexity(ctx(AMBIGUOUS_SHELL))).toBe('low');   // flat, 4 holes
  });
});

describe('sheet-metal rules end to end', () => {
  it('refuses to cost a steel-or-aluminium part until the engineer says which', () => {
    const r = runCostInputRules(SHEET_METAL_RULES, ctx(CROSS_MEMBER));
    expect(r.status).toBe('needs_decision');
    expect(r.decisions.map(d => d.id)).toEqual([MATERIAL_FAMILY_DECISION_ID]);
  });

  it('still fills every field the open question does not touch', () => {
    const r = runCostInputRules(SHEET_METAL_RULES, ctx(CROSS_MEMBER));
    const sm = r.suggestions.sheetMetal as Record<string, unknown>;
    // The blank is pure geometry — it does not care what the part is made of.
    expect(sm.blankLengthMm).toBe(651);
    expect(sm.blankWidthMm).toBe(189);
    expect(sm.numOps).toBe(6);
    // ...and everything that needs the material is named as blocked, not silently absent.
    expect(sm.dieCostGBP).toBeUndefined();
    expect(r.decisions[0].blockedFieldIds).toContain('sm-die-cost');
    expect(r.decisions[0].blockedFieldIds).toContain('sm-shear');
  });

  it('completes once the material is answered', () => {
    const r = runCostInputRules(SHEET_METAL_RULES, ctx(CROSS_MEMBER, STEEL));
    expect(r.status).toBe('complete');
    expect(r.decisions).toHaveLength(0);

    const sm = r.suggestions.sheetMetal as Record<string, number | string>;
    expect(sm.thicknessMm).toBe(1.5);
    expect(sm.netWeightKg).toBe(1.319);              // 168 cm³ x 0.00785
    expect(sm.shearStrengthMPa).toBe(280);
    expect(sm.numOps).toBe(6);                        // 1 blank + 4 bends + 1 pierce
    expect(sm.dieType).toBe('progressive');
    expect(sm.process).toBe('Progressive Stamping');  // 120k/yr at 1.5 mm
  });

  it('feeds the die-cost estimator the derived blank, stations and hardness', () => {
    const r = runCostInputRules(SHEET_METAL_RULES, ctx(CROSS_MEMBER, STEEL));
    const sm = r.suggestions.sheetMetal as Record<string, number>;
    const expected = estimateStampingDieCost({
      dieType: 'progressive',
      stations: 6,
      blankAreaCm2: (651 * 189) / 100,
      shearStrengthMPa: 280,
    });
    expect(sm.dieCostGBP).toBe(expected.total);
    // The kernel's independent number rides along so a wide gap is visible.
    expect(r.provenance['sm-die-cost'].basis).toContain('92300');
  });

  it('predicts die life from material and gauge instead of a flat ladder', () => {
    const thin = runCostInputRules(SHEET_METAL_RULES, ctx(CROSS_MEMBER, STEEL));
    expect((thin.suggestions.sheetMetal as Record<string, number>).dieLife)
      .toBe(estimateStampingDieLife({ shearStrengthMPa: 280, thicknessMm: 1.5, dieType: 'progressive' }));

    // The prompt this replaces said "progressive → 1000000" whatever the stock.
    // Doubling the gauge halves the life; a lookup table could not show that.
    const thickStock = {
      ...CROSS_MEMBER,
      sheetMetal: { bendCount: 4, totalBendLengthMm: 640, thicknessMm: 3.0 },
    } as unknown as OCCTGeometry;
    const thick = runCostInputRules(SHEET_METAL_RULES, ctx(thickStock, STEEL));
    const thickLife = (thick.suggestions.sheetMetal as Record<string, number>).dieLife;
    const thinLife = (thin.suggestions.sheetMetal as Record<string, number>).dieLife;
    expect(thickLife).toBeLessThan(thinLife);
    expect(thickLife / thinLife).toBeCloseTo(0.5, 1);
  });

  it('routes a hole-dense medium-volume bracket to turret punching', () => {
    const r = runCostInputRules(SHEET_METAL_RULES, ctx(PUNCHED_BRACKET, STEEL, { annualVolume: 20_000 }));
    const sm = r.suggestions.sheetMetal as Record<string, string>;
    expect(sm.process).toBe('Turret Punching');
    expect(sm.dieType).toBe('single_stage');
  });

  it('routes an aluminium low-volume part to laser + brake', () => {
    const r = runCostInputRules(SHEET_METAL_RULES, ctx(
      AMBIGUOUS_SHELL,
      { [THIN_WALL_COMMODITY_DECISION_ID]: 'sheet_metal', [MATERIAL_FAMILY_DECISION_ID]: 'aluminium' },
      { annualVolume: 800 },
    ));
    const sm = r.suggestions.sheetMetal as Record<string, string | number>;
    expect(sm.process).toBe('Laser Cutting');
    expect(sm.shearStrengthMPa).toBe(170);
    expect(sm.thicknessMm).toBe(1.9);   // no bends → the ray-cast fallback
  });

  it('asks the commodity question before the material one on an ambiguous shell', () => {
    const r = runCostInputRules(SHEET_METAL_RULES, ctx(AMBIGUOUS_SHELL, {}, { annualVolume: 800 }));
    expect(r.status).toBe('needs_decision');
    expect(r.decisions.map(d => d.id)).toEqual([THIN_WALL_COMMODITY_DECISION_ID]);
  });
});

describe('the prompt cannot say anything the engine would not compute', () => {
  it('renders every decided value with its own basis attached', () => {
    const c = ctx(CROSS_MEMBER, STEEL);
    const text = renderCommodityRulesPrompt(SHEET_METAL_RULES, c);
    const r = runCostInputRules(SHEET_METAL_RULES, c);

    for (const rule of SHEET_METAL_RULES.rules) {
      const out = rule.evaluate(c);
      expect(out.ok, `${rule.id} should be decided`).toBe(true);
      if (!out.ok) continue;
      const line = text.split('\n').find(l => l.trim().startsWith(`${rule.label}=`));
      expect(line, `no rendered line for ${rule.label}`).toBeDefined();
      expect(line).toContain(String(out.decided.value));
      expect(line).toContain(out.decided.basis);
    }
    expect(r.status).toBe('complete');
  });

  it('says UNDECIDED rather than omitting a blocked field', () => {
    const text = renderCommodityRulesPrompt(SHEET_METAL_RULES, ctx(CROSS_MEMBER));
    expect(text).toContain('dieCostGBP: UNDECIDED');
    expect(text).toContain('What is this part made of?');
  });
});

describe('determinism', () => {
  it('is insensitive to the order the answers were given in', () => {
    const a = { [MATERIAL_FAMILY_DECISION_ID]: 'steel', [THIN_WALL_COMMODITY_DECISION_ID]: 'sheet_metal' };
    const b = { [THIN_WALL_COMMODITY_DECISION_ID]: 'sheet_metal', [MATERIAL_FAMILY_DECISION_ID]: 'steel' };
    expect(runCostInputRules(SHEET_METAL_RULES, ctx(CROSS_MEMBER, a)).suggestions)
      .toEqual(runCostInputRules(SHEET_METAL_RULES, ctx(CROSS_MEMBER, b)).suggestions);
  });
});
