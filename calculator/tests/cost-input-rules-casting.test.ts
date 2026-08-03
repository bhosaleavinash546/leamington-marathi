/**
 * Casting cost inputs, derived deterministically.
 *
 * The two behaviours worth defending here are the yield fix (a live 2x material
 * error on investment castings) and the ask-don't-guess chain: four questions
 * geometry cannot answer, asked once each, before any casting number appears.
 */
import { describe, it, expect } from 'vitest';
import { runCostInputRules } from '../src/engine/cost-input-rules/engine.js';
import { CASTING_RULES, complexityBand, minWallMm } from '../src/engine/cost-input-rules/commodities/casting.js';
import { materialFacts } from '../src/engine/cost-input-rules/derive/material.js';
import { CASTING_PROCESS_REFERENCE } from '../src/engine/modules/casting-advisor.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';

/** The die-cast housing from the explainer deck: 1,037 cm³, 3 mm walls. */
const HOUSING = {
  status: 'success',
  partName: 'housing',
  boundingBox: { xMm: 320, yMm: 240, zMm: 96 },
  volume: { mm3: 1_037_000, cm3: 1037 },
  surfaceArea: { mm2: 122_000, cm2: 1220 },
  fillRatio: 0.141,
  wallThickness: {
    minMm: 2.4, maxMm: 4.1, meanMm: 3.0, stdDevMm: 0.4,
    sampleCount: 400, method: 'ray_cast', uniformity: 'good',
  },
  draftAnalysis: { undercutFaceCount: 1, zeroDraftFaceCount: 2, adequateDraftFaceCount: 80, analyzedFaceCount: 83 },
  setupAnalysis: { estimatedSetupCount: 3, principalDirections: [] },
  faces: { total: 120, byType: {} },
  features: { freeFormFaceCount: 4, planarFaceCount: 60 },
  toolingCostEstimates: {
    hpdcDieCostGBP: 118_000, gravityMouldCostGBP: 26_400, sandPatternCostGBP: 7_250,
    imMouldCostGBP: 41_500, forgeDieCostGBP: 63_800, progressiveDieCostGBP: 92_300,
  },
  processSpecificEstimates: {
    sandCycleTimeHr: 0.262, sandCycleTimeHrFerrous: 0.447, forgeStrokes: 6,
    investWaxCostGBP: 1.83, investShellCostGBP: 5.49,
  },
} as unknown as OCCTGeometry;

const ALL_ANSWERED = {
  'material.family': 'aluminium',
  'service.pressureTight': 'no',
  'service.toleranceClass': 'standard',
  'service.safetyCritical': 'no',
};

const ctx = (answers: Record<string, unknown> = {}, over: Partial<RuleContext> = {}): RuleContext => ({
  geo: HOUSING, geometryQuality: 'occt', commodity: 'casting',
  annualVolume: 60_000, filename: 'housing.step', answers, ...over,
});

describe('casting cost-input rules', () => {
  describe('the yield fix', () => {
    it('takes yield from the reference band, not the prompt constants', () => {
      const r = runCostInputRules(CASTING_RULES, ctx(ALL_ANSWERED));
      const c = r.suggestions.casting as Record<string, number>;
      // HPDC band [0.55, 0.75] → 0.65. This is the one subtype where the old
      // prompt constant happened to agree.
      expect(c.yieldFraction).toBe(0.65);
      expect(r.provenance['cast-yield'].source).toBe('library');
      expect(r.provenance['cast-yield'].basis).toContain('0.55–0.75');
    });

    it('halves the investment-casting yield the prompt was using', () => {
      // The defect: the prompt said 0.90, the documented band midpoint is 0.45.
      // Yield divides into pour weight, so 0.90 charged ~half the real metal.
      const mid = (b: readonly [number, number]) => (b[0] + b[1]) / 2;
      const correct = mid(CASTING_PROCESS_REFERENCE.investment.yieldBand);
      expect(correct).toBeCloseTo(0.45, 2);

      const partKg = 2.8;
      const pourAtOldConstant = partKg / 0.90;
      const pourAtBand = partKg / correct;
      expect(pourAtBand / pourAtOldConstant).toBeCloseTo(2.0, 1);
    });

    it('uses the band midpoint for every subtype, so none can drift again', () => {
      for (const [name, ref] of Object.entries(CASTING_PROCESS_REFERENCE)) {
        const mid = Math.round(((ref.yieldBand[0] + ref.yieldBand[1]) / 2) * 100) / 100;
        expect(mid, name).toBeGreaterThan(0);
        expect(mid, name).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('ask before guessing', () => {
    it('asks what the part is made of before costing anything material', () => {
      const r = runCostInputRules(CASTING_RULES, ctx());
      expect(r.status).toBe('needs_decision');
      expect(r.decisions[0].id).toBe('material.family');
      // and it quantifies the consequence of each answer rather than just listing them
      const opts = r.decisions[0].options;
      expect(opts.find(o => o.value === 'aluminium')?.consequence).toBe('2.80 kg');
      expect(opts.find(o => o.value === 'steel')?.consequence).toBe('8.14 kg');
    });

    it('walks the four service questions one at a time, never all at once', () => {
      // Asking four questions in one wall is how engineers learn to click through
      // them. Each is asked only once the previous is settled.
      const seq: string[] = [];
      const answers: Record<string, unknown> = {};
      for (let i = 0; i < 6; i++) {
        const r = runCostInputRules(CASTING_RULES, ctx({ ...answers }));
        if (r.status === 'complete') break;
        const d = r.decisions[0];
        seq.push(d.id);
        answers[d.id] = d.id === 'service.toleranceClass' ? 'standard'
          : d.id === 'material.family' ? 'aluminium' : 'no';
      }
      expect(seq).toEqual([
        'material.family',
        'service.pressureTight',
        'service.toleranceClass',
        'service.safetyCritical',
      ]);
    });

    it('never preselects its own hunch', () => {
      const r = runCostInputRules(CASTING_RULES, ctx({ 'material.family': 'aluminium' }));
      const d = r.decisions.find(x => x.id === 'service.pressureTight')!;
      // "housing.step" matches the pressure-tight hint, so there IS a leaning...
      expect(d.options.some(o => o.leaning)).toBe(true);
      // ...but a leaning is not an answer: the run is still blocked.
      expect(r.status).toBe('needs_decision');
    });

    it('asks for a quotation rather than inventing investment tooling cost', () => {
      // Investment is the one route the geometry kernel does not price. The old
      // prompt fell back to a flat GBP 12,000 constant.
      const r = runCostInputRules(CASTING_RULES, ctx({
        ...ALL_ANSWERED, 'material.family': 'steel', 'service.toleranceClass': 'tight',
      }));
      const sub = (r.suggestions.casting as Record<string, unknown>).subtype;
      expect(sub).toBe('investment');
      expect(r.decisions.map(d => d.id)).toContain('casting.toolingCost');
    });
  });

  describe('the advisor drives the process choice', () => {
    it('picks HPDC for a thin-wall aluminium part at volume', () => {
      const r = runCostInputRules(CASTING_RULES, ctx(ALL_ANSWERED));
      const c = r.suggestions.casting as Record<string, unknown>;
      expect(c.subtype).toBe('hpdc');
      expect(r.provenance['cast-subtype'].source).toBe('advisor');
      expect(r.provenance['cast-subtype'].basis).toMatch(/thin|die|volume/i);
    });

    it('picks sand for a heavy ferrous part', () => {
      const r = runCostInputRules(CASTING_RULES, ctx(
        { ...ALL_ANSWERED, 'material.family': 'cast iron' },
        { annualVolume: 1_000 },
      ));
      expect((r.suggestions.casting as Record<string, unknown>).subtype).toBe('sand');
    });

    it('routes the subtype to the right tooling estimate', () => {
      const hpdc = runCostInputRules(CASTING_RULES, ctx(ALL_ANSWERED));
      expect((hpdc.suggestions.casting as Record<string, number>).dieMouldCostGBP).toBe(118_000);

      const sand = runCostInputRules(CASTING_RULES, ctx(
        { ...ALL_ANSWERED, 'material.family': 'cast iron' }, { annualVolume: 1_000 },
      ));
      expect((sand.suggestions.casting as Record<string, number>).dieMouldCostGBP).toBe(7_250);
    });

    it('only offers HPDC-specific fields when HPDC is chosen', () => {
      const sand = runCostInputRules(CASTING_RULES, ctx(
        { ...ALL_ANSWERED, 'material.family': 'cast iron' }, { annualVolume: 1_000 },
      ));
      expect(sand.provenance['cast-hpdc-ct']).toBeUndefined();
      expect(sand.provenance['cast-hpdc-cav']).toBeUndefined();
      expect(sand.provenance['cast-sand-ct']).toBeDefined();
    });
  });

  describe('geometry derivations', () => {
    it('computes the HPDC shot time from the measured wall', () => {
      const r = runCostInputRules(CASTING_RULES, ctx(ALL_ANSWERED));
      // 45 + 3 x 3.0 = 54
      expect((r.suggestions.casting as Record<string, number>).cycleTimeHpdcSec).toBe(54);
      expect(r.provenance['cast-hpdc-ct'].basis).toContain('45 + 3 × 3.0');
    });

    it('prefers the OCCT sand cycle estimate over the band', () => {
      const r = runCostInputRules(CASTING_RULES, ctx(
        { ...ALL_ANSWERED, 'material.family': 'cast iron' }, { annualVolume: 1_000 },
      ));
      expect((r.suggestions.casting as Record<string, number>).cycleTimeSandGravHr).toBe(0.262);
      expect(r.provenance['cast-sand-ct'].source).toBe('geometry');
    });

    it('rejects the ray-cast wall artefact on a sparse shell', () => {
      // The documented "27 mm wall on a bumper" trap. A genuinely thin shell:
      // 4,200,000 mm3 across 2,800,000 mm2 gives 2V/S = 3.0 mm, so a ray-cast
      // minimum of 27 mm is physically impossible and must be discarded.
      const bumper = {
        ...HOUSING,
        fillRatio: 0.02,
        volume: { mm3: 4_200_000, cm3: 4200 },
        surfaceArea: { mm2: 2_800_000, cm2: 28_000 },
        wallThickness: { ...HOUSING.wallThickness!, minMm: 27 },
      } as OCCTGeometry;
      expect(minWallMm(ctx(ALL_ANSWERED, { geo: bumper }))).toBe(3);

      // A ray-cast wall consistent with the shell estimate is kept, even on a
      // sparse part — the guard must not fire on every hollow thing.
      const plausible = { ...bumper, wallThickness: { ...HOUSING.wallThickness!, minMm: 2.6 } } as OCCTGeometry;
      expect(minWallMm(ctx(ALL_ANSWERED, { geo: plausible }))).toBe(2.6);

      // And a solid part is trusted as measured.
      expect(minWallMm(ctx(ALL_ANSWERED))).toBe(2.4);
    });

    it('scores complexity from undercuts, free-form faces and setups', () => {
      // The housing is genuinely simple to CAST — one undercut, almost no
      // free-form area. Casting complexity is about cores and slides, not about
      // how much machining follows.
      expect(complexityBand(ctx(ALL_ANSWERED))).toBe('low');

      // Two undercuts is the point where a slide becomes likely.
      const withSlides = {
        ...HOUSING, draftAnalysis: { ...HOUSING.draftAnalysis!, undercutFaceCount: 3 },
      } as OCCTGeometry;
      expect(complexityBand(ctx(ALL_ANSWERED, { geo: withSlides }))).toBe('medium');
      const gnarly = {
        ...HOUSING,
        draftAnalysis: { ...HOUSING.draftAnalysis!, undercutFaceCount: 9 },
        features: { ...HOUSING.features!, freeFormFaceCount: 40 },
        setupAnalysis: { estimatedSetupCount: 5, principalDirections: [] },
      } as OCCTGeometry;
      expect(complexityBand(ctx(ALL_ANSWERED, { geo: gnarly }))).toBe('high');
      const simple = {
        ...HOUSING,
        draftAnalysis: { ...HOUSING.draftAnalysis!, undercutFaceCount: 0 },
        features: { ...HOUSING.features!, freeFormFaceCount: 0 },
        setupAnalysis: { estimatedSetupCount: 1, principalDirections: [] },
      } as OCCTGeometry;
      expect(complexityBand(ctx(ALL_ANSWERED, { geo: simple }))).toBe('low');
    });
  });

  describe('material facts', () => {
    it('does not infer a family from density, because we measure volume not mass', () => {
      // Guarding against a circular derivation: assuming a density to pick a
      // family, then using that family's density to compute the mass.
      const r = materialFacts(ctx());
      expect(r.family).toBeNull();
      expect(r.decision).toBeDefined();
    });

    it('accepts a filename prior when the commodity allows that family', () => {
      const r = materialFacts(ctx({}, { filename: 'ADC12-housing.step' }));
      expect(r.family).toBe('aluminium');
      expect(r.basis).toContain('file name');
    });

    it('does not accept a filename prior the commodity cannot make', () => {
      // "PA6-cover.step" names a plastic; you cannot sand-cast PA6.
      const r = materialFacts(ctx({}, { filename: 'PA6-cover.step' }));
      expect(r.family).toBeNull();
      expect(r.decision).toBeDefined();
    });

    it('needs no question when the commodity admits one family', () => {
      const r = materialFacts(ctx({}, { commodity: 'injection_moulding' }));
      expect(r.family).toBe('plastic');
      expect(r.decision).toBeUndefined();
    });
  });

  it('is deterministic', () => {
    const a = runCostInputRules(CASTING_RULES, ctx(ALL_ANSWERED));
    const b = runCostInputRules(CASTING_RULES, ctx(ALL_ANSWERED));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
