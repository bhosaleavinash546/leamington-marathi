import type { CommodityDrivers, OperationInput, RawMaterialInput, ToolingInput } from '../types.js';

export type FabBlankingMethod = 'laser' | 'plasma' | 'waterjet' | 'punch' | 'shear';
export type AssistGas = 'nitrogen' | 'oxygen' | 'air';

/**
 * Assist-gas cost while the beam is cutting, £/hr (UK, 2026).
 * Nitrogen: high-pressure fusion cutting (SS/Al) consumes 20–90 Nm³/hr at 10–20 bar.
 *   Bulk liquid N₂ ≈ £0.15–0.30/m³ → £5–18/hr; on-site generation £3–5/hr; cylinders £20+/hr.
 *   £9/hr is the bulk-liquid mid-point — the defensible basis for a UK fab shop quote.
 * Oxygen: mild-steel oxidation cutting uses far lower flow (2–5 m³/hr, <6 bar) → £1–3/hr bulk.
 * Air: compressor amortization + energy for compressed-air cutting/plasma.
 */
export const ASSIST_GAS_COST_PER_HR: Record<AssistGas, number> = {
  nitrogen: 9.00,
  oxygen:   1.80,
  air:      0.40,
};

/**
 * Waterjet abrasive consumable, £/hr of cutting (UK, 2026).
 * Garnet 80-mesh: 0.3–0.45 kg/min ≈ 20–27 kg/hr at £0.60–0.85/kg → £12–20/hr,
 * plus orifice/mixing-tube wear ~£2–4/hr. Without this, waterjet parts are
 * materially under-costed (abrasive is the dominant waterjet operating cost).
 */
export const WATERJET_ABRASIVE_COST_PER_HR = 18.00;

// [min_tolerance_mm, factor] — check from widest to tightest
export const SM_FAB_TOLERANCE_FACTOR: [number, number][] = [
  [0.50, 1.0],
  [0.30, 1.1],
  [0.20, 1.3],
  [0.10, 1.6],
];

// ─── Laser/plasma/waterjet feed-rate model ───────────────────────────────────
export type FabMaterialFamily = 'mild_steel' | 'stainless' | 'aluminium';

/**
 * Cutting feed rate in mm/min for a mid-range (~6 kW) fibre laser, by material
 * and thickness. Fitted as feed = k / t^p from 2025–26 machine cut charts
 * (Trumpf/Bystronic): speed falls off ~linearly-to-superlinearly with thickness.
 *   mild steel (O₂):  ~8500/t^1.05  · stainless (N₂): ~7000/t^1.35  · Al (N₂): ~7500/t^1.25
 * Method scaling vs laser: plasma faster on thick steel but not fine work (×1.4,
 * only sensible >3 mm), waterjet ~0.12× (slow, cold), punch/shear are not
 * feed-rate cut (return NaN → caller should use a stroke/manual basis instead).
 */
export function estimateLaserFeedRateMmMin(
  family: FabMaterialFamily,
  thicknessMm: number,
  method: FabBlankingMethod = 'laser',
): number {
  const t = Math.max(0.3, thicknessMm);
  const laser =
    family === 'mild_steel' ? 8500 / Math.pow(t, 1.05) :
    family === 'stainless'  ? 7000 / Math.pow(t, 1.35) :
                              7500 / Math.pow(t, 1.25); // aluminium
  if (method === 'plasma')   return laser * 1.4;
  if (method === 'waterjet') return laser * 0.12;
  if (method === 'punch' || method === 'shear') return NaN; // not a continuous-cut process
  return laser;
}

/** Laser pierce time per hole/contour start, seconds — grows with thickness. */
export function estimatePierceSec(thicknessMm: number): number {
  return 0.3 + 0.15 * Math.max(0, thicknessMm);
}

export interface BlankingCycleInputs {
  method: FabBlankingMethod;
  materialFamily: FabMaterialFamily;
  thicknessMm: number;
  /** Total cut path length per part in mm (external perimeter + internal features). */
  cutLengthMm: number;
  /** Number of pierce starts (external contour + each internal hole/slot). */
  pierceCount: number;
  /** Fixed sheet load/unload + positioning overhead per part, seconds. Default 8. */
  loadUnloadSec?: number;
}

/**
 * Physically-grounded blanking cycle time (seconds) = cut length ÷ feed rate
 * + pierce time × pierces + load/unload. Replaces a raw manual seconds guess.
 * Punch/shear return NaN (no continuous feed) — the caller keeps its own basis.
 */
export function estimateBlankingCycleSec(inputs: BlankingCycleInputs): number {
  const feed = estimateLaserFeedRateMmMin(inputs.materialFamily, inputs.thicknessMm, inputs.method);
  if (!Number.isFinite(feed) || feed <= 0) return NaN;
  const cutSec = (Math.max(0, inputs.cutLengthMm) / feed) * 60;
  const pierceSec = Math.max(0, inputs.pierceCount) * estimatePierceSec(inputs.thicknessMm);
  return cutSec + pierceSec + (inputs.loadUnloadSec ?? 8);
}

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
  /** Parts per production batch. Press-brake tool-change time is amortized over this. Default 1. */
  batchSize?: number;
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
    toolChangeCount: 'number — press brake die/punch tool setups per batch',
    toolChangeTimeSec: 'number — seconds per tool change (default 300s); amortized over batchSize',
    batchSize: 'number? — parts per production batch; tool-change time is divided by this (default 1)',
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

  // Waterjet garnet abrasive + orifice wear — dominant waterjet operating cost
  const abrasiveAdder = inputs.blankingMethod === 'waterjet'
    ? WATERJET_ABRASIVE_COST_PER_HR *
      (inputs.blankingCycleTimeSec / 3600) * toleranceFactor * rejectUplift
    : 0;

  // Weld consumables are wasted on rejected parts too — uplift like the gas adder
  const migConsumableCost =
    (inputs.migWeldLengthM ?? 0) * (inputs.migWeldConsumableCostPerM ?? 0.40) * rejectUplift;

  const tigConsumableCost =
    (inputs.tigWeldLengthM ?? 0) * (inputs.tigWeldConsumableCostPerM ?? 0.60) * rejectUplift;

  const consumablesCostPerPart = gasAdder + abrasiveAdder + migConsumableCost + tigConsumableCost;

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
    // Tool-change (setup) time is a per-batch cost — amortize over the batch size
    const effectiveBatch = Math.max(1, inputs.batchSize ?? 1);
    const bendingCycleTimeSec =
      inputs.bendCount * inputs.timePerBendSec +
      (inputs.toolChangeCount * inputs.toolChangeTimeSec) / effectiveBatch;
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
