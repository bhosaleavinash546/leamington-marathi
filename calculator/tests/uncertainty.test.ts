import { describe, it, expect } from 'vitest';
import { computeCostUncertainty, overallConfidence } from '../src/engine/uncertainty.js';
import type { PartCostResult, UniversalStackInput, Confidence } from '../src/engine/types.js';

function makeResult(conf: Confidence): PartCostResult {
  return {
    partName: 'Test',
    breakdown: { rawMaterial: 20, process: 25, labour: 14, tooling: 0.3, packaging: 0.15, logistics: 0.25, overhead: 7, margin: 5 },
    operationDetails: [],
    factoryCost: 59.7, subtotal: 66.7, total: 72,
    traceability: [
      { field: 'material.pricePerKg', value: 1, unit: '£/kg', rateSource: 's', rateId: 'm', confidence: conf },
      { field: 'machine.rate', value: 1, unit: '£/hr', rateSource: 's', rateId: 'x', confidence: conf },
    ],
  } as unknown as PartCostResult;
}
const input = { overheadPct: 0.10, marginPct: 0.08 } as UniversalStackInput;

describe('cost uncertainty — Monte Carlo bands', () => {
  it('orders P10 < P50 < P90 and centres the median near the point estimate', () => {
    const u = computeCostUncertainty(makeResult('Medium'), input, { seed: 42 });
    expect(u.p10).toBeLessThan(u.p50);
    expect(u.p50).toBeLessThan(u.p90);
    expect(u.p50).toBeGreaterThan(makeResult('Medium').total * 0.9);
    expect(u.p50).toBeLessThan(makeResult('Medium').total * 1.1);
    expect(u.plusMinusPct).toBeGreaterThan(0);
  });

  it('lower confidence widens the band', () => {
    const high = computeCostUncertainty(makeResult('High'), input, { seed: 7 });
    const low = computeCostUncertainty(makeResult('Low'), input, { seed: 7 });
    expect(low.cvPct).toBeGreaterThan(high.cvPct);
    expect(low.plusMinusPct).toBeGreaterThan(high.plusMinusPct);
    expect(high.band).toBe('tight');
    expect(low.band === 'moderate' || low.band === 'wide').toBe(true);
  });

  it('is deterministic for a given seed', () => {
    const a = computeCostUncertainty(makeResult('Medium'), input, { seed: 99 });
    const b = computeCostUncertainty(makeResult('Medium'), input, { seed: 99 });
    expect(a).toEqual(b);
  });

  it('overallConfidence reflects the traceability mix', () => {
    expect(overallConfidence(makeResult('High'))).toBe('High');
    expect(overallConfidence(makeResult('Low'))).toBe('Low');
  });
});
