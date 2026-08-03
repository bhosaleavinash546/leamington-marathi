/**
 * DFM from the measurement.
 *
 * Ten `analyse*DFM` functions have existed in the tree for a long time, each
 * fed by hand-typed fields behind a manual advisor button, and none of them has
 * ever seen a measured part. What these tests defend is the wiring: the same
 * geometry that sets the cost also runs the manufacturability checks, against
 * the process the rules actually chose.
 *
 * The second thing they defend is the honesty of an empty list. Machining and
 * composites have no analyser, so no issues is "not checked" — and
 * `analysisLimitations` has to say which of the two it means.
 */
import { describe, it, expect } from 'vitest';
import { analyseDFMFromGeometry, DFM_ANALYSED_COMMODITIES } from '../src/engine/cost-input-rules/dfm.js';
import { buildDeterministicAnalysis } from '../src/engine/cost-input-rules/deterministic.js';
import { CASTING_RULES } from '../src/engine/cost-input-rules/commodities/casting.js';
import { MACHINING_RULES } from '../src/engine/cost-input-rules/commodities/machining.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';

/**
 * The die-cast housing from the explainer deck — 3 mm walls, one undercut face.
 * The undercut is the interesting part: it is how the kernel reports negative
 * draft, and HPDC wants 0.5° minimum.
 */
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
  weights: { aluminiumKg: 2.80, steelKg: 8.14, plasticKg: 1.14 },
  toolingCostEstimates: {
    hpdcDieCostGBP: 118_000, gravityMouldCostGBP: 26_400, sandPatternCostGBP: 7_250,
    imMouldCostGBP: 41_500, forgeDieCostGBP: 63_800, progressiveDieCostGBP: 92_300,
  },
  processSpecificEstimates: {
    sandCycleTimeHr: 0.262, sandCycleTimeHrFerrous: 0.447, forgeStrokes: 6,
    investWaxCostGBP: 1.83, investShellCostGBP: 5.49,
  },
  manufacturabilityScore: 72,
} as unknown as OCCTGeometry;

/** Same housing, drafted properly and with even sections — nothing to report. */
const CLEAN_HOUSING = {
  ...HOUSING,
  wallThickness: { ...HOUSING.wallThickness, minMm: 3.0, maxMm: 4.0, meanMm: 3.4 },
  draftAnalysis: { undercutFaceCount: 0, zeroDraftFaceCount: 0, adequateDraftFaceCount: 83, analyzedFaceCount: 83 },
} as unknown as OCCTGeometry;

/** A 2 mm steel bracket with a Ø1.2 mm hole — under the 1×t punch minimum. */
const BRACKET = {
  status: 'success',
  partName: 'bracket',
  boundingBox: { xMm: 180, yMm: 90, zMm: 40 },
  volume: { mm3: 30_000, cm3: 30 },
  surfaceArea: { mm2: 40_000, cm2: 400 },
  wallThickness: { minMm: 2.0, maxMm: 2.0, meanMm: 2.0, sampleCount: 100, method: 'ray_cast', uniformity: 'excellent' },
  sheetMetal: { thicknessMm: 2.0, bendCount: 3, totalBendLengthMm: 240 },
  featureTable: [
    { kind: 'hole', diaMm: 1.2, depthMm: 2.0, count: 2, through: true },
    { kind: 'hole', diaMm: 8.0, depthMm: 2.0, count: 4, through: true },
  ],
  draftAnalysis: { undercutFaceCount: 0, zeroDraftFaceCount: 0, adequateDraftFaceCount: 0, analyzedFaceCount: 0 },
  setupAnalysis: { estimatedSetupCount: 1, principalDirections: [] },
  faces: { total: 60, byType: {} },
  weights: { aluminiumKg: 0.081, steelKg: 0.236, plasticKg: 0.033 },
  manufacturabilityScore: 88,
} as unknown as OCCTGeometry;

const ctx = (
  geo: OCCTGeometry, commodity: string, answers: Record<string, unknown> = {},
): RuleContext => ({
  geo, geometryQuality: 'occt', commodity,
  annualVolume: 60_000, filename: `${geo.partName ?? 'part'}.step`, answers,
});

describe('DFM from the measured geometry', () => {
  describe('the measurement reaches the analyser', () => {
    it('reports the undercut as below-minimum draft on an HPDC casting', () => {
      const issues = analyseDFMFromGeometry(ctx(HOUSING, 'casting'), { process: 'hpdc' });
      const draft = issues.find(i => /draft/i.test(i.description));
      expect(draft).toBeDefined();
      // The kernel classifies faces rather than reporting an angle; an undercut
      // face is negative draft, and HPDC wants 0.5°.
      expect(draft!.description).toContain('-1°');
      expect(draft!.description).toContain('0.5°');
      expect(draft!.severity).toBe('High');
    });

    it('runs against the route the rules chose, not a default', () => {
      // Investment casting runs at zero draft; HPDC wants 0.5°. Same geometry,
      // different answer — which is the whole reason `chosen` is passed in
      // rather than assumed.
      const flat = {
        ...HOUSING,
        draftAnalysis: { undercutFaceCount: 0, zeroDraftFaceCount: 2, adequateDraftFaceCount: 81, analyzedFaceCount: 83 },
      } as unknown as OCCTGeometry;
      const hpdc = analyseDFMFromGeometry(ctx(flat, 'casting'), { process: 'hpdc' });
      const invest = analyseDFMFromGeometry(ctx(flat, 'casting'), { process: 'investment' });
      expect(hpdc.some(i => /draft/i.test(i.description))).toBe(true);
      expect(invest.some(i => /draft/i.test(i.description))).toBe(false);
      // ...and investment's 0.7 mm minimum wall clears a 2.4 mm section that
      // sand casting's 3.0 mm would not.
      const sand = analyseDFMFromGeometry(ctx(flat, 'casting'), { process: 'sand' });
      expect(sand.some(i => /below sand.* minimum/i.test(i.description))).toBe(true);
      expect(invest.some(i => /minimum/i.test(i.description))).toBe(false);
    });

    it('catches an under-size punched hole from the feature table', () => {
      const issues = analyseDFMFromGeometry(ctx(BRACKET, 'sheet_metal'), { materialFamily: 'steel' });
      const hole = issues.find(i => /Ø1\.2/.test(i.description));
      expect(hole).toBeDefined();
      // 1.0 × t for steel = 2.0 mm; the Ø8 holes are fine and the smallest wins.
      expect(hole!.description).toContain('2.0 mm');
    });

    it('says nothing when the part is clean', () => {
      expect(analyseDFMFromGeometry(ctx(CLEAN_HOUSING, 'casting'), { process: 'hpdc' })).toEqual([]);
    });
  });

  describe('what it refuses to invent', () => {
    it('does not run the check at all when the geometry cannot support it', () => {
      const noWalls = { ...HOUSING, wallThickness: undefined } as unknown as OCCTGeometry;
      expect(analyseDFMFromGeometry(ctx(noWalls, 'casting'), { process: 'hpdc' })).toEqual([]);
    });

    it('does not run the draft check when no face was analysed', () => {
      // A fabricated 0° would generate a fabricated warning on every part whose
      // draft was never measured.
      const noDraft = {
        ...HOUSING,
        draftAnalysis: { undercutFaceCount: 0, zeroDraftFaceCount: 0, adequateDraftFaceCount: 0, analyzedFaceCount: 0 },
      } as unknown as OCCTGeometry;
      expect(analyseDFMFromGeometry(ctx(noDraft, 'casting'), { process: 'hpdc' })).toEqual([]);
    });

    it('returns nothing for the two commodities with no analyser', () => {
      expect(analyseDFMFromGeometry(ctx(HOUSING, 'machining'), {})).toEqual([]);
      expect(analyseDFMFromGeometry(ctx(HOUSING, 'composites'), {})).toEqual([]);
      expect(DFM_ANALYSED_COMMODITIES.has('machining')).toBe(false);
      expect(DFM_ANALYSED_COMMODITIES.has('composites')).toBe(false);
    });
  });

  describe('wired into the deterministic analysis', () => {
    it('puts the issues where the report reads them', () => {
      const { analysis } = buildDeterministicAnalysis(
        CASTING_RULES,
        ctx(HOUSING, 'casting', {
          'material.family': 'aluminium', 'service.pressureTight': 'no',
          'service.toleranceClass': 'standard', 'service.safetyCritical': 'no',
        }),
        'housing',
      );
      const dfm = analysis.costInputSuggestions.dfmIssues ?? [];
      expect(dfm.length).toBeGreaterThan(0);
      expect(dfm.some(i => /draft/i.test(i.description))).toBe(true);
      // Every issue must carry a fix — a warning with no action is noise.
      for (const i of dfm) expect(i.fix.length).toBeGreaterThan(0);
    });

    it('qualifies an empty list differently depending on why it is empty', () => {
      const answered = {
        'material.family': 'aluminium', 'service.pressureTight': 'no',
        'service.toleranceClass': 'standard', 'service.safetyCritical': 'no',
      };
      const cast = buildDeterministicAnalysis(
        CASTING_RULES, ctx(CLEAN_HOUSING, 'casting', answered), 'housing');
      const mach = buildDeterministicAnalysis(
        MACHINING_RULES, ctx(HOUSING, 'machining', answered), 'housing');

      expect(cast.analysis.costInputSuggestions.dfmIssues ?? []).toEqual([]);
      expect(mach.analysis.costInputSuggestions.dfmIssues ?? []).toEqual([]);

      // Same empty list, two different meanings, both stated.
      expect(cast.analysis.analysisLimitations.some(l => /checks ran against the measured geometry/.test(l))).toBe(true);
      expect(mach.analysis.analysisLimitations.some(l => /No DFM analyser exists for machining/.test(l))).toBe(true);
      expect(mach.analysis.analysisLimitations.some(l => /not checked/.test(l))).toBe(true);
    });
  });
});
