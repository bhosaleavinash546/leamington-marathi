import type { CommodityDrivers, OperationInput, RawMaterialInput, ToolingInput } from '../types.js';
import {
  estimateRubberCureTimeSec, estimateRubberMouldCost,
  type RubberCompoundFamily, type RubberMouldSteel, type RubberComplexity,
} from './rubber-advisor.js';

export type RubberProcess =
  | 'extrusion_vulcanise'   // EPDM seals, hoses — extrude then cure in salt bath / oven
  | 'compression_mould'     // Simple gaskets, O-rings, solid mounts
  | 'transfer_mould'        // Bonded rubber-metal parts, complex geometry
  | 'injection_mould_lsr'   // Liquid Silicone Rubber — precision medical/auto seals
  | 'calendering'           // Sheet/strip rubber (flat gaskets)
  | 'die_cut';              // Die-cutting / punching of pre-vulcanised sheet rubber

export interface RubberInputs {
  materialId: string;         // rubber compound material ID
  partWeightKg: number;       // finished rubber part weight kg
  flashAndRunnerWeightKg: number; // flash/excess compound weight kg
  process: RubberProcess;
  machineId: string;
  labourId: string;
  cycleTimeSec: number;       // full moulding/extrusion cycle per part. ≤0 → predict from thickness/compound/temp
  cavities: number;           // cavities per mould (compression/transfer); 1 for extrusion
  oee: number;
  manning: number;
  labourEfficiency: number;
  rejectRate?: number;        // 0–1 scrap fraction (flash defects, dimensional)
  // Curing (for extrusion_vulcanise)
  cureTimeSec?: number;       // oven/salt-bath cure time per part s (default 0 — included in cycleTimeSec)
  cureOvenMachineId?: string; // separate cure oven machine ID
  // Cure-time prediction (used when cycleTimeSec ≤0)
  thicknessMm?: number;
  compoundFamily?: RubberCompoundFamily;
  moldTempC?: number;
  // Tooling
  mouldCost?: number;         // mould/die cost £. ≤0 → estimate parametrically
  mouldLife: number;          // cycles per mould life (compression: 200k, LSR: 500k)
  amortizationVolume: number;
  // Mould estimation (used when mouldCost ≤0)
  projectedAreaCm2?: number;
  moldSteel?: RubberMouldSteel;
  mouldComplexity?: RubberComplexity;
  metalInserts?: number;
  // Secondary bonding (rubber-to-metal)
  bondingPrimerCostPerPart?: number; // adhesive primer cost per part £
  // Deflash / trim + inspection
  deflashMachineId?: string;
  deflashLabourId?: string;
  deflashCycleSec?: number;   // cryo/tumble deflash or manual trim time per part s
  inspectionCostPerPart?: number; // visual + dimensional / leak-test £/part
}

export function getRubberInputSchema(): Record<string, string> {
  return {
    materialId: 'string — rubber compound material ID (mat-epdm, mat-nbr, mat-silicone, mat-nr, mat-viton)',
    partWeightKg: 'number — finished rubber part weight kg',
    flashAndRunnerWeightKg: 'number — flash trim + runner scrap weight kg',
    process: 'extrusion_vulcanise | compression_mould | transfer_mould | injection_mould_lsr | calendering',
    machineId: 'string — machine ID from rate library',
    labourId: 'string — labour rate ID',
    cycleTimeSec: 'number — full cycle time per part s. ≤0 → predict from thickness/compound/temp (t90 model)',
    thicknessMm: 'number? — section thickness mm (drives predicted cure time)',
    compoundFamily: 'string? — compound family for cure prediction (nr/sbr/br/epdm-sulphur/epdm-peroxide/nbr/hnbr/cr/iir/halobutyl/fkm/ffkm/silicone-hcr/silicone-lsr/acm/aem/eco/csm/pu)',
    moldTempC: 'number? — cure temperature °C (default per family)',
    projectedAreaCm2: 'number? — footprint cm² for mould-cost estimate',
    moldSteel: 'aluminium|p20|h13 — mould steel (mould-cost estimate)',
    metalInserts: 'number? — insert-moulding nests (mould-cost estimate)',
    deflashCycleSec: 'number? — deflash/trim time per part s (adds a Deflash/Trim op)',
    inspectionCostPerPart: 'number? — visual/dimensional/leak-test £/part',
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

  // Bonding primer + inspection (visual/dimensional/leak) are per-part consumables.
  const consumablesTotal =
    (inputs.bondingPrimerCostPerPart ?? 0) + (inputs.inspectionCostPerPart ?? 0);

  const rawMaterial: RawMaterialInput = {
    materialId: inputs.materialId,
    netWeightKg: inputs.partWeightKg * rejectUplift,
    materialUtilization,
    ...(consumablesTotal > 0 ? { consumablesCostPerPart: consumablesTotal } : {}),
  };

  // Cure/cycle time: use the given value, else predict from thickness × compound × temp.
  const effectiveCycleSec = inputs.cycleTimeSec > 0
    ? inputs.cycleTimeSec
    : estimateRubberCureTimeSec({
        compoundFamily: inputs.compoundFamily ?? 'epdm-sulphur',
        thicknessMm: inputs.thicknessMm ?? 3,
        moldTempC: inputs.moldTempC,
        process: inputs.process,
      });

  const mainCycleHr = (effectiveCycleSec / 3600) * rejectUplift;

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

  // Optional deflash / trim operation (cryo-tumble or manual).
  if (
    inputs.deflashMachineId &&
    inputs.deflashLabourId &&
    inputs.deflashCycleSec !== undefined &&
    inputs.deflashCycleSec > 0
  ) {
    const deflashHr = (inputs.deflashCycleSec / 3600) * rejectUplift;
    operations.push({
      operationName: 'Deflash / Trim',
      machineId: inputs.deflashMachineId,
      labourId: inputs.deflashLabourId,
      cycleTimeHr: deflashHr,
      partsPerCycle: 1,
      oee: inputs.oee,
      manning: inputs.manning,
      labourTimeHr: deflashHr,
      labourEfficiency: inputs.labourEfficiency,
    });
  }

  // Mould cost: manual figure, else estimate parametrically.
  const baseMouldCost = (inputs.mouldCost && inputs.mouldCost > 0)
    ? inputs.mouldCost
    : estimateRubberMouldCost({
        process: inputs.process,
        cavities: inputs.cavities,
        projectedAreaCm2: inputs.projectedAreaCm2,
        moldSteel: inputs.moldSteel,
        complexity: inputs.mouldComplexity,
        metalInserts: inputs.metalInserts,
      }).total;

  // Mould life accounting
  const numMoulds = inputs.mouldLife > 0
    ? Math.ceil(inputs.amortizationVolume / (inputs.mouldLife * inputs.cavities))
    : 1;

  const tooling: ToolingInput = {
    totalToolingCost: baseMouldCost * numMoulds,
    amortizationVolume: inputs.amortizationVolume,
    mode: 'amortized',
  };

  return { rawMaterial, operations, tooling };
}
