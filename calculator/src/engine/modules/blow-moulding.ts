import type { CommodityDrivers, OperationInput, RawMaterialInput, ToolingInput } from '../types.js';
import { estimateBlowMouldCost, type BlowProcess, type BlowMouldMaterial } from './blow-advisor.js';

export interface BlowMouldingInputs {
  materialId: string;
  partWeightKg: number;
  flashWeightKg: number;
  wallThicknessMm: number;
  coolTimeFactorSPerMm2: number;
  blowTimeSec: number;
  openCloseSec: number;
  machineId: string;
  labourId: string;
  cavities: number;
  oee: number;
  manning: number;
  labourEfficiency: number;
  /** Blow-mould set cost £. Omit/≤0 to estimate parametrically (see estimateBlowMouldCost). */
  mouldCost?: number;
  mouldLife: number;
  amortizationVolume: number;
  deflashMachineId?: string;
  deflashLabourId?: string;
  deflashCycleTimeSec?: number;
  /** Parison extrusion time s (time to extrude the parison before mould close). Typical 3–12s. Default 6s. */
  parisonExtrusionTimeSec?: number;
  /** Scrap fraction 0–1 (wall thickness failure, leak, flash). Uplifts material and cycle time. */
  rejectRate?: number;
  // ── Mould-cost estimator inputs (used when mouldCost ≤0) ──
  partVolumeL?: number;
  mouldMaterial?: BlowMouldMaterial;
  highCooling?: boolean;
  /** SBM two-stage: bought-in / separately-injected preform cost £/part → material consumable. */
  preformCostPerPart?: number;
  /** Colour/UV/barrier masterbatch premium £/kg of part. */
  masterbatchCostPerKg?: number;
}

export function getBlowMouldingInputSchema(): Record<string, string> {
  return {
    materialId: 'string — material ID from rate library (HDPE, PP, PET-BG most common)',
    partWeightKg: 'number — net finished part weight kg',
    flashWeightKg: 'number — pinch-off flash + neck trim scrap weight per part kg',
    wallThicknessMm: 'number — average wall thickness mm (drives cooling time)',
    coolTimeFactorSPerMm2: 'number — cooling constant s/mm² (HDPE/LDPE ~3.5, PP ~3.16, PET ~3.0)',
    blowTimeSec: 'number — pressurisation + hold time s (typically 3–8s for bottles)',
    openCloseSec: 'number — mould open / index / close time s (typically 4–8s)',
    machineId: 'string — EBM machine ID from rate library',
    labourId: 'string — labour rate ID',
    cavities: 'number — blow cavities per mould (typically 1–8 for small parts)',
    oee: 'number 0–1',
    manning: 'number — operators per machine',
    labourEfficiency: 'number 0–1',
    mouldCost: 'number — blow mould set cost £ (lower than injection mould)',
    mouldLife: 'number — cycles per mould life (Al mould: 500k–2M)',
    amortizationVolume: 'number — parts over which to amortize mould cost',
    deflashMachineId: 'string (optional) — secondary deflashing machine ID',
    deflashLabourId: 'string (optional) — labour rate ID for deflash operation',
    deflashCycleTimeSec: 'number (optional) — deflash/trimming cycle time per part s',
    parisonExtrusionTimeSec: 'number (optional) — parison extrusion time s before mould close (typical 3–12s, default 6s)',
    rejectRate: 'number 0–1 (optional) — scrap fraction (wall thickness failure, leak, flash); uplifts material and cycle time',
  };
}

export function computeBlowMouldingDrivers(inputs: BlowMouldingInputs): CommodityDrivers {
  const rejectUplift = (inputs.rejectRate && inputs.rejectRate > 0)
    ? 1 / (1 - inputs.rejectRate)
    : 1;

  const parisonTimeSec = inputs.parisonExtrusionTimeSec ?? 6;
  const coolingTimeSec = inputs.coolTimeFactorSPerMm2 * inputs.wallThicknessMm ** 2;
  const cycleTimeSec = parisonTimeSec + inputs.blowTimeSec + coolingTimeSec + inputs.openCloseSec;
  const cycleTimeHr = cycleTimeSec / 3600;

  const grossWeightKg = inputs.partWeightKg + inputs.flashWeightKg;
  const materialUtilization = inputs.partWeightKg / grossWeightKg;

  // Per-part material consumables: bought-in SBM preform + colour/barrier masterbatch.
  const consumablesCostPerPart =
    (inputs.preformCostPerPart ?? 0) + (inputs.masterbatchCostPerKg ?? 0) * inputs.partWeightKg;

  const rawMaterial: RawMaterialInput = {
    materialId: inputs.materialId,
    netWeightKg: inputs.partWeightKg * rejectUplift,
    materialUtilization,
    ...(consumablesCostPerPart > 0 ? { consumablesCostPerPart } : {}),
  };

  const effectiveCycleTimeHr = cycleTimeHr * rejectUplift;

  // Process label from the actual machine-id prefixes (blow-ibm-* / blow-sbm-*).
  const id = inputs.machineId;
  const processName =
    id.startsWith('blow-ibm') || id.startsWith('bm-ibm') ? 'Injection Blow Moulding' :
    id.startsWith('blow-sbm') || id.startsWith('bm-sbm') || id.includes('pet') ? 'Stretch Blow Moulding' :
    'Extrusion Blow Moulding';

  const operations: OperationInput[] = [
    {
      operationName: processName,
      machineId: inputs.machineId,
      labourId: inputs.labourId,
      cycleTimeHr: effectiveCycleTimeHr,
      partsPerCycle: inputs.cavities,
      oee: inputs.oee,
      manning: inputs.manning,
      labourTimeHr: effectiveCycleTimeHr,
      labourEfficiency: inputs.labourEfficiency,
    },
  ];

  if (
    inputs.deflashMachineId !== undefined &&
    inputs.deflashLabourId !== undefined &&
    inputs.deflashCycleTimeSec !== undefined &&
    inputs.deflashCycleTimeSec > 0
  ) {
    const deflashCycleTimeHr = inputs.deflashCycleTimeSec / 3600;
    operations.push({
      operationName: 'Deflashing',
      machineId: inputs.deflashMachineId,
      labourId: inputs.deflashLabourId,
      cycleTimeHr: deflashCycleTimeHr,
      partsPerCycle: 1,
      oee: 1.0,
      manning: 1,
      labourTimeHr: deflashCycleTimeHr,
      labourEfficiency: 1.0,
    });
  }

  // mouldLife is in cycles; one cycle produces `cavities` parts
  const numMoulds = inputs.mouldLife > 0
    ? Math.ceil(inputs.amortizationVolume / (inputs.mouldLife * inputs.cavities))
    : 1;

  // Mould cost: manual figure, else estimate parametrically from process/cavities/size.
  const blowProcess: BlowProcess =
    id.startsWith('blow-ibm') || id.startsWith('bm-ibm') ? 'ibm' :
    id.startsWith('blow-sbm') || id.startsWith('bm-sbm') || id.includes('pet') ? 'sbm' : 'ebm';
  const baseMouldCost = (inputs.mouldCost && inputs.mouldCost > 0)
    ? inputs.mouldCost
    : estimateBlowMouldCost({
        process: blowProcess,
        cavities: inputs.cavities,
        partVolumeL: inputs.partVolumeL,
        mouldMaterial: inputs.mouldMaterial,
        highCooling: inputs.highCooling,
      }).total;

  const tooling: ToolingInput = {
    totalToolingCost: baseMouldCost * numMoulds,
    amortizationVolume: inputs.amortizationVolume,
    mode: 'amortized',
  };

  return { rawMaterial, operations, tooling };
}
