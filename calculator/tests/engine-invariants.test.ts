import { describe, it, expect } from 'vitest';
import { computeUniversalStack } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import type { UniversalStackInput } from '../src/engine/types.js';
import { assertPartCostInvariants } from './helpers/engine-invariants.js';

const lib = DEFAULT_RATE_LIBRARY;

const base: UniversalStackInput = {
  partName: 'Invariant Part',
  rawMaterial: { materialId: 'mat-al6061', netWeightKg: 0.5, materialUtilization: 0.65 },
  operations: [
    { operationName: 'CNC Turning', machineId: 'mach-lathe-cnc', labourId: 'lab-uk-skilled',
      cycleTimeHr: 0.05, partsPerCycle: 1, oee: 0.85, manning: 1, labourTimeHr: 0.05, labourEfficiency: 0.92 },
  ],
  tooling: { totalToolingCost: 5000, amortizationVolume: 10000, mode: 'amortized' },
  packagingPerPart: 0.15, logisticsPerPart: 0.25, overheadPct: 0.12, marginPct: 0.08,
};

// Representative variations that stress the shared engine the way different
// commodities do (heavy raw material, multi-op, direct-cost material, NRE tooling).
const variants: Array<[string, UniversalStackInput]> = [
  ['baseline machining', base],
  ['heavy multi-op', {
    ...base,
    rawMaterial: { materialId: 'mat-al6061', netWeightKg: 4.2, materialUtilization: 0.8 },
    operations: [
      base.operations[0],
      { operationName: 'Second Op', machineId: 'mach-lathe-cnc', labourId: 'lab-uk-skilled',
        cycleTimeHr: 0.12, partsPerCycle: 1, oee: 0.8, manning: 1, labourTimeHr: 0.12, labourEfficiency: 0.9 },
    ],
  }],
  ['direct-cost material (PCB/paint style)', {
    ...base,
    rawMaterial: { materialId: 'mat-al6061', netWeightKg: 0, materialUtilization: 1, directCost: 3.4 },
  }],
  ['one-time NRE tooling', { ...base, tooling: { totalToolingCost: 20000, amortizationVolume: 5000, mode: 'one_time_nre' } }],
];

describe('universal cost engine — invariants (shared by all commodities)', () => {
  for (const [name, input] of variants) {
    it(`holds for: ${name}`, () => {
      assertPartCostInvariants(computeUniversalStack(input, lib));
    });
  }
});

describe('universal cost engine — determinism', () => {
  it('same input produces byte-identical output (no hidden randomness)', () => {
    const a = JSON.stringify(computeUniversalStack(base, lib));
    const b = JSON.stringify(computeUniversalStack(base, lib));
    expect(a).toBe(b);
  });
});

describe('universal cost engine — learning curve monotonicity', () => {
  it('higher cumulative volume never increases labour cost under Wright\'s law', () => {
    const withLC = (annualVolume: number): UniversalStackInput => ({
      ...base,
      learningCurve: { enabled: true, curvePct: 85, referenceVolume: 1000 },
      annualVolume,
    });
    const low = computeUniversalStack(withLC(2000), lib);
    const high = computeUniversalStack(withLC(200000), lib);
    assertPartCostInvariants(low);
    assertPartCostInvariants(high);
    expect(high.breakdown.labour).toBeLessThanOrEqual(low.breakdown.labour + 1e-6);
  });
});

describe('universal cost engine — edge cases', () => {
  it('a near-zero-cost part still satisfies invariants (no NaN/negative)', () => {
    const tiny: UniversalStackInput = {
      ...base,
      rawMaterial: { materialId: 'mat-al6061', netWeightKg: 0.001, materialUtilization: 0.99 },
      operations: [{ ...base.operations[0], cycleTimeHr: 0.001, labourTimeHr: 0.001 }],
      tooling: { totalToolingCost: 0, amortizationVolume: 1000, mode: 'amortized' },
      packagingPerPart: 0, logisticsPerPart: 0,
    };
    assertPartCostInvariants(computeUniversalStack(tiny, lib));
  });
});
