import type { CommodityDrivers, OperationInput, RawMaterialInput, ToolingInput } from '../types.js';
import {
  thermoformFamilyOf, estimateHeatTimeSec, estimateCoolTimeSec,
  estimateThermoformSpecificEnergy, estimateThermoformToolCost,
  type ThermoformFamily, type ThermoformMethod, type MouldMaterial,
  type ToolCooling, type FormComplexity,
} from './thermoforming-advisor.js';

export type { ThermoformMethod, ThermoformMethod as ThermoformingMethod } from './thermoforming-advisor.js';

export interface ThermoformingInputs {
  materialId: string;
  sheetWeightKg: number;
  partsPerSheet: number;
  partWeightKg: number;
  method?: ThermoformMethod;
  machineId: string;
  labourId: string;
  /** Heat-soak time s. ≤0 ⇒ estimate from sheet thickness + material. */
  heatTimeSec: number;
  /** Forming stroke time s. ≤0 ⇒ small thickness-based default. */
  formTimeSec: number;
  trimTimeSec: number;
  indexTimeSec: number;
  oee: number;
  manning: number;
  labourEfficiency: number;
  /** Forming tool + trim die £. ≤0 ⇒ estimate parametrically. */
  toolCost: number;
  amortizationVolume: number;
  rejectRate?: number;   // scrap fraction 0–1

  // ── process-physics + cost-chain inputs (all optional; safe defaults) ──
  family?: ThermoformFamily;        // defaults from materialId/grade
  sheetThicknessMm?: number;        // drives auto heat/cool time + DFM (not the cost weight)
  /** Tool-contact cooling time s. ≤0 ⇒ estimate from thickness + material + tool cooling. */
  coolTimeSec?: number;
  toolCooling?: ToolCooling;        // ambient / air / water-cooled tool
  /** Electricity £/kWh for the part-level oven + forming energy (regional). */
  energyPricePerKwh?: number;
  /** Masterbatch/additive (UV, AS, FR, impact) let-down fraction (0–~0.1) and its £/kg. */
  additiveFraction?: number;
  additivePricePerKg?: number;
  // parametric tool auto-estimate
  projectedAreaCm2?: number;
  mouldMaterial?: MouldMaterial;
  complexity?: FormComplexity;
  trimType?: 'cnc-router' | 'steel-rule' | 'in-machine';
  // optional QA / inspection operation
  includeInspection?: boolean;
  inspectionMachineId?: string;
  inspectionTimeSec?: number;
}

export function getThermoformingInputSchema(): Record<string, string> {
  return {
    materialId: 'string — sheet material ID from rate library (thermoforming grades preferred)',
    sheetWeightKg: 'number — gross sheet weight per cycle kg (before forming; heated in full)',
    partsPerSheet: 'number — parts nested/formed per sheet',
    partWeightKg: 'number — net part weight after trim kg',
    method: '"vacuum" | "pressure" | "twin_sheet" — drives forming energy + tool cost',
    machineId: 'string — thermoforming machine ID from rate library',
    labourId: 'string — labour rate ID',
    heatTimeSec: 'number — heat-soak time s (≤0 = auto from thickness/material)',
    formTimeSec: 'number — forming stroke time s (≤0 = auto)',
    trimTimeSec: 'number — CNC router / punch trim time per sheet s',
    indexTimeSec: 'number — sheet load, index, unload time s',
    oee: 'number 0–1', manning: 'number — operators per machine', labourEfficiency: 'number 0–1',
    toolCost: 'number — forming tool + trim die £ (≤0 = auto-estimate)',
    amortizationVolume: 'number — parts over which to amortize tooling cost',
    rejectRate: 'number 0–1 (optional) — scrap fraction; uplifts material and cycle time',
    sheetThicknessMm: 'number (optional) — enables auto heat/cool time and DFM',
  };
}

export function computeThermoformingDrivers(inputs: ThermoformingInputs): CommodityDrivers {
  const method: ThermoformMethod = inputs.method ?? 'vacuum';
  const family = inputs.family ?? thermoformFamilyOf(inputs.materialId);
  const thickness = inputs.sheetThicknessMm && inputs.sheetThicknessMm > 0 ? inputs.sheetThicknessMm : 0;

  const rejectUplift = (inputs.rejectRate && inputs.rejectRate > 0)
    ? 1 / (1 - Math.min(0.4999, inputs.rejectRate))
    : 1;

  // Skeletal/edge waste is carried by utilization; the universal stack credits the
  // trimmed skeleton back at the material's scrapRecoveryPricePerKg (regrind value).
  const materialUtilization = (inputs.partWeightKg * inputs.partsPerSheet) / inputs.sheetWeightKg;

  // ── Cycle: heat + form + cool + trim + index (auto-fill from physics when ≤0) ──
  const heatSec = inputs.heatTimeSec > 0
    ? inputs.heatTimeSec
    : (thickness > 0 ? estimateHeatTimeSec(family, thickness) : 0);
  const formSec = inputs.formTimeSec > 0
    ? inputs.formTimeSec
    : (thickness > 0 ? Math.max(2, Math.round(thickness * 2)) : 0);
  const coolSec = (inputs.coolTimeSec && inputs.coolTimeSec > 0)
    ? inputs.coolTimeSec
    : (thickness > 0 ? estimateCoolTimeSec(family, thickness, inputs.toolCooling ?? 'water') : 0);
  const trimSec = Math.max(0, inputs.trimTimeSec);
  const indexSec = Math.max(0, inputs.indexTimeSec);

  const cycleTimeHr = (heatSec + formSec + coolSec + trimSec + indexSec) / 3600;
  const effectiveCycleTimeHr = cycleTimeHr * rejectUplift;

  // ── Part-level oven + forming energy (the biggest, previously invisible term) ──
  // The whole sheet is heated to yield partsPerSheet parts, so energy/part scales
  // with sheet mass ÷ parts, driven by material cp·ΔT and the forming method.
  const specificEnergy = estimateThermoformSpecificEnergy(family, method);   // kWh/kg of sheet
  const energyPerSheet = specificEnergy * inputs.sheetWeightKg * Math.max(0, inputs.energyPricePerKwh ?? 0.20);
  const energyCostPerPart = (energyPerSheet / Math.max(1, inputs.partsPerSheet)) * rejectUplift;

  // ── Additive / masterbatch (UV, anti-static, FR, impact modifier) ──
  const additiveFrac = Math.max(0, Math.min(0.2, inputs.additiveFraction ?? 0));
  const additiveGrossKgPerPart = (inputs.partWeightKg / materialUtilization) * rejectUplift;
  const additiveCostPerPart = additiveFrac * additiveGrossKgPerPart * Math.max(0, inputs.additivePricePerKg ?? 0);

  const consumablesCostPerPart = energyCostPerPart + additiveCostPerPart;

  const rawMaterial: RawMaterialInput = {
    materialId: inputs.materialId,
    netWeightKg: inputs.partWeightKg * rejectUplift,
    materialUtilization,
    ...(consumablesCostPerPart > 0 ? { consumablesCostPerPart } : {}),
  };

  // ── Operations: form the sheet (+ optional dimensional/surface inspection) ──
  const operations: OperationInput[] = [
    {
      operationName: 'Thermoforming',
      machineId: inputs.machineId,
      labourId: inputs.labourId,
      cycleTimeHr: effectiveCycleTimeHr,
      partsPerCycle: inputs.partsPerSheet,
      oee: inputs.oee,
      manning: inputs.manning,
      labourTimeHr: effectiveCycleTimeHr,
      labourEfficiency: inputs.labourEfficiency,
    },
  ];

  if (inputs.includeInspection) {
    const qaSec = inputs.inspectionTimeSec ?? 8;
    operations.push({
      operationName: method === 'twin_sheet' ? 'Bond & Dimensional Inspection' : 'Dimensional / Surface Inspection',
      machineId: inputs.inspectionMachineId ?? inputs.machineId,
      labourId: inputs.labourId,
      cycleTimeHr: (qaSec / 3600) * rejectUplift,
      partsPerCycle: inputs.partsPerSheet,
      oee: inputs.oee,
      manning: 1,
      labourTimeHr: (qaSec / 3600) * rejectUplift,
      labourEfficiency: inputs.labourEfficiency,
    });
  }

  // ── Tooling: forming tool + trim — manual figure, else parametric estimate ──
  const toolCost = inputs.toolCost > 0
    ? inputs.toolCost
    : estimateThermoformToolCost({
        projectedAreaCm2: inputs.projectedAreaCm2,
        mouldMaterial: inputs.mouldMaterial,
        method,
        complexity: inputs.complexity,
        cavities: inputs.partsPerSheet,
        trim: inputs.trimType,
      }).total;

  const tooling: ToolingInput = {
    totalToolingCost: toolCost,
    amortizationVolume: inputs.amortizationVolume,
    mode: 'amortized',
  };

  return { rawMaterial, operations, tooling };
}
