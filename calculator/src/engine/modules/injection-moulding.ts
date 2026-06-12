import type { CommodityDrivers, OperationInput, RawMaterialInput, ToolingInput } from '../types.js';

export interface InjectionMouldingInputs {
  materialId: string;
  partWeightKg: number;
  runnerWeightKg: number;
  regrindFraction: number;   // 0–1, fraction of runner recovered
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
    mouldLife: 'number — shots per mould life (used for information; amortizationVolume controls £/part)',
    amortizationVolume: 'number — parts over which to amortize mould cost',
  };
}

export function computeInjectionMouldingDrivers(inputs: InjectionMouldingInputs): CommodityDrivers {
  // Cooling time
  const coolTimeSec = inputs.coolTimeFactorSPerMm2 * inputs.wallThicknessMm ** 2;
  const totalCycleTimeSec = inputs.fillTimeSec + inputs.packTimeSec + coolTimeSec + inputs.ejectTimeSec;
  const cycleTimeHr = totalCycleTimeSec / 3600;

  // Effective material: runner loss not recovered becomes waste
  const runnerWastePerCavity = (inputs.runnerWeightKg / inputs.cavities) * (1 - inputs.regrindFraction);
  const grossPerPart = inputs.partWeightKg + runnerWastePerCavity;
  const materialUtilization = inputs.partWeightKg / grossPerPart;

  const rawMaterial: RawMaterialInput = {
    materialId: inputs.materialId,
    netWeightKg: inputs.partWeightKg,
    materialUtilization,
  };

  const operations: OperationInput[] = [
    {
      operationName: 'Injection Moulding',
      machineId: inputs.machineId,
      labourId: inputs.labourId,
      cycleTimeHr,
      partsPerCycle: inputs.cavities,
      oee: inputs.oee,
      manning: inputs.manning,
      labourTimeHr: cycleTimeHr,
      labourEfficiency: inputs.labourEfficiency,
    },
  ];

  const tooling: ToolingInput = {
    totalToolingCost: inputs.mouldCost,
    amortizationVolume: inputs.amortizationVolume,
    mode: 'amortized',
  };

  return { rawMaterial, operations, tooling };
}
