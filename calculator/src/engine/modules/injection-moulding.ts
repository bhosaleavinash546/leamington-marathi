import type { CommodityDrivers, OperationInput, RawMaterialInput, ToolingInput } from '../types.js';

export type RunnerSystem = 'cold' | 'hot';

export interface InjectionMouldingInputs {
  materialId: string;
  partWeightKg: number;
  runnerWeightKg: number;
  regrindFraction: number;   // 0–1, fraction of runner recovered (ignored for hot runners)
  runnerSystem?: RunnerSystem; // 'hot' → no runner waste; include hot-runner cost in mouldCost
  cavities: number;
  projectedAreaCm2: number;  // total projected area of all cavities
  cavityPressureMPa: number; // default 30 for standard resins
  wallThicknessMm: number;
  coolTimeFactorSPerMm2: number; // s/mm² — 3.16 for PP, varies by resin
  fillTimeSec: number;
  packTimeSec: number;
  ejectTimeSec: number;
  machineId: string;
  labourId: string;
  oee: number;
  manning: number;
  labourEfficiency: number;
  mouldCost: number;
  mouldLife: number;         // shots per mould life
  amortizationVolume: number;
  toleranceMm?: number;            // tightest tolerance on part mm. Affects mould complexity cost.
  surfaceFinishGrade?: 'standard' | 'textured' | 'high_gloss' | 'painted';
  rejectRate?: number;             // moulding scrap fraction 0–1
}

export function getInjectionMouldingInputSchema(): Record<string, string> {
  return {
    materialId: 'string — resin material ID in rate library',
    partWeightKg: 'number — finished part weight kg (one cavity)',
    runnerWeightKg: 'number — total runner/sprue weight per shot kg',
    regrindFraction: 'number 0–1 — fraction of runner weight recovered as regrind',
    cavities: 'number — number of cavities in tool',
    projectedAreaCm2: 'number — total projected area of all cavities cm²',
    cavityPressureMPa: 'number — cavity pressure MPa (default 30)',
    wallThicknessMm: 'number — nominal wall thickness mm (drives cool time)',
    coolTimeFactorSPerMm2: 'number — cooling constant s/mm² (3.16 for PP; ~2.0 for ABS)',
    fillTimeSec: 'number — injection fill time s',
    packTimeSec: 'number — packing/holding time s',
    ejectTimeSec: 'number — mould open + eject + close time s',
    machineId: 'string — IMM machine ID from rate library',
    labourId: 'string — labour rate ID',
    oee: 'number 0–1',
    manning: 'number — operators per machine',
    labourEfficiency: 'number 0–1',
    mouldCost: 'number — total mould cost £',
    mouldLife: 'number — shots per mould life. numMoulds = ceil(amortVol / (mouldLife × cavities)); drives total tooling cost',
    amortizationVolume: 'number — parts over which to amortize mould cost',
    toleranceMm: 'number? — tightest part tolerance mm. Multiplier applied to mould cost: >=0.2→×1.0, >=0.1→×1.2, >=0.05→×1.5, <0.05→×2.0',
    surfaceFinishGrade: 'standard|textured|high_gloss|painted — mould surface finish. Multiplier on mould cost: standard×1.0, textured×1.1, high_gloss×1.4, painted×1.6 (cosmetic mould only)',
    rejectRate: 'number 0–1 (optional) — moulding scrap fraction; uplifts effective cycle time and material',
  };
}

/**
 * Estimate required clamping force (tonnes) from projected area and cavity pressure.
 * Use to validate machine selection. Safety factor = 1.15 standard.
 */
export function estimateClampingTonnage(inputs: Pick<InjectionMouldingInputs, 'projectedAreaCm2' | 'cavityPressureMPa'> & { safetyfactor?: number }): number {
  const sf = inputs.safetyfactor ?? 1.15;
  // Force (N) = area_m2 × pressure_Pa = area_cm2 × 1e-4 m2 × pressure_MPa × 1e6 Pa
  const forceN = inputs.projectedAreaCm2 * 1e-4 * inputs.cavityPressureMPa * 1e6 * sf;
  return forceN / 9806.65; // convert N to tonnes-force
}

export function computeInjectionMouldingDrivers(inputs: InjectionMouldingInputs): CommodityDrivers {
  const rejectUplift = (inputs.rejectRate && inputs.rejectRate > 0)
    ? 1 / (1 - inputs.rejectRate)
    : 1;

  // Tolerance → mould cost multiplier
  const toleranceFactor =
    inputs.toleranceMm === undefined ? 1.0 :
    inputs.toleranceMm >= 0.20 ? 1.0 :
    inputs.toleranceMm >= 0.10 ? 1.2 :
    inputs.toleranceMm >= 0.05 ? 1.5 :
    2.0;

  // Surface finish → mould cost multiplier (also slows cooling for high-gloss)
  const finishFactors: Record<string, { tooling: number; coolTime: number }> = {
    standard:   { tooling: 1.00, coolTime: 1.00 },
    textured:   { tooling: 1.10, coolTime: 1.00 },
    high_gloss: { tooling: 1.40, coolTime: 1.15 },
    painted:    { tooling: 1.60, coolTime: 1.00 },
  };
  const finishFactor = finishFactors[inputs.surfaceFinishGrade ?? 'standard'] ?? finishFactors.standard;

  // Cooling time
  const coolTimeSec = inputs.coolTimeFactorSPerMm2 * inputs.wallThicknessMm ** 2 * finishFactor.coolTime;
  const totalCycleTimeSec = inputs.fillTimeSec + inputs.packTimeSec + coolTimeSec + inputs.ejectTimeSec;
  const cycleTimeHr = totalCycleTimeSec / 3600;

  // Effective material: for hot runners there is no runner waste (plastic stays in manifold)
  const effectiveRunnerWeightKg = inputs.runnerSystem === 'hot' ? 0 : inputs.runnerWeightKg;
  const runnerWastePerCavity = (effectiveRunnerWeightKg / inputs.cavities) * (1 - inputs.regrindFraction);
  const grossPerPart = inputs.partWeightKg + runnerWastePerCavity;
  const materialUtilization = inputs.partWeightKg / grossPerPart;

  const rawMaterial: RawMaterialInput = {
    materialId: inputs.materialId,
    netWeightKg: inputs.partWeightKg * rejectUplift,
    materialUtilization,
  };

  const effectiveCycleTimeHr = cycleTimeHr * rejectUplift;

  const operations: OperationInput[] = [
    {
      operationName: 'Injection Moulding',
      machineId: inputs.machineId,
      labourId: inputs.labourId,
      cycleTimeHr: effectiveCycleTimeHr,
      partsPerCycle: inputs.cavities,
      oee: inputs.oee,
      manning: inputs.manning,
      labourTimeHr: effectiveCycleTimeHr,
      labourEfficiency: inputs.labourEfficiency,
    },
  ];

  // mouldLife is in shots; one shot produces `cavities` parts
  const shotsNeeded = inputs.amortizationVolume / inputs.cavities;
  const numMoulds = inputs.mouldLife > 0 ? Math.ceil(shotsNeeded / inputs.mouldLife) : 1;
  const tooling: ToolingInput = {
    totalToolingCost: inputs.mouldCost * numMoulds * toleranceFactor * finishFactor.tooling,
    amortizationVolume: inputs.amortizationVolume,
    mode: 'amortized',
  };

  return { rawMaterial, operations, tooling };
}
