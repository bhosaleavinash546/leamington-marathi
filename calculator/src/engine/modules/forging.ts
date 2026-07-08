import type { CommodityDrivers, OperationInput, RawMaterialInput, ToolingInput } from '../types.js';
import { estimateForgingDieCost, type DieSteel, type ShapeComplexity } from './forging-advisor.js';

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
  heatingEnergyKwhPerKg: number;  // wall-plug billet heating energy kWh/kg (induction basis)
  /** Effective heating tariff £/kWh for the selected fuel (see resolveFurnaceEnergyPricePerKwh). Default 0.23. */
  heatingEnergyPricePerKwh?: number;
  dieLife: number;           // forgings per die set
  /** Die-set cost £. Omit/≤0 to estimate parametrically (see estimateForgingDieCost). */
  dieCost?: number;
  // ── Parametric die-cost inputs (used only when dieCost is omitted/≤0) ──
  projectedAreaCm2?: number;  // part plan area — drives die block/machining and forging load
  dieSteel?: DieSteel;
  dieImpressions?: number;    // blocker + finisher (+ edger) cavities; default 2
  dieComplexity?: ShapeComplexity;
  // ── Optional preform / blocker stage (multi-step forging) ──
  preformMachineId?: string;  // upsetter / blocking press / roll for the preform pass
  preformLabourId?: string;
  preformCycleHr?: number;    // preform cycle time hr (>0 to add the stage)
  trimmingMachineId?: string;
  trimmingLabourId?: string;
  trimmingCycleHr?: number;
  heatTreatCostPerKg?: number;  // external heat treat cost £/kg of part
  descaleCostPerKg?: number;    // descaling / shot blast cost £/kg of billet
  coiningCostPerPart?: number;  // coining / sizing / straightening cost £/part
  ndtCostPerPart?: number;      // NDT (MPI/UT/CT) cost £/part for safety-critical forgings
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
      'number — wall-plug billet heating energy kWh/kg (induction basis); costed per part at the region fuel tariff',
    heatingEnergyPricePerKwh: 'number? — effective heating £/kWh for the selected fuel (default 0.23)',
    dieLife: 'number — forgings per die set; numDieSets = ceil(amortVol / dieLife)',
    dieCost: 'number? — die set cost £. Omit/≤0 to estimate from area, steel, impressions and complexity',
    projectedAreaCm2: 'number? — part projected (plan) area cm²; drives die-cost estimate and forging-load check',
    dieSteel: 'h13|premium|hammer — die steel grade (die-cost estimator only)',
    dieImpressions: 'number? — die impressions/cavities (die-cost estimator only; default 2)',
    dieComplexity: 'simple|moderate|complex — die geometry complexity (die-cost estimator only)',
    preformMachineId: 'string? — preform/blocker machine ID (multi-step forging)',
    preformLabourId: 'string? — preform labour rate ID',
    preformCycleHr: 'number? — preform cycle time hr (>0 adds the preform stage)',
    trimmingMachineId: 'string? — trimming press machine ID',
    trimmingLabourId: 'string? — trimming labour rate ID',
    trimmingCycleHr: 'number? — trimming cycle time hr',
    heatTreatCostPerKg: 'number? — external heat treatment cost £/kg of part',
    descaleCostPerKg: 'number? — descaling/shot blast cost £/kg of billet',
    coiningCostPerPart: 'number? — coining/sizing/straightening cost £/part',
    ndtCostPerPart: 'number? — NDT (MPI/UT/CT) cost £/part for safety-critical forgings',
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

  const operations: OperationInput[] = [];

  // Optional preform / blocker stage (multi-step forging): an upset/block pass
  // before the finish impression, on its own machine + labour.
  if (
    inputs.preformMachineId !== undefined &&
    inputs.preformLabourId !== undefined &&
    inputs.preformCycleHr !== undefined &&
    inputs.preformCycleHr > 0
  ) {
    operations.push({
      operationName: 'Preform / Blocker',
      machineId: inputs.preformMachineId,
      labourId: inputs.preformLabourId,
      cycleTimeHr: inputs.preformCycleHr * rejectUplift,
      partsPerCycle: 1,
      oee: inputs.oee,
      manning: inputs.manning,
      labourTimeHr: inputs.preformCycleHr * rejectUplift,
      labourEfficiency: inputs.labourEfficiency,
    });
  }

  // Primary (finish) forge operation
  operations.push({
    operationName: 'Forging',
    machineId: inputs.forgeId,
    labourId: inputs.labourId,
    cycleTimeHr: effectiveCycleHr * rejectUplift,
    partsPerCycle: 1,
    oee: inputs.oee,
    manning: inputs.manning,
    labourTimeHr: effectiveCycleHr * rejectUplift,
    labourEfficiency: inputs.labourEfficiency,
  });

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

  // Die-set cost: use the manual figure if provided, else estimate it parametrically.
  const baseDieCost = (inputs.dieCost && inputs.dieCost > 0)
    ? inputs.dieCost
    : estimateForgingDieCost({
        projectedAreaCm2: inputs.projectedAreaCm2 ?? 0,
        partWeightKg: inputs.partWeightKg,
        dieSteel: inputs.dieSteel,
        impressions: inputs.dieImpressions,
        complexity: inputs.dieComplexity,
      }).total;

  const tooling: ToolingInput = {
    totalToolingCost: baseDieCost * numDieSets,
    amortizationVolume: inputs.amortizationVolume,
    mode: 'amortized',
  };

  // Billet heating energy — a real per-part cost (furnace/induction), previously
  // collected but never costed. Priced on the whole billet at the fuel tariff.
  const heatingCostPerPart =
    (inputs.heatingEnergyKwhPerKg ?? 0) * billetWeightKg * (inputs.heatingEnergyPricePerKwh ?? 0.23);

  // Heat treat and descale are recurring per-part costs → rawMaterial.consumablesCostPerPart
  const heatTreatCostPerPart = (inputs.heatTreatCostPerKg ?? 0) * inputs.partWeightKg;
  const descaleCostPerPart = (inputs.descaleCostPerKg ?? 0) * billetWeightKg;
  const consumablesCostPerPart =
    heatingCostPerPart + heatTreatCostPerPart + descaleCostPerPart +
    (inputs.coiningCostPerPart ?? 0) + (inputs.ndtCostPerPart ?? 0);

  return {
    rawMaterial: consumablesCostPerPart > 0 ? { ...rawMaterial, consumablesCostPerPart } : rawMaterial,
    operations,
    tooling,
  };
}
