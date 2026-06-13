import type { CommodityDrivers, OperationInput, RawMaterialInput, ToolingInput } from '../types.js';

export type RubberProcess =
  | 'extrusion_vulcanise'   // EPDM seals, hoses — extrude then cure in salt bath / oven
  | 'compression_mould'     // Simple gaskets, O-rings, solid mounts
  | 'transfer_mould'        // Bonded rubber-metal parts, complex geometry
  | 'injection_mould_lsr'   // Liquid Silicone Rubber — precision medical/auto seals
  | 'calendering';          // Sheet/strip rubber (flat gaskets)

export interface RubberInputs {
  materialId: string;         // rubber compound material ID
  partWeightKg: number;       // finished rubber part weight kg
  flashAndRunnerWeightKg: number; // flash/excess compound weight kg
  process: RubberProcess;
  machineId: string;
  labourId: string;
  cycleTimeSec: number;       // full moulding/extrusion cycle per part (or per cut length for extrusion)
  cavities: number;           // cavities per mould (compression/transfer); 1 for extrusion
  oee: number;
  manning: number;
  labourEfficiency: number;
  rejectRate?: number;        // 0–1 scrap fraction (flash defects, dimensional)
  // Curing (for extrusion_vulcanise)
  cureTimeSec?: number;       // oven/salt-bath cure time per part s (default 0 — included in cycleTimeSec)
  cureOvenMachineId?: string; // separate cure oven machine ID
  // Tooling
  mouldCost: number;          // mould/die cost £
  mouldLife: number;          // cycles per mould life (compression: 200k, LSR: 500k)
  amortizationVolume: number;
  // Secondary bonding (rubber-to-metal)
  bondingPrimerCostPerPart?: number; // adhesive primer cost per part £
}

export function getRubberInputSchema(): Record<string, string> {
  return {
    materialId: 'string — rubber compound material ID (mat-epdm, mat-nbr, mat-silicone, mat-nr, mat-viton)',
    partWeightKg: 'number — finished rubber part weight kg',
    flashAndRunnerWeightKg: 'number — flash trim + runner scrap weight kg',
    process: 'extrusion_vulcanise | compression_mould | transfer_mould | injection_mould_lsr | calendering',
    machineId: 'string — machine ID from rate library',
    labourId: 'string — labour rate ID',
    cycleTimeSec: 'number — full cycle time per part (or per extrusion cut) in seconds',
    cavities: 'number — cavities per mould (1 for extrusion/calendering)',
    oee: 'number 0–1',
    manning: 'number — operators per machine',
    labourEfficiency: 'number 0–1',
    rejectRate: 'number 0–1 (optional) — scrap/reject fraction from flash/dimensional defects',
    cureTimeSec: 'number? — separate oven cure time s (for extrusion_vulcanise with inline cure)',
    cureOvenMachineId: 'string? — separate cure oven machine ID if curing is offline',
    mouldCost: 'number — mould or extrusion die cost £',
    mouldLife: 'number — cycles per mould life',
    amortizationVolume: 'number — parts to amortize tooling over',
    bondingPrimerCostPerPart: 'number? — rubber-to-metal adhesive primer cost per part £',
  };
}

export function computeRubberDrivers(inputs: RubberInputs): CommodityDrivers {
  const rejectUplift = (inputs.rejectRate && inputs.rejectRate > 0)
    ? 1 / (1 - inputs.rejectRate)
    : 1;

  const grossWeightKg = inputs.partWeightKg + inputs.flashAndRunnerWeightKg;
  const materialUtilization = inputs.partWeightKg / grossWeightKg;

  const consumablesCostPerPart = (inputs.bondingPrimerCostPerPart ?? 0) > 0
    ? inputs.bondingPrimerCostPerPart!
    : undefined;

  const rawMaterial: RawMaterialInput = {
    materialId: inputs.materialId,
    netWeightKg: inputs.partWeightKg * rejectUplift,
    materialUtilization,
    ...(consumablesCostPerPart ? { consumablesCostPerPart } : {}),
  };

  const mainCycleHr = (inputs.cycleTimeSec / 3600) * rejectUplift;

  const operations: OperationInput[] = [
    {
      operationName: `Rubber ${inputs.process.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}`,
      machineId: inputs.machineId,
      labourId: inputs.labourId,
      cycleTimeHr: mainCycleHr,
      partsPerCycle: inputs.cavities,
      oee: inputs.oee,
      manning: inputs.manning,
      labourTimeHr: mainCycleHr,
      labourEfficiency: inputs.labourEfficiency,
    },
  ];

  // Optional offline cure oven operation
  if (
    inputs.cureOvenMachineId &&
    inputs.cureTimeSec !== undefined &&
    inputs.cureTimeSec > 0
  ) {
    const cureHr = (inputs.cureTimeSec / 3600) * rejectUplift;
    operations.push({
      operationName: 'Vulcanisation Cure',
      machineId: inputs.cureOvenMachineId,
      labourId: inputs.labourId,
      cycleTimeHr: cureHr,
      partsPerCycle: inputs.cavities,
      oee: inputs.oee,
      manning: inputs.manning,
      labourTimeHr: cureHr,
      labourEfficiency: inputs.labourEfficiency,
    });
  }

  // Mould life accounting
  const numMoulds = inputs.mouldLife > 0
    ? Math.ceil(inputs.amortizationVolume / (inputs.mouldLife * inputs.cavities))
    : 1;

  const tooling: ToolingInput = {
    totalToolingCost: inputs.mouldCost * numMoulds,
    amortizationVolume: inputs.amortizationVolume,
    mode: 'amortized',
  };

  return { rawMaterial, operations, tooling };
}
