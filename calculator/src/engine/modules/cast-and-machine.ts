import type { CommodityDrivers, OperationInput, ToolingInput } from '../types.js';
import type { CastingSubtype } from './casting.js';
import type { MachiningOperation } from './machining.js';
import { computeCastingDrivers } from './casting.js';

export interface CastAndMachineInputs {
  // === CASTING ===
  castingSubtype: CastingSubtype;
  materialId: string;
  castPartWeightKg: number;     // as-cast weight (material cost basis)
  finishedWeightKg: number;     // finished weight after machining (informational)
  castingYield: number;
  rejectRate: number;
  castingLabourId: string;
  castingOee: number;
  castingManning: number;
  castingLabourEfficiency: number;
  // Subtype-specific (same as CastingInputs)
  hpdc?: { machineId: string; cycleTimeSec: number; cavities: number; dieCost: number; dieLife: number; };
  sand?: { mouldLineId: string; cycleTimeHr: number; patternCost: number; patternLife: number; coreCostPerPart: number; };
  gravity?: { machineId: string; cycleTimeHr: number; mouldCost: number; mouldLife: number; };
  investment?: { waxCostPerPart: number; shellBuildCostPerPart: number; pourLabourId: string; pourCycleHr: number; pourMachineId: string; };

  // === MACHINING ===
  geometryComplexity: 1 | 2 | 3 | 4 | 5;
  machiningOps: MachiningOperation[];
  machiningSetup: {
    setupTimeHr: number;
    batchSize: number;
    machineId: string;
    labourId: string;
  };
  machiningToolingCost: number;       // fixtures + cutting tools £
  machiningProgrammingNRE: number;    // CNC programming NRE £

  // === SHARED ===
  amortizationVolume: number;
}

export function computeCastAndMachineDrivers(inputs: CastAndMachineInputs): CommodityDrivers {
  // 1. Compute casting drivers (provides rawMaterial + casting operations + casting tooling)
  const castDrivers = computeCastingDrivers({
    subtype: inputs.castingSubtype,
    materialId: inputs.materialId,
    partWeightKg: inputs.castPartWeightKg,
    castingYield: inputs.castingYield,
    rejectRate: inputs.rejectRate,
    labourId: inputs.castingLabourId,
    oee: inputs.castingOee,
    manning: inputs.castingManning,
    labourEfficiency: inputs.castingLabourEfficiency,
    amortizationVolume: inputs.amortizationVolume,
    hpdc: inputs.hpdc,
    sand: inputs.sand,
    gravity: inputs.gravity,
    investment: inputs.investment,
  });

  // 2. Build machining operations (setup pseudo-op + main ops)
  const setupPerPart = inputs.machiningSetup.setupTimeHr / Math.max(inputs.machiningSetup.batchSize, 1);
  const machOps: OperationInput[] = [
    {
      operationName: 'Machining Setup (amortised)',
      machineId: inputs.machiningSetup.machineId,
      labourId: inputs.machiningSetup.labourId,
      cycleTimeHr: setupPerPart,
      partsPerCycle: 1,
      oee: 1.0,
      manning: 1,
      labourTimeHr: setupPerPart,
      labourEfficiency: 1.0,
    },
    ...inputs.machiningOps.map(op => ({
      operationName: op.name,
      machineId: op.machineId,
      labourId: op.labourId,
      cycleTimeHr: op.cycleTimeHr,
      partsPerCycle: op.partsPerCycle,
      oee: op.oee,
      manning: op.manning,
      labourTimeHr: op.labourTimeHr,
      labourEfficiency: op.labourEfficiency,
    } satisfies OperationInput)),
  ];

  // 3. Combine tooling: casting tooling cost already inflated by consumables in castDrivers
  const combinedTooling: ToolingInput = {
    totalToolingCost: castDrivers.tooling.totalToolingCost + inputs.machiningToolingCost + inputs.machiningProgrammingNRE,
    amortizationVolume: inputs.amortizationVolume,
    mode: 'amortized',
  };

  return {
    rawMaterial: castDrivers.rawMaterial,
    operations: [...castDrivers.operations, ...machOps],
    tooling: combinedTooling,
  };
}
