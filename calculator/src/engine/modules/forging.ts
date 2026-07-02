import type { CommodityDrivers, OperationInput, RawMaterialInput, ToolingInput } from '../types.js';

export interface ForgingInputs {
  materialId: string;
  partWeightKg: number;
  flashAndScaleKg: number;   // flash + scale loss
  yieldFraction: number;     // billet → forgeable fraction 0–1 (accounts for end-of-bar crop, etc.)
  forgeId: string;           // forge machine ID
  labourId: string;
  strokesToForm: number;     // number of blows/strokes — used to compute cycle time when cycleTimeHr is 0
  timePerBlowSec?: number;   // seconds per blow including dwell + ram travel (default 10 s)
  cycleTimeHr: number;       // explicit cycle time hr; if 0, computed from strokesToForm × timePerBlowSec
  oee: number;
  manning: number;
  labourEfficiency: number;
  heatingEnergyKwhPerKg: number;  // induction heating energy (informational; included in machine rate)
  dieLife: number;           // forgings per die set
  dieCost: number;           // die set cost £
  trimmingMachineId?: string;
  trimmingLabourId?: string;
  trimmingCycleHr?: number;
  heatTreatCostPerKg?: number;  // external heat treat cost £/kg of part
  descaleCostPerKg?: number;    // descaling / shot blast cost £/kg of billet
  rejectRate?: number;          // forging scrap fraction 0–1
  amortizationVolume: number;
}

export function getForgingInputSchema(): Record<string, string> {
  return {
    materialId: 'string — billet material ID from rate library',
    partWeightKg: 'number — finished forging weight kg',
    flashAndScaleKg: 'number — flash + scale loss per forging kg',
    yieldFraction:
      'number 0–1 — billet yield (accounts for end-crop, furnace scale); effective billet weight = (partWeightKg + flashAndScaleKg) / yieldFraction',
    forgeId: 'string — forge press / hammer machine ID from rate library',
    labourId: 'string — labour rate ID',
    strokesToForm: 'number — number of blows to form (informational)',
    cycleTimeHr: 'number — total forging cycle time hr (handling + forging + transfer)',
    oee: 'number 0–1',
    manning: 'number — operators per forge',
    labourEfficiency: 'number 0–1',
    heatingEnergyKwhPerKg:
      'number — induction heating energy kWh/kg (informational; energy cost captured in machine rate)',
    dieLife: 'number — forgings per die set (informational)',
    dieCost: 'number — die set cost £',
    trimmingMachineId: 'string? — trimming press machine ID',
    trimmingLabourId: 'string? — trimming labour rate ID',
    trimmingCycleHr: 'number? — trimming cycle time hr',
    heatTreatCostPerKg: 'number? — external heat treatment cost £/kg of part',
    descaleCostPerKg: 'number? — descaling/shot blast cost £/kg of billet',
    rejectRate: 'number 0–1 (optional) — forging scrap fraction; uplifts material and cycle time',
    amortizationVolume: 'number — volume over which to amortize tooling and ancillary costs',
  };
}

export function computeForgingDrivers(inputs: ForgingInputs): CommodityDrivers {
  const rejectUplift = (inputs.rejectRate && inputs.rejectRate > 0)
    ? 1 / (1 - inputs.rejectRate)
    : 1;

  // Billet weight purchased: (part + flash/scale) / yield
  const billetWeightKg = (inputs.partWeightKg + inputs.flashAndScaleKg) / inputs.yieldFraction;

  // materialUtilization = net part weight / billet weight (based on per-billet geometry, not reject)
  const materialUtilization = inputs.partWeightKg / billetWeightKg;

  const rawMaterial: RawMaterialInput = {
    materialId: inputs.materialId,
    netWeightKg: inputs.partWeightKg * rejectUplift, // buy more billets to cover rejects
    materialUtilization,
  };

  // Cycle time: use explicit value if given, else compute from strokes × time-per-blow
  const effectiveCycleHr = inputs.cycleTimeHr > 0
    ? inputs.cycleTimeHr
    : (inputs.strokesToForm * (inputs.timePerBlowSec ?? 10)) / 3600;

  // Primary forge operation
  const operations: OperationInput[] = [
    {
      operationName: 'Forging',
      machineId: inputs.forgeId,
      labourId: inputs.labourId,
      cycleTimeHr: effectiveCycleHr * rejectUplift,
      partsPerCycle: 1,
      oee: inputs.oee,
      manning: inputs.manning,
      labourTimeHr: effectiveCycleHr * rejectUplift,
      labourEfficiency: inputs.labourEfficiency,
    },
  ];

  // Optional trimming operation
  if (
    inputs.trimmingMachineId !== undefined &&
    inputs.trimmingLabourId !== undefined &&
    inputs.trimmingCycleHr !== undefined &&
    inputs.trimmingCycleHr > 0
  ) {
    operations.push({
      operationName: 'Flash Trimming',
      machineId: inputs.trimmingMachineId,
      labourId: inputs.trimmingLabourId,
      cycleTimeHr: inputs.trimmingCycleHr * rejectUplift,
      partsPerCycle: 1,
      oee: inputs.oee,
      manning: inputs.manning,
      labourTimeHr: inputs.trimmingCycleHr * rejectUplift,
      labourEfficiency: inputs.labourEfficiency,
    });
  }

  // Number of die sets needed over the programme life
  const numDieSets = inputs.dieLife > 0 ? Math.ceil(inputs.amortizationVolume / inputs.dieLife) : 1;

  const tooling: ToolingInput = {
    totalToolingCost: inputs.dieCost * numDieSets,
    amortizationVolume: inputs.amortizationVolume,
    mode: 'amortized',
  };

  // Heat treat and descale are recurring per-part costs → rawMaterial.consumablesCostPerPart
  const heatTreatCostPerPart = (inputs.heatTreatCostPerKg ?? 0) * inputs.partWeightKg;
  const descaleCostPerPart = (inputs.descaleCostPerKg ?? 0) * billetWeightKg;
  const consumablesCostPerPart = heatTreatCostPerPart + descaleCostPerPart;

  return {
    rawMaterial: consumablesCostPerPart > 0 ? { ...rawMaterial, consumablesCostPerPart } : rawMaterial,
    operations,
    tooling,
  };
}
