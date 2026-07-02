import { describe, it, expect } from 'vitest';
import { computeMachiningDrivers } from '../src/engine/modules/machining.js';
import { computeUniversalStack, validateStackInput } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import type { MachiningInputs } from '../src/engine/modules/machining.js';

const BASE_INPUTS: MachiningInputs = {
  materialId: 'mat-al6061',
  netWeightKg: 0.5,
  stockWeightKg: 0.77,
  materialUtilization: 0,
  operations: [
    {
      name: 'CNC Turning',
      type: 'turning',
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
  setup: {
    setupTimeHr: 0.5,
    batchSize: 50,
    machineId: 'mach-lathe-cnc',
    labourId: 'lab-uk-skilled',
  },
  programmingNRE: 500,
  toolingCost: 3000,
  amortizationVolume: 10000,
};

describe('computeMachiningDrivers', () => {
  it('auto-computes utilization when materialUtilization is 0', () => {
    const drivers = computeMachiningDrivers(BASE_INPUTS);
    const expected = BASE_INPUTS.netWeightKg / BASE_INPUTS.stockWeightKg;
    expect(drivers.rawMaterial.materialUtilization).toBeCloseTo(expected, 6);
  });

  it('uses explicit materialUtilization when provided', () => {
    const drivers = computeMachiningDrivers({ ...BASE_INPUTS, materialUtilization: 0.70 });
    expect(drivers.rawMaterial.materialUtilization).toBe(0.70);
  });

  it('includes setup as first operation', () => {
    const drivers = computeMachiningDrivers(BASE_INPUTS);
    expect(drivers.operations[0].operationName).toBe('Setup (amortised)');
  });

  it('setup cost per part = setupTime / batchSize', () => {
    const drivers = computeMachiningDrivers(BASE_INPUTS);
    const setupOp = drivers.operations[0];
    expect(setupOp.cycleTimeHr).toBeCloseTo(BASE_INPUTS.setup.setupTimeHr / BASE_INPUTS.setup.batchSize, 8);
  });

  it('total ops count = 1 main + 1 setup', () => {
    const drivers = computeMachiningDrivers(BASE_INPUTS);
    expect(drivers.operations).toHaveLength(2);
  });

  it('tooling combines toolingCost and programmingNRE', () => {
    const drivers = computeMachiningDrivers(BASE_INPUTS);
    expect(drivers.tooling.totalToolingCost).toBe(BASE_INPUTS.toolingCost + BASE_INPUTS.programmingNRE);
  });

  it('produces valid stack input accepted by validateStackInput', () => {
    const drivers = computeMachiningDrivers(BASE_INPUTS);
    const stackInput = {
      partName: 'Test Machined Part',
      ...drivers,
      packagingPerPart: 0.10,
      logisticsPerPart: 0.20,
      overheadPct: 0.12,
      marginPct: 0.08,
    };
    const validation = validateStackInput(stackInput, DEFAULT_RATE_LIBRARY);
    expect(validation.valid).toBe(true);
  });

  it('full stack computes a positive total cost', () => {
    const drivers = computeMachiningDrivers(BASE_INPUTS);
    const stackInput = {
      partName: 'Test Machined Part',
      ...drivers,
      packagingPerPart: 0.10,
      logisticsPerPart: 0.20,
      overheadPct: 0.12,
      marginPct: 0.08,
    };
    const result = computeUniversalStack(stackInput, DEFAULT_RATE_LIBRARY);
    expect(result.total).toBeGreaterThan(0);
  });
});
