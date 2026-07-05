import { describe, it, expect } from 'vitest';
import { computeComplexityScore } from '../server/data/pcb-country-rates.js';
import { computePCBADrivers } from '../src/engine/modules/pcba.js';
import type { PCBAInputs } from '../src/engine/modules/pcba.js';

// Regression tests for the PCB deep-dive review fixes.

describe('computeComplexityScore — HDI normalisation (review fix)', () => {
  const spec = { estimatedLayers: 8, widthMm: 100, heightMm: 80, throughVias: 0, minTraceSpaceMm: 0.15 };

  it('scores 2+N+2 in enum form (2plus_n_plus2) as 16, not the fallthrough 10', () => {
    expect(computeComplexityScore({ ...spec, hdiStructure: '2plus_n_plus2' }, {}).factors.hdiScore).toBe(16);
  });

  it('scores 2+N+2 in symbolic form (2+N+2) as 16', () => {
    expect(computeComplexityScore({ ...spec, hdiStructure: '2+N+2' }, {}).factors.hdiScore).toBe(16);
  });

  it('keeps 1+N+1 at 10 and any-layer at 20 across formats', () => {
    expect(computeComplexityScore({ ...spec, hdiStructure: '1plus_n_plus1' }, {}).factors.hdiScore).toBe(10);
    expect(computeComplexityScore({ ...spec, hdiStructure: 'any_layer' }, {}).factors.hdiScore).toBe(20);
    expect(computeComplexityScore({ ...spec, hdiStructure: 'any-layer' }, {}).factors.hdiScore).toBe(20);
    expect(computeComplexityScore({ ...spec, hdiStructure: 'none' }, {}).factors.hdiScore).toBe(0);
  });
});

describe('computePCBADrivers — assembly-yield zero guard (review fix)', () => {
  const base: PCBAInputs = {
    pcbCostPerBoard: 2, bom: [], smtMachineId: 'smt', smtLabourId: 'lab', smtLines: 1,
    smtLineRatePerHr: 120, smtOee: 0.85, throughHoleCount: 0, manualSolderCount: 0,
    thLabourId: 'lab', thLabourTimeSecPerJoint: 12, manualLabourTimeSecPerJoint: 20,
    assemblyYield: 0.98, reworkCostPerFailure: 8, amortizationVolume: 5000,
  };

  it('does not produce Infinity/NaN direct cost when yield is 0', () => {
    const d = computePCBADrivers({ ...base, assemblyYield: 0 });
    const cost = d.rawMaterial.directCost ?? NaN;
    expect(Number.isFinite(cost)).toBe(true);
    expect(cost).toBeGreaterThanOrEqual(0);
  });

  it('adds rework cost as yield drops (0.90 costs more than 0.99)', () => {
    const hi = computePCBADrivers({ ...base, assemblyYield: 0.99 }).rawMaterial.directCost ?? 0;
    const lo = computePCBADrivers({ ...base, assemblyYield: 0.90 }).rawMaterial.directCost ?? 0;
    expect(lo).toBeGreaterThan(hi);
  });
});
