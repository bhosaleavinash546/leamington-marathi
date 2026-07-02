import type { CommodityDrivers, OperationInput, RawMaterialInput, ToolingInput } from '../types.js';

export type ThermoformingMethod = 'vacuum' | 'pressure' | 'twin_sheet';

export interface ThermoformingInputs {
  materialId: string;
  sheetWeightKg: number;
  partsPerSheet: number;
  partWeightKg: number;
  method?: ThermoformingMethod;
  machineId: string;
  labourId: string;
  heatTimeSec: number;
  formTimeSec: number;
  trimTimeSec: number;
  indexTimeSec: number;
  oee: number;
  manning: number;
  labourEfficiency: number;
  toolCost: number;
  amortizationVolume: number;
  rejectRate?: number;   // scrap fraction 0–1
}

export function getThermoformingInputSchema(): Record<string, string> {
  return {
    materialId: 'string — material ID from rate library (PS, PET, ABS, PP, PC most common)',
    sheetWeightKg: 'number — gross sheet weight per cycle kg (before forming)',
    partsPerSheet: 'number — parts nested/formed per sheet',
    partWeightKg: 'number — net part weight after trim kg',
    method: '"vacuum" | "pressure" | "twin_sheet" (optional, informational)',
    machineId: 'string — thermoforming machine ID from rate library',
    labourId: 'string — labour rate ID',
    heatTimeSec: 'number — radiant/contact heating time s',
    formTimeSec: 'number — vacuum/pressure forming stroke time s',
    trimTimeSec: 'number — CNC router or punch trim time per sheet s',
    indexTimeSec: 'number — sheet load, index, unload time s',
    oee: 'number 0–1',
    manning: 'number — operators per machine',
    labourEfficiency: 'number 0–1',
    toolCost: 'number — forming tool + trim die cost £',
    amortizationVolume: 'number — parts over which to amortize tooling cost',
    rejectRate: 'number 0–1 (optional) — scrap fraction; uplifts material and cycle time',
  };
}

export function computeThermoformingDrivers(inputs: ThermoformingInputs): CommodityDrivers {
  const rejectUplift = (inputs.rejectRate && inputs.rejectRate > 0)
    ? 1 / (1 - inputs.rejectRate)
    : 1;

  const materialUtilization = (inputs.partWeightKg * inputs.partsPerSheet) / inputs.sheetWeightKg;

  // grossWeightKgPerPart is used by the universal stack via netWeightKg / materialUtilization
  // netWeightKg represents the net part weight; utilization carries the skeletal waste
  const rawMaterial: RawMaterialInput = {
    materialId: inputs.materialId,
    netWeightKg: inputs.partWeightKg * rejectUplift,
    materialUtilization,
  };

  // One machine cycle forms an entire sheet producing partsPerSheet parts
  const cycleTimeHr = (inputs.heatTimeSec + inputs.formTimeSec + inputs.trimTimeSec + inputs.indexTimeSec) / 3600;
  const effectiveCycleTimeHr = cycleTimeHr * rejectUplift;

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

  const tooling: ToolingInput = {
    totalToolingCost: inputs.toolCost,
    amortizationVolume: inputs.amortizationVolume,
    mode: 'amortized',
  };

  return { rawMaterial, operations, tooling };
}
