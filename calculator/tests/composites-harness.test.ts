/**
 * Tests for composites and wiring-harness modules.
 */
import { describe, it, expect } from 'vitest';
import { computeCompositeDrivers } from '../src/engine/modules/composites.js';
import { computeWiringHarnessDrivers } from '../src/engine/modules/wiring-harness.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';

const STACK_DEFAULTS = {
  partName: 'Test Part',
  packagingPerPart: 0.00,
  logisticsPerPart: 0.00,
  overheadPct: 0.12,
  marginPct: 0.08,
};

// ─── Composites ───────────────────────────────────────────────────────────────

const COMP_INPUTS = {
  fibrePricePerKg: 32.00,
  resinPricePerKg: 0,
  fibreWeightFraction: 0.60,
  partWeightKg: 1.80,
  wasteFraction: 0.20,
  process: 'prepreg_layup' as const,
  areaM2: 0.65,
  plies: 8,
  layupLabourId: 'lab-uk-skilled',
  layupTimeHrPerPart: 3.5,
  oee: 0.78,
  manning: 2,
  labourEfficiency: 0.90,
  cureMachineId: 'autoclave-1200mm',
  cureLabourId: 'lab-uk-skilled',
  cureTimeHr: 4.0,
  partsPerCureCycle: 4,
  trimMachineId: 'waterjet-5ax-composite',
  trimLabourId: 'lab-uk-semiskilled',
  trimTimeHr: 0.50,
  ndiCostPerPart: 25.00,
  rejectRate: 0.04,
  toolingCost: 18000,
  toolingLife: 400,
  amortizationVolume: 2000,
};

describe('Composites module', () => {
  it('directCost = grossMatCost + ndiCost with reject uplift', () => {
    const d = computeCompositeDrivers(COMP_INPUTS);
    const rejectUplift = 1 / (1 - 0.04);
    const fibreMass = 1.80 * 0.60;
    const resinMass = 1.80 * 0.40;
    const netMat = fibreMass * 32.00 + resinMass * 0;
    const grossMat = netMat / (1 - 0.20);
    const expected = (grossMat + 25.00) * rejectUplift;
    expect(d.rawMaterial.directCost).toBeCloseTo(expected, 3);
  });

  it('generates 3 operations (layup + cure + trim)', () => {
    const d = computeCompositeDrivers(COMP_INPUTS);
    expect(d.operations).toHaveLength(3);
  });

  it('cure cycle time per part = cureTimeHr / partsPerCureCycle', () => {
    const d = computeCompositeDrivers(COMP_INPUTS);
    const cureOp = d.operations.find(o => o.operationName.toLowerCase().includes('cure'))!;
    const rejectUplift = 1 / (1 - 0.04);
    expect(cureOp.cycleTimeHr).toBeCloseTo((4.0 / 4) * rejectUplift, 6);
  });

  it('numTools = ceil(amortVol / toolingLife)', () => {
    const d = computeCompositeDrivers(COMP_INPUTS);
    const numTools = Math.ceil(2000 / 400);
    expect(d.tooling.totalToolingCost).toBe(18000 * numTools);
  });

  it('waste fraction drives material utilization', () => {
    const d = computeCompositeDrivers(COMP_INPUTS);
    expect(d.rawMaterial.materialUtilization).toBeCloseTo(1 - 0.20, 6);
  });

  it('no trim op when trimTimeHr = 0', () => {
    const d = computeCompositeDrivers({ ...COMP_INPUTS, trimTimeHr: 0 });
    expect(d.operations).toHaveLength(2);
  });

  it('zero reject rate → rejectUplift = 1', () => {
    const noReject = computeCompositeDrivers({ ...COMP_INPUTS, rejectRate: 0 });
    const withReject = computeCompositeDrivers(COMP_INPUTS);
    expect(noReject.rawMaterial.directCost!).toBeLessThan(withReject.rawMaterial.directCost!);
  });

  it('full stack produces positive total', () => {
    const d = computeCompositeDrivers(COMP_INPUTS);
    const r = computeUniversalStack({ ...STACK_DEFAULTS, ...d }, DEFAULT_RATE_LIBRARY);
    expect(r.total).toBeGreaterThan(0);
    expect(r.breakdown.rawMaterial).toBeGreaterThan(0);
    expect(r.breakdown.process).toBeGreaterThan(0);
    expect(r.breakdown.labour).toBeGreaterThan(0);
  });

  it('RTM with resin produces higher directCost than prepreg (resin cost added)', () => {
    const rtm = computeCompositeDrivers({
      ...COMP_INPUTS,
      process: 'rtm',
      resinPricePerKg: 13.00,
      fibrePricePerKg: 24.00,
    });
    // Net mat = 1.8×0.60×24 + 1.8×0.40×13 = 25.92 + 9.36 = 35.28
    const fibreMass = 1.80 * 0.60;
    const resinMass = 1.80 * 0.40;
    const netMat = fibreMass * 24.00 + resinMass * 13.00;
    const grossMat = netMat / (1 - 0.20);
    const rejectUplift = 1 / (1 - 0.04);
    const expected = (grossMat + 25.00) * rejectUplift;
    expect(rtm.rawMaterial.directCost).toBeCloseTo(expected, 3);
  });
});

// ─── Wiring Harness ───────────────────────────────────────────────────────────

const HARN_INPUTS = {
  wires: [
    { crossSectionMm2: 0.5,  lengthM: 3.20, pricePerM: 0.10 },
    { crossSectionMm2: 1.5,  lengthM: 1.40, pricePerM: 0.18 },
    { crossSectionMm2: 4.0,  lengthM: 0.60, pricePerM: 0.40 },
  ],
  connectors: [
    { count: 4, costEach: 1.20, circuitsPerConnector: 6,  terminationTimeSec: 10 },
    { count: 2, costEach: 2.80, circuitsPerConnector: 12, terminationTimeSec: 10 },
  ],
  spliceCount: 6,
  spliceCostEach: 0.08,
  conduitLengthM: 2.0,
  conduitCostPerM: 0.35,
  tapeMetres: 5.0,
  tapeCostPerM: 0.12,
  labourId: 'lab-uk-semiskilled',
  assemblyTimeHr: 0.45,
  oee: 0.85,
  manning: 1,
  labourEfficiency: 0.90,
  testMachineId: 'harness-test-sys',
  testLabourId: 'lab-uk-semiskilled',
  testTimeHr: 0.05,
  rejectRate: 0.02,
  boardingBoardCost: 800,
  boardingBoardLife: 20000,
  amortizationVolume: 10000,
};

describe('Wiring Harness module', () => {
  it('directCost = sum of all material costs with reject uplift', () => {
    const d = computeWiringHarnessDrivers(HARN_INPUTS);
    const rejectUplift = 1 / (1 - 0.02);
    const wireCost = 3.20 * 0.10 + 1.40 * 0.18 + 0.60 * 0.40;
    const connCost = 4 * 1.20 + 2 * 2.80;
    const spliceCost = 6 * 0.08;
    const conduitCost = 2.0 * 0.35;
    const tapeCost = 5.0 * 0.12;
    const expected = (wireCost + connCost + spliceCost + conduitCost + tapeCost) * rejectUplift;
    expect(d.rawMaterial.directCost).toBeCloseTo(expected, 4);
  });

  it('generates 2 operations (assembly + test)', () => {
    const d = computeWiringHarnessDrivers(HARN_INPUTS);
    expect(d.operations).toHaveLength(2);
    expect(d.operations[0].operationName).toContain('Assembly');
    expect(d.operations[1].operationName).toContain('Test');
  });

  it('no test operation when testTimeHr = 0', () => {
    const d = computeWiringHarnessDrivers({ ...HARN_INPUTS, testTimeHr: 0 });
    expect(d.operations).toHaveLength(1);
  });

  it('boarding board amortization = ceil(amortVol / boardLife)', () => {
    const d = computeWiringHarnessDrivers(HARN_INPUTS);
    const numBoards = Math.ceil(10000 / 20000);
    expect(d.tooling.totalToolingCost).toBe(800 * numBoards);
  });

  it('zero wire lengths still produces positive directCost from connectors', () => {
    const noWires = computeWiringHarnessDrivers({
      ...HARN_INPUTS,
      wires: [{ crossSectionMm2: 0.5, lengthM: 0, pricePerM: 0.10 }],
    });
    // Wire cost = 0, but connectors still add cost
    expect(noWires.rawMaterial.directCost!).toBeGreaterThan(0);
  });

  it('full stack produces positive total', () => {
    const d = computeWiringHarnessDrivers(HARN_INPUTS);
    const r = computeUniversalStack({ ...STACK_DEFAULTS, ...d }, DEFAULT_RATE_LIBRARY);
    expect(r.total).toBeGreaterThan(0);
    expect(r.breakdown.rawMaterial).toBeGreaterThan(0);
    expect(r.breakdown.labour).toBeGreaterThan(0);
  });

  it('reject rate uplift increases assembly time and material cost', () => {
    const base = computeWiringHarnessDrivers({ ...HARN_INPUTS, rejectRate: 0 });
    const withReject = computeWiringHarnessDrivers(HARN_INPUTS);
    expect(withReject.rawMaterial.directCost!).toBeGreaterThan(base.rawMaterial.directCost!);
    expect(withReject.operations[0].cycleTimeHr).toBeGreaterThan(base.operations[0].cycleTimeHr);
  });

  it('labour dominates total cost for complex harness', () => {
    const complexHarness = computeWiringHarnessDrivers({
      ...HARN_INPUTS,
      assemblyTimeHr: 4.0,   // long harness
      labourId: 'lab-uk-semiskilled',
    });
    const r = computeUniversalStack({ ...STACK_DEFAULTS, partName: 'Complex Harness', ...complexHarness }, DEFAULT_RATE_LIBRARY);
    // Labour should be significant contributor
    expect(r.breakdown.labour).toBeGreaterThan(r.breakdown.tooling);
  });
});
