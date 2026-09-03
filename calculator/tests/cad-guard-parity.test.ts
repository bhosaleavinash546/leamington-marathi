/**
 * The same guards on every path.
 *
 * The deterministic path is the default, and it ran FEWER guards than the AI
 * path: the near-net machining cap was applied after the deterministic branch
 * had already returned, and both gear coherence checks were structurally dead
 * there because the "stated" side was never supplied (stated always equalled
 * measured). Leanings were also assumed on both paths, although an engineer
 * is present on one of them. All four are pinned here without a kernel.
 */
import { describe, it, expect } from 'vitest';
import {
  ruleContextFor, statedFromAnswers, runAllGuards, isCostable, parseAcknowledged,
} from '../server/routes/cad.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';
import type { Decision } from '../src/engine/cost-input-rules/types.js';

const geo: OCCTGeometry = {
  status: 'success', partName: 'x',
  boundingBox: { xMm: 120, yMm: 80, zMm: 40 },
  volume: { mm3: 200_000, cm3: 200 }, surfaceArea: { mm2: 40_000, cm2: 400 }, fillRatio: 0.52,
  weights: { aluminiumKg: 0.54, steelKg: 1.57, plasticKg: 0.21, castIronKg: 1.43, copperKg: 1.79, titaniumKg: 0.89 },
  gear: { likelyGear: true, teeth: 38, tipDiameterMm: 120, faceWidthMm: 20, boreDiameterMm: 40,
          derivedNormalModuleMm: 3, moduleBasis: 'OD/(z+2)', teethBasis: 'tip patches', helixAngleDeg: 0, internal: false },
} as OCCTGeometry;

const overrides = { annualVolume: 50_000, forcedCommodity: '', forcedMaterial: '' };

describe('leanings are assumed only when nobody is at the screen', () => {
  it('AI path assumes leanings; deterministic path blocks', () => {
    expect(ruleContextFor('casting', geo, 'x.step', overrides, {}, 'ai').assumeLeanings).toBe(true);
    expect(ruleContextFor('casting', geo, 'x.step', overrides, {}, 'both').assumeLeanings).toBe(false);
    expect(ruleContextFor('casting', geo, 'x.step', overrides, {}, 'deterministic').assumeLeanings).toBe(false);
  });

  it('geometryQuality says mesh when the wall came from the STL heuristic', () => {
    const stl = { ...geo, wallThickness: { minMm: 1, maxMm: 4, meanMm: 2, stdDevMm: 0.6, sampleCount: 0, method: 'stl_heuristic', uniformity: 'unknown' } } as unknown as OCCTGeometry;
    expect(ruleContextFor('machining', stl, 'x.stl', overrides).geometryQuality).toBe('stl');
    expect(ruleContextFor('machining', geo, 'x.step', overrides).geometryQuality).toBe('occt');
    expect(ruleContextFor('machining', { status: 'error', error: 'x' }, 'x.step', overrides).geometryQuality).toBe('text');
  });
});

describe('gear coherence on the deterministic path', () => {
  it('the engineer\'s typed tooth count is the stated side', () => {
    expect(statedFromAnswers({})).toBeNull();
    expect(statedFromAnswers({ 'gear.teethEntry': '40' })).toEqual({ gear: { teeth: 40, drawingTeeth: 40 } });
    expect(statedFromAnswers({ 'gear.moduleEntry': '2.5' })).toEqual({ gear: { normalModuleMm: 2.5 } });
  });

  it('gear_teeth_mismatch fires when the typed count disagrees with the counted teeth', () => {
    const analysis = { costInputSuggestions: { recommendedCommodity: 'gear', gear: { teeth: 38 } }, geometry: { estimatedVolumeCm3: 200 } };
    const w = runAllGuards(analysis, geo, 200, statedFromAnswers({ 'gear.teethEntry': '40' }));
    const hit = w.find(x => x.code === 'gear_teeth_mismatch');
    expect(hit).toBeTruthy();
    expect(hit!.blocking).toBe(true);
    expect(hit!.message).toMatch(/40 teeth/);
    expect(hit!.message).toMatch(/38/);
  });

  it('and stays silent when the typed count matches — measured vs itself was the old dead check', () => {
    const analysis = { costInputSuggestions: { recommendedCommodity: 'gear', gear: { teeth: 38 } }, geometry: { estimatedVolumeCm3: 200 } };
    expect(runAllGuards(analysis, geo, 200, statedFromAnswers({ 'gear.teethEntry': '38' })).some(x => x.code === 'gear_teeth_mismatch')).toBe(false);
    expect(runAllGuards(analysis, geo, 200, null).some(x => x.code === 'gear_teeth_mismatch')).toBe(false);
  });
});

describe('the near-net machining cap runs through the shared guard', () => {
  it('a casting with from-solid machining hours is capped and says so', () => {
    const analysis = {
      costInputSuggestions: { recommendedCommodity: 'casting', netWeightKg: 1.4, estimatedCycleTimeHr: 3.0,
        estimatedOperations: [{ operationName: 'Mill', cycleTimeHr: 3.0 }] },
      geometry: { estimatedVolumeCm3: 200 },
      processRecommendations: [],
    };
    const w = runAllGuards(analysis, geo, 200, null);
    expect(w.some(x => x.code === 'near_net_machining_capped')).toBe(true);
    // The cap is applied in place, so the deterministic payload carries the capped hours.
    expect(analysis.costInputSuggestions.estimatedCycleTimeHr).toBeLessThan(3.0);
  });
});

describe('costable', () => {
  const blocking: Decision = { id: 'material.family', kind: 'material_family', question: 'q', why: 'w', options: [], blockedFieldIds: [], blockedRuleIds: [], severity: 'blocking' };
  const advisory: Decision = { ...blocking, id: 'adv', severity: 'advisory' };
  it('is false with an open blocking decision, true with only advisory ones', () => {
    expect(isCostable([blocking], [])).toBe(false);
    expect(isCostable([advisory], [])).toBe(true);
  });
  it('a blocking sanity code must be acknowledged BY CODE', () => {
    const w = [{ code: 'weight_inconsistent_steel', message: 'm', severity: 'warn' as const, blocking: true }];
    expect(isCostable([], w)).toBe(false);
    expect(isCostable([], w, ['weight_inconsistent_aluminum'])).toBe(false);
    expect(isCostable([], w, ['weight_inconsistent_steel'])).toBe(true);
  });
  it('parseAcknowledged accepts a JSON array or a comma list and drops anything that is not a code', () => {
    expect(parseAcknowledged('["a_b","c1"]')).toEqual(['a_b', 'c1']);
    expect(parseAcknowledged('a_b,c1')).toEqual(['a_b', 'c1']);
    expect(parseAcknowledged(['ok_code', 'bad code!', 42, '<x>'])).toEqual(['ok_code']);
    expect(parseAcknowledged(undefined)).toEqual([]);
  });
});
