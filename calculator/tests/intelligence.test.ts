import { describe, it, expect } from 'vitest';
import { computeIntelligenceSummary } from '../src/engine/intelligence.js';
import type { KnowledgeCase } from '../src/engine/part-similarity.js';

const JAN = Date.UTC(2026, 0, 15), FEB = Date.UTC(2026, 1, 15), MAR = Date.UTC(2026, 2, 15);
let _id = 0;
const kase = (commodity: string, totalCost: number, actualCost: number | undefined, savedAt: number, userAdjusted = false): KnowledgeCase =>
  ({ id: String(_id++), savedAt, partName: `P${_id}`, fingerprint: { commodity }, totalCost, currency: 'GBP', actualCost, userAdjusted });

describe('intelligence summary (trust dashboard)', () => {
  it('reports size, coverage and honest nulls with no actuals', () => {
    const s = computeIntelligenceSummary([kase('machining', 40, undefined, JAN), kase('casting', 55, undefined, JAN)]);
    expect(s.totalCases).toBe(2);
    expect(s.withActuals).toBe(0);
    expect(s.overallMapePct).toBeNull();
    expect(s.biasDirection).toBeNull();
    expect(s.verdict).toBe('insufficient-data');
    expect(s.byCommodity.machining).toBe(1);
  });

  it('computes MAPE and detects under-estimation bias from actuals', () => {
    // Estimates 100, actuals ~115 → MAPE ~13%, model under-estimates.
    const cases = [kase('machining', 100, 115, JAN), kase('machining', 100, 118, JAN), kase('machining', 100, 112, FEB)];
    const s = computeIntelligenceSummary(cases);
    expect(s.withActuals).toBe(3);
    expect(s.overallMapePct).toBeGreaterThan(10);
    expect(s.overallMapePct).toBeLessThan(16);
    expect(s.biasDirection).toBe('under');
    expect(s.trend.map(t => t.month)).toEqual(['2026-01', '2026-02']);
  });

  it('verdict "improving" when monthly MAPE falls materially', () => {
    const cases = [
      kase('casting', 100, 125, JAN), kase('casting', 100, 122, JAN),      // Jan MAPE ~19%
      kase('casting', 100, 104, MAR), kase('casting', 100, 103, MAR),      // Mar MAPE ~3.4%
    ];
    const s = computeIntelligenceSummary(cases);
    expect(s.verdict).toBe('improving');
    expect(s.trend[0].mapePct).toBeGreaterThan(s.trend[1].mapePct);
  });

  it('counts user-corrected analyses (expert feedback signal)', () => {
    const s = computeIntelligenceSummary([kase('rubber', 5, undefined, JAN, true), kase('rubber', 6, undefined, JAN)]);
    expect(s.adjustedCases).toBe(1);
  });
});
