import { describe, it, expect } from 'vitest';
import { computeAccuracyReport, accuracyHeadline, type AccuracyPoint } from '../src/engine/accuracy.js';

const P = (commodity: string, estimateGBP: number, actualGBP: number): AccuracyPoint => ({ commodity, estimateGBP, actualGBP });

describe('accuracy harness', () => {
  it('computes MAPE, over-bias, and hit-rates for a commodity', () => {
    // Five machining points, all ~4–5% high → high confidence, over-biased.
    const pts = [P('machining', 100, 95), P('machining', 50, 48), P('machining', 200, 190), P('machining', 80, 77), P('machining', 120, 114)];
    const rep = computeAccuracyReport(pts);
    const m = rep.byCommodity.find(c => c.commodity === 'machining')!;
    expect(m.n).toBe(5);
    expect(m.mapePct).toBeGreaterThan(3);
    expect(m.mapePct).toBeLessThan(7);
    expect(m.biasDir).toBe('over');
    expect(m.within10Pct).toBe(1);
    expect(m.confidence).toBe('high');
  });

  it('flags small samples as insufficient rather than reporting false confidence', () => {
    const rep = computeAccuracyReport([P('casting', 100, 90), P('casting', 100, 95), P('casting', 100, 92)]);
    const c = rep.byCommodity.find(x => x.commodity === 'casting')!;
    expect(c.n).toBe(3);
    expect(c.confidence).toBe('insufficient');
    expect(accuracyHeadline(c)).toMatch(/insufficient/i);
  });

  it('detects an under-estimating bias', () => {
    const pts = Array.from({ length: 6 }, (_, i) => P('forging', 80, 100 + i)); // estimates ~20% low
    const c = computeAccuracyReport(pts).byCommodity[0];
    expect(c.biasDir).toBe('under');
    expect(c.biasPct).toBeLessThan(0);
  });

  it('skips invalid points (zero/negative/NaN actuals) and reports the count', () => {
    const rep = computeAccuracyReport([P('rubber', 10, 10), P('rubber', 10, 0), P('rubber', 10, Number.NaN), P('rubber', -5, 10)]);
    expect(rep.skipped).toBe(3);
    expect(rep.totalPoints).toBe(1);
  });

  it('grades a poor commodity as low confidence', () => {
    const pts = Array.from({ length: 6 }, (_, i) => P('composites', 100, 60 + i * 4)); // ~30–60% error
    const c = computeAccuracyReport(pts).byCommodity[0];
    expect(c.confidence).toBe('low');
    expect(c.mapePct).toBeGreaterThan(25);
  });
});

describe('no accuracy figure from made-up or pooled data', () => {
  it('ignores the template EXAMPLE rows the samples CSV ships with', () => {
    // The shipped CSV is five EXAMPLE rows; `npm run accuracy` graded them "high".
    const ex = (c: string, e: number, a: number): AccuracyPoint =>
      ({ commodity: c, estimateGBP: e, actualGBP: a, partName: `EXAMPLE ${c} part`, source: 'EXAMPLE — replace with real quote' });
    const rep = computeAccuracyReport([ex('machining', 86.34, 91), ex('machining', 42.1, 44.5), ex('casting', 142.5, 151),
      ex('injection_moulding', 34.6, 33.2), ex('sheet_metal', 12.8, 13.4)]);
    expect(rep.examples).toBe(5);
    expect(rep.totalPoints).toBe(0);
    expect(rep.overall.confidence).toBe('insufficient');
    expect(rep.generatedNote).toMatch(/No real data/);
  });

  it('does not pool thin commodities into a confident overall figure', () => {
    // One or two points in each of four processes: every row is insufficient,
    // so ALL must be too — it used to read "high".
    const rep = computeAccuracyReport([P('machining', 86, 91), P('machining', 42, 44.5), P('casting', 142, 151),
      P('injection_moulding', 34.6, 33.2), P('sheet_metal', 12.8, 13.4)]);
    expect(rep.byCommodity.every(c => c.confidence === 'insufficient')).toBe(true);
    expect(rep.overall.confidence).toBe('insufficient');
  });

  it('grades ALL on the commodities that earned a grade, and says what it left out', () => {
    const good = [P('machining', 100, 95), P('machining', 50, 48), P('machining', 200, 190), P('machining', 80, 77), P('machining', 120, 114)];
    const rep = computeAccuracyReport([...good, P('casting', 300, 100)]);   // one wild casting point
    expect(rep.overall.n).toBe(5);
    expect(rep.overall.confidence).toBe('high');
    expect(rep.overall.mapePct).toBeLessThan(7);                            // the casting point is not pooled in
    expect(rep.generatedNote).toMatch(/1 more in commodities with too few to grade/);
  });
});
