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
  investment?: { waxCostPerPart: number; shellBuildCostPerPart: number; pourLabourId: string; pourCycleHr: number; pourMachineId: string; waxDieCost: number; };

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

  // === POST-CASTING SECONDARY OPERATIONS (optional) ===
  /** T5/T6/T4 heat treatment cost per kg (0 or undefined = none) */
  heatTreatmentCostPerKg?: number;
  /** Shot blast / surface prep cost per part (0 or undefined = none) */
  shotBlastCostPerPart?: number;
  /** Impregnation (porosity sealing) cost per part — common for pressure-critical HPDC */
  impregnationCostPerPart?: number;
  /** Deburring / fettling cost per part */
  deburringCostPerPart?: number;
  /** Hot isostatic pressing cost per kg — closes micro-porosity for aero/safety-critical castings */
  hipCostPerKg?: number;
  /** Non-destructive test (X-ray/CT) cost per part — safety-critical porosity screening */
  ndtCostPerPart?: number;
  /** Post-casting labour ID (for heat treat/shot blast operations) */
  postCastLabourId?: string;
  /** Post-casting machine ID (heat treat furnace) */
  heatTreatMachineId?: string;
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
  const GEOMETRY_COMPLEXITY_SETUP_FACTOR = [0, 0.5, 0.75, 1.0, 1.4, 1.8];
  const complexitySetupFactor = GEOMETRY_COMPLEXITY_SETUP_FACTOR[inputs.geometryComplexity] ?? 1.0;
  const setupPerPart = (inputs.machiningSetup.setupTimeHr / Math.max(inputs.machiningSetup.batchSize, 1)) * complexitySetupFactor;
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

  // 4. Aggregate post-casting consumable costs into material line
  const postCastCost =
    (inputs.heatTreatmentCostPerKg ?? 0) * inputs.castPartWeightKg +
    (inputs.hipCostPerKg ?? 0) * inputs.castPartWeightKg +
    (inputs.shotBlastCostPerPart ?? 0) +
    (inputs.impregnationCostPerPart ?? 0) +
    (inputs.deburringCostPerPart ?? 0) +
    (inputs.ndtCostPerPart ?? 0);

  const finalRawMaterial = postCastCost > 0
    ? {
        ...castDrivers.rawMaterial,
        consumablesCostPerPart: (castDrivers.rawMaterial.consumablesCostPerPart ?? 0) + postCastCost,
      }
    : castDrivers.rawMaterial;

  return {
    rawMaterial: finalRawMaterial,
    operations: [...castDrivers.operations, ...machOps],
    tooling: combinedTooling,
  };
}
