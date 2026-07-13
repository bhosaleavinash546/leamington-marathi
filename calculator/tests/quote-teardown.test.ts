import { describe, it, expect } from 'vitest';
import { analyzeQuote, type TeardownInput } from '../src/engine/quote-teardown.js';
import type { Breakdown8Bucket } from '../src/engine/types.js';

const should: Breakdown8Bucket = {
  rawMaterial: 40, process: 20, labour: 10, tooling: 5,
  packaging: 1, logistics: 2, overhead: 12, margin: 10,
}; // total 100

const base = (over: Partial<TeardownInput> = {}): TeardownInput => ({
  commodity: 'machining', shouldCost: 100, shouldBreakdown: should,
  supplierQuoteGBP: 118, annualVolume: 5000, materialFamily: 'Aluminium', ...over,
});

describe('quote teardown — negotiation intelligence', () => {
  it('computes PPV, RAG and annual impact', () => {
    const r = analyzeQuote(base());
    expect(r.verdict.ppvGBP).toBe(18);
    expect(r.verdict.ppvPct).toBe(18);
    expect(r.verdict.annualImpactGBP).toBe(90000);   // 18 × 5000
    expect(r.verdict.rag).toBe('red');               // >15%
  });

  it('flags a competitive quote as green with a hold recommendation', () => {
    const r = analyzeQuote(base({ supplierQuoteGBP: 103 }));
    expect(r.verdict.rag).toBe('green');
    expect(r.headline.toLowerCase()).toContain('within');
  });

  it('attribution mode when no breakdown given', () => {
    const r = analyzeQuote(base());
    expect(r.mode).toBe('attribution');
    // still produces levers + questions + closing plays for the gap
    expect(r.levers.length).toBeGreaterThan(0);
    expect(r.supplierQuestions.length).toBeGreaterThan(0);
    expect(r.closingPlays.length).toBeGreaterThan(0);
  });

  it('line-by-line mode when supplier discloses a breakdown, gaps ranked by £', () => {
    const r = analyzeQuote(base({
      supplierBreakdown: { rawMaterial: 52, process: 22, labour: 10, tooling: 5, packaging: 1, logistics: 2, overhead: 14, margin: 12 },
    }));
    expect(r.mode).toBe('line-by-line');
    // material gap (52-40=12) is the biggest → ranked first
    expect(r.gaps[0].bucket).toBe('rawMaterial');
    expect(r.gaps[0].gapGBP).toBe(12);
    // a lever exists for the material gap
    expect(r.levers.some(l => l.area === 'Raw Material')).toBe(true);
  });

  it('flags overhead/margin above the commercial benchmark', () => {
    const r = analyzeQuote(base({
      supplierQuoteGBP: 130,
      // margin 26 of 130 = 20% (>12% norm); overhead 26/130=20% (>18%)
      supplierBreakdown: { rawMaterial: 40, process: 20, labour: 10, tooling: 5, packaging: 1, logistics: 2, overhead: 26, margin: 26 },
    }));
    expect(r.benchmarkFlags.some(f => f.includes('Margin'))).toBe(true);
    expect(r.benchmarkFlags.some(f => f.includes('Overhead'))).toBe(true);
  });

  it('produces a causal diagnosis when an index premium is supplied', () => {
    const r = analyzeQuote(base({ impliedIndexPremiumPct: 14, indexCategory: 'Aluminium' }));
    expect(r.causalDiagnosis).toContain('Aluminium');
    expect(r.causalDiagnosis).toContain('14%');
  });

  it('reports whether the quote sits inside the empirical conformal band', () => {
    const inside = analyzeQuote(base({ supplierQuoteGBP: 104, conformalHalfWidthPct: 6.5 }));
    expect(inside.verdict.withinConformal).toBe(true);    // 4% ≤ 6.5%
    const outside = analyzeQuote(base({ supplierQuoteGBP: 118, conformalHalfWidthPct: 6.5 }));
    expect(outside.verdict.withinConformal).toBe(false);  // 18% > 6.5%
  });

  it('expected recovery sums to the total opportunity', () => {
    const r = analyzeQuote(base({
      supplierBreakdown: { rawMaterial: 52, process: 20, labour: 10, tooling: 5, packaging: 1, logistics: 2, overhead: 12, margin: 16 },
    }));
    const summed = r.levers.reduce((s, l) => s + l.expectedRecoveryGBP, 0);
    expect(r.totalOpportunityGBP).toBe(summed);
    expect(r.totalOpportunityGBP).toBeGreaterThan(0);
  });
});
