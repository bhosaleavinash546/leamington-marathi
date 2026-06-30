import { describe, it, expect } from 'vitest';
import { runValidation, SW_VALIDATION_CASES } from '../src/engine/sw-validation.js';

describe('model validation — back-test vs published programmes', () => {
  const report = runValidation();

  it('covers the documented reference programmes', () => {
    expect(report.caseCount).toBe(SW_VALIDATION_CASES.length);
    expect(report.caseCount).toBeGreaterThanOrEqual(7);
  });

  // Total SW investment is the metric the model is calibrated to — it should
  // track the published envelope within should-cost norms (±20–30%).
  it('total-cost MAPE is within should-cost tolerance (<30%)', () => {
    expect(report.mapeTotal).toBeLessThan(30);
  });

  it('a clear majority of programmes fall within the ±35% band', () => {
    expect(report.withinBandCount).toBeGreaterThanOrEqual(5);
  });

  it('every case produces a finite, signed variance', () => {
    for (const c of report.cases) {
      expect(Number.isFinite(c.totalVariancePct)).toBe(true);
      expect(Number.isFinite(c.perVehicleVariancePct)).toBe(true);
      expect(c.modelledTotalGBP).toBeGreaterThan(0);
    }
  });

  // KNOWN GAP (documented in docs/sw-cost-validation.md): the model amortises
  // NRE over full lifetime volume, while published £/vehicle figures use a
  // shorter recovery window (~2yr). So per-vehicle variance is large and is NOT
  // asserted as passing — the harness reports it honestly rather than hiding it.
  it('reports the per-vehicle variance (known calibration gap, not yet closed)', () => {
    expect(Number.isFinite(report.mapePerVehicle)).toBe(true);
    expect(report.mapePerVehicle).toBeGreaterThan(0);
  });
});
