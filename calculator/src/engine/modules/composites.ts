import type { CommodityDrivers, OperationInput, RawMaterialInput, ToolingInput } from '../types.js';

export type CompositeProcess =
  | 'hand_layup'
  | 'prepreg_layup'
  | 'rtm'
  | 'vartm'
  | 'filament_winding'
  | 'pultrusion';

export type CureType = 'autoclave' | 'oven' | 'press' | 'ambient';

export interface CompositeInputs {
  // Material (prices must be supplied explicitly since two materials exist)
  fibrePricePerKg: number;       // dry fabric or prepreg price £/kg
  resinPricePerKg: number;       // infusion/RTM resin price £/kg (0 for prepreg)
  fibreWeightFraction: number;   // mass fraction of fibre in cured laminate (0.45–0.65)
  partWeightKg: number;          // cured part weight kg
  wasteFraction: number;         // material waste from trim/offcuts (0.05–0.35)

  // Process
  process: CompositeProcess;
  areaM2: number;                // part surface area m² (for estimating layup time)
  plies: number;                 // number of plies

  // Layup operation
  layupMachineId?: string;       // AFP/ATL machine ID; omit for manual hand layup
  layupLabourId: string;
  layupTimeHrPerPart: number;    // total layup time per part hr (manual or machine)
  oee: number;
  manning: number;
  labourEfficiency: number;

  // Cure operation
  cureMachineId: string;         // autoclave-1200mm, oven-composite-cure, rtm-press-std
  cureLabourId: string;
  cureTimeHr: number;            // cure cycle time in machine hr
  partsPerCureCycle?: number;    // parts per autoclave/oven batch (default 1)

  // Trim / finish operation
  trimMachineId?: string;        // waterjet-5ax-composite; omit if manual
  trimLabourId: string;
  trimTimeHr: number;            // waterjet/router trim + drill time per part hr

  // Optional NDI inspection
  ndiCostPerPart?: number;       // C-scan / UT per part £

  // Reject rate (0–1)
  rejectRate?: number;

  // Tooling
  toolingCost: number;           // mould/mandrel cost £
  toolingLife: number;           // parts per tool life
  amortizationVolume: number;
}

export function getCompositeInputSchema(): Record<string, string> {
  return {
    fibrePricePerKg: 'number — fibre fabric or prepreg price £/kg. Dry CF: 22–35, Dry GF: 3–6, CF prepreg: 28–80, GF prepreg: 6–15',
    resinPricePerKg: 'number — infusion/RTM resin £/kg. Use 0 for prepreg (resin already included). Epoxy infusion: 8–18, vinylester: 4–8',
    fibreWeightFraction: 'number 0–1 — mass fraction of fibre in cured part. CFRP hand layup: 0.50, prepreg: 0.60, RTM: 0.55, GFRP: 0.45–0.55',
    partWeightKg: 'number — cured finished part weight kg',
    wasteFraction: 'number 0–1 — trim and offcut waste fraction. Prepreg hand layup: 0.15–0.30, RTM: 0.05–0.10, pultrusion: 0.02–0.05',
    process: 'hand_layup | prepreg_layup | rtm | vartm | filament_winding | pultrusion',
    areaM2: 'number — developed part surface area m² (used for reference; layupTimeHrPerPart drives cost)',
    plies: 'number — number of laminate plies',
    layupMachineId: 'string? — AFP/ATL machine ID for automated layup; omit for hand layup. e.g. autoclave-1200mm',
    layupLabourId: 'string — labour ID for layup operators. lab-uk-skilled typical for composites',
    layupTimeHrPerPart: 'number — total layup time hr per part. Hand: 0.5–8hr; prepreg hand: 1–12hr; RTM: 0.2–1hr (demould+load)',
    oee: 'number 0–1 — overall equipment effectiveness',
    manning: 'number — operators per machine/layup station',
    labourEfficiency: 'number 0–1',
    cureMachineId: 'string — cure machine ID. autoclave-1200mm, oven-composite-cure, rtm-press-std',
    cureLabourId: 'string — labour ID for cure monitoring. lab-uk-skilled or lab-uk-semiskilled',
    cureTimeHr: 'number — full cure cycle time in machine hr. Autoclave CFRP: 3–8hr; Oven: 2–4hr; RTM press: 0.5–2hr',
    partsPerCureCycle: 'number? — parts per autoclave/oven batch (default 1). Autoclave batching can load 5–20 small parts',
    trimMachineId: 'string? — waterjet or router machine ID. waterjet-5ax-composite; omit for manual trim',
    trimLabourId: 'string — labour ID for trim/drill operator',
    trimTimeHr: 'number — trim + drill + deflash time hr per part. Waterjet CFRP: 0.25–1.5hr',
    ndiCostPerPart: 'number? — NDI C-scan / UT inspection £/part. Automotive structural: 15–50, aerospace: 80–250',
    rejectRate: 'number 0–1? — composite scrap rate (delamination, porosity, dimensional). 0.03–0.08 typical',
    toolingCost: 'number — mould/mandrel cost £. Machined Al tool: 8k–50k; CFRP mould: 15k–150k; invar: 100k–500k',
    toolingLife: 'number — parts per tool life. Al mould: 500–2000; CFRP mould: 100–400; invar: 2000–5000',
    amortizationVolume: 'number — parts over which to amortize tooling cost',
  };
}

export function computeCompositeDrivers(inputs: CompositeInputs): CommodityDrivers {
  const rejectUplift = inputs.rejectRate && inputs.rejectRate > 0
    ? 1 / (1 - inputs.rejectRate)
    : 1.0;

  // ── Material cost (fibre + resin, gross for waste) ────────────────────────
  const fibreMassNet = inputs.partWeightKg * inputs.fibreWeightFraction;
  const resinMassNet = inputs.partWeightKg * (1 - inputs.fibreWeightFraction);
  const netMatCost = fibreMassNet * inputs.fibrePricePerKg + resinMassNet * inputs.resinPricePerKg;
  // Gross material purchased = net / (1 - waste) to account for offcuts/trim
  const grossMatCost = netMatCost / (1 - Math.min(inputs.wasteFraction, 0.60));
  const ndiCost = inputs.ndiCostPerPart ?? 0;

  const rawMaterial: RawMaterialInput = {
    materialId: 'mat-virtual',
    netWeightKg: 0,
    materialUtilization: 1 - inputs.wasteFraction,
    directCost: (grossMatCost + ndiCost) * rejectUplift,
  };

  // ── Operations ───────────────────────────────────────────────────────────
  const operations: OperationInput[] = [];

  // 1. Layup operation
  const layupCycleHr = inputs.layupTimeHrPerPart * rejectUplift;
  operations.push({
    operationName: inputs.layupMachineId
      ? 'Automated Fibre Placement / Layup'
      : `${inputs.process === 'hand_layup' ? 'Hand' : inputs.process === 'prepreg_layup' ? 'Prepreg Hand' : inputs.process.toUpperCase()} Layup`,
    machineId: inputs.layupMachineId ?? 'bench-assembly',
    labourId: inputs.layupLabourId,
    cycleTimeHr: layupCycleHr,
    partsPerCycle: 1,
    oee: inputs.oee,
    manning: inputs.manning,
    labourTimeHr: layupCycleHr,
    labourEfficiency: inputs.labourEfficiency,
  });

  // 2. Cure operation (batched if partsPerCureCycle > 1)
  const batchSize = Math.max(1, inputs.partsPerCureCycle ?? 1);
  const cureCyclePerPart = inputs.cureTimeHr / batchSize;
  operations.push({
    operationName: `Cure (${inputs.cureMachineId.includes('autoclave') ? 'Autoclave' : inputs.cureMachineId.includes('rtm') ? 'RTM Press' : 'Oven'})`,
    machineId: inputs.cureMachineId,
    labourId: inputs.cureLabourId,
    cycleTimeHr: cureCyclePerPart * rejectUplift,
    partsPerCycle: 1,
    oee: inputs.oee,
    manning: 1,
    labourTimeHr: cureCyclePerPart * 0.25 * rejectUplift,
    labourEfficiency: inputs.labourEfficiency,
  });

  // 3. Trim / finish operation
  if (inputs.trimTimeHr > 0) {
    const trimCycleHr = inputs.trimTimeHr * rejectUplift;
    operations.push({
      operationName: 'Trim, Drill & Finish',
      machineId: inputs.trimMachineId ?? 'bench-assembly',
      labourId: inputs.trimLabourId,
      cycleTimeHr: trimCycleHr,
      partsPerCycle: 1,
      oee: inputs.oee,
      manning: 1,
      labourTimeHr: trimCycleHr,
      labourEfficiency: inputs.labourEfficiency,
    });
  }

  // ── Tooling ──────────────────────────────────────────────────────────────
  const numTools = inputs.toolingLife > 0
    ? Math.ceil(inputs.amortizationVolume / inputs.toolingLife)
    : 1;

  const tooling: ToolingInput = {
    totalToolingCost: inputs.toolingCost * numTools,
    amortizationVolume: inputs.amortizationVolume,
    mode: 'amortized',
  };

  return { rawMaterial, operations, tooling };
}
