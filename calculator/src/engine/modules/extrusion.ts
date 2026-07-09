import type { CommodityDrivers, OperationInput, RawMaterialInput, ToolingInput } from '../types.js';
import {
  estimateExtrusionLineRate, estimateExtrusionSpecificEnergy, estimateExtrusionDieCost,
  extrusionFamilyOf,
  type ExtrusionFamily, type ExtrusionProcess, type ScrewType, type ExtrusionCooling, type DieComplexity,
} from './extrusion-advisor.js';

export interface ExtrusionInputs {
  materialId: string;
  profileWeightKgPerM: number;
  partLengthM: number;
  /** Achievable throughput kg/hr. ≤0 ⇒ estimate from screw Ø + material + cooling. */
  lineRateKgPerHr: number;
  extruderId: string;
  labourId: string;
  oee: number;
  manning: number;
  labourEfficiency: number;
  startupScrapFraction: number;
  /** Die + calibration tooling £. ≤0 ⇒ estimate parametrically from process/size/layers. */
  dieCost: number;
  amortizationVolume: number;

  // ── process-physics + cost-chain inputs (all optional; safe defaults) ──
  family?: ExtrusionFamily;           // defaults from materialId/grade
  process?: ExtrusionProcess;         // pipe/profile/sheet/cable/tube/coex
  screwType?: ScrewType;
  screwDiameterMm?: number;           // for auto line-rate
  wallThicknessMm?: number;           // cooling-limited line rate + die sizing
  cooling?: ExtrusionCooling;
  /** Electricity £/kWh for the variable melt+chill process energy (regional). */
  energyPricePerKwh?: number;
  /** Masterbatch/additive let-down fraction (0–~0.25) and its £/kg. */
  additiveFraction?: number;
  additivePricePerKg?: number;
  // scrap chain
  steadyScrapFraction?: number;       // running scrap (out-of-tolerance, sampling)
  colourChangesPerDay?: number;
  dieChangesPerDay?: number;
  shiftHours?: number;                // for change-scrap amortisation
  // die auto-estimate
  dieSizeMm?: number;
  dieLayers?: number;
  dieComplexity?: DieComplexity;
  // downstream operations
  includeFinishing?: boolean;         // cut-off/coil + inspection (default true)
  finishMachineId?: string;
  finishTimeSecPerPart?: number;
  qaTimeSecPerPart?: number;
  includeLeakTest?: boolean;          // pipe/tube pressure/leak test (default false)
  testMachineId?: string;
  testTimeSecPerPart?: number;
}

export function getExtrusionInputSchema(): Record<string, string> {
  return {
    materialId: 'string — material ID from rate library (extrusion grades preferred)',
    profileWeightKgPerM: 'number — linear weight density of extruded profile kg/m',
    partLengthM: 'number — cut length per finished part m',
    lineRateKgPerHr: 'number — extrusion throughput kg/hr (≤0 = auto-estimate)',
    extruderId: 'string — extruder/line machine ID',
    labourId: 'string — labour rate ID',
    oee: 'number 0–1', manning: 'number', labourEfficiency: 'number 0–1',
    startupScrapFraction: 'number — startup purge scrap fraction',
    dieCost: 'number — die + calibration tooling £ (≤0 = auto-estimate)',
    amortizationVolume: 'number — parts to amortize die cost',
  };
}

const PURGE_COLOUR_KG = 15;   // typical purge mass per colour change
const PURGE_DIE_KG = 40;      // typical purge/scrap per die change

export function computeExtrusionDrivers(inputs: ExtrusionInputs): CommodityDrivers {
  const partWeightKg = inputs.profileWeightKgPerM * inputs.partLengthM;
  const family = inputs.family ?? extrusionFamilyOf(inputs.materialId);
  const screwType = inputs.screwType ?? (inputs.extruderId?.includes('150mm') || inputs.extruderId?.includes('coex') ? 'twin' : 'single');

  // ── Line rate: use given, else estimate from screw output vs cooling limit ──
  let lineRate = inputs.lineRateKgPerHr;
  if (!(lineRate > 0)) {
    lineRate = estimateExtrusionLineRate({
      screwDiameterMm: inputs.screwDiameterMm ?? 75,
      family, screwType,
      wallThicknessMm: inputs.wallThicknessMm,
      profileKgPerM: inputs.profileWeightKgPerM,
      cooling: inputs.cooling,
    }).lineRateKgHr;
  }
  lineRate = Math.max(1, lineRate);

  // ── Scrap chain: startup + steady + change (colour/die) purge ──
  const shiftHours = inputs.shiftHours ?? 8;
  const dailyThroughputKg = Math.max(1, lineRate * shiftHours);
  const changeScrapKgPerDay =
    (inputs.colourChangesPerDay ?? 0) * PURGE_COLOUR_KG + (inputs.dieChangesPerDay ?? 0) * PURGE_DIE_KG;
  const changeScrapFraction = changeScrapKgPerDay / dailyThroughputKg;
  const scrapFraction = Math.min(
    0.4999,
    Math.max(0, inputs.startupScrapFraction) + Math.max(0, inputs.steadyScrapFraction ?? 0.02) + changeScrapFraction,
  );

  const grossWeightKg = partWeightKg / (1 - scrapFraction);
  const materialUtilization = partWeightKg / grossWeightKg;

  // ── Variable process energy (melt + drive + chill) and additive/masterbatch ──
  const specificEnergy = estimateExtrusionSpecificEnergy(family, screwType); // kWh/kg
  const energyCostPerPart = specificEnergy * grossWeightKg * Math.max(0, inputs.energyPricePerKwh ?? 0.20);
  const additiveFrac = Math.max(0, Math.min(0.3, inputs.additiveFraction ?? 0));
  const additiveCostPerPart = additiveFrac * grossWeightKg * Math.max(0, inputs.additivePricePerKg ?? 0);
  const consumablesCostPerPart = energyCostPerPart + additiveCostPerPart;

  const rawMaterial: RawMaterialInput = {
    materialId: inputs.materialId,
    netWeightKg: partWeightKg,
    materialUtilization,
    ...(consumablesCostPerPart > 0 ? { consumablesCostPerPart } : {}),
  };

  // ── Operations: extrude (gross mass on the line) + finishing/QA + optional leak test ──
  const extrudeCycleHr = grossWeightKg / lineRate;
  const operations: OperationInput[] = [
    {
      operationName: 'Extrusion',
      machineId: inputs.extruderId,
      labourId: inputs.labourId,
      cycleTimeHr: extrudeCycleHr,
      partsPerCycle: 1,
      oee: inputs.oee,
      manning: inputs.manning,
      labourTimeHr: extrudeCycleHr,
      labourEfficiency: inputs.labourEfficiency,
    },
  ];

  if (inputs.includeFinishing !== false) {
    const finSec = inputs.finishTimeSecPerPart ?? 4;
    const qaSec = inputs.qaTimeSecPerPart ?? 6;
    operations.push({
      operationName: 'Cut-off, Coil & Inspect',
      machineId: inputs.finishMachineId ?? 'extrusion-finish-qa',
      labourId: inputs.labourId,
      cycleTimeHr: finSec / 3600,
      partsPerCycle: 1,
      oee: inputs.oee,
      manning: 1,
      labourTimeHr: qaSec / 3600,
      labourEfficiency: inputs.labourEfficiency,
    });
  }

  if (inputs.includeLeakTest) {
    const testSec = inputs.testTimeSecPerPart ?? 25;
    operations.push({
      operationName: 'Pressure / Leak Test',
      machineId: inputs.testMachineId ?? 'extrusion-leak-test',
      labourId: inputs.labourId,
      cycleTimeHr: testSec / 3600,
      partsPerCycle: 1,
      oee: inputs.oee,
      manning: 1,
      labourTimeHr: testSec / 3600,
      labourEfficiency: inputs.labourEfficiency,
    });
  }

  // ── Tooling: die + calibration/sizing — manual figure, else estimate ──
  const dieCost = inputs.dieCost > 0
    ? inputs.dieCost
    : estimateExtrusionDieCost({
        process: inputs.process ?? 'profile',
        sizeMm: inputs.dieSizeMm,
        layers: inputs.dieLayers,
        complexity: inputs.dieComplexity,
      }).total;

  const tooling: ToolingInput = {
    totalToolingCost: dieCost,
    amortizationVolume: inputs.amortizationVolume,
    mode: 'amortized',
  };

  return { rawMaterial, operations, tooling };
}
