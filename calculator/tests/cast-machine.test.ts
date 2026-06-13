/**
 * Cast + Machine module tests — combined HPDC/sand casting + CNC machining.
 */
import { describe, it, expect } from 'vitest';
import { computeCastAndMachineDrivers } from '../src/engine/modules/cast-and-machine.js';
import { computeUniversalStack } from '../src/engine/core.js';
import { DEFAULT_RATE_LIBRARY } from '../src/engine/rate-library.js';
import type { CastAndMachineInputs } from '../src/engine/modules/cast-and-machine.js';
import type { MachiningOperation } from '../src/engine/modules/machining.js';

const STACK_DEFAULTS = { packagingPerPart: 0.00, logisticsPerPart: 0.00, overheadPct: 0.12, marginPct: 0.09 };

const DEFAULT_MILLING_OP: MachiningOperation = {
  name: 'Face Mill',
  type: 'milling_3ax',
  machineId: 'mach-haas-vf2',
  labourId: 'lab-uk-skilled',
  cycleTimeHr: 0.05,
  partsPerCycle: 1,
  oee: 0.85,
  manning: 1,
  labourTimeHr: 0.05,
  labourEfficiency: 0.92,
};

const HPDC_INPUTS: CastAndMachineInputs = {
  castingSubtype: 'hpdc',
  materialId: 'mat-adc12',
  castPartWeightKg: 1.5,
  finishedWeightKg: 1.3,
  castingYield: 0.75,
  rejectRate: 0.03,
  castingLabourId: 'lab-uk-skilled',
  castingOee: 0.80,
  castingManning: 1,
  castingLabourEfficiency: 0.92,
  hpdc: {
    machineId: 'hpdc-800t',
    cycleTimeSec: 45,
    cavities: 2,
    dieCost: 120000,
    dieLife: 200000,
  },
  geometryComplexity: 2,
  machiningOps: [DEFAULT_MILLING_OP],
  machiningSetup: {
    setupTimeHr: 0.5,
    batchSize: 50,
    machineId: 'mach-haas-vf2',
    labourId: 'lab-uk-skilled',
  },
  machiningToolingCost: 5000,
  machiningProgrammingNRE: 2000,
  amortizationVolume: 50000,
};

const SAND_INPUTS: CastAndMachineInputs = {
  castingSubtype: 'sand',
  materialId: 'mat-gjl250',
  castPartWeightKg: 3.0,
  finishedWeightKg: 2.5,
  castingYield: 0.65,
  rejectRate: 0.05,
  castingLabourId: 'lab-uk-semiskilled',
  castingOee: 0.75,
  castingManning: 1,
  castingLabourEfficiency: 0.90,
  sand: {
    mouldLineId: 'sand-cast-line',
    cycleTimeHr: 0.5,
    patternCost: 5000,
    patternLife: 10000,
    coreCostPerPart: 1.5,
  },
  geometryComplexity: 3,
  machiningOps: [DEFAULT_MILLING_OP],
  machiningSetup: {
    setupTimeHr: 0.75,
    batchSize: 25,
    machineId: 'mach-vmc3',
    labourId: 'lab-uk-skilled',
  },
  machiningToolingCost: 3000,
  machiningProgrammingNRE: 1500,
  amortizationVolume: 10000,
};

describe('Cast + Machine module', () => {
  it('computeCastAndMachineDrivers HPDC + CNC milling produces positive total', () => {
    const drivers = computeCastAndMachineDrivers(HPDC_INPUTS);
    const result = computeUniversalStack(
      { partName: 'HPDC Bracket + Machined', ...drivers, ...STACK_DEFAULTS },
      DEFAULT_RATE_LIBRARY
    );
    expect(result.total).toBeGreaterThan(0);
  });

  it('casting operations come before machining operations in the array', () => {
    const drivers = computeCastAndMachineDrivers(HPDC_INPUTS);
    const ops = drivers.operations;
    // Find index of casting op and first machining op
    const castIdx = ops.findIndex(o => o.operationName.toLowerCase().includes('cast') || o.operationName.toLowerCase().includes('hpdc'));
    const machSetupIdx = ops.findIndex(o => o.operationName.toLowerCase().includes('machining setup'));
    expect(castIdx).toBeGreaterThanOrEqual(0);
    expect(machSetupIdx).toBeGreaterThanOrEqual(0);
    expect(castIdx).toBeLessThan(machSetupIdx);
  });

  it('combined tooling = casting die cost + machining tooling cost for HPDC', () => {
    const drivers = computeCastAndMachineDrivers(HPDC_INPUTS);
    const expectedToolingTotal =
      HPDC_INPUTS.hpdc!.dieCost +
      HPDC_INPUTS.machiningToolingCost +
      HPDC_INPUTS.machiningProgrammingNRE;
    expect(drivers.tooling.totalToolingCost).toBeCloseTo(expectedToolingTotal, 4);
  });

  it('raw material materialId comes from casting input materialId', () => {
    const drivers = computeCastAndMachineDrivers(HPDC_INPUTS);
    expect(drivers.rawMaterial.materialId).toBe(HPDC_INPUTS.materialId);
  });

  it('sand casting + machining: tooling is pattern sets × cost; core cost moves to rawMaterial', () => {
    const drivers = computeCastAndMachineDrivers(SAND_INPUTS);
    // Core cost is now a rawMaterial consumable, not tooling.
    // Pattern tooling = patternCost × ceil(amortVol / patternLife)
    const patternSets = Math.ceil(SAND_INPUTS.amortizationVolume / SAND_INPUTS.sand!.patternLife);
    const sandPatternTooling = SAND_INPUTS.sand!.patternCost * patternSets;
    const expectedTotal =
      sandPatternTooling +
      SAND_INPUTS.machiningToolingCost +
      SAND_INPUTS.machiningProgrammingNRE;
    expect(drivers.tooling.totalToolingCost).toBeCloseTo(expectedTotal, 4);
    // Core cost (£1.50/part) should appear in rawMaterial consumables, not tooling
    expect(drivers.rawMaterial.consumablesCostPerPart).toBeCloseTo(SAND_INPUTS.sand!.coreCostPerPart, 4);
  });

  it('full stack computeUniversalStack gives positive total for HPDC+machining input', () => {
    const drivers = computeCastAndMachineDrivers(HPDC_INPUTS);
    const result = computeUniversalStack(
      { partName: 'HPDC + CNC', ...drivers, ...STACK_DEFAULTS },
      DEFAULT_RATE_LIBRARY
    );
    expect(result.total).toBeGreaterThan(0);
    expect(result.breakdown.rawMaterial).toBeGreaterThan(0);
    expect(result.breakdown.process).toBeGreaterThan(0);
    expect(result.breakdown.tooling).toBeGreaterThan(0);
  });

  it('geometry complexity is preserved in input (informational field)', () => {
    // geometryComplexity is passed through as input data, not validated by engine
    const inputs2: CastAndMachineInputs = { ...HPDC_INPUTS, geometryComplexity: 4 };
    const drivers = computeCastAndMachineDrivers(inputs2);
    // Should still compute without error — complexity is a UI concern
    expect(drivers.operations.length).toBeGreaterThan(0);
    expect(inputs2.geometryComplexity).toBe(4);
  });

  it('machiningProgrammingNRE is included in combined tooling', () => {
    const withNRE = computeCastAndMachineDrivers(HPDC_INPUTS);
    const withoutNRE = computeCastAndMachineDrivers({ ...HPDC_INPUTS, machiningProgrammingNRE: 0 });
    expect(withNRE.tooling.totalToolingCost - withoutNRE.tooling.totalToolingCost)
      .toBeCloseTo(HPDC_INPUTS.machiningProgrammingNRE, 4);
  });
});
