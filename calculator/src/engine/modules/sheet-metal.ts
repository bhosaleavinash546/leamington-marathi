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
  secondaryOpsOee?: number;             // defaults to press OEE if not supplied
  secondaryOpsManning?: number;         // defaults to press manning if not supplied
  secondaryOpsLabourEfficiency?: number;// defaults to press labourEfficiency if not supplied
  rejectRate?: number;                  // 0–1 scrap fraction; uplifts both material and cycle time
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
    secondaryOpsOee: 'number? 0–1 — secondary op OEE (defaults to press OEE)',
    secondaryOpsManning: 'number? — secondary op operators per machine (defaults to press manning)',
    secondaryOpsLabourEfficiency: 'number? 0–1 — secondary op labour efficiency (defaults to press value)',
    rejectRate: 'number? 0–1 — press-shop scrap fraction; uplifts material weight and cycle times',
  };
}

export function computeSheetMetalDrivers(inputs: SheetMetalInputs): CommodityDrivers {
  // Strip utilization: ratio of blank area to strip cell area.
  // NOTE: this captures strip-nesting scrap only (edge trim + pitch allowance). Piercing/trim
  // scrap inside the blank is NOT captured unless netWeightKg ≈ blank weight — see input docs.
  const blankArea = inputs.blankLengthMm * inputs.blankWidthMm;
  const stripCellArea = inputs.stripWidthMm * inputs.pitchMm;
  // Guard: zero/negative strip geometry must not silently clamp to 100% utilisation
  // (blankArea / 0 = Infinity → Math.min(∞, 1) = 1). NaN is rejected by validateStackInput.
  const materialUtilization = blankArea > 0 && stripCellArea > 0
    ? Math.min((blankArea / stripCellArea) * inputs.partsPerStroke, 1.0)
    : NaN;

  const rejectUplift = inputs.rejectRate && inputs.rejectRate > 0
    ? 1 / (1 - inputs.rejectRate)
    : 1;

  const rawMaterial: RawMaterialInput = {
    materialId: inputs.materialId,
    netWeightKg: inputs.netWeightKg * rejectUplift,
    materialUtilization,
  };

  // Cycle time per STROKE: 1 stroke takes 1/SPM minutes = 1/(SPM*60) hours.
  // Per-part allocation happens in the core via partsPerCycle — do NOT divide by
  // partsPerStroke here as well (that double-counted multi-part dies, halving press
  // cost for a 2-out die instead of allocating it correctly).
  // Guard: SPM ≤ 0 would give Infinity; emit NaN so validateStackInput rejects it.
  const baseCycleHr = inputs.strokesPerMin > 0 ? 1 / (inputs.strokesPerMin * 60) : NaN;
  const cycleTimeHr = baseCycleHr * rejectUplift;

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
      cycleTimeHr: inputs.secondaryOpsCycleHr * rejectUplift,
      partsPerCycle: 1,
      oee: inputs.secondaryOpsOee ?? inputs.oee,
      manning: inputs.secondaryOpsManning ?? inputs.manning,
      labourTimeHr: inputs.secondaryOpsCycleHr * rejectUplift,
      labourEfficiency: inputs.secondaryOpsLabourEfficiency ?? inputs.labourEfficiency,
    });
  }

  // Number of die sets needed over the programme life
  const numDieSets = inputs.dieLife > 0 ? Math.ceil(inputs.amortizationVolume / inputs.dieLife) : 1;
  const tooling: ToolingInput = {
    totalToolingCost: inputs.dieCostEstimate * numDieSets,
    amortizationVolume: inputs.amortizationVolume,
    mode: 'amortized',
  };

  return { rawMaterial, operations, tooling };
}

/** Indicative blanking/piercing tonnage estimate (kN). Not used in cost model — reference only. */
export function estimateTonnageKN(inputs: Pick<SheetMetalInputs, 'perimeterMm' | 'thicknessMm' | 'shearStrengthMPa'>): number {
  return inputs.perimeterMm * 1e-3 * inputs.thicknessMm * 1e-3 * inputs.shearStrengthMPa * 1e6 / 1000;
}
