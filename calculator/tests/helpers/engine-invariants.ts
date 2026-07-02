import { expect } from 'vitest';
import type { PartCostResult } from '../../src/engine/types.js';

/**
 * Shared cost-engine invariants that must hold for EVERY commodity, since they
 * all roll up through the universal stack into a PartCostResult. Import and call
 * this from any commodity test to broaden coverage cheaply (Recommendation #2).
 */
export function assertPartCostInvariants(r: PartCostResult): void {
  const b = r.breakdown;
  const buckets = [b.rawMaterial, b.process, b.labour, b.tooling, b.packaging, b.logistics, b.overhead, b.margin];

  // 1. No NaN / Infinity anywhere in the headline numbers.
  for (const v of [...buckets, r.factoryCost, r.subtotal, r.total]) {
    expect(Number.isFinite(v)).toBe(true);
  }

  // 2. Every bucket is non-negative (a cost can't be negative).
  for (const v of buckets) expect(v).toBeGreaterThanOrEqual(0);

  // 3. Total equals the sum of the eight buckets.
  const sum = buckets.reduce((a, v) => a + v, 0);
  expect(r.total).toBeCloseTo(sum, 4);

  // 4. Cost builds up monotonically: factory ≤ subtotal ≤ total.
  expect(r.factoryCost).toBeLessThanOrEqual(r.subtotal + 1e-6);
  expect(r.subtotal).toBeLessThanOrEqual(r.total + 1e-6);

  // 5. A costed part has a positive total.
  expect(r.total).toBeGreaterThan(0);

  // 6. Margin and overhead are consistent with their subtotals (non-negative,
  //    and margin sits on top of the subtotal).
  expect(r.total).toBeCloseTo(r.subtotal + b.margin, 4);
}
