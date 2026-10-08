import { describe, it, expect } from 'vitest';
import { runValidation, SW_VALIDATION_CASES } from '../src/engine/sw-validation.js';

describe('model validation — back-test vs published programmes', () => {
  const report = runValidation();

  it('covers the documented reference programmes', () => {
    expect(report.caseCount).toBe(SW_VALIDATION_CASES.length);
    expect(report.caseCount).toBeGreaterThanOrEqual(7);
  });

  // The published figures are unverified (sw-benchmarks.ts), so the model is NOT asserted to match them — a test that
  // did would pin the model to numbers nobody can trace (software review P1 #6). The harness still reports variance.
  it('states that no published figure is sourced, and how many per-vehicle figures do not reconcile', () => {
    expect(report.verifiedCount).toBe(0);
    expect(report.perVehicleInconsistent).toBe(6);   // all but Lucid Air: e.g. BMW iX £620M ÷ (70k × 9) = £984, listed £4,800
  });

  it('every case produces a finite, signed variance', () => {
    for (const c of report.cases) {
      expect(Number.isFinite(c.totalVariancePct)).toBe(true);
      expect(Number.isFinite(c.perVehicleVariancePct)).toBe(true);
      expect(c.modelledTotalGBP).toBeGreaterThan(0);
    }
  });

});
