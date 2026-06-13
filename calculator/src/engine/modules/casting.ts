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
    waxDieCost: number;
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
    'investment.waxDieCost': 'number — wax injection die set cost £ (typically £3000–25000)',
  };
}

export function computeCastingDrivers(inputs: CastingInputs): CommodityDrivers {
  if (inputs.rejectRate >= 1) throw new Error('rejectRate must be < 1');
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
      // Reject uplift: must cast rejectUplift × more parts to yield target volume
      const hpdcCycleEff = cycleTimeHr * rejectUplift;
      operations.push({
        operationName: 'HPDC Casting',
        machineId: inputs.hpdc.machineId,
        labourId: inputs.labourId,
        cycleTimeHr: hpdcCycleEff,
        partsPerCycle: inputs.hpdc.cavities,
        oee: inputs.oee,
        manning: inputs.manning,
        labourTimeHr: hpdcCycleEff,
        labourEfficiency: inputs.labourEfficiency,
      });
      // Die replacement: number of die sets = ceil(volume / (dieLife × cavities))
      const hpdcPartsPerDieSet = inputs.hpdc.dieLife * inputs.hpdc.cavities;
      const hpdcNumDieSets = hpdcPartsPerDieSet > 0
        ? Math.ceil(inputs.amortizationVolume / hpdcPartsPerDieSet)
        : 1;
      tooling = {
        totalToolingCost: inputs.hpdc.dieCost * hpdcNumDieSets,
        amortizationVolume: inputs.amortizationVolume,
        mode: 'amortized',
      };
      break;
    }

    case 'sand': {
      if (!inputs.sand) throw new Error('sand config required when subtype is sand');
      const sandCycleEff = inputs.sand.cycleTimeHr * rejectUplift;
      operations.push({
        operationName: 'Sand Casting — Moulding',
        machineId: inputs.sand.mouldLineId,
        labourId: inputs.labourId,
        cycleTimeHr: sandCycleEff,
        partsPerCycle: 1,
        oee: inputs.oee,
        manning: inputs.manning,
        labourTimeHr: sandCycleEff,
        labourEfficiency: inputs.labourEfficiency,
      });
      // Pattern replacement based on pattern life
      const sandNumPatterns = inputs.sand.patternLife > 0
        ? Math.ceil(inputs.amortizationVolume / inputs.sand.patternLife)
        : 1;
      tooling = {
        totalToolingCost: inputs.sand.patternCost * sandNumPatterns,
        amortizationVolume: inputs.amortizationVolume,
        mode: 'amortized',
      };
      break;
    }

    case 'gravity': {
      if (!inputs.gravity) throw new Error('gravity config required when subtype is gravity');
      const gravCycleEff = inputs.gravity.cycleTimeHr * rejectUplift;
      operations.push({
        operationName: 'Gravity Die Casting',
        machineId: inputs.gravity.machineId,
        labourId: inputs.labourId,
        cycleTimeHr: gravCycleEff,
        partsPerCycle: 1,
        oee: inputs.oee,
        manning: inputs.manning,
        labourTimeHr: gravCycleEff,
        labourEfficiency: inputs.labourEfficiency,
      });
      // Mould replacement based on mould life
      const gravNumMoulds = inputs.gravity.mouldLife > 0
        ? Math.ceil(inputs.amortizationVolume / inputs.gravity.mouldLife)
        : 1;
      tooling = {
        totalToolingCost: inputs.gravity.mouldCost * gravNumMoulds,
        amortizationVolume: inputs.amortizationVolume,
        mode: 'amortized',
      };
      break;
    }

    case 'investment': {
      if (!inputs.investment) throw new Error('investment config required when subtype is investment');
      // Pour operation on the furnace
      const invCycleEff = inputs.investment.pourCycleHr * rejectUplift;
      operations.push({
        operationName: 'Investment Casting — Pour',
        machineId: inputs.investment.pourMachineId,
        labourId: inputs.investment.pourLabourId,
        cycleTimeHr: invCycleEff,
        partsPerCycle: 1,
        oee: inputs.oee,
        manning: inputs.manning,
        labourTimeHr: invCycleEff,
        labourEfficiency: inputs.labourEfficiency,
      });
      tooling = {
        totalToolingCost: inputs.investment.waxDieCost,
        amortizationVolume: inputs.amortizationVolume,
        mode: 'amortized',
      };
      break;
    }

    default:
      throw new Error(`Unknown casting subtype: ${(inputs as CastingInputs).subtype}`);
  }

  // Move consumables to rawMaterial so they appear in material cost bucket, not tooling
  let consumablesCostPerPart = 0;
  if (inputs.subtype === 'sand' && inputs.sand) {
    consumablesCostPerPart = inputs.sand.coreCostPerPart;
  } else if (inputs.subtype === 'investment' && inputs.investment) {
    consumablesCostPerPart = inputs.investment.waxCostPerPart + inputs.investment.shellBuildCostPerPart;
  }

  return {
    rawMaterial: consumablesCostPerPart > 0
      ? { ...rawMaterial, consumablesCostPerPart }
      : rawMaterial,
    operations,
    tooling,
  };
}
