/**
 * The hard-assign: what stops the prompt being a polite request.
 *
 * `renderCommodityRulesPrompt` tells the model "yieldFraction=0.65, use
 * verbatim". A model can return 0.9 anyway, and until this layer existed
 * nothing noticed. These tests pin the three things that matter: a contradicted
 * value is overwritten and reported, a field with no rule is left alone, and a
 * rule path with no consumer is named rather than silently dropped.
 */
import { describe, it, expect } from 'vitest';
import { applyRuleDecisions, RULE_PATH_MAP } from '../src/engine/cost-input-rules/apply.js';
import { runCostInputRules } from '../src/engine/cost-input-rules/engine.js';
import { CASTING_RULES } from '../src/engine/cost-input-rules/commodities/casting.js';
import { COMPOSITES_RULES } from '../src/engine/cost-input-rules/commodities/composites.js';
import { RULE_SPECS } from '../src/engine/cost-input-rules/index.js';
import { MATERIAL_FAMILY_DECISION_ID } from '../src/engine/cost-input-rules/derive/material.js';
import {
  PRESSURE_TIGHT_DECISION_ID, TOLERANCE_CLASS_DECISION_ID, SAFETY_CRITICAL_DECISION_ID,
} from '../src/engine/cost-input-rules/derive/service-context.js';
import { LAMINATE_DECISION_ID } from '../src/engine/cost-input-rules/derive/laminate.js';
import type { RuleContext } from '../src/engine/cost-input-rules/types.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';

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

const ANSWERED = {
  [MATERIAL_FAMILY_DECISION_ID]: 'aluminium',
  [PRESSURE_TIGHT_DECISION_ID]: 'no',
  [TOLERANCE_CLASS_DECISION_ID]: 'standard',
  [SAFETY_CRITICAL_DECISION_ID]: 'no',
};

const ctx = (answers: Record<string, unknown> = ANSWERED, over: Partial<RuleContext> = {}): RuleContext => ({
  geo: HOUSING, geometryQuality: 'occt', commodity: 'casting', commoditySource: 'engineer',
  annualVolume: 60_000, filename: 'housing.step', answers, ...over,
});

/** A model reply of the shape `cadAnalyzeJSON` produces. */
const modelReply = (casting: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  costInputSuggestions: {
    recommendedCommodity: 'casting',
    netWeightKg: 9.9,
    materialId: 'mat-a356',
    estimatedCycleTimeHr: 0.5,
    estimatedSetupTimeHr: 0.75,
    estimatedOperations: [],
    casting,
    ...extra,
  },
} as Record<string, unknown> & { costInputSuggestions: Record<string, unknown> });

describe('the rules overwrite the model', () => {
  it('replaces a yield the model disagreed with, and says it did', () => {
    // The old prompt's investment constant. A model that has seen a thousand
    // should-costs will happily return it.
    const analysis = modelReply({ subtype: 'investment', yieldFraction: 0.9, cavities: 4 });
    const result = applyRuleDecisions(analysis, runCostInputRules(CASTING_RULES, ctx()));

    const c = analysis.costInputSuggestions.casting as Record<string, number | string>;
    expect(c.yieldFraction).toBe(0.65);          // HPDC band midpoint
    expect(c.subtype).toBe('hpdc');
    expect(c.cavities).toBe(1);

    const yieldOverride = result.overridden.find(o => o.field === 'casting.yieldFraction')!;
    expect(yieldOverride.from).toBe(0.9);
    expect(yieldOverride.to).toBe(0.65);
    expect(yieldOverride.contradicted).toBe(true);
    expect(yieldOverride.basis).toContain('0.55–0.75');
  });

  it('does not cry foul when the model agreed', () => {
    const analysis = modelReply({ subtype: 'hpdc', yieldFraction: 0.65 });
    const result = applyRuleDecisions(analysis, runCostInputRules(CASTING_RULES, ctx()));
    const y = result.overridden.find(o => o.field === 'casting.yieldFraction')!;
    expect(y.contradicted).toBe(false);
  });

  it('leaves fields no rule decided exactly as the model returned them', () => {
    const analysis = modelReply({ subtype: 'sand' }, { manufacturabilityScore: 71 });
    applyRuleDecisions(analysis, runCostInputRules(CASTING_RULES, ctx()));
    // Nothing in CASTING_RULES touches this, so it must survive untouched.
    expect(analysis.costInputSuggestions.manufacturabilityScore).toBe(71);
    expect(analysis.costInputSuggestions.recommendedCommodity).toBe('casting');
  });

  it('writes the rule confidence over the model confidence', () => {
    const analysis = modelReply({ yieldFraction: 0.9 },
      { fieldConfidences: { 'cast-yield': 0.99 } });
    applyRuleDecisions(analysis, runCostInputRules(CASTING_RULES, ctx()));
    const fc = analysis.costInputSuggestions.fieldConfidences as Record<string, number>;
    // The rule reads the band with 0.9 confidence; the model's 0.99 was its own
    // opinion of a number it had guessed.
    expect(fc['cast-yield']).toBeLessThan(0.99);
  });

  it('overwrites nothing when the rules are blocked, and names what is open', () => {
    const analysis = modelReply({ subtype: 'investment', yieldFraction: 0.9 });
    const before = JSON.stringify(analysis.costInputSuggestions.casting);
    const result = applyRuleDecisions(analysis, runCostInputRules(CASTING_RULES, ctx({})));

    expect(JSON.stringify(analysis.costInputSuggestions.casting)).toBe(before);
    expect(result.undecided).toContain(MATERIAL_FAMILY_DECISION_ID);
    expect(result.overridden.filter(o => o.field.startsWith('casting.'))).toHaveLength(0);
  });

  it('survives a reply with no costInputSuggestions at all', () => {
    const r = applyRuleDecisions({} as never, runCostInputRules(CASTING_RULES, ctx()));
    expect(r.overridden).toHaveLength(0);
  });
});

describe('the path map', () => {
  it('converts units where the two shapes disagree', () => {
    const compCtx: RuleContext = {
      geo: HOUSING, geometryQuality: 'occt', commodity: 'composites',
      commoditySource: 'engineer', annualVolume: 500, filename: 'panel.step',
      answers: { [LAMINATE_DECISION_ID]: 'prepreg-cf' },
    };
    const analysis = modelReply({}, { composites: { areaCm2: 1, cureTimeSec: 1 } });
    applyRuleDecisions(analysis, runCostInputRules(COMPOSITES_RULES, compCtx));
    const c = analysis.costInputSuggestions.composites as Record<string, number>;

    // The rule computes 0.061 m²; the consumer reads cm². A mechanical prefix
    // map would have written 0.061 into a cm² field — wrong by 10,000x.
    expect(c.areaCm2).toBe(610);
    // Likewise 3 hr of cure into a field read as seconds.
    expect(c.cureTimeSec).toBe(10_800);
  });

  it('translates the rubber process vocabulary', () => {
    expect(RULE_PATH_MAP['rubber.process'].transform!('compression_mould')).toBe('compression');
    expect(RULE_PATH_MAP['rubber.process'].transform!('injection_mould_lsr')).toBe('injection');
    // An unmapped word passes through rather than becoming undefined.
    expect(RULE_PATH_MAP['rubber.process'].transform!('die_cut')).toBe('die_cut');
  });

  it('names every computed value that nothing downstream reads', () => {
    // A gap worth seeing. The machining stock weight is the big one: the rules
    // measure the billet off the bounding box, and the browser still derives it
    // as a flat net x 1.4 because there is no field to carry the real number.
    const result = applyRuleDecisions(modelReply({}), runCostInputRules(CASTING_RULES, ctx()));
    for (const path of result.notWritten) {
      expect(RULE_PATH_MAP[path], `${path} should be absent from the map`).toBeUndefined();
    }
  });

  it('maps nothing that is not a real rule path', () => {
    // Every entry in the map must correspond to a rule some spec actually
    // exports, or it is dead weight that reads as coverage.
    const known = new Set<string>();
    for (const spec of Object.values(RULE_SPECS)) for (const r of spec.rules) known.add(r.path);
    for (const path of Object.keys(RULE_PATH_MAP)) {
      expect(known.has(path), `${path} is mapped but no spec emits it`).toBe(true);
    }
  });
});
