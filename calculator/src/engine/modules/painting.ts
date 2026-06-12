import type { CommodityDrivers, OperationInput, RawMaterialInput, ToolingInput } from '../types.js';

export type CoatType = 'pretreat' | 'e_coat' | 'primer' | 'basecoat' | 'clearcoat' | 'powder';

export interface CoatLayer {
  coatType: CoatType;
  materialId: string;          // paint material ID (for traceability / future lookup)
  dftMicrons: number;          // dry film thickness µm
  solidsPct: number;           // fraction 0–1 (solids content of wet paint)
  transferEfficiency: number;  // fraction 0–1 (paint that lands on the part)
  paintDensityKgPerL: number;  // typical 1.3–1.5 kg/L
  pricePerL: number;           // paint price £/L (user-supplied from rate library or quote)
}

export interface PaintingInputs {
  surfaceAreaM2: number;
  coats: CoatLayer[];
  lineId: string;              // paint line machine ID
  labourId: string;
  lineRatePartsPerHr: number;  // throughput of the paint line
  oee: number;
  manning: number;
  labourEfficiency: number;
  rejectReworkPct: number;     // 0–1 cost uplift for rework / rejects
  toolingCost: number;         // fixture / masking tooling cost £
  amortizationVolume: number;
}

export function getPaintingInputSchema(): Record<string, string> {
  return {
    surfaceAreaM2: 'number — exposed surface area to be painted m²',
    'coats[].coatType': 'pretreat | e_coat | primer | basecoat | clearcoat | powder',
    'coats[].materialId': 'string — paint material ID (for traceability)',
    'coats[].dftMicrons': 'number — dry film thickness µm',
    'coats[].solidsPct': 'number 0–1 — solids fraction of wet paint',
    'coats[].transferEfficiency': 'number 0–1 — fraction of wet paint that reaches the part',
    'coats[].paintDensityKgPerL': 'number — paint density kg/L (typically 1.3–1.5)',
    'coats[].pricePerL':
      'number — paint cost £/L (from rate library or supplier quote)',
    lineId: 'string — paint line machine ID from rate library',
    labourId: 'string — labour rate ID',
    lineRatePartsPerHr: 'number — parts per hour through the paint line',
    oee: 'number 0–1',
    manning: 'number — operators on the paint line',
    labourEfficiency: 'number 0–1',
    rejectReworkPct: 'number 0–1 — uplift factor for rework / visual rejects (e.g. 0.05 = 5%)',
    toolingCost: 'number — fixture and masking tooling cost £',
    amortizationVolume: 'number — volume over which to amortize tooling',
  };
}

/**
 * Compute wet paint consumption per coat (litres) based on dry film build.
 *
 * wet_volume_L = surfaceAreaM2 × dftMicrons × 1e-6 / (solidsPct × transferEfficiency) × 1000
 *              (m² × m/m → m³; ÷ efficiency losses; × 1000 converts m³→L)
 */
export function coatWetVolumeLitres(coat: CoatLayer, surfaceAreaM2: number): number {
  const dftM = coat.dftMicrons * 1e-6; // µm → m
  return (surfaceAreaM2 * dftM) / (coat.solidsPct * coat.transferEfficiency) * 1000;
}

export function computePaintingDrivers(inputs: PaintingInputs): CommodityDrivers {
  // Sum paint material cost across all coats
  let totalPaintCostPerPart = 0;
  for (const coat of inputs.coats) {
    const wetVolL = coatWetVolumeLitres(coat, inputs.surfaceAreaM2);
    totalPaintCostPerPart += wetVolL * coat.pricePerL;
  }

  // Apply rework uplift
  totalPaintCostPerPart *= 1 + inputs.rejectReworkPct;

  // Use directCost to bypass weight-based material calculation.
  // materialId 'mat-virtual' exists in the default library purely for validation.
  const rawMaterial: RawMaterialInput = {
    materialId: 'mat-virtual',
    netWeightKg: 0,
    materialUtilization: 1,
    directCost: totalPaintCostPerPart,
  };

  const cycleTimeHr = 1 / inputs.lineRatePartsPerHr;

  const operations: OperationInput[] = [
    {
      operationName: 'Paint Line',
      machineId: inputs.lineId,
      labourId: inputs.labourId,
      cycleTimeHr,
      partsPerCycle: 1,
      oee: inputs.oee,
      manning: inputs.manning,
      labourTimeHr: cycleTimeHr,
      labourEfficiency: inputs.labourEfficiency,
    },
  ];

  const tooling: ToolingInput = {
    totalToolingCost: inputs.toolingCost,
    amortizationVolume: inputs.amortizationVolume,
    mode: 'amortized',
  };

  return { rawMaterial, operations, tooling };
}
