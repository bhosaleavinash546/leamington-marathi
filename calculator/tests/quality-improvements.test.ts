import { describe, it, expect } from 'vitest';
import { computeLearningCurveAdjustment } from '../src/engine/learning-curve.js';
import { computeAssemblyRollup, newAssembly } from '../src/engine/assembly.js';
import { runSensitivity } from '../src/engine/sensitivity.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import type { UniversalStackInput } from '../src/engine/types.js';

// ─── Learning Curve ───────────────────────────────────────────────────────────

describe('Learning Curve — computeLearningCurveAdjustment', () => {
  it('returns factor = 1 when volume equals reference volume', () => {
    const r = computeLearningCurveAdjustment(100, { annualVolume: 1000, referenceVolume: 1000, curvePct: 85 });
    expect(r.adjustmentFactor).toBeCloseTo(1, 6);
    expect(r.adjustedLabourCost).toBeCloseTo(100, 6);
    expect(r.volumeEffect).toBeCloseTo(0, 6);
  });

  it('reduces cost when volume > reference (85% curve)', () => {
    // At 2× volume, cost reduces to 85% of original (Wright's law definition)
    const r = computeLearningCurveAdjustment(100, { annualVolume: 2000, referenceVolume: 1000, curvePct: 85 });
    expect(r.adjustedLabourCost).toBeCloseTo(85, 2);
    expect(r.adjustmentFactor).toBeCloseTo(0.85, 4);
    expect(r.volumeEffect).toBeLessThan(0);
  });

  it('increases cost when volume < reference (below reference volume)', () => {
    const r = computeLearningCurveAdjustment(100, { annualVolume: 500, referenceVolume: 1000, curvePct: 85 });
    expect(r.adjustedLabourCost).toBeGreaterThan(100);
    expect(r.adjustmentFactor).toBeGreaterThan(1);
    expect(r.volumeEffect).toBeGreaterThan(0);
  });

  it('handles 90% curve correctly', () => {
    // At 2× volume, cost reduces to 90%
    const r = computeLearningCurveAdjustment(200, { annualVolume: 2000, referenceVolume: 1000, curvePct: 90 });
    expect(r.adjustedLabourCost).toBeCloseTo(180, 2);
  });

  it('clamps curvePct to minimum 50% (b cannot go below -1)', () => {
    const r = computeLearningCurveAdjustment(100, { annualVolume: 2000, referenceVolume: 1000, curvePct: 10 });
    // Clamped to 50% so factor = 0.5
    expect(r.adjustmentFactor).toBeCloseTo(0.5, 4);
  });

  it('clamps curvePct to maximum 100% (no learning — flat)', () => {
    const r = computeLearningCurveAdjustment(100, { annualVolume: 2000, referenceVolume: 1000, curvePct: 100 });
    expect(r.adjustmentFactor).toBeCloseTo(1, 6);
    expect(r.adjustedLabourCost).toBeCloseTo(100, 6);
  });

  it('handles zero referenceVolume gracefully (factor = 1)', () => {
    const r = computeLearningCurveAdjustment(100, { annualVolume: 5000, referenceVolume: 0, curvePct: 85 });
    expect(r.adjustmentFactor).toBe(1);
    expect(r.adjustedLabourCost).toBe(100);
  });

  it('baseLabourCost = 0 gives adjustedLabourCost = 0', () => {
    const r = computeLearningCurveAdjustment(0, { annualVolume: 5000, referenceVolume: 1000, curvePct: 85 });
    expect(r.adjustedLabourCost).toBe(0);
    expect(r.volumeEffect).toBe(0);
  });
});

// ─── Assembly BOM Rollup ──────────────────────────────────────────────────────

describe('computeAssemblyRollup', () => {
  it('returns zero totals for empty assembly', () => {
    const a = newAssembly('Empty');
    const r = computeAssemblyRollup(a);
    expect(r.totalPartsCost).toBe(0);
    expect(r.total).toBe(0);
    expect(r.totalWeightKg).toBe(0);
    expect(r.lineSubtotals).toHaveLength(0);
  });

  it('computes extended cost and weight for each line', () => {
    const a = newAssembly('Test');
    a.lines = [
      { id: '1', description: 'Bracket', qty: 4, unitCostGBP: 2.50, unitWeightKg: 0.1, notes: '' },
      { id: '2', description: 'Bolt', qty: 8, unitCostGBP: 0.12, unitWeightKg: 0.01, notes: '' },
    ];
    const r = computeAssemblyRollup(a);
    expect(r.lineSubtotals[0].extendedCost).toBeCloseTo(10.0, 4);
    expect(r.lineSubtotals[0].extendedWeight).toBeCloseTo(0.4, 4);
    expect(r.lineSubtotals[1].extendedCost).toBeCloseTo(0.96, 4);
    expect(r.lineSubtotals[1].extendedWeight).toBeCloseTo(0.08, 4);
    expect(r.totalPartsCost).toBeCloseTo(10.96, 4);
    expect(r.totalWeightKg).toBeCloseTo(0.48, 4);
  });

  it('applies overhead and margin correctly', () => {
    const a = newAssembly('OH test');
    a.lines = [{ id: '1', description: 'Part A', qty: 1, unitCostGBP: 100, unitWeightKg: 0, notes: '' }];
    a.overheadPct = 10;  // 10%
    a.marginPct = 20;    // 20%
    const r = computeAssemblyRollup(a);
    expect(r.overhead).toBeCloseTo(10, 4);   // 100 × 10%
    expect(r.subtotal).toBeCloseTo(110, 4);  // 100 + 10
    expect(r.margin).toBeCloseTo(22, 4);     // 110 × 20%
    expect(r.total).toBeCloseTo(132, 4);     // 110 + 22
  });

  it('handles zero overhead and margin (direct cost passthrough)', () => {
    const a = newAssembly('No markup');
    a.lines = [{ id: '1', description: 'P', qty: 2, unitCostGBP: 50, unitWeightKg: 1, notes: '' }];
    a.overheadPct = 0;
    a.marginPct = 0;
    const r = computeAssemblyRollup(a);
    expect(r.total).toBeCloseTo(100, 4);
    expect(r.overhead).toBe(0);
    expect(r.margin).toBe(0);
  });

  it('handles qty = 0 line (contributes nothing)', () => {
    const a = newAssembly('Zero qty');
    a.lines = [
      { id: '1', description: 'Active', qty: 5, unitCostGBP: 10, unitWeightKg: 0.5, notes: '' },
      { id: '2', description: 'Inactive', qty: 0, unitCostGBP: 999, unitWeightKg: 99, notes: '' },
    ];
    const r = computeAssemblyRollup(a);
    expect(r.totalPartsCost).toBeCloseTo(50, 4);
    expect(r.totalWeightKg).toBeCloseTo(2.5, 4);
  });

  it('newAssembly generates unique IDs', () => {
    const a1 = newAssembly('A');
    const a2 = newAssembly('B');
    expect(a1.id).not.toBe(a2.id);
    expect(a1.id).toMatch(/^asm-/);
  });
});

// ─── Sensitivity — edge cases ─────────────────────────────────────────────────

describe('Sensitivity — edge cases', () => {
  const baseInput: UniversalStackInput = {
    partName: 'Test Part',
    rawMaterial: { materialId: 'mat-al6061', netWeightKg: 0.5, materialUtilization: 0.65 },
    operations: [{
      operationName: 'Turning',
      machineId: 'mach-lathe-cnc',
      labourId: 'lab-uk-skilled',
      cycleTimeHr: 0.05,
      partsPerCycle: 1,
      oee: 0.85,
      manning: 1,
      labourTimeHr: 0.05,
      labourEfficiency: 0.92,
    }],
    tooling: { totalToolingCost: 5000, amortizationVolume: 10000, mode: 'amortized' },
    packagingPerPart: 0.10,
    logisticsPerPart: 0.20,
    overheadPct: 0.12,
    marginPct: 0.08,
  };

  it('returns finite plusPct / minusPct values (no Infinity or NaN)', () => {
    const result = runSensitivity(baseInput, DEFAULT_RATE_LIBRARY, 10);
    for (const d of result.drivers) {
      expect(isFinite(d.plusPct)).toBe(true);
      expect(isFinite(d.minusPct)).toBe(true);
    }
  });

  it('drivers are sorted by range descending', () => {
    const result = runSensitivity(baseInput, DEFAULT_RATE_LIBRARY, 10);
    for (let i = 1; i < result.drivers.length; i++) {
      expect(result.drivers[i - 1].range).toBeGreaterThanOrEqual(result.drivers[i].range);
    }
  });

  it('baseline total matches direct computeUniversalStack call', async () => {
    const { computeUniversalStack } = await import('../src/engine/core.js');
    const direct = computeUniversalStack(baseInput, DEFAULT_RATE_LIBRARY);
    const result = runSensitivity(baseInput, DEFAULT_RATE_LIBRARY, 10);
    expect(result.baseline.total).toBeCloseTo(direct.total, 4);
  });
});
