import type { CommodityDrivers, RawMaterialInput, OperationInput, ToolingInput } from '../types.js';

export interface RotationalMouldingInputs {
  materialId: string;
  partWeightKg: number;
  powderCostAdderPerKg: number;
  partsPerArm: number;
  heatingTimeSec: number;
  coolingTimeSec: number;
  loadUnloadTimeSec: number;
  machineId: string;
  labourId: string;
  oee: number;
  manning: number;
  labourEfficiency: number;
  mouldCost: number;
  mouldLife: number;
  amortizationVolume: number;
}

export function getRotationalMouldingInputSchema(): Record<string, string> {
  return {
    materialId: 'string — material ID from rate library (LLDPE powder most common)',
    partWeightKg: 'number — finished part weight kg (equals powder charge weight)',
    powderCostAdderPerKg: 'number — grinding/screening premium over pellet price £/kg (0.15–0.40 typical)',
    partsPerArm: 'number — number of moulds per arm (1–4 typically)',
    heatingTimeSec: 'number — oven residence time s (600–1800s typical)',
    coolingTimeSec: 'number — cooling booth time s (900–2400s typical)',
    loadUnloadTimeSec: 'number — demould + charge load time s (120–300s typical)',
    machineId: 'string — rotomoulding machine ID from rate library',
    labourId: 'string — labour rate ID',
    oee: 'number 0–1',
    manning: 'number — operators per machine',
    labourEfficiency: 'number 0–1',
    mouldCost: 'number — Al casting tool cost £ (much cheaper than injection mould)',
    mouldLife: 'number — cycles per mould life (50k–200k typical)',
    amortizationVolume: 'number — parts over which to amortize mould cost',
  };
}

export function computeRotationalMouldingDrivers(inputs: RotationalMouldingInputs): CommodityDrivers {
  const cycleTimeSec = inputs.heatingTimeSec + inputs.coolingTimeSec + inputs.loadUnloadTimeSec;
  const cycleTimeHr = cycleTimeSec / 3600;

  // Virtually no material waste in rotomoulding; all powder sinters onto mould walls
  const materialUtilization = 0.99;

  // Powder grinding premium is a per-part consumable added to the material cost bucket
  const consumablesCostPerPart = inputs.powderCostAdderPerKg * inputs.partWeightKg;

  const rawMaterial: RawMaterialInput = {
    materialId: inputs.materialId,
    netWeightKg: inputs.partWeightKg,
    materialUtilization,
    consumablesCostPerPart,
  };

  // Arms rotate simultaneously; one arm completes per full oven cycle
  const operations: OperationInput[] = [
    {
      operationName: 'Rotational Moulding',
      machineId: inputs.machineId,
      labourId: inputs.labourId,
      cycleTimeHr,
      partsPerCycle: inputs.partsPerArm,
      oee: inputs.oee,
      manning: inputs.manning,
      labourTimeHr: cycleTimeHr,
      labourEfficiency: inputs.labourEfficiency,
    },
  ];

  const numMoulds = inputs.mouldLife > 0
    ? Math.ceil(inputs.amortizationVolume / (inputs.mouldLife * inputs.partsPerArm))
    : 1;

  const tooling: ToolingInput = {
    totalToolingCost: inputs.mouldCost * numMoulds,
    amortizationVolume: inputs.amortizationVolume,
    mode: 'amortized',
  };

  return { rawMaterial, operations, tooling };
}
