import type { CommodityDrivers, OperationInput, RawMaterialInput, ToolingInput } from '../types.js';

export type FabBlankingMethod = 'laser' | 'plasma' | 'waterjet' | 'punch' | 'shear';
export type AssistGas = 'nitrogen' | 'oxygen' | 'air';

export const ASSIST_GAS_COST_PER_HR: Record<AssistGas, number> = {
  nitrogen: 3.50,
  oxygen:   1.20,
  air:      0.40,
};

// [min_tolerance_mm, factor] — check from widest to tightest
export const SM_FAB_TOLERANCE_FACTOR: [number, number][] = [
  [0.50, 1.0],
  [0.30, 1.1],
  [0.20, 1.3],
  [0.10, 1.6],
];

export interface SheetMetalFabInputs {
  // ── Material ────────────────────────────────────────────────────────────────
  materialId: string;
  partWeightKg: number;
  materialUtilization: number;

  // ── Blanking ────────────────────────────────────────────────────────────────
  blankingMethod: FabBlankingMethod;
  blankingMachineId: string;
  blankingLabourId: string;
  blankingCycleTimeSec: number;
  /** Assist gas for laser (N₂/O₂/Air) or plasma (Air/O₂) cutting */
  assistGas?: AssistGas;

  // ── Bending ─────────────────────────────────────────────────────────────────
  bendCount: number;
  timePerBendSec: number;
  toolChangeCount: number;
  toolChangeTimeSec: number;
  bendMachineId: string;
  bendLabourId: string;

  // ── Process parameters ───────────────────────────────────────────────────────
  oee: number;
  manning: number;
  labourEfficiency: number;
  rejectRate?: number;

  // ── Tolerance ────────────────────────────────────────────────────────────────
  toleranceMm?: number;

  // ── Spot welding (optional) ──────────────────────────────────────────────────
  spotWeldCount?: number;
  spotWeldMachineId?: string;
  spotWeldLabourId?: string;
  timePerSpotWeldSec?: number;

  // ── MIG welding (optional) ───────────────────────────────────────────────────
  migWeldLengthM?: number;
  migWeldSpeedMPerMin?: number;
  migWeldMachineId?: string;
  migWeldLabourId?: string;
  migWeldConsumableCostPerM?: number;

  // ── TIG welding (optional) ───────────────────────────────────────────────────
  /** TIG weld bead length per part in metres. Typical 0.1–2.0m. */
  tigWeldLengthM?: number;
  /** TIG deposition speed m/min. Manual TIG: 0.05–0.12 m/min. Default 0.08. */
  tigWeldSpeedMPerMin?: number;
  tigWeldMachineId?: string;
  tigWeldLabourId?: string;
  /** Argon gas + filler rod cost per metre of TIG bead. Typical £0.50–0.80/m. Default 0.60. */
  tigWeldConsumableCostPerM?: number;

  // ── Tooling ──────────────────────────────────────────────────────────────────
  toolingCost: number;
  amortizationVolume: number;
}

export function getSheetMetalFabInputSchema(): Record<string, string> {
  return {
    materialId: 'string — ID from rate library materials (e.g. mat-dc01, mat-ss304-sheet)',
    partWeightKg: 'number — finished part weight kg',
    materialUtilization: 'number 0–1 — net part weight / gross blank weight including nesting scrap',
    blankingMethod: 'laser | plasma | waterjet | punch | shear — primary blanking/cutting process',
    blankingMachineId: 'string — machine ID for the blanking operation',
    blankingLabourId: 'string — labour rate ID for blanking',
    blankingCycleTimeSec: 'number — total blanking cycle time per part in seconds including sheet load/index',
    assistGas: 'nitrogen | oxygen | air — assist gas for laser (N₂ for SS/Al, O₂ for mild steel) or plasma gas type',
    bendCount: 'number — number of bends per part',
    timePerBendSec: 'number — seconds per bend including repositioning (default 45s)',
    toolChangeCount: 'number — press brake die/punch tool setups per part run',
    toolChangeTimeSec: 'number — seconds per tool change amortized over batch (default 300s)',
    bendMachineId: 'string — press brake machine ID',
    bendLabourId: 'string — labour rate ID for bending',
    oee: 'number 0–1 — overall equipment effectiveness for blanking and bending',
    manning: 'number — operators per machine',
    labourEfficiency: 'number 0–1',
    rejectRate: 'number 0–1 — overall fab reject rate; uplifts material and cycle times',
    toleranceMm: 'number — tightest tolerance on part in mm; multiplies blanking and bending cycle times',
    spotWeldCount: 'number? — number of spot welds per part',
    spotWeldMachineId: 'string? — spot weld machine ID (required when spotWeldCount > 0)',
    spotWeldLabourId: 'string? — labour rate ID for spot welding (required when spotWeldCount > 0)',
    timePerSpotWeldSec: 'number? — seconds per spot weld (default 3s)',
    migWeldLengthM: 'number? — total MIG weld bead length per part in metres',
    migWeldSpeedMPerMin: 'number? — MIG wire deposition speed m/min (default 0.3)',
    migWeldMachineId: 'string? — MIG welder machine ID (required when migWeldLengthM > 0)',
    migWeldLabourId: 'string? — labour rate ID for MIG welding (required when migWeldLengthM > 0)',
    migWeldConsumableCostPerM: 'number? — wire + shielding gas cost £/m of weld bead (default 0.40)',
    tigWeldLengthM: 'number? — total TIG weld bead length per part in metres',
    tigWeldSpeedMPerMin: 'number? — TIG deposition speed m/min (manual: 0.05–0.12, default 0.08)',
    tigWeldMachineId: 'string? — TIG welder machine ID (required when tigWeldLengthM > 0)',
    tigWeldLabourId: 'string? — labour rate ID for TIG welding (skilled welder required)',
    tigWeldConsumableCostPerM: 'number? — argon + filler rod cost £/m of TIG bead (default 0.60)',
    toolingCost: 'number — press brake tooling + nesting/CNC programming NRE £',
    amortizationVolume: 'number — volume over which to amortize tooling',
  };
}

const BLANKING_OP_NAME: Record<FabBlankingMethod, string> = {
  laser:    'Laser Cutting',
  plasma:   'Plasma Cutting',
  waterjet: 'Waterjet Cutting',
  punch:    'Turret Punching',
  shear:    'Shearing',
};

function resolveToleranceFactor(toleranceMm: number | undefined): number {
  if (toleranceMm === undefined) return 1.0;
  // Walk from tightest threshold to widest; return factor for first threshold ≤ toleranceMm
  for (let i = SM_FAB_TOLERANCE_FACTOR.length - 1; i >= 0; i--) {
    const [threshold, factor] = SM_FAB_TOLERANCE_FACTOR[i];
    if (toleranceMm <= threshold) return factor;
  }
  return 1.0;
}

export function computeSheetMetalFabDrivers(inputs: SheetMetalFabInputs): CommodityDrivers {
  const toleranceFactor = resolveToleranceFactor(inputs.toleranceMm);

  const rejectUplift = inputs.rejectRate && inputs.rejectRate > 0
    ? 1 / (1 - inputs.rejectRate)
    : 1.0;

  // Assist gas applies to laser and plasma
  const gasApplies = inputs.assistGas &&
    (inputs.blankingMethod === 'laser' || inputs.blankingMethod === 'plasma');
  const gasAdder = gasApplies
    ? ASSIST_GAS_COST_PER_HR[inputs.assistGas!] *
      (inputs.blankingCycleTimeSec / 3600) * toleranceFactor * rejectUplift
    : 0;

  const migConsumableCost =
    (inputs.migWeldLengthM ?? 0) * (inputs.migWeldConsumableCostPerM ?? 0.40);

  const tigConsumableCost =
    (inputs.tigWeldLengthM ?? 0) * (inputs.tigWeldConsumableCostPerM ?? 0.60);

  const consumablesCostPerPart = gasAdder + migConsumableCost + tigConsumableCost;

  const rawMaterial: RawMaterialInput = {
    materialId: inputs.materialId,
    netWeightKg: inputs.partWeightKg * rejectUplift,
    materialUtilization: inputs.materialUtilization,
    ...(consumablesCostPerPart > 0 ? { consumablesCostPerPart } : {}),
  };

  const blankingCycleHr =
    (inputs.blankingCycleTimeSec / 3600) * toleranceFactor * rejectUplift;

  const operations: OperationInput[] = [
    {
      operationName: BLANKING_OP_NAME[inputs.blankingMethod],
      machineId: inputs.blankingMachineId,
      labourId: inputs.blankingLabourId,
      cycleTimeHr: blankingCycleHr,
      partsPerCycle: 1,
      oee: inputs.oee,
      manning: inputs.manning,
      labourTimeHr: blankingCycleHr,
      labourEfficiency: inputs.labourEfficiency,
    },
  ];

  if (inputs.bendCount > 0) {
    const bendingCycleTimeSec =
      inputs.bendCount * inputs.timePerBendSec +
      inputs.toolChangeCount * inputs.toolChangeTimeSec;
    const bendingCycleHr = (bendingCycleTimeSec / 3600) * toleranceFactor * rejectUplift;
    operations.push({
      operationName: 'Press Brake Bending',
      machineId: inputs.bendMachineId,
      labourId: inputs.bendLabourId,
      cycleTimeHr: bendingCycleHr,
      partsPerCycle: 1,
      oee: inputs.oee,
      manning: inputs.manning,
      labourTimeHr: bendingCycleHr,
      labourEfficiency: inputs.labourEfficiency,
    });
  }

  if (
    (inputs.spotWeldCount ?? 0) > 0 &&
    inputs.spotWeldMachineId !== undefined &&
    inputs.spotWeldLabourId !== undefined
  ) {
    const swCycleHr =
      inputs.spotWeldCount! * (inputs.timePerSpotWeldSec ?? 3) / 3600 * rejectUplift;
    operations.push({
      operationName: 'Spot Welding',
      machineId: inputs.spotWeldMachineId,
      labourId: inputs.spotWeldLabourId,
      cycleTimeHr: swCycleHr,
      partsPerCycle: 1,
      oee: 1.0,
      manning: inputs.manning,
      labourTimeHr: swCycleHr,
      labourEfficiency: inputs.labourEfficiency,
    });
  }

  if (
    (inputs.migWeldLengthM ?? 0) > 0 &&
    inputs.migWeldMachineId !== undefined &&
    inputs.migWeldLabourId !== undefined
  ) {
    const migCycleHr =
      inputs.migWeldLengthM! / (inputs.migWeldSpeedMPerMin ?? 0.3) / 60 * rejectUplift;
    operations.push({
      operationName: 'MIG Welding',
      machineId: inputs.migWeldMachineId,
      labourId: inputs.migWeldLabourId,
      cycleTimeHr: migCycleHr,
      partsPerCycle: 1,
      oee: 1.0,
      manning: inputs.manning,
      labourTimeHr: migCycleHr,
      labourEfficiency: inputs.labourEfficiency,
    });
  }

  if (
    (inputs.tigWeldLengthM ?? 0) > 0 &&
    inputs.tigWeldMachineId !== undefined &&
    inputs.tigWeldLabourId !== undefined
  ) {
    const tigCycleHr =
      inputs.tigWeldLengthM! / (inputs.tigWeldSpeedMPerMin ?? 0.08) / 60 * rejectUplift;
    operations.push({
      operationName: 'TIG Welding',
      machineId: inputs.tigWeldMachineId,
      labourId: inputs.tigWeldLabourId,
      cycleTimeHr: tigCycleHr,
      partsPerCycle: 1,
      oee: 1.0,
      manning: inputs.manning,
      labourTimeHr: tigCycleHr,
      labourEfficiency: inputs.labourEfficiency,
    });
  }

  const tooling: ToolingInput = {
    totalToolingCost: inputs.toolingCost,
    amortizationVolume: inputs.amortizationVolume,
    mode: 'amortized',
  };

  return { rawMaterial, operations, tooling };
}
