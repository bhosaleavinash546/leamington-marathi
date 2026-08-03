/**
 * The rule runner's contract — the behaviours everything else depends on.
 *
 * These are deliberately about the ENGINE, not about any particular commodity's
 * numbers: determinism, the ask-don't-guess rule, decision de-duplication, and
 * the guarantee that prompt text and computed value are the same number.
 */
import { describe, it, expect } from 'vitest';
import { runCostInputRules, renderCommodityRulesPrompt } from '../src/engine/cost-input-rules/engine.js';
import { decided, ask } from '../src/engine/cost-input-rules/types.js';
import type {
  CommodityRuleSpec, RuleContext, Decision,
} from '../src/engine/cost-input-rules/types.js';
import type { OCCTGeometry } from '../src/engine/ai-analysis.js';

const GEO = {
  status: 'success',
  volume: { mm3: 1_037_000, cm3: 1037 },
  wallThickness: {
    minMm: 2.4, maxMm: 4.1, meanMm: 3.0, stdDevMm: 0.4,
    sampleCount: 400, method: 'ray_cast', uniformity: 'good',
  },
} as unknown as OCCTGeometry;

const ctx = (answers: Record<string, unknown> = {}): RuleContext => ({
  geo: GEO, geometryQuality: 'occt', commodity: 'casting',
  annualVolume: 60_000, filename: 'housing.step', answers,
});

const MATERIAL_DECISION: Decision = {
  id: 'material.family',
  kind: 'material_family',
  question: 'Is this part metal or plastic?',
  why: 'The same solid is ~2.9x heavier in steel than aluminium — the CAD file cannot tell us.',
  options: [
    { value: 'aluminium', label: 'Aluminium', consequence: '2.80 kg' },
    { value: 'steel', label: 'Steel', consequence: '8.14 kg' },
  ],
  blockedFieldIds: [],
  blockedRuleIds: [],
  severity: 'blocking',
};

/** Two decided rules, plus two that both wait on the SAME question. */
const SPEC: CommodityRuleSpec = {
  commodity: 'casting',
  header: 'CASTING COST INPUT RULES:',
  rules: [
    {
      id: 'casting.hpdc.cycleTimeSec',
      path: 'casting.cycleTimeHpdcSec',
      fieldId: 'cast-hpdc-ct',
      label: 'cycleTimeHpdcSec',
      evaluate: (c) => {
        const wall = c.geo.wallThickness!.meanMm;
        return decided('casting.hpdc.cycleTimeSec', 45 + 3 * wall, 'rule',
          `45 + 3 × ${wall.toFixed(1)} mm mean wall`, 0.9);
      },
    },
    {
      id: 'casting.dieLife',
      path: 'casting.dieMouldLife',
      fieldId: 'cast-hpdc-die-life',
      label: 'dieMouldLife',
      evaluate: () => decided('casting.dieLife', 150_000, 'library', 'HPDC die life band'),
    },
    {
      id: 'casting.netWeight',
      path: 'casting.netWeightKg',
      fieldId: 'cast-part-wt',
      label: 'netWeightKg',
      evaluate: (c) => (c.answers['material.family']
        ? decided('casting.netWeight', 2.8, 'engineer', 'volume × chosen density')
        : ask(MATERIAL_DECISION)),
    },
    {
      id: 'casting.materialId',
      path: 'casting.materialId',
      fieldId: 'cast-mat',
      label: 'materialId',
      evaluate: (c) => (c.answers['material.family']
        ? decided('casting.materialId', 'mat-adc12', 'engineer', 'chosen family → die-cast grade')
        : ask(MATERIAL_DECISION)),
    },
  ],
};

describe('cost-input rule engine', () => {
  it('is deterministic — same input, deep-equal output', () => {
    const a = runCostInputRules(SPEC, ctx({ 'material.family': 'aluminium' }));
    const b = runCostInputRules(SPEC, ctx({ 'material.family': 'aluminium' }));
    expect(a).toEqual(b);
    // Key order too — the analysis cache keys on this.
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('asks rather than guesses when it cannot decide', () => {
    const r = runCostInputRules(SPEC, ctx());
    expect(r.status).toBe('needs_decision');
    expect(r.decisions).toHaveLength(1);
    expect(r.decisions[0].id).toBe('material.family');
    // and it does NOT invent the blocked values
    expect(r.provenance['cast-part-wt']).toBeUndefined();
    expect(r.provenance['cast-mat']).toBeUndefined();
  });

  it('still fills every field that does not depend on the open question', () => {
    // A blocked run must not return an empty form — the engineer should see
    // what IS known and exactly what is missing.
    const r = runCostInputRules(SPEC, ctx());
    expect((r.suggestions.casting as Record<string, unknown>).cycleTimeHpdcSec).toBe(54);
    expect((r.suggestions.casting as Record<string, unknown>).dieMouldLife).toBe(150_000);
  });

  it('de-duplicates one question asked by several rules, and records what it blocks', () => {
    const r = runCostInputRules(SPEC, ctx());
    expect(r.decisions).toHaveLength(1);
    const d = r.decisions[0];
    expect(d.blockedRuleIds.sort()).toEqual(['casting.materialId', 'casting.netWeight']);
    expect(d.blockedFieldIds.sort()).toEqual(['cast-mat', 'cast-part-wt']);
  });

  it('completes once the question is answered', () => {
    const r = runCostInputRules(SPEC, ctx({ 'material.family': 'aluminium' }));
    expect(r.status).toBe('complete');
    expect(r.decisions).toHaveLength(0);
    expect(r.provenance['cast-part-wt'].source).toBe('engineer');
  });

  it('carries a justification and a confidence on every filled field', () => {
    const r = runCostInputRules(SPEC, ctx({ 'material.family': 'aluminium' }));
    for (const [field, p] of Object.entries(r.provenance)) {
      expect(p.basis, field).toBeTruthy();
      expect(p.confidence, field).toBeGreaterThan(0);
      expect(r.fieldConfidences[field]).toBe(p.confidence);
    }
  });

  it('survives a throwing rule instead of failing the whole costing', () => {
    const bad: CommodityRuleSpec = {
      ...SPEC,
      rules: [
        ...SPEC.rules.slice(0, 1),
        { id: 'boom', path: 'casting.boom', label: 'boom',
          evaluate: () => { throw new Error('kaboom'); } },
      ],
    };
    const r = runCostInputRules(bad, ctx({ 'material.family': 'aluminium' }));
    expect((r.suggestions.casting as Record<string, unknown>).cycleTimeHpdcSec).toBe(54);
    expect(r.notes.join(' ')).toContain('boom');
  });

  it('renders the SAME number in the prompt as the engine computes', () => {
    // The reason the rules are moving out of the prompt at all.
    const c = ctx({ 'material.family': 'aluminium' });
    const text = renderCommodityRulesPrompt(SPEC, c);
    const value = (runCostInputRules(SPEC, c).suggestions.casting as Record<string, unknown>)
      .cycleTimeHpdcSec;
    expect(value).toBe(54);
    expect(text).toContain(`cycleTimeHpdcSec=${String(value)}`);
    // The derivation travels with the value, so the model is told WHY, not just what.
    expect(text).toContain('45 + 3 × 3.0 mm mean wall');
    // And every decided rule is rendered from its own computed value — assert it
    // for the whole spec, not just the one line, or this test proves very little.
    const r = runCostInputRules(SPEC, c);
    for (const [, p] of Object.entries(r.provenance)) {
      expect(text, p.ruleId).toContain(p.basis);
    }
  });

  it('marks an undecided field in the prompt instead of leaving the model to guess', () => {
    const text = renderCommodityRulesPrompt(SPEC, ctx());
    expect(text).toContain('netWeightKg: UNDECIDED');
    expect(text).toContain('Is this part metal or plastic?');
  });

  it('honours appliesWhen so subtype rules stay out of the wrong block', () => {
    const spec: CommodityRuleSpec = {
      ...SPEC,
      rules: [{
        id: 'sand.only', path: 'casting.sandOnly', fieldId: 'cast-sand-ct', label: 'sandOnly',
        appliesWhen: (c) => c.answers.subtype === 'sand',
        evaluate: () => decided('sand.only', 1, 'rule', 'sand'),
      }],
    };
    expect(runCostInputRules(spec, ctx({ subtype: 'hpdc' })).provenance['cast-sand-ct'])
      .toBeUndefined();
    expect(runCostInputRules(spec, ctx({ subtype: 'sand' })).provenance['cast-sand-ct'])
      .toBeDefined();
  });
});
