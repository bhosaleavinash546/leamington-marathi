import type { CommodityDrivers, OperationInput, RawMaterialInput, ToolingInput } from '../types.js';

export interface ExtrusionInputs {
  materialId: string;
  profileWeightKgPerM: number;
  partLengthM: number;
  lineRateKgPerHr: number;
  extruderId: string;
  labourId: string;
  oee: number;
  manning: number;
  labourEfficiency: number;
  startupScrapFraction: number;
  dieCost: number;
  amortizationVolume: number;
}

export function getExtrusionInputSchema(): Record<string, string> {
  return {
    materialId: 'string — material ID from rate library (PE, PP, PVC, PS, PET, PA)',
    profileWeightKgPerM: 'number — linear weight density of extruded profile kg/m',
    partLengthM: 'number — cut length per finished part m',
    lineRateKgPerHr: 'number — extrusion throughput kg/hr',
    extruderId: 'string — extruder machine ID from rate library',
    labourId: 'string — labour rate ID',
    oee: 'number 0–1',
    manning: 'number — operators per machine',
    labourEfficiency: 'number 0–1',
    startupScrapFraction: 'number 0–<0.5 — fraction of run lost to startup purge / colour change',
    dieCost: 'number — extrusion die cost £',
    amortizationVolume: 'number — parts over which to amortize die cost',
  };
}

export function computeExtrusionDrivers(inputs: ExtrusionInputs): CommodityDrivers {
  const partWeightKg = inputs.profileWeightKgPerM * inputs.partLengthM;

  // Clamp startupScrapFraction below 0.5 to avoid division by zero / absurd uplift
  const scrapFraction = Math.min(inputs.startupScrapFraction, 0.4999);
  const grossWeightKg = partWeightKg / (1 - scrapFraction);
  const materialUtilization = partWeightKg / grossWeightKg;

  const rawMaterial: RawMaterialInput = {
    materialId: inputs.materialId,
    netWeightKg: partWeightKg,
    materialUtilization,
  };

  // Time to extrude one part's worth of material at line rate
  const cycleTimeHrPerPart = partWeightKg / inputs.lineRateKgPerHr;

  const operations: OperationInput[] = [
    {
      operationName: 'Extrusion',
      machineId: inputs.extruderId,
      labourId: inputs.labourId,
      cycleTimeHr: cycleTimeHrPerPart,
      partsPerCycle: 1,
      oee: inputs.oee,
      manning: inputs.manning,
      labourTimeHr: cycleTimeHrPerPart,
      labourEfficiency: inputs.labourEfficiency,
    },
  ];

  const tooling: ToolingInput = {
    totalToolingCost: inputs.dieCost,
    amortizationVolume: inputs.amortizationVolume,
    mode: 'amortized',
  };

  return { rawMaterial, operations, tooling };
}
