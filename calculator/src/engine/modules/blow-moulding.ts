import type { CommodityDrivers, OperationInput, RawMaterialInput, ToolingInput } from '../types.js';

export interface BlowMouldingInputs {
  materialId: string;
  partWeightKg: number;
  flashWeightKg: number;
  wallThicknessMm: number;
  coolTimeFactorSPerMm2: number;
  blowTimeSec: number;
  openCloseSec: number;
  machineId: string;
  labourId: string;
  cavities: number;
  oee: number;
  manning: number;
  labourEfficiency: number;
  mouldCost: number;
  mouldLife: number;
  amortizationVolume: number;
  deflashMachineId?: string;
  deflashLabourId?: string;
  deflashCycleTimeSec?: number;
}

export function getBlowMouldingInputSchema(): Record<string, string> {
  return {
    materialId: 'string — material ID from rate library (HDPE, PP, PET-BG most common)',
    partWeightKg: 'number — net finished part weight kg',
    flashWeightKg: 'number — pinch-off flash + neck trim scrap weight per part kg',
    wallThicknessMm: 'number — average wall thickness mm (drives cooling time)',
    coolTimeFactorSPerMm2: 'number — cooling constant s/mm² (HDPE/LDPE ~3.5, PP ~3.16, PET ~3.0)',
    blowTimeSec: 'number — pressurisation + hold time s (typically 3–8s for bottles)',
    openCloseSec: 'number — mould open / index / close time s (typically 4–8s)',
    machineId: 'string — EBM machine ID from rate library',
    labourId: 'string — labour rate ID',
    cavities: 'number — blow cavities per mould (typically 1–8 for small parts)',
    oee: 'number 0–1',
    manning: 'number — operators per machine',
    labourEfficiency: 'number 0–1',
    mouldCost: 'number — blow mould set cost £ (lower than injection mould)',
    mouldLife: 'number — cycles per mould life (Al mould: 500k–2M)',
    amortizationVolume: 'number — parts over which to amortize mould cost',
    deflashMachineId: 'string (optional) — secondary deflashing machine ID',
    deflashLabourId: 'string (optional) — labour rate ID for deflash operation',
    deflashCycleTimeSec: 'number (optional) — deflash/trimming cycle time per part s',
  };
}

export function computeBlowMouldingDrivers(inputs: BlowMouldingInputs): CommodityDrivers {
  const coolingTimeSec = inputs.coolTimeFactorSPerMm2 * inputs.wallThicknessMm ** 2;
  const cycleTimeSec = inputs.blowTimeSec + coolingTimeSec + inputs.openCloseSec;
  const cycleTimeHr = cycleTimeSec / 3600;

  const grossWeightKg = inputs.partWeightKg + inputs.flashWeightKg;
  const materialUtilization = inputs.partWeightKg / grossWeightKg;

  const rawMaterial: RawMaterialInput = {
    materialId: inputs.materialId,
    netWeightKg: inputs.partWeightKg,
    materialUtilization,
  };

  const operations: OperationInput[] = [
    {
      operationName: 'Extrusion Blow Moulding',
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

  if (
    inputs.deflashMachineId !== undefined &&
    inputs.deflashLabourId !== undefined &&
    inputs.deflashCycleTimeSec !== undefined &&
    inputs.deflashCycleTimeSec > 0
  ) {
    const deflashCycleTimeHr = inputs.deflashCycleTimeSec / 3600;
    operations.push({
      operationName: 'Deflashing',
      machineId: inputs.deflashMachineId,
      labourId: inputs.deflashLabourId,
      cycleTimeHr: deflashCycleTimeHr,
      partsPerCycle: 1,
      oee: 1.0,
      manning: 1,
      labourTimeHr: deflashCycleTimeHr,
      labourEfficiency: 1.0,
    });
  }

  // mouldLife is in cycles; one cycle produces `cavities` parts
  const numMoulds = inputs.mouldLife > 0
    ? Math.ceil(inputs.amortizationVolume / (inputs.mouldLife * inputs.cavities))
    : 1;

  const tooling: ToolingInput = {
    totalToolingCost: inputs.mouldCost * numMoulds,
    amortizationVolume: inputs.amortizationVolume,
    mode: 'amortized',
  };

  return { rawMaterial, operations, tooling };
}
