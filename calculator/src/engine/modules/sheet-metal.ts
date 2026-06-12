import type { CommodityDrivers, OperationInput, RawMaterialInput, ToolingInput } from '../types.js';

export type DieType = 'single_stage' | 'progressive' | 'transfer';

export interface SheetMetalInputs {
  materialId: string;
  netWeightKg: number;
  blankLengthMm: number;
  blankWidthMm: number;
  thicknessMm: number;
  perimeterMm: number;
  shearStrengthMPa: number; // default 250 for mild steel
  stripWidthMm: number;
  pitchMm: number;
  partsPerStroke: number;
  pressId: string;
  labourId: string;
  strokesPerMin: number;
  oee: number;
  manning: number;
  labourEfficiency: number;
  numOperations: number;
  dieType: DieType;
  dieLife: number;
  dieCostEstimate: number;
  amortizationVolume: number;
  secondaryOpsMachineId?: string;
  secondaryOpsLabourId?: string;
  secondaryOpsCycleHr?: number;
}

export function getSheetMetalInputSchema(): Record<string, string> {
  return {
    materialId: 'string — ID from rate library materials (e.g. mat-steel1045)',
    netWeightKg: 'number — finished part weight kg',
    blankLengthMm: 'number — developed blank length in mm',
    blankWidthMm: 'number — developed blank width in mm',
    thicknessMm: 'number — sheet/strip thickness in mm',
    perimeterMm: 'number — cut perimeter in mm (for tonnage estimate)',
    shearStrengthMPa: 'number — material shear strength MPa (default 250 for mild steel)',
    stripWidthMm: 'number — actual strip width fed into die',
    pitchMm: 'number — feed advance per stroke in mm',
    partsPerStroke: 'number — parts produced per press stroke (usually 1)',
    pressId: 'string — machine ID for the press (e.g. press-100t)',
    labourId: 'string — labour rate ID',
    strokesPerMin: 'number — press speed SPM',
    oee: 'number 0–1 — overall equipment effectiveness',
    manning: 'number — operators per press',
    labourEfficiency: 'number 0–1',
    numOperations: 'number — informational: blank/pierce/form/trim stages',
    dieType: 'single_stage | progressive | transfer',
    dieLife: 'number — parts per die life',
    dieCostEstimate: 'number — total die/tooling cost £',
    amortizationVolume: 'number — volume over which to amortize tooling',
    secondaryOpsMachineId: 'string? — optional secondary operation machine ID',
    secondaryOpsLabourId: 'string? — optional secondary operation labour ID',
    secondaryOpsCycleHr: 'number? — optional secondary operation cycle time hr',
  };
}

export function computeSheetMetalDrivers(inputs: SheetMetalInputs): CommodityDrivers {
  // Strip utilization: ratio of blank area to strip cell area
  const blankArea = inputs.blankLengthMm * inputs.blankWidthMm;
  const stripCellArea = inputs.stripWidthMm * inputs.pitchMm;
  const materialUtilization = Math.min((blankArea / stripCellArea) * inputs.partsPerStroke, 1.0);

  const rawMaterial: RawMaterialInput = {
    materialId: inputs.materialId,
    netWeightKg: inputs.netWeightKg,
    materialUtilization,
  };

  // Cycle time per part: 1 stroke takes 1/SPM minutes = 1/(SPM*60) hours
  const cycleTimeHr = 1 / (inputs.strokesPerMin * 60 * inputs.partsPerStroke);

  const operations: OperationInput[] = [
    {
      operationName: `Press (${inputs.dieType.replace('_', ' ')})`,
      machineId: inputs.pressId,
      labourId: inputs.labourId,
      cycleTimeHr,
      partsPerCycle: inputs.partsPerStroke,
      oee: inputs.oee,
      manning: inputs.manning,
      labourTimeHr: cycleTimeHr,
      labourEfficiency: inputs.labourEfficiency,
    },
  ];

  if (
    inputs.secondaryOpsMachineId !== undefined &&
    inputs.secondaryOpsLabourId !== undefined &&
    inputs.secondaryOpsCycleHr !== undefined
  ) {
    operations.push({
      operationName: 'Secondary Operation',
      machineId: inputs.secondaryOpsMachineId,
      labourId: inputs.secondaryOpsLabourId,
      cycleTimeHr: inputs.secondaryOpsCycleHr,
      partsPerCycle: 1,
      oee: inputs.oee,
      manning: inputs.manning,
      labourTimeHr: inputs.secondaryOpsCycleHr,
      labourEfficiency: inputs.labourEfficiency,
    });
  }

  const tooling: ToolingInput = {
    totalToolingCost: inputs.dieCostEstimate,
    amortizationVolume: inputs.amortizationVolume,
    mode: 'amortized',
  };

  return { rawMaterial, operations, tooling };
}

/** Indicative blanking/piercing tonnage estimate (kN). Not used in cost model — reference only. */
export function estimateTonnageKN(inputs: Pick<SheetMetalInputs, 'perimeterMm' | 'thicknessMm' | 'shearStrengthMPa'>): number {
  return inputs.perimeterMm * 1e-3 * inputs.thicknessMm * 1e-3 * inputs.shearStrengthMPa * 1e6 / 1000;
}
