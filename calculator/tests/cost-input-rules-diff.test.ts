/**
 * The rules-vs-AI comparison itself.
 *
 * `diffAnalyses` is what `mode:'both'` returns and what the results panel now
 * renders, and it had no test — it shipped in Stage 8 as an audit tool nothing
 * on screen consumed, so nothing exercised it either.
 *
 * The behaviour worth pinning is the tolerance. Both sides round differently:
 * the rules to a stated precision, the model to whatever it felt like. An exact
 * comparison reports that rounding as disagreement and buries the real gaps
 * underneath it — which, on a panel that leads with disagreements, would be the
 * difference between a useful screen and noise.
 */
import { describe, it, expect } from 'vitest';
import { diffAnalyses, formatDiff } from '../src/engine/cost-input-rules/diff.js';
import type { CostInputRuleResult } from '../src/engine/cost-input-rules/types.js';

/** Only the two fields `diffAnalyses` reads: `byRule` for bases, `decisions`. */
const result = (
  byRule: Record<string, { basis: string }> = {},
  decisions: Array<{ id: string }> = [],
): CostInputRuleResult => ({
  status: 'complete', commodity: {} as never, suggestions: {},
  provenance: {}, byRule: byRule as never, fieldConfidences: {},
  decisions: decisions as never, answers: {}, notes: [], engineVersion: 1,
});

describe('diffAnalyses', () => {
  describe('the tolerance', () => {
    it('treats a rounding difference as agreement', () => {
      // 0.5% apart — inside any sane rounding, nowhere near a cost.
      const d = diffAnalyses({ netWeightKg: 4.5 }, { netWeightKg: 4.4776 }, result());
      expect(d.diffs[0].verdict).toBe('agree');
      expect(d.agreed).toBe(1);
      expect(d.differed).toBe(0);
    });

    it('reports anything past 1% as a disagreement, with its size', () => {
      const d = diffAnalyses({ netWeightKg: 4.5 }, { netWeightKg: 13.5 }, result());
      expect(d.diffs[0].verdict).toBe('differ');
      // Signed rule-vs-AI: the rule is 67% below what the model said.
      expect(d.diffs[0].deltaPct).toBeCloseTo(-0.667, 3);
    });

    it('does not divide by an AI zero', () => {
      const d = diffAnalyses({ toolingCost: 118_000 }, { toolingCost: 0 }, result());
      expect(d.diffs[0].deltaPct).toBe(Infinity);
      expect(d.diffs[0].verdict).toBe('differ');
      // Two zeros are agreement, not an indeterminate form.
      expect(diffAnalyses({ x: 0 }, { x: 0 }, result()).diffs[0].verdict).toBe('agree');
    });
  });

  describe('what each side produced', () => {
    it('flattens nested suggestions to dot paths', () => {
      const d = diffAnalyses(
        { casting: { yieldFraction: 0.65 } }, { casting: { yieldFraction: 0.9 } }, result());
      expect(d.diffs[0].field).toBe('casting.yieldFraction');
    });

    it('marks fields only one side has', () => {
      const d = diffAnalyses({ dieLife: 30_000 }, { someAIField: 'x' }, result());
      const byField = Object.fromEntries(d.diffs.map(x => [x.field, x.verdict]));
      expect(byField['dieLife']).toBe('rule-only');
      expect(byField['someAIField']).toBe('ai-only');
      expect(d.ruleOnly).toBe(1);
      expect(d.aiOnly).toBe(1);
    });

    it('compares non-numbers as strings', () => {
      expect(diffAnalyses({ p: 'hpdc' }, { p: 'sand' }, result()).diffs[0].verdict).toBe('differ');
      expect(diffAnalyses({ p: 'hpdc' }, { p: 'hpdc' }, result()).diffs[0].verdict).toBe('agree');
      expect(diffAnalyses({ p: 'hpdc' }, { p: 'sand' }, result()).diffs[0].deltaPct).toBeNull();
    });
  });

  describe('the basis', () => {
    it('attaches the rule’s reasoning to its row', () => {
      const d = diffAnalyses({ netWeightKg: 4.5 }, { netWeightKg: 13.5 },
        result({ netWeightKg: { basis: '1667 cm³ × 0.0027 kg/cm³ (PP)' } }));
      expect(d.diffs[0].basis).toContain('1667 cm³');
    });

    it('leaves it empty rather than inventing one', () => {
      expect(diffAnalyses({ x: 1 }, { x: 2 }, result()).diffs[0].basis).toBe('');
    });
  });

  it('carries the questions the rules refused to answer', () => {
    const d = diffAnalyses({ x: 1 }, { x: 1 },
      result({}, [{ id: 'material.family' }, { id: 'service.safetyCritical' }]));
    expect(d.undecided).toEqual(['material.family', 'service.safetyCritical']);
  });

  it('formats a terminal table of the disagreements only', () => {
    const d = diffAnalyses(
      { netWeightKg: 4.5, cycleTimeHr: 0.2 }, { netWeightKg: 13.5, cycleTimeHr: 0.2 }, result());
    const table = formatDiff(d);
    expect(table).toContain('netWeightKg');
    expect(table).not.toContain('cycleTimeHr');   // agreed — not worth a line
    expect(table).toContain('1 agree · 1 differ');
  });
});
