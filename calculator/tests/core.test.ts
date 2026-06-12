import { describe, it, expect } from 'vitest';
import { computeUniversalStack, validateStackInput } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import type { UniversalStackInput } from '../src/engine/types.js';

const VALID_INPUT: UniversalStackInput = {
  partName: 'Test Part',
  rawMaterial: {
    materialId: 'mat-al6061',
    netWeightKg: 0.5,
    materialUtilization: 0.65,
  },
  operations: [
    {
      operationName: 'CNC Turning',
      machineId: 'mach-lathe-cnc',
      labourId: 'lab-uk-skilled',
      cycleTimeHr: 0.05,
      partsPerCycle: 1,
      oee: 0.85,
      manning: 1,
      labourTimeHr: 0.05,
      labourEfficiency: 0.92,
    },
  ],
  tooling: {
    totalToolingCost: 5000,
    amortizationVolume: 10000,
    mode: 'amortized',
  },
  packagingPerPart: 0.15,
  logisticsPerPart: 0.25,
  overheadPct: 0.12,
  marginPct: 0.08,
};

describe('validateStackInput', () => {
  it('passes for a valid input', () => {
    const result = validateStackInput(VALID_INPUT, DEFAULT_RATE_LIBRARY);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects zero net weight', () => {
    const bad = { ...VALID_INPUT, rawMaterial: { ...VALID_INPUT.rawMaterial, netWeightKg: 0 } };
    const result = validateStackInput(bad, DEFAULT_RATE_LIBRARY);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field.includes('netWeightKg'))).toBe(true);
  });

  it('rejects utilization > 1', () => {
    const bad = { ...VALID_INPUT, rawMaterial: { ...VALID_INPUT.rawMaterial, materialUtilization: 1.1 } };
    const result = validateStackInput(bad, DEFAULT_RATE_LIBRARY);
    expect(result.valid).toBe(false);
  });

  it('rejects unknown materialId', () => {
    const bad = { ...VALID_INPUT, rawMaterial: { ...VALID_INPUT.rawMaterial, materialId: 'mat-unknown' } };
    const result = validateStackInput(bad, DEFAULT_RATE_LIBRARY);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.field.includes('materialId'))).toBe(true);
  });

  it('rejects OEE > 1', () => {
    const bad = {
      ...VALID_INPUT,
      operations: [{ ...VALID_INPUT.operations[0], oee: 1.2 }],
    };
    const result = validateStackInput(bad, DEFAULT_RATE_LIBRARY);
    expect(result.valid).toBe(false);
  });

  it('rejects unknown machineId', () => {
    const bad = {
      ...VALID_INPUT,
      operations: [{ ...VALID_INPUT.operations[0], machineId: 'mach-unknown' }],
    };
    const result = validateStackInput(bad, DEFAULT_RATE_LIBRARY);
    expect(result.valid).toBe(false);
  });

  it('warns on low utilization', () => {
    const lowUtil = { ...VALID_INPUT, rawMaterial: { ...VALID_INPUT.rawMaterial, materialUtilization: 0.2 } };
    const result = validateStackInput(lowUtil, DEFAULT_RATE_LIBRARY);
    expect(result.warnings.some(w => w.field.includes('materialUtilization'))).toBe(true);
  });

  it('rejects negative margin', () => {
    const bad = { ...VALID_INPUT, marginPct: -0.05 };
    const result = validateStackInput(bad, DEFAULT_RATE_LIBRARY);
    expect(result.valid).toBe(false);
  });
});

describe('computeUniversalStack', () => {
  it('sums breakdown to total correctly', () => {
    const result = computeUniversalStack(VALID_INPUT, DEFAULT_RATE_LIBRARY);
    const bucketSum =
      result.breakdown.rawMaterial +
      result.breakdown.process +
      result.breakdown.labour +
      result.breakdown.tooling +
      result.breakdown.packaging +
      result.breakdown.logistics +
      result.breakdown.overhead +
      result.breakdown.margin;
    expect(bucketSum).toBeCloseTo(result.total, 6);
  });

  it('factoryCost + overhead = subtotal', () => {
    const result = computeUniversalStack(VALID_INPUT, DEFAULT_RATE_LIBRARY);
    expect(result.factoryCost + result.breakdown.overhead).toBeCloseTo(result.subtotal, 6);
  });

  it('subtotal + margin = total', () => {
    const result = computeUniversalStack(VALID_INPUT, DEFAULT_RATE_LIBRARY);
    expect(result.subtotal + result.breakdown.margin).toBeCloseTo(result.total, 6);
  });

  it('produces traceability records for all rates used', () => {
    const result = computeUniversalStack(VALID_INPUT, DEFAULT_RATE_LIBRARY);
    expect(result.traceability.length).toBeGreaterThan(0);
    // Every traceability record has a rateId linking to the library
    for (const t of result.traceability) {
      expect(t.rateId).toBeTruthy();
      expect(t.rateSource).toBeTruthy();
    }
  });

  it('NRE tooling mode sets toolingNRE and zero per-part tooling', () => {
    const nreInput: UniversalStackInput = {
      ...VALID_INPUT,
      tooling: { totalToolingCost: 20000, amortizationVolume: 1, mode: 'one_time_nre' },
    };
    const result = computeUniversalStack(nreInput, DEFAULT_RATE_LIBRARY);
    expect(result.toolingNRE).toBe(20000);
    expect(result.breakdown.tooling).toBe(0);
  });

  it('throws for unknown material', () => {
    const bad = { ...VALID_INPUT, rawMaterial: { ...VALID_INPUT.rawMaterial, materialId: 'mat-nope' } };
    expect(() => computeUniversalStack(bad, DEFAULT_RATE_LIBRARY)).toThrow();
  });
});
