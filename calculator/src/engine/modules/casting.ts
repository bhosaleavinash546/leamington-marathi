import type { CommodityDrivers, OperationInput, RawMaterialInput, ToolingInput } from '../types.js';

export type CastingSubtype = 'hpdc' | 'sand' | 'gravity' | 'investment';

export interface CastingInputs {
  subtype: CastingSubtype;
  materialId: string;        // alloy material ID
  partWeightKg: number;
  castingYield: number;      // 0–1, part_weight / pour_weight
  rejectRate: number;        // 0–1, adds uplift to material needed
  labourId: string;
  oee: number;
  manning: number;
  labourEfficiency: number;
  amortizationVolume: number;
  // HPDC specific
  hpdc?: {
    machineId: string;
    cycleTimeSec: number;
    cavities: number;
    dieCost: number;
    dieLife: number;         // shots per die life (informational)
  };
  // Sand casting specific
  sand?: {
    mouldLineId: string;
    cycleTimeHr: number;
    patternCost: number;
    patternLife: number;     // castings per pattern (informational)
    coreCostPerPart: number;
  };
  // Gravity / permanent mould
  gravity?: {
    machineId: string;
    cycleTimeHr: number;
    mouldCost: number;
    mouldLife: number;       // castings per mould (informational)
  };
  // Investment casting
  investment?: {
    waxCostPerPart: number;
    shellBuildCostPerPart: number;
    pourLabourId: string;
    pourCycleHr: number;
    pourMachineId: string;
  };
}

export function getCastingInputSchema(): Record<string, string> {
  return {
    subtype: 'hpdc | sand | gravity | investment',
    materialId: 'string — alloy material ID from rate library',
    partWeightKg: 'number — finished casting weight kg',
    castingYield: 'number 0–1 — part weight / pour weight',
    rejectRate: 'number 0–1 — scrap/reject fraction; uplifts effective material',
    labourId: 'string — labour rate ID',
    oee: 'number 0–1',
    manning: 'number — operators per machine',
    labourEfficiency: 'number 0–1',
    amortizationVolume: 'number — volume over which to amortize tooling',
    'hpdc.machineId': 'string — HPDC machine ID (required when subtype=hpdc)',
    'hpdc.cycleTimeSec': 'number — total HPDC cycle time in seconds',
    'hpdc.cavities': 'number — number of cavities per shot',
    'hpdc.dieCost': 'number — die set cost £',
    'hpdc.dieLife': 'number — shots per die life (informational)',
    'sand.mouldLineId': 'string — moulding line machine ID (required when subtype=sand)',
    'sand.cycleTimeHr': 'number — moulding cycle time hr',
    'sand.patternCost': 'number — pattern cost £',
    'sand.patternLife': 'number — castings per pattern (informational)',
    'sand.coreCostPerPart': 'number — core material + manufacture cost per casting £',
    'gravity.machineId': 'string — gravity/tilt machine ID (required when subtype=gravity)',
    'gravity.cycleTimeHr': 'number — cycle time hr',
    'gravity.mouldCost': 'number — permanent mould cost £',
    'gravity.mouldLife': 'number — castings per mould (informational)',
    'investment.waxCostPerPart': 'number — wax pattern cost per part £ (required when subtype=investment)',
    'investment.shellBuildCostPerPart': 'number — ceramic shell cost per part £',
    'investment.pourLabourId': 'string — labour rate ID for pour/casting operation',
    'investment.pourCycleHr': 'number — pour + solidify cycle time hr',
    'investment.pourMachineId': 'string — furnace machine ID',
  };
}

export function computeCastingDrivers(inputs: CastingInputs): CommodityDrivers {
  // Reject uplift: need to cast more parts to achieve target yield
  const rejectUplift = 1 / (1 - inputs.rejectRate);
  // Pour weight accounts for runner/gating loss (yield)
  // materialUtilization = part weight / pour weight = castingYield
  const effectiveNetWeight = inputs.partWeightKg * rejectUplift;

  const rawMaterial: RawMaterialInput = {
    materialId: inputs.materialId,
    netWeightKg: effectiveNetWeight,
    materialUtilization: inputs.castingYield,
  };

  const operations: OperationInput[] = [];
  let tooling: ToolingInput;

  switch (inputs.subtype) {
    case 'hpdc': {
      if (!inputs.hpdc) throw new Error('hpdc config required when subtype is hpdc');
      const cycleTimeHr = inputs.hpdc.cycleTimeSec / 3600;
      operations.push({
        operationName: 'HPDC Casting',
        machineId: inputs.hpdc.machineId,
        labourId: inputs.labourId,
        cycleTimeHr,
        partsPerCycle: inputs.hpdc.cavities,
        oee: inputs.oee,
        manning: inputs.manning,
        labourTimeHr: cycleTimeHr,
        labourEfficiency: inputs.labourEfficiency,
      });
      tooling = {
        totalToolingCost: inputs.hpdc.dieCost,
        amortizationVolume: inputs.amortizationVolume,
        mode: 'amortized',
      };
      break;
    }

    case 'sand': {
      if (!inputs.sand) throw new Error('sand config required when subtype is sand');
      operations.push({
        operationName: 'Sand Casting — Moulding',
        machineId: inputs.sand.mouldLineId,
        labourId: inputs.labourId,
        cycleTimeHr: inputs.sand.cycleTimeHr,
        partsPerCycle: 1,
        oee: inputs.oee,
        manning: inputs.manning,
        labourTimeHr: inputs.sand.cycleTimeHr,
        labourEfficiency: inputs.labourEfficiency,
      });
      // Core cost is a recurring per-part consumable; fold into tooling so that
      // toolingPerPart = patternCost/amortizationVolume + coreCostPerPart
      tooling = {
        totalToolingCost:
          inputs.sand.patternCost + inputs.sand.coreCostPerPart * inputs.amortizationVolume,
        amortizationVolume: inputs.amortizationVolume,
        mode: 'amortized',
      };
      break;
    }

    case 'gravity': {
      if (!inputs.gravity) throw new Error('gravity config required when subtype is gravity');
      operations.push({
        operationName: 'Gravity Die Casting',
        machineId: inputs.gravity.machineId,
        labourId: inputs.labourId,
        cycleTimeHr: inputs.gravity.cycleTimeHr,
        partsPerCycle: 1,
        oee: inputs.oee,
        manning: inputs.manning,
        labourTimeHr: inputs.gravity.cycleTimeHr,
        labourEfficiency: inputs.labourEfficiency,
      });
      tooling = {
        totalToolingCost: inputs.gravity.mouldCost,
        amortizationVolume: inputs.amortizationVolume,
        mode: 'amortized',
      };
      break;
    }

    case 'investment': {
      if (!inputs.investment) throw new Error('investment config required when subtype is investment');
      // Pour operation on the furnace
      operations.push({
        operationName: 'Investment Casting — Pour',
        machineId: inputs.investment.pourMachineId,
        labourId: inputs.investment.pourLabourId,
        cycleTimeHr: inputs.investment.pourCycleHr,
        partsPerCycle: 1,
        oee: inputs.oee,
        manning: inputs.manning,
        labourTimeHr: inputs.investment.pourCycleHr,
        labourEfficiency: inputs.labourEfficiency,
      });
      // Wax + shell costs are recurring per-part consumables; fold into tooling
      const consumablesTotalCost =
        (inputs.investment.waxCostPerPart + inputs.investment.shellBuildCostPerPart) *
        inputs.amortizationVolume;
      tooling = {
        totalToolingCost: consumablesTotalCost,
        amortizationVolume: inputs.amortizationVolume,
        mode: 'amortized',
      };
      break;
    }

    default:
      throw new Error(`Unknown casting subtype: ${(inputs as CastingInputs).subtype}`);
  }

  return { rawMaterial, operations, tooling };
}
